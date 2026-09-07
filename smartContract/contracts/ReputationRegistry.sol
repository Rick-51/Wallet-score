// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {INativeQueryVerifier} from "@gluwa/usc-contracts/contracts/write-ability/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

/**
 * @title ReputationRegistry
 * @notice On-chain store of wallet Reputation Profiles for the Credit
 *         Reputation Protocol.
 *
 *         The contract does NOT score wallets. Its job is to record:
 *           1. An assessment request (wallet address + declared wallet type).
 *           2. Cross-chain evidence that was cryptographically verified by the
 *              Attestcoin Protocol on Creditcoin (the "verification layer").
 *           3. The human-in-the-loop underwriting result produced by a reviewer:
 *              reputation score, risk level and suggested loan terms.
 *
 *         Third-party lending protocols read these results but make their own
 *         decisions: "Don't trust the score. Verify the evidence."
 *
 *         Roles:
 *           - owner:   manage reviewers, the oracle and the verifier contract.
 *           - oracle:  backend worker that submits Attestcoin-verified evidence
 *                      and advances the analysis status.
 *           - reviewer: human underwriter that approves/rejects assessments.
 */
contract ReputationRegistry {
  // --- Types ----------------------------------------------------------------

  enum WalletType {
    PERSONAL,
    AI_AGENT,
    BUSINESS,
    DAO
  }

  enum AssessmentStatus {
    PENDING,
    ANALYZING,
    READY_FOR_REVIEW,
    APPROVED,
    REJECTED
  }

  enum RiskLevel {
    LOW,
    MEDIUM,
    HIGH
  }

  struct Evidence {
    uint64 chainKey; // Attestcoin source-chain key (not the EVM chain ID)
    uint64 blockHeight; // source-chain block height of the attested tx
    bytes32 sourceTxHash; // explorer reference supplied by the trusted oracle
    string eventType; // e.g. "aave:borrow" | "aave:repay" | "liquidation"
    uint64 verifiedAt; // timestamp the evidence was verified on Creditcoin
  }

  struct Assessment {
    address wallet;
    WalletType walletType;
    AssessmentStatus status;
    uint16 reputationScore; // 0 - 1000
    RiskLevel riskLevel;
    uint256 suggestedCreditLimit; // USD amount, 2 decimals (e.g. 1500000 = $15,000.00)
    uint16 suggestedAprBps; // basis points, e.g. 850 = 8.50%
    uint16 suggestedCollateralBps; // basis points, e.g. 7000 = 70.00%
    string reviewerNotes;
    uint64 submittedAt;
    uint64 reviewedAt;
  }

  // --- State -----------------------------------------------------------------

  address public owner;
  address public oracle;
  mapping(address => bool) public reviewers;
  INativeQueryVerifier public immutable attestcoinVerifier;
  mapping(uint64 => address) public aavePools;
  mapping(bytes32 => bool) public submittedEvidence;

  mapping(address => Assessment) private _assessments;
  mapping(address => uint256) public evidenceCount;
  mapping(address => mapping(uint256 => Evidence)) private _evidence;

  // --- Events ----------------------------------------------------------------

  event AssessmentSubmitted(address indexed wallet, WalletType walletType, uint64 timestamp);
  event AssessmentStatusUpdated(address indexed wallet, AssessmentStatus status);
  event EvidenceSubmitted(
    address indexed wallet,
    uint256 indexed index,
    uint64 chainKey,
    uint64 blockHeight,
    bytes32 sourceTxHash,
    string eventType,
    uint64 timestamp
  );
  event AssessmentReviewed(
    address indexed wallet,
    uint16 reputationScore,
    RiskLevel riskLevel,
    uint256 suggestedCreditLimit,
    uint16 suggestedAprBps,
    uint16 suggestedCollateralBps,
    string reviewerNotes
  );
  event AssessmentRejected(address indexed wallet, string reason);
  event OracleUpdated(address indexed previousOracle, address indexed newOracle);
  event ReviewerAdded(address indexed reviewer);
  event ReviewerRemoved(address indexed reviewer);
  event AavePoolUpdated(uint64 indexed chainKey, address indexed pool);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  // --- Modifiers -------------------------------------------------------------

  modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
  }

  modifier onlyReviewer() {
    require(msg.sender == owner || reviewers[msg.sender], "Not reviewer");
    _;
  }

  modifier onlyOracle() {
    require(msg.sender == oracle, "Not oracle");
    _;
  }

  // --- Setup -----------------------------------------------------------------

  constructor(INativeQueryVerifier attestcoinVerifier_) {
    require(address(attestcoinVerifier_) != address(0), "Zero verifier");
    owner = msg.sender;
    oracle = msg.sender;
    attestcoinVerifier = attestcoinVerifier_;
  }

  // --- Assessment lifecycle ---------------------------------------------------

  /**
   * @notice Submit a wallet for reputation assessment. The caller declares the
   *         wallet type; any address may submit on behalf of a wallet.
   *         Re-submission is allowed after a REJECTION.
   */
  function submitAssessment(address wallet, WalletType walletType) external {
    require(wallet != address(0), "Zero wallet");
    Assessment storage a = _assessments[wallet];
    require(a.wallet == address(0) || a.status == AssessmentStatus.REJECTED, "Already submitted");

    _assessments[wallet] = Assessment({
      wallet: wallet,
      walletType: walletType,
      status: AssessmentStatus.PENDING,
      reputationScore: 0,
      riskLevel: RiskLevel.LOW,
      suggestedCreditLimit: 0,
      suggestedAprBps: 0,
      suggestedCollateralBps: 0,
      reviewerNotes: "",
      submittedAt: uint64(block.timestamp),
      reviewedAt: 0
    });

    emit AssessmentSubmitted(wallet, walletType, uint64(block.timestamp));
  }

  /**
   * @notice Oracle advances the analysis status (PENDING -> ANALYZING ->
   *         READY_FOR_REVIEW). Only the oracle may call this.
   */
  function updateStatus(address wallet, AssessmentStatus newStatus) external onlyOracle {
    Assessment storage a = _assessments[wallet];
    require(a.wallet != address(0), "No assessment");
    require(
      newStatus == AssessmentStatus.ANALYZING || newStatus == AssessmentStatus.READY_FOR_REVIEW,
      "Invalid status"
    );
    a.status = newStatus;
    emit AssessmentStatusUpdated(wallet, newStatus);
  }

  /**
   * @notice Submit evidence that has been verified on the source chain by the
   *         Attestcoin Protocol. The proof is checked synchronously against the
   *         verifier before the evidence is recorded. Only the oracle may call.
   */
  function submitEvidence(
    address wallet,
    uint64 chainKey,
    uint64 blockHeight,
    bytes32 sourceTxHash,
    bytes calldata encodedTx,
    INativeQueryVerifier.MerkleProof calldata merkleProof,
    INativeQueryVerifier.ContinuityProof calldata continuityProof,
    string calldata eventType
  ) external onlyOracle {
    bool verified = attestcoinVerifier.verify(chainKey, blockHeight, encodedTx, merkleProof, continuityProof);
    require(verified, "Attestcoin verification failed");
    require(!submittedEvidence[sourceTxHash], "Evidence already submitted");
    require(_matchesAaveEvidence(wallet, chainKey, encodedTx, eventType), "Evidence does not match wallet event");

    submittedEvidence[sourceTxHash] = true;

    uint256 index = evidenceCount[wallet];
    _evidence[wallet][index] = Evidence({
      chainKey: chainKey,
      blockHeight: blockHeight,
      sourceTxHash: sourceTxHash,
      eventType: eventType,
      verifiedAt: uint64(block.timestamp)
    });
    evidenceCount[wallet] = index + 1;

    emit EvidenceSubmitted(
      wallet,
      index,
      chainKey,
      blockHeight,
      sourceTxHash,
      eventType,
      uint64(block.timestamp)
    );
  }

  // --- Underwriting -----------------------------------------------------------

  /**
   * @notice Reviewer approves an assessment with the final underwriting result.
   */
  function reviewAssessment(
    address wallet,
    uint16 reputationScore,
    RiskLevel riskLevel,
    uint256 suggestedCreditLimit,
    uint16 suggestedAprBps,
    uint16 suggestedCollateralBps,
    string calldata reviewerNotes
  ) external onlyReviewer {
    Assessment storage a = _assessments[wallet];
    require(a.wallet != address(0), "No assessment");
    require(a.status != AssessmentStatus.APPROVED, "Already approved");
    require(reputationScore <= 1000, "Score above 1000");

    a.reputationScore = reputationScore;
    a.riskLevel = riskLevel;
    a.suggestedCreditLimit = suggestedCreditLimit;
    a.suggestedAprBps = suggestedAprBps;
    a.suggestedCollateralBps = suggestedCollateralBps;
    a.reviewerNotes = reviewerNotes;
    a.status = AssessmentStatus.APPROVED;
    a.reviewedAt = uint64(block.timestamp);

    emit AssessmentReviewed(
      wallet,
      reputationScore,
      riskLevel,
      suggestedCreditLimit,
      suggestedAprBps,
      suggestedCollateralBps,
      reviewerNotes
    );
  }

  /**
   * @notice Reviewer rejects an assessment.
   */
  function rejectAssessment(address wallet, string calldata reason) external onlyReviewer {
    Assessment storage a = _assessments[wallet];
    require(a.wallet != address(0), "No assessment");
    require(a.status != AssessmentStatus.APPROVED, "Already approved");

    a.status = AssessmentStatus.REJECTED;
    a.reviewedAt = uint64(block.timestamp);
    emit AssessmentRejected(wallet, reason);
  }

  // --- Views -----------------------------------------------------------------

  function getAssessment(address wallet) external view returns (Assessment memory) {
    return _assessments[wallet];
  }

  function getEvidence(address wallet, uint256 index) external view returns (Evidence memory) {
    require(index < evidenceCount[wallet], "Index out of bounds");
    return _evidence[wallet][index];
  }

  // --- Administration ---------------------------------------------------------

  function setOracle(address newOracle) external onlyOwner {
    require(newOracle != address(0), "Zero oracle");
    emit OracleUpdated(oracle, newOracle);
    oracle = newOracle;
  }

  function addReviewer(address reviewer) external onlyOwner {
    require(reviewer != address(0), "Zero reviewer");
    reviewers[reviewer] = true;
    emit ReviewerAdded(reviewer);
  }

  function removeReviewer(address reviewer) external onlyOwner {
    reviewers[reviewer] = false;
    emit ReviewerRemoved(reviewer);
  }

  function setAavePool(uint64 chainKey, address pool) external onlyOwner {
    require(pool != address(0), "Zero pool");
    aavePools[chainKey] = pool;
    emit AavePoolUpdated(chainKey, pool);
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "Zero owner");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  // --- Verified evidence decoding -------------------------------------------

  bytes32 private constant BORROW_EVENT = keccak256(
    "Borrow(address,address,address,uint256,uint8,uint256,uint16)"
  );
  bytes32 private constant REPAY_EVENT = keccak256(
    "Repay(address,address,address,uint256,bool)"
  );
  bytes32 private constant LIQUIDATION_EVENT = keccak256(
    "LiquidationCall(address,address,address,uint256,uint256,address,bool)"
  );

  function _matchesAaveEvidence(
    address wallet,
    uint64 chainKey,
    bytes calldata encodedTx,
    string calldata eventType
  ) private view returns (bool) {
    address pool = aavePools[chainKey];
    require(pool != address(0), "Aave pool not configured");

    EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTx);
    require(receipt.receiptStatus == 1, "Source transaction failed");

    bytes32 requested = keccak256(bytes(eventType));
    for (uint256 i; i < receipt.receiptLogs.length; ++i) {
      EvmV1Decoder.LogEntry memory entry = receipt.receiptLogs[i];
      if (entry.address_ != pool || entry.topics.length == 0) continue;

      if (requested == keccak256("aave:borrow") && entry.topics[0] == BORROW_EVENT) {
        (address user, , , ) = abi.decode(entry.data, (address, uint256, uint8, uint256));
        if (user == wallet) return true;
      }
      if (
        requested == keccak256("aave:repay") &&
        entry.topics[0] == REPAY_EVENT &&
        entry.topics.length >= 3 &&
        _topicAddress(entry.topics[2]) == wallet
      ) return true;
      if (
        requested == keccak256("liquidation") &&
        entry.topics[0] == LIQUIDATION_EVENT &&
        entry.topics.length >= 4 &&
        _topicAddress(entry.topics[3]) == wallet
      ) return true;
    }
    return false;
  }

  function _topicAddress(bytes32 topic) private pure returns (address) {
    return address(uint160(uint256(topic)));
  }
}

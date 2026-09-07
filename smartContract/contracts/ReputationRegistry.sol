// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IAttestcoinVerifier} from "./IAttestcoinVerifier.sol";

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
    bytes32 chainKey; // source chain the evidence was verified against
    uint256 blockHeight; // source-chain block height of the attested tx
    bytes32 sourceTxHash; // reference hash of the attested transaction
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
  IAttestcoinVerifier public attestcoinVerifier;

  mapping(address => Assessment) private _assessments;
  mapping(address => uint256) public evidenceCount;
  mapping(address => mapping(uint256 => Evidence)) private _evidence;

  // --- Events ----------------------------------------------------------------

  event AssessmentSubmitted(address indexed wallet, WalletType walletType, uint64 timestamp);
  event AssessmentStatusUpdated(address indexed wallet, AssessmentStatus status);
  event EvidenceSubmitted(
    address indexed wallet,
    uint256 indexed index,
    bytes32 chainKey,
    uint256 blockHeight,
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
  event AttestcoinVerifierUpdated(address indexed previous, address indexed updated);
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

  constructor(IAttestcoinVerifier attestcoinVerifier_) {
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
    bytes32 chainKey,
    uint256 blockHeight,
    bytes calldata encodedTx,
    bytes calldata merkleProof,
    bytes calldata continuityProof,
    string calldata eventType
  ) external onlyOracle {
    bool verified = attestcoinVerifier.verify(chainKey, blockHeight, encodedTx, merkleProof, continuityProof);
    require(verified, "Attestcoin verification failed");

    uint256 index = evidenceCount[wallet];
    _evidence[wallet][index] = Evidence({
      chainKey: chainKey,
      blockHeight: blockHeight,
      sourceTxHash: keccak256(encodedTx),
      eventType: eventType,
      verifiedAt: uint64(block.timestamp)
    });
    evidenceCount[wallet] = index + 1;

    emit EvidenceSubmitted(
      wallet,
      index,
      chainKey,
      blockHeight,
      keccak256(encodedTx),
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

  function setAttestcoinVerifier(IAttestcoinVerifier newVerifier) external onlyOwner {
    require(address(newVerifier) != address(0), "Zero verifier");
    emit AttestcoinVerifierUpdated(address(attestcoinVerifier), address(newVerifier));
    attestcoinVerifier = newVerifier;
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "Zero owner");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }
}

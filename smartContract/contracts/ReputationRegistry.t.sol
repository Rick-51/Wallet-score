// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "./ReputationRegistry.sol";
import {INativeQueryVerifier} from "@gluwa/usc-contracts/contracts/write-ability/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {MockAttestcoinVerifier} from "./mocks/MockAttestcoinVerifier.sol";

contract ReputationRegistryTest is Test {
  ReputationRegistry registry;
  MockAttestcoinVerifier verifier;

  address oracle = address(0x1111);
  address reviewer = address(0x2222);
  address alice = address(0x3333);
  address bob = address(0x4444);
  address pool = address(0x5555);
  uint64 constant CHAIN_KEY = 1;

  function setUp() public {
    verifier = new MockAttestcoinVerifier();
    registry = new ReputationRegistry(verifier);
    registry.setAavePool(CHAIN_KEY, pool);
    registry.setOracle(oracle);
    registry.addReviewer(reviewer);
  }

  // --- Submission ------------------------------------------------------------

  function test_SubmitAssessment() public {
    vm.prank(alice);
    registry.submitAssessment(alice, ReputationRegistry.WalletType.AI_AGENT);

    ReputationRegistry.Assessment memory a = registry.getAssessment(alice);
    assertEq(a.wallet, alice);
    assertEq(uint8(a.walletType), uint8(ReputationRegistry.WalletType.AI_AGENT));
    assertEq(uint8(a.status), uint8(ReputationRegistry.AssessmentStatus.PENDING));
    assertEq(a.reputationScore, 0);
    assertGt(a.submittedAt, 0);
  }

  function test_SubmitAssessmentRevertsOnZero() public {
    vm.expectRevert(bytes("Zero wallet"));
    registry.submitAssessment(address(0), ReputationRegistry.WalletType.PERSONAL);
  }

  function test_CannotResubmitWhilePending() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.expectRevert(bytes("Already submitted"));
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
  }

  function test_CanResubmitAfterRejection() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
    registry.rejectAssessment(alice, "insufficient history");

    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
    assertEq(uint8(registry.getAssessment(alice).status), uint8(ReputationRegistry.AssessmentStatus.PENDING));
  }

  // --- Status -----------------------------------------------------------------

  function test_UpdateStatusOnlyOracle() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.prank(oracle);
    registry.updateStatus(alice, ReputationRegistry.AssessmentStatus.ANALYZING);
    assertEq(uint8(registry.getAssessment(alice).status), uint8(ReputationRegistry.AssessmentStatus.ANALYZING));

    vm.prank(oracle);
    registry.updateStatus(alice, ReputationRegistry.AssessmentStatus.READY_FOR_REVIEW);
    assertEq(uint8(registry.getAssessment(alice).status), uint8(ReputationRegistry.AssessmentStatus.READY_FOR_REVIEW));
  }

  function test_UpdateStatusRevertsForNonOracle() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.prank(alice);
    vm.expectRevert(bytes("Not oracle"));
    registry.updateStatus(alice, ReputationRegistry.AssessmentStatus.ANALYZING);
  }

  function test_UpdateStatusRevertsForInvalidStatus() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.prank(oracle);
    vm.expectRevert(bytes("Invalid status"));
    registry.updateStatus(alice, ReputationRegistry.AssessmentStatus.APPROVED);
  }

  // --- Evidence ----------------------------------------------------------------

  function test_SubmitEvidence() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.BUSINESS);

    bytes memory encodedTx = _repayTx(alice);
    bytes32 sourceTxHash = keccak256("source transaction");
    INativeQueryVerifier.MerkleProof memory merkle = _emptyMerkleProof();
    INativeQueryVerifier.ContinuityProof memory cont = _emptyContinuityProof();

    vm.prank(oracle);
    registry.submitEvidence(alice, CHAIN_KEY, 19_000_000, sourceTxHash, encodedTx, merkle, cont, "aave:repay");

    assertEq(registry.evidenceCount(alice), 1);

    ReputationRegistry.Evidence memory e = registry.getEvidence(alice, 0);
    assertEq(e.chainKey, CHAIN_KEY);
    assertEq(e.blockHeight, 19_000_000);
    assertEq(e.sourceTxHash, sourceTxHash);
    assertEq(e.eventType, "aave:repay");
    assertGt(e.verifiedAt, 0);
  }

  function test_SubmitEvidenceRevertsWhenVerificationFails() public {
    verifier.setResult(false);

    vm.prank(oracle);
    vm.expectRevert(bytes("Attestcoin verification failed"));
    registry.submitEvidence(
      alice,
      CHAIN_KEY,
      1,
      keccak256("failed"),
      hex"aa",
      _emptyMerkleProof(),
      _emptyContinuityProof(),
      "aave:borrow"
    );
  }

  function test_SubmitEvidenceRevertsForNonOracle() public {
    vm.prank(alice);
    vm.expectRevert(bytes("Not oracle"));
    registry.submitEvidence(
      alice,
      CHAIN_KEY,
      1,
      keccak256("unauthorized"),
      hex"aa",
      _emptyMerkleProof(),
      _emptyContinuityProof(),
      "aave:borrow"
    );
  }

  function test_GetEvidenceRevertsOutOfBounds() public {
    vm.expectRevert(bytes("Index out of bounds"));
    registry.getEvidence(alice, 0);
  }

  function _emptyMerkleProof() private pure returns (INativeQueryVerifier.MerkleProof memory proof) {
    proof.root = bytes32(0);
    proof.siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
  }

  function _emptyContinuityProof() private pure returns (INativeQueryVerifier.ContinuityProof memory proof) {
    proof.lowerEndpointDigest = bytes32(0);
    proof.roots = new bytes32[](0);
  }

  function _repayTx(address wallet) private view returns (bytes memory) {
    bytes32[] memory logTopics = new bytes32[](4);
    logTopics[0] = keccak256("Repay(address,address,address,uint256,bool)");
    logTopics[1] = bytes32(uint256(uint160(address(0x6666))));
    logTopics[2] = bytes32(uint256(uint160(wallet)));
    logTopics[3] = bytes32(uint256(uint160(wallet)));

    EvmV1Decoder.LogEntry[] memory logs = new EvmV1Decoder.LogEntry[](1);
    logs[0] = EvmV1Decoder.LogEntry({
      address_: pool,
      topics: logTopics,
      data: abi.encode(uint256(100 ether), false)
    });

    bytes[] memory chunks = new bytes[](3);
    chunks[0] = abi.encode(uint64(1), uint64(100_000), wallet, false, pool, uint256(0), bytes(""));
    chunks[1] = abi.encode(uint128(1), uint256(27), bytes32(0), bytes32(0));
    chunks[2] = abi.encode(uint8(1), uint64(90_000), logs, bytes(""));
    return abi.encode(uint8(0), chunks);
  }

  // --- Underwriting -------------------------------------------------------------

  function test_ReviewAssessment() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.DAO);

    registry.reviewAssessment(
      alice,
      862,
      ReputationRegistry.RiskLevel.LOW,
      15_000_00, // $15,000.00
      850, // 8.50%
      7000, // 70.00%
      "Strong repayment history"
    );

    ReputationRegistry.Assessment memory a = registry.getAssessment(alice);
    assertEq(uint8(a.status), uint8(ReputationRegistry.AssessmentStatus.APPROVED));
    assertEq(a.reputationScore, 862);
    assertEq(uint8(a.riskLevel), uint8(ReputationRegistry.RiskLevel.LOW));
    assertEq(a.suggestedCreditLimit, 15_000_00);
    assertEq(a.suggestedAprBps, 850);
    assertEq(a.suggestedCollateralBps, 7000);
    assertEq(a.reviewerNotes, "Strong repayment history");
    assertGt(a.reviewedAt, 0);
  }

  function test_ReviewRevertsForNonReviewer() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.prank(alice);
    vm.expectRevert(bytes("Not reviewer"));
    registry.reviewAssessment(alice, 700, ReputationRegistry.RiskLevel.MEDIUM, 1000, 1000, 8000, "");
  }

  function test_ReviewRevertsWhenScoreAbove1000() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.expectRevert(bytes("Score above 1000"));
    registry.reviewAssessment(alice, 1001, ReputationRegistry.RiskLevel.LOW, 1000, 1000, 8000, "");
  }

  function test_ReviewerCanReview() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    vm.prank(reviewer);
    registry.reviewAssessment(alice, 500, ReputationRegistry.RiskLevel.HIGH, 0, 1500, 12000, "risky");

    assertEq(registry.getAssessment(alice).reputationScore, 500);
  }

  function test_RejectAssessment() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);

    registry.rejectAssessment(alice, "no lending history");

    assertEq(uint8(registry.getAssessment(alice).status), uint8(ReputationRegistry.AssessmentStatus.REJECTED));
  }

  function test_CannotReviewApprovedTwice() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
    registry.reviewAssessment(alice, 700, ReputationRegistry.RiskLevel.MEDIUM, 1000, 1000, 8000, "");

    vm.expectRevert(bytes("Already approved"));
    registry.reviewAssessment(alice, 800, ReputationRegistry.RiskLevel.LOW, 2000, 700, 5000, "");
  }

  // --- Administration -----------------------------------------------------------

  function test_OnlyOwnerCanManageRoles() public {
    vm.prank(alice);
    vm.expectRevert(bytes("Not owner"));
    registry.addReviewer(bob);

    vm.prank(alice);
    vm.expectRevert(bytes("Not owner"));
    registry.setOracle(bob);
  }

  function test_RemoveReviewer() public {
    registry.addReviewer(bob);

    vm.prank(bob);
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
    registry.removeReviewer(bob);

    vm.prank(bob);
    vm.expectRevert(bytes("Not reviewer"));
    registry.reviewAssessment(alice, 600, ReputationRegistry.RiskLevel.MEDIUM, 1000, 1000, 8000, "");
  }

  function test_SetAavePool() public {
    registry.setAavePool(3, address(0x7777));
    assertEq(registry.aavePools(3), address(0x7777));
  }
}

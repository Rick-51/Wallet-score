// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "./ReputationRegistry.sol";
import {IAttestcoinVerifier} from "./IAttestcoinVerifier.sol";
import {MockAttestcoinVerifier} from "./mocks/MockAttestcoinVerifier.sol";

contract ReputationRegistryTest is Test {
  ReputationRegistry registry;
  MockAttestcoinVerifier verifier;

  address oracle = address(0x1111);
  address reviewer = address(0x2222);
  address alice = address(0x3333);
  address bob = address(0x4444);

  function setUp() public {
    verifier = new MockAttestcoinVerifier();
    registry = new ReputationRegistry(verifier);
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

    bytes memory encodedTx = hex"c0ffee";
    bytes memory merkle = hex"beef";
    bytes memory cont = hex"1234";

    vm.prank(oracle);
    registry.submitEvidence(alice, bytes32("ethereum"), 19_000_000, encodedTx, merkle, cont, "aave:repay");

    assertEq(registry.evidenceCount(alice), 1);

    ReputationRegistry.Evidence memory e = registry.getEvidence(alice, 0);
    assertEq(e.chainKey, bytes32("ethereum"));
    assertEq(e.blockHeight, 19_000_000);
    assertEq(e.sourceTxHash, keccak256(encodedTx));
    assertEq(e.eventType, "aave:repay");
    assertGt(e.verifiedAt, 0);
  }

  function test_SubmitEvidenceRevertsWhenVerificationFails() public {
    verifier.setResult(false);

    vm.prank(oracle);
    vm.expectRevert(bytes("Attestcoin verification failed"));
    registry.submitEvidence(alice, bytes32("ethereum"), 1, hex"aa", hex"bb", hex"cc", "aave:borrow");
  }

  function test_SubmitEvidenceRevertsForNonOracle() public {
    vm.prank(alice);
    vm.expectRevert(bytes("Not oracle"));
    registry.submitEvidence(alice, bytes32("ethereum"), 1, hex"aa", hex"bb", hex"cc", "aave:borrow");
  }

  function test_GetEvidenceRevertsOutOfBounds() public {
    vm.expectRevert(bytes("Index out of bounds"));
    registry.getEvidence(alice, 0);
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

  function test_SetAttestcoinVerifier() public {
    MockAttestcoinVerifier v2 = new MockAttestcoinVerifier();
    registry.setAttestcoinVerifier(v2);
    assertEq(address(registry.attestcoinVerifier()), address(v2));
  }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "./ReputationRegistry.sol";
import {DemoLending} from "./DemoLending.sol";
import {MockAttestcoinVerifier} from "./mocks/MockAttestcoinVerifier.sol";

contract DemoLendingTest is Test {
  ReputationRegistry registry;
  DemoLending lending;

  address alice = address(0x3333);

  function setUp() public {
    MockAttestcoinVerifier verifier = new MockAttestcoinVerifier();
    registry = new ReputationRegistry(verifier);
    lending = new DemoLending(registry);
  }

  function setupWallet(address wallet, uint16 score) internal {
    registry.submitAssessment(wallet, ReputationRegistry.WalletType.AI_AGENT);
    registry.reviewAssessment(wallet, score, ReputationRegistry.RiskLevel.LOW, 10_000_00, 850, 7000, "");
  }

  function test_ScoreBelow500Rejected() public {
    setupWallet(alice, 499);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertFalse(t.approved);
  }

  function test_Score500Tier() public {
    setupWallet(alice, 500);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertTrue(t.approved);
    assertEq(t.collateralBps, 12000);
    assertEq(t.aprBps, 1500);
  }

  function test_Score699Tier() public {
    setupWallet(alice, 699);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertEq(t.collateralBps, 12000);
    assertEq(t.aprBps, 1500);
  }

  function test_Score700Tier() public {
    setupWallet(alice, 700);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertTrue(t.approved);
    assertEq(t.collateralBps, 8000);
    assertEq(t.aprBps, 1000);
  }

  function test_Score849Tier() public {
    setupWallet(alice, 849);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertEq(t.collateralBps, 8000);
    assertEq(t.aprBps, 1000);
  }

  function test_Score850Tier() public {
    setupWallet(alice, 850);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertTrue(t.approved);
    assertEq(t.collateralBps, 5000);
    assertEq(t.aprBps, 700);
  }

  function test_Score1000Tier() public {
    setupWallet(alice, 1000);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertEq(t.collateralBps, 5000);
    assertEq(t.aprBps, 700);
  }

  function test_UnknownWalletRejected() public view {
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertFalse(t.approved);
  }

  function test_UnreviewedWalletRejected() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertFalse(t.approved);
  }

  function test_RejectedAssessmentIsNotEligible() public {
    registry.submitAssessment(alice, ReputationRegistry.WalletType.PERSONAL);
    registry.rejectAssessment(alice, "bad history");

    DemoLending.LoanTerms memory t = lending.getLoanTerms(alice);
    assertFalse(t.approved);
  }

  function test_RequiredCollateral() public {
    setupWallet(alice, 850); // 50% collateral

    (uint256 collateral, bool approved) = lending.requiredCollateral(alice, 10_000_00); // $10,000
    assertTrue(approved);
    assertEq(collateral, 5_000_00); // $5,000
  }

  function test_RequiredCollateralRejected() public view {
    (uint256 collateral, bool approved) = lending.requiredCollateral(alice, 10_000_00);
    assertFalse(approved);
    assertEq(collateral, 0);
  }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ReputationRegistry} from "./ReputationRegistry.sol";

/**
 * @title DemoLending
 * @notice Minimal demo of how a lending protocol can convert a wallet's
 *         verified Reputation Score into concrete loan terms.
 *
 *         This is intentionally NOT a full lending protocol — no funds, no
 *         collateral custody. It only demonstrates the mapping:
 *
 *             Reputation -> financial terms
 *
 *         Tiers (from the project brief):
 *             Score < 500           -> rejected
 *             Score 500 - 699       -> 120% collateral, 15.00% APR
 *             Score 700 - 849       ->  80% collateral, 10.00% APR
 *             Score >= 850          ->  50% collateral,  7.00% APR
 */
contract DemoLending {
  ReputationRegistry public registry;

  struct LoanTerms {
    bool approved;
    uint16 collateralBps; // required collateral ratio, e.g. 12000 = 120%
    uint16 aprBps; // annual percentage rate, e.g. 1500 = 15.00%
  }

  event LoanQuote(
    address indexed wallet,
    uint16 reputationScore,
    bool approved,
    uint16 collateralBps,
    uint16 aprBps
  );

  constructor(ReputationRegistry registry_) {
    require(address(registry_) != address(0), "Zero registry");
    registry = registry_;
  }

  /**
   * @notice Returns the loan terms for a wallet based on its approved
   *         reputation score. Unapproved / unknown wallets are rejected.
   */
  function getLoanTerms(address wallet) public view returns (LoanTerms memory) {
    ReputationRegistry.Assessment memory a = registry.getAssessment(wallet);

    if (a.wallet != wallet || a.status != ReputationRegistry.AssessmentStatus.APPROVED) {
      return LoanTerms({approved: false, collateralBps: 0, aprBps: 0});
    }

    uint16 score = a.reputationScore;
    if (score < 500) {
      return LoanTerms({approved: false, collateralBps: 0, aprBps: 0});
    }
    if (score < 700) {
      return LoanTerms({approved: true, collateralBps: 12000, aprBps: 1500});
    }
    if (score < 850) {
      return LoanTerms({approved: true, collateralBps: 8000, aprBps: 1000});
    }
    return LoanTerms({approved: true, collateralBps: 5000, aprBps: 700});
  }

  /**
   * @notice Convenience helper: compute the collateral required to borrow
   *         `borrowAmount`, given the wallet's reputation-derived ratio.
   *         Returns (0, false) when the wallet is not eligible.
   */
  function requiredCollateral(address wallet, uint256 borrowAmount)
    external
    view
    returns (uint256 collateral, bool approved)
  {
    LoanTerms memory terms = getLoanTerms(wallet);
    if (!terms.approved) {
      return (0, false);
    }
    return ((borrowAmount * terms.collateralBps) / 10_000, true);
  }

  /**
   * @notice Emits a LoanQuote event for off-chain consumers without changing state.
   */
  function quote(address wallet) external returns (LoanTerms memory) {
    LoanTerms memory terms = getLoanTerms(wallet);
    emit LoanQuote(wallet, registry.getAssessment(wallet).reputationScore, terms.approved, terms.collateralBps, terms.aprBps);
    return terms;
  }
}

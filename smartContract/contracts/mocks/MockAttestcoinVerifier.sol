// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {INativeQueryVerifier} from "@gluwa/usc-contracts/contracts/write-ability/INativeQueryVerifier.sol";

/**
 * @title MockAttestcoinVerifier
 * @notice Development stand-in for the Attestcoin verification precompile.
 *         Lets tests toggle the verification result to exercise both the
 *         success and failure branches without the real Creditcoin precompile.
 */
contract MockAttestcoinVerifier is INativeQueryVerifier {
  bool public result = true;

  function setResult(bool result_) external {
    result = result_;
  }

  function verify(
    uint64,
    uint64,
    bytes calldata,
    MerkleProof calldata,
    ContinuityProof calldata
  ) external view override returns (bool) {
    return result;
  }
}

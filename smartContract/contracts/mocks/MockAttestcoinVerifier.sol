// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IAttestcoinVerifier} from "../IAttestcoinVerifier.sol";

/**
 * @title MockAttestcoinVerifier
 * @notice Development stand-in for the Attestcoin verification precompile.
 *         Lets tests toggle the verification result to exercise both the
 *         success and failure branches without the real Creditcoin precompile.
 */
contract MockAttestcoinVerifier is IAttestcoinVerifier {
  bool public result = true;

  function setResult(bool result_) external {
    result = result_;
  }

  function verify(
    bytes32,
    uint256,
    bytes calldata,
    bytes calldata,
    bytes calldata
  ) external view override returns (bool) {
    return result;
  }
}

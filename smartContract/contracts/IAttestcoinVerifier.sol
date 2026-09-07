// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title IAttestcoinVerifier
 * @notice Abstraction over the Attestcoin Protocol's cross-chain verification
 *         precompile deployed on Creditcoin.
 *
 *         The Attestcoin Protocol verifies, in the same transaction, that a
 *         transaction from a source chain (e.g. Ethereum) was actually included
 *         in a source-chain block. It does this using a Merkle inclusion proof
 *         and a continuity proof over the source chain's block headers — no
 *         bridges, oracles or trust assumptions.
 *
 *         On Creditcoin this interface is backed by a native precompile that
 *         implements:
 *
 *             verify(chainKey, blockHeight, encodedTx, merkleProof, continuityProof) -> bool
 *
 *         For local development / testing, deploy MockAttestcoinVerifier.
 */
interface IAttestcoinVerifier {
  /**
   * @notice Verifies that `encodedTx` was included at `blockHeight` on the
   *         source chain identified by `chainKey`.
   * @param chainKey Identifier of the source chain being read.
   * @param blockHeight Height of the source-chain block containing the tx.
   * @param encodedTx The encoded transaction (or event) to verify.
   * @param merkleProof Merkle inclusion proof of the tx against the block root.
   * @param continuityProof Continuity proof of the block against the chain head.
   * @return true if the evidence is cryptographically valid, false otherwise.
   */
  function verify(
    bytes32 chainKey,
    uint256 blockHeight,
    bytes calldata encodedTx,
    bytes calldata merkleProof,
    bytes calldata continuityProof
  ) external view returns (bool);
}

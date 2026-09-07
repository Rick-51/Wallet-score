import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { JsonRpcProvider } from "ethers";
import type { Hash, Hex } from "viem";
import { config } from "../config.js";
import { getRegistry } from "../services/registry.js";

/**
 * End-to-end on-chain demo against the deployed contracts (Creditcoin testnet):
 *
 *   submitAssessment → submitEvidence → reviewAssessment → getLoanTerms
 *
 *   npm run onchain:demo
 *
 * Defaults to a known Sepolia Aave Repay event that is already covered by
 * Creditcoin testnet attestations. Environment variables may override it.
 */
const registry = getRegistry();
if (!registry) {
  console.error("Registry not loaded. Set CREDITCOIN_PRIVATE_KEY.");
  process.exit(1);
}

const wallet = (process.env.SOURCE_WALLET_ADDRESS ??
  "0x2D39338894D7D3Be4908d6fbfc3500440C788F01") as Hash;
const sourceChainId = Number(process.env.SOURCE_CHAIN_ID ?? "11155111");
const sourceTxHash = (process.env.SOURCE_TX_HASH ??
  "0xfd31041ec90a9a6b8f5d7fdec0b9aac94828984bbd5e0766d6b8f69cb9a3da3a") as Hash;
const eventType = process.env.SOURCE_EVENT_TYPE ?? "aave:repay";

const creditcoinProvider = new JsonRpcProvider(config.CREDITCOIN_RPC_URL);
const chainProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider as never);
const sourceChain = (await chainProvider.getSupportedChains()).find(
  (chain) => chain.chainId === sourceChainId,
);
if (!sourceChain) throw new Error(`Attestcoin does not support source chain ${sourceChainId}`);

const builder = new proofProvider.service.ProofBuilder(
  sourceChain.chainKey,
  config.CREDITCOIN_PROOF_BUILDER_URL,
  60_000,
);
const proofResult = await builder.getProof(sourceTxHash);
if (!proofResult.success || !proofResult.data) {
  throw new Error(proofResult.error ?? "Proof builder returned no proof");
}
const proof = proofResult.data;

const verifier = new blockProver.PrecompileBlockProver(creditcoinProvider as never);
const verified = await verifier.verifySingle(
  proof.chainKey,
  proof.headerNumber,
  proof.txBytes,
  proof.merkleProof,
  proof.continuityProof,
);
if (!verified) throw new Error("Creditcoin native verifier rejected the proof");
console.log("0. native verification: true");

// 1. submitAssessment (user submits a wallet + declared type)
const submit = await registry.submitAssessment(wallet, "PERSONAL");
console.log("1. submitAssessment:", submit);

// 2. submitEvidence (the registry repeats native verification and validates
//    the Aave receipt log before recording evidence).
const evidence = await registry.submitEvidence(wallet, {
  chainKey: BigInt(proof.chainKey),
  blockHeight: BigInt(proof.headerNumber),
  sourceTxHash,
  encodedTx: proof.txBytes as Hex,
  merkleProof: {
    root: proof.merkleProof.root as Hash,
    siblings: proof.merkleProof.siblings.map((sibling) => ({
      hash: sibling.hash as Hash,
      isLeft: sibling.isLeft,
    })),
  },
  continuityProof: {
    lowerEndpointDigest: proof.continuityProof.lowerEndpointDigest as Hash,
    roots: proof.continuityProof.roots as Hash[],
  },
  eventType,
});
console.log("2. submitEvidence :", evidence);

// 3. reviewAssessment (reviewer approves with the underwriting result)
const review = await registry.reviewAssessment(wallet, {
  reputationScore: 862,
  riskLevel: "LOW",
  creditLimitUsdMinor: 1500000n, // $15,000.00
  aprBps: 850, // 8.50%
  collateralBps: 7000, // 70.00%
  reviewerNotes: "Good repayment history.",
});
console.log("3. reviewAssessment:", review);

// 4. DemoLending.getLoanTerms (third-party read)
const terms = await registry.getLoanTerms(wallet);
console.log("4. getLoanTerms   :", terms);

console.log("\nWallet:", wallet);
console.log("Note: getLoanTerms maps score 862 (>= 850) → 50% collateral / 7.00% APR.");

import { keccak256, stringToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getRegistry } from "../services/registry.js";

/**
 * End-to-end on-chain demo against the deployed contracts (Creditcoin testnet):
 *
 *   submitAssessment → submitEvidence → reviewAssessment → getLoanTerms
 *
 *   npm run onchain:demo
 *
 * Uses a fresh random wallet each run so it can be re-run. Requires
 * CREDITCOIN_PRIVATE_KEY (the owner/oracle signer).
 */
const registry = getRegistry();
if (!registry) {
  console.error("Registry not loaded. Set CREDITCOIN_PRIVATE_KEY.");
  process.exit(1);
}

const wallet = privateKeyToAccount(generatePrivateKey()).address;

// 1. submitAssessment (user submits a wallet + declared type)
const submit = await registry.submitAssessment(wallet, "PERSONAL");
await registry.waitForReceipt(submit);
console.log("1. submitAssessment:", submit);

// 2. submitEvidence (oracle submits Attestcoin-verified evidence; mock accepts
//    placeholder proofs)
const evidence = await registry.submitEvidence(wallet, {
  chainKey: keccak256(stringToHex("ethereum:11155111")),
  blockHeight: 1n,
  encodedTx: "0x1234",
  merkleProof: "0x",
  continuityProof: "0x",
  eventType: "aave:borrow",
});
await registry.waitForReceipt(evidence);
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
await registry.waitForReceipt(review);
console.log("3. reviewAssessment:", review);

// 4. DemoLending.getLoanTerms (third-party read)
const terms = await registry.getLoanTerms(wallet);
console.log("4. getLoanTerms   :", terms);

console.log("\nWallet:", wallet);
console.log("Note: getLoanTerms maps score 862 (>= 850) → 50% collateral / 7.00% APR.");

import { network } from "hardhat";

const { viem } = await network.create({ network: "creditcoinTestnet" });

const [deployer] = await viem.getWalletClients();
if (!deployer) {
  throw new Error(
    "No deployer account found. Set CREDITCOIN_PRIVATE_KEY in .env and fund it " +
      "with testnet tCTC from the Creditcoin faucet, then re-run.",
  );
}

console.log("Network  : Creditcoin Testnet (chainId 102031)");
console.log("Deployer :", deployer.account.address);
console.log("");

// 1. Attestcoin verifier — the demo deploys a mock. For production, swap
//    `verifier.address` below for the real Attestcoin precompile on Creditcoin.
const verifier = await viem.deployContract("MockAttestcoinVerifier");
console.log("MockAttestcoinVerifier :", verifier.address);

// 2. Reputation registry (owner = deployer = oracle by default).
const registry = await viem.deployContract("ReputationRegistry", [
  verifier.address,
]);
console.log("ReputationRegistry     :", registry.address);

// 3. Demo lending.
const lending = await viem.deployContract("DemoLending", [registry.address]);
console.log("DemoLending            :", lending.address);

console.log("");
console.log("✅ Deployment complete");
console.log(`   ReputationRegistry: ${registry.address}`);
console.log(`   DemoLending:        ${lending.address}`);

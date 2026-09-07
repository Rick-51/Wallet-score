import { network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const NATIVE_ATTESTCOIN_VERIFIER = "0x0000000000000000000000000000000000000FD2";
const SEPOLIA_CHAIN_KEY = 1n;
const AAVE_POOL_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";

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

// 1. Reputation registry (owner = deployer = oracle by default) wired directly
//    to Creditcoin's native Attestcoin block-prover precompile.
const registry = await viem.deployContract("ReputationRegistry", [
  NATIVE_ATTESTCOIN_VERIFIER,
]);
console.log("ReputationRegistry     :", registry.address);

await registry.write.setAavePool([SEPOLIA_CHAIN_KEY, AAVE_POOL_SEPOLIA]);
console.log("Sepolia Aave pool      :", AAVE_POOL_SEPOLIA);

// 2. Demo lending.
const lending = await viem.deployContract("DemoLending", [registry.address]);
console.log("DemoLending            :", lending.address);

console.log("");
console.log("✅ Deployment complete");
console.log(`   ReputationRegistry: ${registry.address}`);
console.log(`   DemoLending:        ${lending.address}`);

const deploymentFile = resolve("deployments/creditcoin-testnet.json");
await mkdir(dirname(deploymentFile), { recursive: true });
await writeFile(
  deploymentFile,
  JSON.stringify(
    {
      network: "creditcoinTestnet",
      chainId: 102031,
      explorer: "https://creditcoin-testnet.blockscout.com",
      deployer: deployer.account.address,
      contracts: {
        AttestcoinNativeVerifier: {
          address: NATIVE_ATTESTCOIN_VERIFIER,
          abi: "@gluwa/usc-contracts/contracts/write-ability/INativeQueryVerifier.sol",
        },
        ReputationRegistry: {
          address: registry.address,
          abi: "artifacts/contracts/ReputationRegistry.sol/ReputationRegistry.json",
        },
        DemoLending: {
          address: lending.address,
          abi: "artifacts/contracts/DemoLending.sol/DemoLending.json",
        },
      },
      sourceChains: {
        sepolia: {
          chainId: 11155111,
          attestcoinChainKey: Number(SEPOLIA_CHAIN_KEY),
          aavePool: AAVE_POOL_SEPOLIA,
        },
      },
      notes: {
        owner: `deployer (${deployer.account.address})`,
        oracle: "deployer",
        reviewer: "deployer",
        attestcoin: "Creditcoin native Block Prover precompile (0xFD2)",
      },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(`   Deployment record:  ${deploymentFile}`);

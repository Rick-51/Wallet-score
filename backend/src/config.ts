import "dotenv/config";
import { z } from "zod";

export type Network = "sepolia" | "ethereum" | "mainnet";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_PATH: z.string().min(1).default("./data/reputation.db"),

  NETWORK: z.enum(["sepolia", "ethereum", "mainnet"]).default("sepolia"),
  RPC_URL_SEPOLIA: z
    .string()
    .min(1)
    .default("https://ethereum-sepolia-rpc.publicnode.com"),
  RPC_URL_ETHEREUM: z.string().min(1).default("https://eth.llamarpc.com"),

  // Optional Etherscan API key — enables transaction-history metrics.
  ETHERSCAN_API_KEY: z.string().optional(),

  ADMIN_API_KEY: z.string().min(1).default("dev-admin-key"),

  // Aave V3 (Sepolia) pool proxy.
  AAVE_POOL_SEPOLIA: z
    .string()
    .min(1)
    .default("0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"),
  AAVE_START_BLOCK: z.coerce.bigint().default(3975368n),
  LOG_CHUNK: z.coerce.bigint().default(50000n),

  // ---- Creditcoin testnet / on-chain contracts ----
  CREDITCOIN_RPC_URL: z
    .string()
    .min(1)
    .default("https://rpc.cc3-testnet.creditcoin.network"),
  CREDITCOIN_PROOF_BUILDER_URL: z
    .string()
    .url()
    .default("https://prover.cc3-testnet.creditcoin.network"),
  // Signer for on-chain writes (submitAssessment / submitEvidence / review).
  // Leave empty to disable on-chain sync (backend runs read-only, local only).
  CREDITCOIN_PRIVATE_KEY: z.string().optional(),
  // Hardhat deployment record: contains contract addresses + ABI paths.
  DEPLOYMENT_FILE: z
    .string()
    .min(1)
    .default("../smartContract/deployments/creditcoin-testnet.json"),
  // Optional overrides (defaults are read from DEPLOYMENT_FILE).
  REGISTRY_ADDRESS: z.string().optional(),
  DEMO_LENDING_ADDRESS: z.string().optional(),

  // Optional stablecoin token addresses for balance aggregation.
  USDC_SEPOLIA: z.string().optional(),
  USDT_SEPOLIA: z.string().optional(),
  DAI_SEPOLIA: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  throw new Error("Invalid environment variables");
}

export const config = parsed.data;

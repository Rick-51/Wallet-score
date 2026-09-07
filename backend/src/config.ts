import "dotenv/config";
import { z } from "zod";

export type Network = "sepolia" | "ethereum" | "mainnet";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_PATH: z.string().min(1).default("./data/reputation.db"),

  NETWORK: z.enum(["sepolia", "ethereum", "mainnet"]).default("sepolia"),
  RPC_URL_SEPOLIA: z.string().min(1).default("https://rpc.sepolia.org"),
  RPC_URL_ETHEREUM: z.string().min(1).default("https://eth.llamarpc.com"),

  // Optional Etherscan API key — enables transaction-history metrics.
  ETHERSCAN_API_KEY: z.string().optional(),

  ADMIN_API_KEY: z.string().min(1).default("dev-admin-key"),

  // Aave V3 (Sepolia) pool proxy.
  AAVE_POOL_SEPOLIA: z
    .string()
    .min(1)
    .default("0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"),
  AAVE_START_BLOCK: z.coerce.bigint().default(0n),
  LOG_CHUNK: z.coerce.bigint().default(5000n),

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

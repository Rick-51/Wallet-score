import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import type { RiskLevel, WalletType } from "../db/schema.js";

export const CREDITCOIN_CHAIN_ID = 102031;

const WALLET_TYPE_ENUM: Record<WalletType, number> = {
  PERSONAL: 0,
  AI_AGENT: 1,
  BUSINESS: 2,
  DAO: 3,
};

const RISK_LEVEL_ENUM: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const creditcoinTestnet = defineChain({
  id: CREDITCOIN_CHAIN_ID,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "tCTC", decimals: 18 },
  rpcUrls: { default: { http: [config.CREDITCOIN_RPC_URL] } },
});

interface DeploymentContract {
  address: string;
  abi: string;
}

interface Deployment {
  chainId: number;
  contracts: Record<string, DeploymentContract>;
}

export interface OnchainEvidence {
  chainKey: bigint;
  blockHeight: bigint;
  sourceTxHash: Hash;
  encodedTx: `0x${string}`;
  merkleProof: {
    root: Hash;
    siblings: Array<{ hash: Hash; isLeft: boolean }>;
  };
  continuityProof: {
    lowerEndpointDigest: Hash;
    roots: Hash[];
  };
  eventType: string;
}

export interface OnchainReview {
  reputationScore: number;
  riskLevel: RiskLevel;
  creditLimitUsdMinor: bigint;
  aprBps: number;
  collateralBps: number;
  reviewerNotes: string;
}

export interface LoanTerms {
  approved: boolean;
  collateralBps: number;
  aprBps: number;
}

/**
 * Typed client for the deployed `ReputationRegistry` + `DemoLending` contracts.
 *
 * ABI + addresses are read at runtime from the Hardhat deployment record
 * (DEPLOYMENT_FILE) so the backend stays in sync with the contract repo without
 * copying ABIs. When CREDITCOIN_PRIVATE_KEY is unset, load() returns null and
 * on-chain writes are skipped (local-only mode).
 */
export class RegistryClient {
  private constructor(
    readonly registryAddress: Address,
    readonly demoLendingAddress: Address | null,
    private readonly registryAbi: Abi,
    private readonly demoLendingAbi: Abi | null,
    private readonly walletClient: WalletClient,
    private readonly publicClient: PublicClient,
  ) {}

  static load(): RegistryClient | null {
    if (!config.CREDITCOIN_PRIVATE_KEY) {
      console.warn("CREDITCOIN_PRIVATE_KEY not set — on-chain sync disabled.");
      return null;
    }
    try {
      const deployment = loadDeployment();
      const registry = deployment.contracts.ReputationRegistry;
      if (!registry) throw new Error("ReputationRegistry missing from deployment file");
      const demoLending = deployment.contracts.DemoLending;

      const registryAddress = getAddress(config.REGISTRY_ADDRESS || registry.address);
      const demoLendingAddress = config.DEMO_LENDING_ADDRESS || demoLending?.address || null;

      const account = privateKeyToAccount(normalizeKey(config.CREDITCOIN_PRIVATE_KEY));
      const transport = http(config.CREDITCOIN_RPC_URL);
      const publicClient = createPublicClient({ chain: creditcoinTestnet, transport });
      const walletClient = createWalletClient({ account, chain: creditcoinTestnet, transport });

      return new RegistryClient(
        registryAddress,
        demoLendingAddress ? getAddress(demoLendingAddress) : null,
        loadAbi(registry.abi),
        demoLending ? loadAbi(demoLending.abi) : null,
        walletClient,
        publicClient,
      );
    } catch (err) {
      console.error("Failed to load ReputationRegistry client:", err);
      return null;
    }
  }

  async submitAssessment(wallet: Address, walletType: WalletType): Promise<Hash> {
    return this.write("submitAssessment", [wallet, WALLET_TYPE_ENUM[walletType]]);
  }

  async submitEvidence(wallet: Address, evidence: OnchainEvidence): Promise<Hash> {
    return this.write("submitEvidence", [
      wallet,
      evidence.chainKey,
      evidence.blockHeight,
      evidence.sourceTxHash,
      evidence.encodedTx,
      evidence.merkleProof,
      evidence.continuityProof,
      evidence.eventType,
    ]);
  }

  async reviewAssessment(wallet: Address, review: OnchainReview): Promise<Hash> {
    return this.write("reviewAssessment", [
      wallet,
      review.reputationScore,
      RISK_LEVEL_ENUM[review.riskLevel],
      review.creditLimitUsdMinor,
      review.aprBps,
      review.collateralBps,
      review.reviewerNotes,
    ]);
  }

  // Owner-only, one-time setup helpers.
  async setOracle(address: Address): Promise<Hash> {
    return this.write("setOracle", [address]);
  }

  async addReviewer(address: Address): Promise<Hash> {
    return this.write("addReviewer", [address]);
  }

  async waitForReceipt(hash: Hash) {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }

  async getLoanTerms(wallet: Address): Promise<LoanTerms> {
    if (!this.demoLendingAddress || !this.demoLendingAbi) {
      throw new Error("DemoLending not configured");
    }
    // viem decodes the named struct output into an object.
    const terms = (await this.publicClient.readContract({
      address: this.demoLendingAddress,
      abi: this.demoLendingAbi,
      functionName: "getLoanTerms",
      args: [wallet],
    })) as { approved: boolean; collateralBps: number; aprBps: number };
    return {
      approved: terms.approved,
      collateralBps: terms.collateralBps,
      aprBps: terms.aprBps,
    };
  }

  private async write(functionName: string, args: unknown[]): Promise<Hash> {
    // The ABI is loaded at runtime so viem cannot statically type the function
    // signature; the options object is cast accordingly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await (this.walletClient as any).writeContract({
      address: this.registryAddress,
      abi: this.registryAbi,
      functionName,
      args,
    });
    const txHash = hash as Hash;
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} reverted in transaction ${txHash}`);
    }
    return txHash;
  }
}

let cached: RegistryClient | null | undefined;

export function getRegistry(): RegistryClient | null {
  if (cached === undefined) cached = RegistryClient.load();
  return cached;
}

function normalizeKey(key: string): `0x${string}` {
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

function loadDeployment(): Deployment {
  const file = path.resolve(config.DEPLOYMENT_FILE);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Deployment;
}

function loadAbi(abiRelPath: string): Abi {
  // The `abi` field in the deployment record is relative to the smartContract
  // directory (the parent of `deployments/`).
  const deploymentFile = path.resolve(config.DEPLOYMENT_FILE);
  const smartContractDir = path.resolve(path.dirname(deploymentFile), "..");
  const abiFile = path.resolve(smartContractDir, abiRelPath);
  return JSON.parse(fs.readFileSync(abiFile, "utf-8")).abi as Abi;
}

import { eq } from "drizzle-orm";
import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { JsonRpcProvider } from "ethers";
import { type Hash, type Hex } from "viem";
import { config } from "../config.js";
import { db } from "../db/client.js";
import {
  attestations,
  type EventType,
  type ProofStatus,
} from "../db/schema.js";
import type { RegistryClient } from "./registry.js";

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  BORROW: "aave:borrow",
  REPAY: "aave:repay",
  LIQUIDATION: "liquidation",
};

export interface Evidence {
  walletId: number;
  walletAddress: string;
  chainId: number; // source chain id (e.g. Sepolia = 11155111)
  sourceTxHash: string; // source-chain tx hash
  blockHeight: bigint; // source-chain block height
  eventType: EventType;
}

export interface AttestationRecord {
  id: number;
  proofStatus: ProofStatus;
  onchainTxHash: string | null;
}

/**
 * AttestcoinClient — the "Verification Layer" boundary.
 *
 * Records evidence locally, requests a genuine inclusion + continuity proof
 * from Creditcoin's proof builder, checks it against the native block-prover
 * precompile, then forwards the same proof to ReputationRegistry for atomic
 * verification and evidence recording.
 */
export class AttestcoinClient {
  constructor(
    private readonly registry: RegistryClient | null,
    private readonly chainId: number,
  ) {}

  async submitEvidence(evidence: Evidence): Promise<AttestationRecord> {
    const [row] = await db
      .insert(attestations)
      .values({
        walletId: evidence.walletId,
        chainId: evidence.chainId,
        sourceTxHash: evidence.sourceTxHash,
        eventType: evidence.eventType,
        proofStatus: "PENDING",
      })
      .returning({ id: attestations.id, proofStatus: attestations.proofStatus });

    if (!this.registry) {
      return { id: row.id, proofStatus: row.proofStatus, onchainTxHash: null };
    }

    try {
      const provider = new JsonRpcProvider(config.CREDITCOIN_RPC_URL);
      const chainProvider = new chainInfo.PrecompileChainInfoProvider(provider as never);
      const supported = await chainProvider.getSupportedChains();
      const sourceChain = supported.find((chain) => chain.chainId === evidence.chainId);
      if (!sourceChain) {
        throw new Error(`Source chain ${evidence.chainId} is not supported by Attestcoin`);
      }

      const latest = await chainProvider.getLatestAttestedHeightAndHash(sourceChain.chainKey);
      if (!latest.exists || latest.height < Number(evidence.blockHeight)) {
        console.warn(
          `Source block ${evidence.blockHeight} is not attested yet (latest ${latest.height})`,
        );
        return { id: row.id, proofStatus: row.proofStatus, onchainTxHash: null };
      }

      const builder = new proofProvider.service.ProofBuilder(
        sourceChain.chainKey,
        config.CREDITCOIN_PROOF_BUILDER_URL,
        60_000,
      );
      const proofResult = await builder.getProof(evidence.sourceTxHash);
      if (!proofResult.success || !proofResult.data) {
        throw new Error(proofResult.error ?? "Attestcoin proof builder returned no proof");
      }
      const proof = proofResult.data;

      const nativeVerifier = new blockProver.PrecompileBlockProver(provider as never);
      const verified = await nativeVerifier.verifySingle(
        proof.chainKey,
        proof.headerNumber,
        proof.txBytes,
        proof.merkleProof,
        proof.continuityProof,
      );
      if (!verified) throw new Error("Creditcoin native verifier rejected the proof");

      const txHash = await this.registry.submitEvidence(
        evidence.walletAddress as Hash,
        {
          chainKey: BigInt(proof.chainKey),
          blockHeight: BigInt(proof.headerNumber),
          sourceTxHash: evidence.sourceTxHash as Hash,
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
          eventType: EVENT_TYPE_LABEL[evidence.eventType],
        },
      );

      await db
        .update(attestations)
        .set({ proofStatus: "VERIFIED", onchainTxHash: txHash, verifiedAt: new Date() })
        .where(eq(attestations.id, row.id));

      return { id: row.id, proofStatus: "VERIFIED", onchainTxHash: txHash };
    } catch (err) {
      console.warn(`submitEvidence (${EVENT_TYPE_LABEL[evidence.eventType]}) failed:`, err);
      await db
        .update(attestations)
        .set({ proofStatus: "FAILED" })
        .where(eq(attestations.id, row.id));
      return { id: row.id, proofStatus: "FAILED", onchainTxHash: null };
    }
  }

  async getVerificationStatus(attestationId: number): Promise<ProofStatus> {
    const [row] = await db
      .select({ proofStatus: attestations.proofStatus })
      .from(attestations)
      .where(eq(attestations.id, attestationId))
      .limit(1);
    return row?.proofStatus ?? "PENDING";
  }
}

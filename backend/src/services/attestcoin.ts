import { eq } from "drizzle-orm";
import { keccak256, stringToHex, type Hash } from "viem";
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
 * Records evidence locally, then forwards it to the on-chain
 * `ReputationRegistry.submitEvidence`, which checks the proof against the
 * Attestcoin verifier before storing it. With the current MockAttestcoinVerifier
 * (verify always returns true) the demo works with placeholder proofs.
 *
 * TODO(attestcoin): the real Creditcoin precompile requires a genuine Merkle
 * inclusion proof + continuity proof produced by an Attestcoin node. Until that
 * is wired up, `encodedTx` is the source tx hash and both proofs are empty.
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
      const chainKey = keccak256(stringToHex(`ethereum:${evidence.chainId}`));
      const txHash = await this.registry.submitEvidence(
        evidence.walletAddress as Hash,
        {
          chainKey,
          blockHeight: evidence.blockHeight,
          encodedTx: evidence.sourceTxHash as Hash,
          merkleProof: "0x",
          continuityProof: "0x",
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
      return { id: row.id, proofStatus: row.proofStatus, onchainTxHash: null };
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

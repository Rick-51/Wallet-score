import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { attestations, type EventType, type ProofStatus } from "../db/schema.js";

export interface Evidence {
  walletId: number;
  chainId: number;
  sourceTxHash: string | null;
  eventType: EventType;
}

export interface AttestationRecord {
  id: number;
  proofStatus: ProofStatus;
}

/**
 * AttestcoinClient — the boundary for the "Verification Layer".
 *
 * The Creditcoin / Attestcoin contract (`ReputationRegistry.sol`) is NOT
 * deployed yet. This stub records evidence in the local `attestations` table
 * with `proofStatus = "PENDING"` and returns a synthetic proof id, so the rest
 * of the pipeline (worker, admin UI) can be built against a stable interface.
 *
 * TODO(contract): once ReputationRegistry.sol is deployed, replace the body of
 * `submitEvidence` with a viem `writeContract` call that posts a merkle proof /
 * event reference to Attestcoin, and poll `getVerificationStatus` against the
 * on-chain attestation id instead of the local row.
 */
export class AttestcoinClient {
  constructor(private readonly chainId: number) {}

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

    // TODO(contract): submit proof to Attestcoin and persist the on-chain id.
    return row;
  }

  async getVerificationStatus(attestationId: number): Promise<ProofStatus> {
    const row = await db
      .select({ proofStatus: attestations.proofStatus })
      .from(attestations)
      .where(eq(attestations.id, attestationId))
      .limit(1);

    // TODO(contract): read on-chain status; for now reflect the local row.
    return row[0]?.proofStatus ?? "PENDING";
  }
}

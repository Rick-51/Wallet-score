import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/client.js";
import {
  assessmentRequests,
  assessments,
  attestations,
  requestStatuses,
  riskLevels,
  walletMetrics,
  wallets,
} from "../db/schema.js";
import {
  badRequest,
  firstZodMessage,
  notFound,
  unauthorized,
} from "../lib/errors.js";
import { getRegistry } from "../services/registry.js";

const reviewSchema = z.object({
  reputationScore: z.coerce.number().int().min(0).max(1000),
  riskLevel: z.enum(riskLevels),
  // Contract-native units: USD minor units (×100) and basis points.
  creditLimitUsdMinor: z.coerce.number().int().min(0),
  aprBps: z.coerce.number().int().min(0).max(65535),
  collateralBps: z.coerce.number().int().min(0).max(65535),
  reviewerNotes: z.string().default(""),
});

export const adminRouter = new Hono();

adminRouter.use("*", async (c, next) => {
  const key = c.req.header("X-Admin-Key");
  if (!key || key !== config.ADMIN_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

adminRouter.get("/assessments", async (c) => {
  const status = c.req.query("status");
  const base = db
    .select({
      request: assessmentRequests,
      wallet: wallets,
    })
    .from(assessmentRequests)
    .innerJoin(wallets, eq(assessmentRequests.walletId, wallets.id));

  const rows =
    status && requestStatuses.includes(status as (typeof requestStatuses)[number])
      ? await base
          .where(eq(assessmentRequests.status, status as (typeof requestStatuses)[number]))
          .orderBy(desc(assessmentRequests.id))
      : await base.orderBy(desc(assessmentRequests.id));

  return c.json({ assessments: rows });
});

adminRouter.get("/assessments/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw badRequest("Invalid id");

  const request = (
    await db.select().from(assessmentRequests).where(eq(assessmentRequests.id, id)).limit(1)
  )[0];
  if (!request) throw notFound("Assessment request not found");

  const [wallet, metrics, attestationRows, assessment] = await Promise.all([
    db.select().from(wallets).where(eq(wallets.id, request.walletId)).limit(1),
    db.select().from(walletMetrics).where(eq(walletMetrics.walletId, request.walletId)).limit(1),
    db.select().from(attestations).where(eq(attestations.walletId, request.walletId)),
    db.select().from(assessments).where(eq(assessments.requestId, request.id)).limit(1),
  ]);

  return c.json({
    request,
    wallet: wallet[0] ?? null,
    metrics: metrics[0] ?? null,
    attestations: attestationRows,
    assessment: assessment[0] ?? null,
  });
});

adminRouter.post("/assessments/:id/review", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw badRequest("Invalid id");

  const request = (
    await db.select().from(assessmentRequests).where(eq(assessmentRequests.id, id)).limit(1)
  )[0];
  if (!request) throw notFound("Assessment request not found");

  const parsed = reviewSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(firstZodMessage(parsed.error));
  const body = parsed.data;

  const wallet = (
    await db.select().from(wallets).where(eq(wallets.id, request.walletId)).limit(1)
  )[0];
  if (!wallet) throw notFound("Wallet not found");

  // On-chain review (best-effort — requires the signer to be owner or a reviewer).
  let onchainTxHash: string | null = null;
  const registry = getRegistry();
  if (registry) {
    try {
      onchainTxHash = await registry.reviewAssessment(
        wallet.address as `0x${string}`,
        {
          reputationScore: body.reputationScore,
          riskLevel: body.riskLevel,
          creditLimitUsdMinor: BigInt(body.creditLimitUsdMinor),
          aprBps: body.aprBps,
          collateralBps: body.collateralBps,
          reviewerNotes: body.reviewerNotes,
        },
      );
    } catch (err) {
      console.warn("on-chain reviewAssessment failed:", err);
    }
  }

  const [assessment] = await db
    .insert(assessments)
    .values({
      walletId: request.walletId,
      requestId: request.id,
      reputationScore: body.reputationScore,
      riskLevel: body.riskLevel,
      creditLimitUsdMinor: body.creditLimitUsdMinor,
      aprBps: body.aprBps,
      collateralBps: body.collateralBps,
      reviewerNotes: body.reviewerNotes,
      onchainTxHash,
    })
    .returning();

  await db
    .update(assessmentRequests)
    .set({ status: "APPROVED", reviewedAt: new Date() })
    .where(eq(assessmentRequests.id, request.id));

  return c.json({ assessment, onchainTxHash }, 201);
});

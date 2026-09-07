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

const reviewSchema = z.object({
  reputationScore: z.number().int().min(0).max(1000),
  riskLevel: z.enum(riskLevels),
  suggestedCreditLimit: z.string().min(1),
  suggestedApr: z.string().min(1),
  suggestedCollateralRatio: z.string().min(1),
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

  const [assessment] = await db
    .insert(assessments)
    .values({
      walletId: request.walletId,
      requestId: request.id,
      reputationScore: body.reputationScore,
      riskLevel: body.riskLevel,
      suggestedCreditLimit: body.suggestedCreditLimit,
      suggestedApr: body.suggestedApr,
      suggestedCollateralRatio: body.suggestedCollateralRatio,
      reviewerNotes: body.reviewerNotes,
    })
    .returning();

  await db
    .update(assessmentRequests)
    .set({ status: "APPROVED", reviewedAt: new Date() })
    .where(eq(assessmentRequests.id, request.id));

  return c.json({ assessment }, 201);
});

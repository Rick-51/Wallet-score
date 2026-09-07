import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  assessmentRequests,
  assessments,
  attestations,
  walletMetrics,
  wallets,
  walletTypes,
} from "../db/schema.js";
import {
  badRequest,
  firstZodMessage,
  notFound,
} from "../lib/errors.js";
import { canonicalAddress, isValidWalletAddress } from "../lib/address.js";
import { analysisQueue } from "../lib/queue.js";
import { runAnalysis } from "../services/analyzer.js";

const analyzeSchema = z.object({
  walletAddress: z.string().refine(isValidWalletAddress, {
    message: "Invalid wallet address",
  }),
  walletType: z.enum(walletTypes),
});

export const walletsRouter = new Hono();

walletsRouter.post("/analyze", async (c) => {
  const parsed = analyzeSchema.safeParse(await c.req.json());
  if (!parsed.success) throw badRequest(firstZodMessage(parsed.error));
  const { walletAddress, walletType } = parsed.data;

  const address = canonicalAddress(walletAddress);

  // Upsert wallet (create or refresh declared type).
  const existing = await db
    .select()
    .from(wallets)
    .where(eq(wallets.address, address))
    .limit(1);
  let wallet = existing[0];
  if (!wallet) {
    wallet = (await db.insert(wallets).values({ address, walletType }).returning())[0];
  } else if (wallet.walletType !== walletType) {
    await db
      .update(wallets)
      .set({ walletType })
      .where(eq(wallets.id, wallet.id));
    wallet = { ...wallet, walletType };
  }

  const [request] = await db
    .insert(assessmentRequests)
    .values({ walletId: wallet.id, status: "PENDING" })
    .returning();

  analysisQueue.enqueue(() => runAnalysis(request.id));

  return c.json(
    { requestId: request.id, walletAddress: address, status: "PENDING" },
    202,
  );
});

walletsRouter.get("/:address", async (c) => {
  const raw = c.req.param("address");
  if (!isValidWalletAddress(raw)) throw badRequest("Invalid wallet address");
  const address = canonicalAddress(raw);

  const wallet = (
    await db.select().from(wallets).where(eq(wallets.address, address)).limit(1)
  )[0];
  if (!wallet) throw notFound("Wallet not found");

  const metrics =
    (await db
      .select()
      .from(walletMetrics)
      .where(eq(walletMetrics.walletId, wallet.id))
      .limit(1))[0] ?? null;

  const latestRequest =
    (await db
      .select()
      .from(assessmentRequests)
      .where(eq(assessmentRequests.walletId, wallet.id))
      .orderBy(desc(assessmentRequests.id))
      .limit(1))[0] ?? null;

  return c.json({ wallet, metrics, latestRequest });
});

walletsRouter.get("/:address/assessment", async (c) => {
  const raw = c.req.param("address");
  if (!isValidWalletAddress(raw)) throw badRequest("Invalid wallet address");
  const address = canonicalAddress(raw);

  const wallet = (
    await db.select().from(wallets).where(eq(wallets.address, address)).limit(1)
  )[0];
  if (!wallet) throw notFound("Wallet not found");

  const [metrics, assessment, attestationRows] = await Promise.all([
    db
      .select()
      .from(walletMetrics)
      .where(eq(walletMetrics.walletId, wallet.id))
      .limit(1),
    db
      .select()
      .from(assessments)
      .where(eq(assessments.walletId, wallet.id))
      .orderBy(desc(assessments.id))
      .limit(1),
    db
      .select()
      .from(attestations)
      .where(eq(attestations.walletId, wallet.id)),
  ]);

  return c.json({
    wallet,
    metrics: metrics[0] ?? null,
    assessment: assessment[0] ?? null,
    attestations: attestationRows,
  });
});

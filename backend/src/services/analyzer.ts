import { eq, inArray, sql } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import {
  assessmentRequests,
  walletMetrics,
  wallets,
  type EventType,
} from "../db/schema.js";
import { analysisQueue } from "../lib/queue.js";
import { fetchAaveMetrics } from "./aave.js";
import { AttestcoinClient } from "./attestcoin.js";
import { chainIdFor, readBalances } from "./chain.js";
import { fetchTxHistory } from "./etherscan.js";
import { getRegistry } from "./registry.js";

/**
 * The "Backend Worker" body. Runs off the HTTP request via the in-process queue:
 * collects on-chain + lending data, persists metrics, creates verification
 * stubs, and advances the request PENDING → ANALYZING → READY_FOR_REVIEW.
 */
export async function runAnalysis(requestId: number): Promise<void> {
  await db
    .update(assessmentRequests)
    .set({ status: "ANALYZING" })
    .where(eq(assessmentRequests.id, requestId));

  const [request] = await db
    .select()
    .from(assessmentRequests)
    .where(eq(assessmentRequests.id, requestId));
  if (!request) return;

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, request.walletId));
  if (!wallet) return;

  const address = wallet.address as `0x${string}`;
  const chainId = chainIdFor(config.NETWORK);

  try {
    const [balances, txHistory, aave] = await Promise.all([
      readBalances(address),
      fetchTxHistory(address),
      fetchAaveMetrics(address),
    ]);

    // Upsert metrics (one row per wallet).
    await db
      .insert(walletMetrics)
      .values({
        walletId: wallet.id,
        ethBalance: balances.ethBalance,
        stablecoinBalance: balances.stablecoinBalance,
        transactionCount: txHistory.transactionCount,
        activeDays: txHistory.activeDays,
        totalBorrowed: aave.totalBorrowed,
        totalRepaid: aave.totalRepaid,
        outstandingDebt: aave.outstandingDebt,
        borrowCount: aave.borrowCount,
        repaymentCount: aave.repaymentCount,
        liquidationCount: aave.liquidationCount,
        liquidatedAmount: aave.liquidatedAmount,
        largestLoan: aave.largestLoan,
        averageLoanSize: aave.averageLoanSize,
        currentCollateral: aave.currentCollateral,
      })
      .onConflictDoUpdate({
        target: walletMetrics.walletId,
        set: {
          ethBalance: sql`excluded.eth_balance`,
          stablecoinBalance: sql`excluded.stablecoin_balance`,
          transactionCount: sql`excluded.transaction_count`,
          activeDays: sql`excluded.active_days`,
          totalBorrowed: sql`excluded.total_borrowed`,
          totalRepaid: sql`excluded.total_repaid`,
          outstandingDebt: sql`excluded.outstanding_debt`,
          borrowCount: sql`excluded.borrow_count`,
          repaymentCount: sql`excluded.repayment_count`,
          liquidationCount: sql`excluded.liquidation_count`,
          liquidatedAmount: sql`excluded.liquidated_amount`,
          largestLoan: sql`excluded.largest_loan`,
          averageLoanSize: sql`excluded.average_loan_size`,
          currentCollateral: sql`excluded.current_collateral`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    // Update wallet timestamps (keep any previously known earlier first_seen).
    await db
      .update(wallets)
      .set({
        firstSeen: txHistory.firstTransactionTime ?? wallet.firstSeen,
        lastActive: txHistory.lastActiveTime ?? wallet.lastActive,
      })
      .where(eq(wallets.id, wallet.id));

    // Submit verified evidence (Attestcoin verification layer).
    const attest = new AttestcoinClient(getRegistry(), chainId);
    const evidence: Array<{
      tx: string | null;
      block: bigint | null;
      type: EventType;
    }> = [
      { tx: aave.latestBorrowTx, block: aave.latestBorrowBlock, type: "BORROW" },
      { tx: aave.latestRepayTx, block: aave.latestRepayBlock, type: "REPAY" },
      { tx: aave.latestLiquidationTx, block: aave.latestLiquidationBlock, type: "LIQUIDATION" },
    ];
    for (const e of evidence) {
      if (e.tx) {
        await attest.submitEvidence({
          walletId: wallet.id,
          walletAddress: wallet.address,
          chainId,
          sourceTxHash: e.tx,
          blockHeight: e.block ?? 0n,
          eventType: e.type,
        });
      }
    }

    await db
      .update(assessmentRequests)
      .set({ status: "READY_FOR_REVIEW" })
      .where(eq(assessmentRequests.id, requestId));
  } catch (err) {
    console.error(`Analysis failed for request ${requestId}:`, err);
    // Revert to PENDING so it can be retried (re-enqueued on next startup).
    await db
      .update(assessmentRequests)
      .set({ status: "PENDING" })
      .where(eq(assessmentRequests.id, requestId));
  }
}

/** Re-enqueue any unfinished requests on startup (survives restart). */
export async function requeueUnfinished(): Promise<number> {
  const rows = await db
    .select()
    .from(assessmentRequests)
    .where(inArray(assessmentRequests.status, ["PENDING", "ANALYZING"]));
  for (const row of rows) {
    analysisQueue.enqueue(() => runAnalysis(row.id));
  }
  return rows.length;
}

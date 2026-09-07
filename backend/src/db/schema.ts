import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---- Enumerated types -------------------------------------------------------

export const walletTypes = ["PERSONAL", "AI_AGENT", "BUSINESS", "DAO"] as const;
export type WalletType = (typeof walletTypes)[number];

export const requestStatuses = [
  "PENDING",
  "ANALYZING",
  "READY_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const riskLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof riskLevels)[number];

export const proofStatuses = ["PENDING", "VERIFIED", "FAILED"] as const;
export type ProofStatus = (typeof proofStatuses)[number];

export const eventTypes = ["BORROW", "REPAY", "LIQUIDATION"] as const;
export type EventType = (typeof eventTypes)[number];

// ---- Tables -----------------------------------------------------------------

export const wallets = sqliteTable("wallets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Canonicalized lowercase address.
  address: text("address").notNull().unique(),
  walletType: text("wallet_type", { enum: walletTypes }).notNull(),
  firstSeen: integer("first_seen", { mode: "timestamp_ms" }),
  lastActive: integer("last_active", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Monetary amounts are stored as decimal strings (never floats). Counts are
// integers. Nullable fields mean "not yet collected".
export const walletMetrics = sqliteTable("wallet_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletId: integer("wallet_id")
    .notNull()
    .unique()
    .references(() => wallets.id, { onDelete: "cascade" }),

  // Wallet base data
  ethBalance: text("eth_balance"),
  stablecoinBalance: text("stablecoin_balance"),
  transactionCount: integer("transaction_count"),
  activeDays: integer("active_days"),

  // DeFi lending data (Aave)
  totalBorrowed: text("total_borrowed"),
  totalRepaid: text("total_repaid"),
  outstandingDebt: text("outstanding_debt"),
  borrowCount: integer("borrow_count"),
  repaymentCount: integer("repayment_count"),
  liquidationCount: integer("liquidation_count"),
  liquidatedAmount: text("liquidated_amount"),
  largestLoan: text("largest_loan"),
  averageLoanSize: text("average_loan_size"),
  currentCollateral: text("current_collateral"),

  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const assessmentRequests = sqliteTable("assessment_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  status: text("status", { enum: requestStatuses }).notNull().default("PENDING"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
});

export const assessments = sqliteTable("assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  requestId: integer("request_id")
    .notNull()
    .references(() => assessmentRequests.id, { onDelete: "cascade" }),

  reputationScore: integer("reputation_score").notNull(),
  riskLevel: text("risk_level", { enum: riskLevels }).notNull(),
  suggestedCreditLimit: text("suggested_credit_limit").notNull(),
  suggestedApr: text("suggested_apr").notNull(),
  suggestedCollateralRatio: text("suggested_collateral_ratio").notNull(),
  reviewerNotes: text("reviewer_notes").notNull().default(""),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const attestations = sqliteTable("attestations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  chainId: integer("chain_id").notNull(),
  sourceTxHash: text("source_tx_hash"),
  eventType: text("event_type", { enum: eventTypes }).notNull(),
  proofStatus: text("proof_status", { enum: proofStatuses })
    .notNull()
    .default("PENDING"),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
});

// ---- Inferred row types -----------------------------------------------------

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type WalletMetrics = typeof walletMetrics.$inferSelect;
export type AssessmentRequest = typeof assessmentRequests.$inferSelect;
export type Assessment = typeof assessments.$inferSelect;
export type Attestation = typeof attestations.$inferSelect;

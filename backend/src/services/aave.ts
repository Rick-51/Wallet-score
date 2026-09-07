import {
  erc20Abi,
  formatUnits,
  parseAbi,
  parseAbiItem,
  type AbiEvent,
  type Address,
  type PublicClient,
} from "viem";
import { config } from "../config.js";
import { getPublicClient } from "./chain.js";

const BORROW_EVENT = parseAbiItem(
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
);
const REPAY_EVENT = parseAbiItem(
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
);
const LIQUIDATION_EVENT = parseAbiItem(
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
);

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

export interface AaveMetrics {
  // Historical totals are token-denominated, normalized to an 18-decimal scale
  // (not USD). currentCollateral / outstandingDebt are USD from getUserAccountData.
  totalBorrowed: string | null;
  totalRepaid: string | null;
  outstandingDebt: string | null;
  borrowCount: number;
  repaymentCount: number;
  liquidationCount: number;
  liquidatedAmount: string | null;
  largestLoan: string | null;
  averageLoanSize: string | null;
  currentCollateral: string | null;
  latestBorrowTx: string | null;
  latestRepayTx: string | null;
  latestLiquidationTx: string | null;
  latestBorrowBlock: bigint | null;
  latestRepayBlock: bigint | null;
  latestLiquidationBlock: bigint | null;
}

const EMPTY: AaveMetrics = {
  totalBorrowed: null,
  totalRepaid: null,
  outstandingDebt: null,
  borrowCount: 0,
  repaymentCount: 0,
  liquidationCount: 0,
  liquidatedAmount: null,
  largestLoan: null,
  averageLoanSize: null,
  currentCollateral: null,
  latestBorrowTx: null,
  latestRepayTx: null,
  latestLiquidationTx: null,
  latestBorrowBlock: null,
  latestRepayBlock: null,
  latestLiquidationBlock: null,
};

/** Raw, loosely-typed log shape returned by paginated getLogs. */
interface RawLog {
  args: Record<string, unknown>;
  transactionHash: string;
  blockNumber: bigint;
}

// `event`/`args` are intentionally loose here: getLogs' types are generic per
// event shape, and we cast results to RawLog anyway. Keeps the three event
// scans (Borrow/Repay/LiquidationCall) behind one pagination loop.
async function paginatedLogs(
  client: PublicClient,
  address: Address,
  event: AbiEvent,
  args: Record<string, unknown> | undefined,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLog[]> {
  const chunk = config.LOG_CHUNK;
  const out: RawLog[] = [];
  let from = fromBlock;
  while (from <= toBlock) {
    const to = from + chunk - 1n > toBlock ? toBlock : from + chunk - 1n;
    const batch = await client.getLogs({
      address,
      event,
      args,
      fromBlock: from,
      toBlock: to,
    });
    out.push(...(batch as unknown as RawLog[]));
    from = to + 1n;
  }
  return out;
}

const decimalsCache = new Map<string, number>();

async function reserveDecimals(client: PublicClient, reserve: string): Promise<number> {
  const key = reserve.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;
  let decimals = 18;
  try {
    decimals = Number(
      await client.readContract({
        address: reserve as Address,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    );
  } catch {
    // fall back to 18
  }
  decimalsCache.set(key, decimals);
  return decimals;
}

function scaleTo18(amount: bigint, decimals: number): bigint {
  if (decimals <= 18) return amount * 10n ** BigInt(18 - decimals);
  return amount / 10n ** BigInt(decimals - 18);
}

function asBigint(v: unknown): bigint {
  return BigInt(v as bigint);
}

export async function fetchAaveMetrics(address: Address): Promise<AaveMetrics> {
  if (!config.AAVE_POOL_SEPOLIA) return EMPTY;
  const pool = config.AAVE_POOL_SEPOLIA as Address;
  const client = getPublicClient(config.NETWORK);

  try {
    const toBlock = await client.getBlockNumber();
    const fromBlock = config.AAVE_START_BLOCK;

    // `onBehalfOf` is the account that owns the debt and is indexed, so it is
    // both more credit-relevant and dramatically cheaper to query than scanning
    // every Borrow event and filtering the non-indexed caller (`user`).
    const borrowLogs = await paginatedLogs(
      client,
      pool,
      BORROW_EVENT,
      { onBehalfOf: address },
      fromBlock,
      toBlock,
    );

    // Repay & LiquidationCall: `user` IS indexed → filter at the RPC.
    const repayLogs = await paginatedLogs(
      client,
      pool,
      REPAY_EVENT,
      { user: address },
      fromBlock,
      toBlock,
    );
    const liquidationLogs = await paginatedLogs(
      client,
      pool,
      LIQUIDATION_EVENT,
      { user: address },
      fromBlock,
      toBlock,
    );

    const borrowCount = borrowLogs.length;
    const repaymentCount = repayLogs.length;
    const liquidationCount = liquidationLogs.length;

    let totalBorrowed = 0n;
    let totalRepaid = 0n;
    let liquidatedAmount = 0n;
    let largestLoan = 0n;

    for (const log of borrowLogs) {
      const reserve = log.args.reserve as string;
      const decimals = await reserveDecimals(client, reserve);
      const scaled = scaleTo18(asBigint(log.args.amount), decimals);
      totalBorrowed += scaled;
      if (scaled > largestLoan) largestLoan = scaled;
    }
    for (const log of repayLogs) {
      const reserve = log.args.reserve as string;
      const decimals = await reserveDecimals(client, reserve);
      totalRepaid += scaleTo18(asBigint(log.args.amount), decimals);
    }
    for (const log of liquidationLogs) {
      const debtAsset = log.args.debtAsset as string;
      const decimals = await reserveDecimals(client, debtAsset);
      liquidatedAmount += scaleTo18(asBigint(log.args.debtToCover), decimals);
    }

    // Current collateral + outstanding debt in USD (8-decimal base currency).
    let currentCollateral: string | null = null;
    let outstandingDebt: string | null = null;
    try {
      const accountData = await client.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "getUserAccountData",
        args: [address],
      });
      currentCollateral = formatUnits(accountData[0], 8);
      outstandingDebt = formatUnits(accountData[1], 8);
    } catch (err) {
      console.warn("getUserAccountData failed:", err);
    }

    return {
      totalBorrowed: borrowCount > 0 ? formatUnits(totalBorrowed, 18) : null,
      totalRepaid: repaymentCount > 0 ? formatUnits(totalRepaid, 18) : null,
      outstandingDebt,
      borrowCount,
      repaymentCount,
      liquidationCount,
      liquidatedAmount: liquidationCount > 0 ? formatUnits(liquidatedAmount, 18) : null,
      largestLoan: borrowCount > 0 ? formatUnits(largestLoan, 18) : null,
      averageLoanSize:
        borrowCount > 0 ? formatUnits(totalBorrowed / BigInt(borrowCount), 18) : null,
      currentCollateral,
      latestBorrowTx: borrowLogs.at(-1)?.transactionHash ?? null,
      latestRepayTx: repayLogs.at(-1)?.transactionHash ?? null,
      latestLiquidationTx: liquidationLogs.at(-1)?.transactionHash ?? null,
      latestBorrowBlock: borrowLogs.at(-1)?.blockNumber ?? null,
      latestRepayBlock: repayLogs.at(-1)?.blockNumber ?? null,
      latestLiquidationBlock: liquidationLogs.at(-1)?.blockNumber ?? null,
    };
  } catch (err) {
    console.warn("fetchAaveMetrics failed:", err);
    return EMPTY;
  }
}

import { config } from "../config.js";

function chainId(network: string): string {
  return network === "sepolia" ? "11155111" : "1";
}

interface EtherscanTx {
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
}

export interface TxHistory {
  transactionCount: number | null;
  firstTransactionTime: Date | null;
  lastActiveTime: Date | null;
  activeDays: number | null;
}

const EMPTY: TxHistory = {
  transactionCount: null,
  firstTransactionTime: null,
  lastActiveTime: null,
  activeDays: null,
};

async function txlist(
  address: string,
  sort: "asc" | "desc",
): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    chainid: chainId(config.NETWORK),
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "1000",
    sort,
    apikey: config.ETHERSCAN_API_KEY!,
  });
  const res = await fetch(`https://api.etherscan.io/v2/api?${params.toString()}`);
  const json = (await res.json()) as {
    status: string;
    result: EtherscanTx[] | string;
  };
  if (json.status === "0" && typeof json.result === "string" && /no transactions/i.test(json.result)) {
    return [];
  }
  if (json.status !== "1" || !Array.isArray(json.result)) {
    throw new Error(
      `Etherscan error: ${typeof json.result === "string" ? json.result : json.status}`,
    );
  }
  return json.result;
}

/**
 * Optional transaction-history source. Without an `ETHERSCAN_API_KEY` (or if the
 * call fails) this returns nulls so the pipeline still completes — these fields
 * are approximate, indexer-derived values capped at 1,000 transactions on the
 * current Etherscan free tier.
 */
export async function fetchTxHistory(address: string): Promise<TxHistory> {
  if (!config.ETHERSCAN_API_KEY) {
    console.warn("ETHERSCAN_API_KEY not set; skipping tx-history metrics.");
    return EMPTY;
  }
  try {
    const [desc, asc] = await Promise.all([
      txlist(address, "desc"),
      txlist(address, "asc"),
    ]);

    const toDate = (t: EtherscanTx) => new Date(Number(t.timeStamp) * 1000);
    const days = new Set(
      desc.map((t) => toDate(t).toISOString().slice(0, 10)),
    );

    return {
      transactionCount: desc.length,
      firstTransactionTime: asc.length > 0 ? toDate(asc[0]) : null,
      lastActiveTime: desc.length > 0 ? toDate(desc[0]) : null,
      activeDays: days.size,
    };
  } catch (err) {
    console.warn("fetchTxHistory failed:", err);
    return EMPTY;
  }
}

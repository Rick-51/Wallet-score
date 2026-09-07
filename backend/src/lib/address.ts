import { getAddress, isAddress } from "viem";

export function isValidWalletAddress(value: string): boolean {
  return isAddress(value);
}

/** Canonical lowercase form used for storage and lookups. */
export function canonicalAddress(value: string): string {
  return getAddress(value.trim()).toLowerCase();
}

/** Human-friendly `0x1234…abcd` form for display. */
export function shortenAddress(address: string, leading = 4, trailing = 4): string {
  const a = address.startsWith("0x") ? address : address;
  if (a.length <= leading + trailing + 2) return a;
  return `${a.slice(0, leading + 2)}…${a.slice(-trailing)}`;
}

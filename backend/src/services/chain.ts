import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import { config, type Network } from "../config.js";

function rpcFor(network: Network): string {
  switch (network) {
    case "ethereum":
    case "mainnet":
      return config.RPC_URL_ETHEREUM;
    case "sepolia":
    default:
      return config.RPC_URL_SEPOLIA;
  }
}

export function chainIdFor(network: Network): number {
  return network === "sepolia" ? sepolia.id : mainnet.id;
}

const clients = new Map<Network, PublicClient>();

export function getPublicClient(network: Network = config.NETWORK): PublicClient {
  let client = clients.get(network);
  if (!client) {
    const chain = network === "sepolia" ? sepolia : mainnet;
    client = createPublicClient({ chain, transport: http(rpcFor(network)) });
    clients.set(network, client);
  }
  return client;
}

export interface BalanceSnapshot {
  ethBalance: string | null;
  stablecoinBalance: string | null;
}

export async function readEthBalance(
  address: Address,
  network: Network = config.NETWORK,
): Promise<string | null> {
  try {
    const balance = await getPublicClient(network).getBalance({ address });
    return formatEther(balance);
  } catch (err) {
    console.warn("readEthBalance failed:", err);
    return null;
  }
}

export async function readStablecoinBalance(
  address: Address,
  network: Network = config.NETWORK,
): Promise<string | null> {
  // Only Sepolia token addresses are configured for the MVP; other networks
  // return null until addresses are added.
  const tokens = [config.USDC_SEPOLIA, config.USDT_SEPOLIA, config.DAI_SEPOLIA].filter(
    (t): t is string => Boolean(t),
  );
  if (tokens.length === 0) return null;

  try {
    const client = getPublicClient(network);
    // Sum raw balances in a common 18-decimal scale to avoid float precision loss.
    let totalScaled = 0n;
    for (const token of tokens) {
      const raw = await client.readContract({
        address: token as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      const decimals = Number(
        await client.readContract({
          address: token as Address,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      );
      totalScaled += raw * 10n ** BigInt(18 - decimals);
    }
    return formatUnits(totalScaled, 18);
  } catch (err) {
    console.warn("readStablecoinBalance failed:", err);
    return null;
  }
}

export async function readBalances(
  address: Address,
  network: Network = config.NETWORK,
): Promise<BalanceSnapshot> {
  const [ethBalance, stablecoinBalance] = await Promise.all([
    readEthBalance(address, network),
    readStablecoinBalance(address, network),
  ]);
  return { ethBalance, stablecoinBalance };
}

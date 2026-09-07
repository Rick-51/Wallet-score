import { createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import { CREDITCOIN_CHAIN_ID, getRegistry } from "../services/registry.js";

/**
 * Diagnostics for the Creditcoin testnet integration.
 *
 *   npm run onchain:check
 */
const registry = getRegistry();

if (!registry) {
  console.error("Registry not loaded. Check CREDITCOIN_PRIVATE_KEY / DEPLOYMENT_FILE.");
  process.exit(1);
}

const account = privateKeyToAccount(
  (config.CREDITCOIN_PRIVATE_KEY!.startsWith("0x")
    ? config.CREDITCOIN_PRIVATE_KEY!
    : `0x${config.CREDITCOIN_PRIVATE_KEY}`) as `0x${string}`,
);

const publicClient = createPublicClient({
  chain: { id: CREDITCOIN_CHAIN_ID } as never,
  transport: http(config.CREDITCOIN_RPC_URL),
});

const [balance, owner, oracle] = await Promise.all([
  publicClient.getBalance({ address: account.address }).catch(() => null),
  publicClient
    .readContract({
      address: registry.registryAddress,
      abi: [
        {
          type: "function",
          name: "owner",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "owner",
    })
    .catch(() => null),
  publicClient
    .readContract({
      address: registry.registryAddress,
      abi: [
        {
          type: "function",
          name: "oracle",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "oracle",
    })
    .catch(() => null),
]);

console.log("Signer address :", account.address);
console.log("Registry       :", registry.registryAddress);
console.log("DemoLending    :", registry.demoLendingAddress);
console.log("Signer balance :", balance === null ? "(unreachable)" : `${formatEther(balance)} tCTC`);
console.log("Contract owner :", owner ?? "(unreachable)");
console.log("Contract oracle:", oracle ?? "(unreachable)");
console.log("Is owner       :", owner === account.address);
console.log("Is oracle      :", oracle === account.address);

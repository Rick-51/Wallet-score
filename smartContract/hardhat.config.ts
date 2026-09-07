import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

const CREDITCOIN_RPC_URL =
  process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CREDITCOIN_PRIVATE_KEY = process.env.CREDITCOIN_PRIVATE_KEY ?? "";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    creditcoinTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 102031,
      url: CREDITCOIN_RPC_URL,
      accounts: CREDITCOIN_PRIVATE_KEY ? [CREDITCOIN_PRIVATE_KEY] : [],
    },
  },
});

import { getRegistry } from "../services/registry.js";

/**
 * One-time owner setup for the ReputationRegistry roles:
 *
 *   npm run setup:roles -- setOracle     <backendWorkerAddress>
 *   npm run setup:roles -- addReviewer   <reviewerAddress>
 *
 * Requires CREDITCOIN_PRIVATE_KEY to be the contract owner's key.
 */
const [cmd, addr] = process.argv.slice(2);

const registry = getRegistry();
if (!registry) {
  console.error("Registry not configured. Set CREDITCOIN_PRIVATE_KEY (owner).");
  process.exit(1);
}

if ((cmd === "setOracle" || cmd === "addReviewer") && addr) {
  const txHash =
    cmd === "setOracle"
      ? await registry.setOracle(addr as `0x${string}`)
      : await registry.addReviewer(addr as `0x${string}`);
  console.log(`${cmd} → ${addr}`);
  console.log(`tx: ${txHash}`);
} else {
  console.log("Usage: npm run setup:roles -- <setOracle|addReviewer> <address>");
  process.exit(1);
}

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the Credit Reputation Protocol stack.
//
const NATIVE_ATTESTCOIN_VERIFIER = "0x0000000000000000000000000000000000000FD2";
const SEPOLIA_CHAIN_KEY = 1;
const AAVE_POOL_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";

export default buildModule("CreditReputationModule", (m) => {
  const registry = m.contract("ReputationRegistry", [NATIVE_ATTESTCOIN_VERIFIER]);
  m.call(registry, "setAavePool", [SEPOLIA_CHAIN_KEY, AAVE_POOL_SEPOLIA]);

  const lending = m.contract("DemoLending", [registry]);

  return { registry, lending };
});

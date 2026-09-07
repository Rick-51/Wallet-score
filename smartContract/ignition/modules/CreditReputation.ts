import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the Credit Reputation Protocol stack.
//
// NOTE: For a real Creditcoin deployment, replace MockAttestcoinVerifier with
// the Attestcoin Protocol precompile address and pass it to ReputationRegistry.
export default buildModule("CreditReputationModule", (m) => {
  const verifier = m.contract("MockAttestcoinVerifier");

  const registry = m.contract("ReputationRegistry", [verifier]);

  const lending = m.contract("DemoLending", [registry]);

  return { verifier, registry, lending };
});

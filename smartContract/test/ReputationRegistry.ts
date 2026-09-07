import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeAbiParameters, keccak256, padHex, parseAbiParameters, stringToHex } from "viem";

// viem types `bytes` / `bytes32` args as `0x${string}` template literals.
type Hex = `0x${string}`;
const CHAIN_KEY = 1n;
const POOL = "0x0000000000000000000000000000000000005555" as const;
const EMPTY_MERKLE = { root: `0x${"00".repeat(32)}` as Hex, siblings: [] };
const EMPTY_CONTINUITY = { lowerEndpointDigest: `0x${"00".repeat(32)}` as Hex, roots: [] };

// Solidity enum values mirrored as numbers (enums encode as uint8).
const WalletType = { PERSONAL: 0, AI_AGENT: 1, BUSINESS: 2, DAO: 3 } as const;
const Status = {
  PENDING: 0,
  ANALYZING: 1,
  READY_FOR_REVIEW: 2,
  APPROVED: 3,
  REJECTED: 4,
} as const;

describe("ReputationRegistry + DemoLending", async function () {
  const { viem } = await network.create();
  const [owner, oracle, reviewer, alice, mallory] = await viem.getWalletClients();

  async function deploy() {
    const verifier = await viem.deployContract("MockAttestcoinVerifier");
    const registry = await viem.deployContract("ReputationRegistry", [
      verifier.address,
    ]);
    const lending = await viem.deployContract("DemoLending", [registry.address]);

    await registry.write.setOracle([oracle.account.address], {
      account: owner.account,
    });
    await registry.write.addReviewer([reviewer.account.address], {
      account: owner.account,
    });
    await registry.write.setAavePool([CHAIN_KEY, POOL], { account: owner.account });

    return { verifier, registry, lending };
  }

  it("submits an assessment and records the declared wallet type", async function () {
    const { registry } = await deploy();

    await registry.write.submitAssessment(
      [alice.account.address, WalletType.AI_AGENT],
      { account: alice.account },
    );

    const a = await registry.read.getAssessment([alice.account.address]);
    assert.equal(a.wallet.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(a.walletType, WalletType.AI_AGENT);
    assert.equal(a.status, Status.PENDING);
    assert.equal(a.reputationScore, 0);
  });

  it("emits AssessmentSubmitted with the declared wallet type", async function () {
    const { registry } = await deploy();

    await viem.assertions.emitWithArgs(
      registry.write.submitAssessment(
        [alice.account.address, WalletType.DAO],
        { account: alice.account },
      ),
      registry,
      "AssessmentSubmitted",
      [alice.account.address, WalletType.DAO, (v: bigint) => v > 0n],
    );
  });

  it("only the oracle can submit Attestcoin-verified evidence", async function () {
    const { registry } = await deploy();

    await registry.write.submitAssessment(
      [alice.account.address, WalletType.BUSINESS],
      { account: alice.account },
    );

    const repayData = encodeAbiParameters(parseAbiParameters("uint256 amount, bool useATokens"), [100n, false]);
    const receipt = encodeAbiParameters(
      parseAbiParameters("uint8 status, uint64 gasUsed, (address address_, bytes32[] topics, bytes data)[] logs, bytes logsBloom"),
      [1, 90_000n, [{
        address_: POOL,
        topics: [
          keccak256(stringToHex("Repay(address,address,address,uint256,bool)")),
          padHex("0x6666", { size: 32 }),
          padHex(alice.account.address, { size: 32 }),
          padHex(alice.account.address, { size: 32 }),
        ],
        data: repayData,
      }], "0x"],
    );
    const common = encodeAbiParameters(
      parseAbiParameters("uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data"),
      [1n, 100_000n, alice.account.address, false, POOL, 0n, "0x"],
    );
    const legacy = encodeAbiParameters(
      parseAbiParameters("uint128 gasPrice, uint256 v, bytes32 r, bytes32 s"),
      [1n, 27n, `0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`],
    );
    const evidence = {
      chainKey: CHAIN_KEY,
      blockHeight: 19_000_000n,
      sourceTxHash: keccak256(stringToHex("source transaction")),
      encodedTx: encodeAbiParameters(parseAbiParameters("uint8 txType, bytes[] chunks"), [0, [common, legacy, receipt]]),
      merkleProof: EMPTY_MERKLE,
      continuityProof: EMPTY_CONTINUITY,
      eventType: "aave:repay",
    };

    // A non-oracle caller is rejected.
    await viem.assertions.revertWith(
      registry.write.submitEvidence(
        [
          alice.account.address,
          evidence.chainKey,
          evidence.blockHeight,
          evidence.sourceTxHash,
          evidence.encodedTx,
          evidence.merkleProof,
          evidence.continuityProof,
          evidence.eventType,
        ],
        { account: mallory.account },
      ),
      "Not oracle",
    );

    await registry.write.submitEvidence(
      [
        alice.account.address,
        evidence.chainKey,
        evidence.blockHeight,
        evidence.sourceTxHash,
        evidence.encodedTx,
        evidence.merkleProof,
        evidence.continuityProof,
        evidence.eventType,
      ],
      { account: oracle.account },
    );

    assert.equal(await registry.read.evidenceCount([alice.account.address]), 1n);

    const e = await registry.read.getEvidence([alice.account.address, 0n]);
    assert.equal(e.eventType, "aave:repay");
    assert.equal(e.blockHeight, 19_000_000n);
  });

  it("reverts when the Attestcoin proof does not verify", async function () {
    const { registry, verifier } = await deploy();

    await verifier.write.setResult([false], { account: owner.account });

    await viem.assertions.revertWith(
      registry.write.submitEvidence(
        [
          alice.account.address,
          CHAIN_KEY,
          1n,
          keccak256(stringToHex("failed")),
          "0xaa",
          EMPTY_MERKLE,
          EMPTY_CONTINUITY,
          "aave:borrow",
        ],
        { account: oracle.account },
      ),
      "Attestcoin verification failed",
    );
  });

  it("a reviewer approves an assessment and DemoLending quotes terms", async function () {
    const { registry, lending } = await deploy();

    await registry.write.submitAssessment(
      [alice.account.address, WalletType.AI_AGENT],
      { account: alice.account },
    );

    await registry.write.reviewAssessment(
      [alice.account.address, 820, 0, 15_000_00n, 850, 7000, "Strong history"],
      { account: reviewer.account },
    );

    const a = await registry.read.getAssessment([alice.account.address]);
    assert.equal(a.status, Status.APPROVED);
    assert.equal(a.reputationScore, 820);
    assert.equal(a.suggestedAprBps, 850);
    assert.equal(a.suggestedCreditLimit, 15_000_00n);

    // 820 -> 80% collateral, 10% APR.
    const terms = await lending.read.getLoanTerms([alice.account.address]);
    assert.equal(terms.approved, true);
    assert.equal(terms.collateralBps, 8000);
    assert.equal(terms.aprBps, 1000);
  });

  it("quotes the correct tier across score boundaries", async function () {
    const { registry, lending } = await deploy();

    const cases: Array<[number, boolean, number, number]> = [
      [499, false, 0, 0],
      [500, true, 12000, 1500],
      [699, true, 12000, 1500],
      [700, true, 8000, 1000],
      [849, true, 8000, 1000],
      [850, true, 5000, 700],
      [1000, true, 5000, 700],
    ];

    for (const [score, approved, collateral, apr] of cases) {
      const wallet = `0x${(score + 0x1000).toString(16).padStart(40, "0")}` as const;
      await registry.write.submitAssessment(
        [wallet, WalletType.PERSONAL],
        { account: alice.account },
      );
      await registry.write.reviewAssessment(
        [wallet, score, 0, 10_000_00n, 850, collateral, ""],
        { account: reviewer.account },
      );

      const terms = await lending.read.getLoanTerms([wallet]);
      assert.equal(terms.approved, approved, `score ${score} approved`);
      assert.equal(terms.collateralBps, collateral, `score ${score} collateral`);
      assert.equal(terms.aprBps, apr, `score ${score} apr`);
    }
  });

  it("rejects unknown and rejected wallets", async function () {
    const { registry, lending } = await deploy();

    // Never submitted.
    const unknown = await lending.read.getLoanTerms([mallory.account.address]);
    assert.equal(unknown.approved, false);

    // Submitted then rejected.
    await registry.write.submitAssessment(
      [alice.account.address, WalletType.PERSONAL],
      { account: alice.account },
    );
    await registry.write.rejectAssessment(
      [alice.account.address, "no history"],
      { account: reviewer.account },
    );
    const rejected = await lending.read.getLoanTerms([alice.account.address]);
    assert.equal(rejected.approved, false);
  });
});

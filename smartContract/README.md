# Veritas Credit Reputation Contracts

The contracts run on Creditcoin and use Attestcoin to verify selected source-chain
transactions before recording them as wallet reputation evidence.

## Testnet deployment

- Creditcoin Testnet chain ID: `102031`
- Native Attestcoin block-prover precompile: `0x0000000000000000000000000000000000000FD2`
- Deployment addresses: `deployments/creditcoin-testnet.json`
- Supported MVP source: Sepolia (`Attestcoin chain key 1`)
- Verified protocol: Aave V3 Sepolia Pool

`ReputationRegistry.submitEvidence` performs two checks in one Creditcoin
transaction:

1. The native precompile verifies the Merkle inclusion and continuity proofs.
2. The registry decodes the proved receipt and checks that it contains the
   requested Aave event for the submitted wallet.

The mock verifier remains available only for local unit tests.

## Commands

```shell
npm run build
npm test
npm run deploy:creditcoin -- --network creditcoinTestnet
```

The deployment command requires `CREDITCOIN_PRIVATE_KEY` in `.env`, deploys the
registry and demo lending contracts, configures the Sepolia Aave pool, and writes
the resulting addresses to `deployments/creditcoin-testnet.json`.

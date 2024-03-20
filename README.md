## ProverMarketplace Offchain Node
This repository contains a simple proof of concept offchain actor for use with https://github.com/corddry/provermarketplace, using dummy values and contracts deployed on Sepolia

### Quickstart
1. clone & cd into the repo
2. npm install
3. copy sample.env to .env and fill in a Sepolia RPC API key and a private key for an account funded with Sepolia ETH
4. npx tsc 
5. node src/prover.js
require("dotenv").config();
const { Web3 } = require('web3');
const fs = require('fs');
const abi = require('./abi.js');

// Script is currently hardcoded to only interact with Sepolia
const network = "sepolia";
const rpcURL = process.env.SEPOLIA_WEBSOCKET;
const web3 = new Web3(rpcURL);

// Deployed ProverMarketplace contract on Sepolia
const proverMarketAddress = "0x05CC789E47E69a5896C8798c4C85238F4Ca5A732";
const contract = new web3.eth.Contract(abi, proverMarketAddress);

// Obtain a Web3 signer from the private key in the .env file
const signer = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
web3.eth.accounts.wallet.add(signer);

// All of the fields necessary to find a request on the marketplace
interface ProofRequest {
    requester: string;
    verifier: string;
    programHash: string;
    bounty: bigint;
    callbackContract: string;
    callbackSelector: string;
    input: string;
}

// The possible states returned by idToRequestStatus in the ProverMarketplace contract
enum RequestStatus {
    NotFound = 0,
    Pending = 1,
    Fulfilled = 2,
}

// Helper function for getting a request ID from the ProverMarketplace contract
async function getRequestID(req: ProofRequest) {
    return await contract.methods.getRequestID(req.verifier, req.programHash, req.bounty, req.callbackContract, req.callbackSelector, req.input).call();
}

// Helper function for getting the status of a request from the ProverMarketplace contract
async function getStatus(requestID: string) {
    return Number(await contract.methods.idToRequestStatus(requestID).call());
}

// Helper function for fulfilling a request on the ProverMarketplace contract
// Currently uses dummy values for the posted proof and output, intended for use with a dummy verifier
async function fulfill(req: ProofRequest) {
    // Dummy proof bytes
    const proof = '0xF00F00';
    // Dummy output: 1337 in hex padded to 32 bytes
    const output = '0x0000000000000000000000000000000000000000000000000000000000000539';

    // Build the transaction
    const method_abi = contract.methods.fulfillProof(req.verifier, req.programHash, req.bounty, req.callbackContract, req.callbackSelector, req.input, output, proof).encodeABI();
    let tx = {
        from: signer.address,
        to: contract.options.address,
        data: method_abi,
        value: '0',
        gasPrice: '100000000000',
        gas: '3000000',
    }
    // Update the gas limit with a more accurate estimate
    // NOTE: gas price currently does not use an estimate and is hardcoded to 100 gwei
    const gas_estimate = await web3.eth.estimateGas(tx);
    tx.gas = gas_estimate;

    // Use the signer derived from our .env to sign the transaction
    const signedTx = await web3.eth.accounts.signTransaction(tx, signer.privateKey);

    // Send the transaction and log the transaction's url on Etherscan
    await web3.eth
        .sendSignedTransaction(signedTx.rawTransaction)
        .once("transactionHash", (txhash: string) => {
            console.log("Transaction Sent!\nhttps://${network}.etherscan.io/tx/${txhash}\n\n");
        });
}

// Helper function for parsing an event into a ProofRequest
function getRequestFromEvent(event: any): ProofRequest {
    // See https://web3js.readthedocs.io/en/v1.2.11/web3-eth-abi.html#decodelog
    const decoded = web3.eth.abi.decodeLog([{
        type: "address",
        name: "requester",
        indexed: true,
    }, {
        type: "address",
        name: "verifier",
        indexed: true,
    }, {
        type: "bytes32",
        name: "programHash",
        indexed: true,
    }, {
        type: "uint256",
        name: "bounty",
        indexed: false,
    }, {
        type: "address",
        name: "callbackContract",
        indexed: false,
    }, {
        type: "bytes4",
        name: "callbackSelector",
        indexed: false,
    }, {
        type: "bytes",
        name: "input",
        indexed: false,
    }],
        event.data,
        [event.topics[0], event.topics[1], event.topics[2], event.topics[3]],
    );
    // Form a ProofRequest from the decoded object
    const req: ProofRequest = { requester: decoded.requester, verifier: decoded.verifier, programHash: decoded.programHash, bounty: decoded.bounty, callbackContract: decoded.callbackContract, callbackSelector: decoded.callbackSelector, input: decoded.input };
    return req;
}

// Sets up the subscription to the ProofRequested event and listens for requests
async function listenForRequests() {
    // Subscribe to the ProofRequested event signature
    const options = { topics: [web3.utils.sha3("ProofRequested(address,address,bytes32,uint256,address,bytes4,bytes)")] }
    const subscription = await web3.eth.subscribe("logs", options);

    // On each ProofRequested event, check the status of the request and fulfill it if it's pending
    subscription.on("data", async (event: any) => {
        const req = getRequestFromEvent(event);
        const id = await getRequestID(req);
        const status = await getStatus(id);
        switch (status) {
            // NOTE: It is possible the subscription could pick up a spoofed event from a different contract with the same signature,
            // if that were to happen, it would get thrown out here.
            case RequestStatus.NotFound:
                console.log("Request not found in marketplace");
                break;
            // NOTE: in its current state, if two nodes were running this script simultaneously, it would be unlikely that one node
            // would be able to fulfill a request quickly enough before the other sees the event.
            case RequestStatus.Fulfilled:
                console.log("Request already fulfilled");
                break;
            case RequestStatus.Pending:
                console.log("Pending request found! ID: ", id, "\n", req, "\nFulfilling...");
                await fulfill(req);
                break;
            // NOTE: Default case should never trigger
            default:
                console.error("Unknown request status: ", status);
                break;
        }
    });
}
listenForRequests();

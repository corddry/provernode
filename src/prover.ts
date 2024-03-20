require("dotenv").config();
const { Web3 } = require('web3');
const fs = require('fs');
const abi = require('./abi.js');

const network = "sepolia";
const rpcURL = process.env.SEPOLIA_WEBSOCKET;
const web3 = new Web3(rpcURL);

const proverMarketAddress = "0x05CC789E47E69a5896C8798c4C85238F4Ca5A732";
const contract = new web3.eth.Contract(abi, proverMarketAddress);

const signer = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
web3.eth.accounts.wallet.add(signer);

interface ProofRequest {
    requester: string;
    verifier: string;
    programHash: string;
    bounty: bigint;
    callbackContract: string;
    callbackSelector: string;
    input: string;
}

enum RequestStatus {
    NotFound = 0,
    Pending = 1,
    Fulfilled = 2,
}

async function getRequestID(req: ProofRequest) {
    return await contract.methods.getRequestID(req.verifier, req.programHash, req.bounty, req.callbackContract, req.callbackSelector, req.input).call();
}

async function getStatus(requestID: string) {
    return Number(await contract.methods.idToRequestStatus(requestID).call());
}

async function fulfill(req: ProofRequest) {
    const proof = '0xF00F00';
    const output = '0x0000000000000000000000000000000000000000000000000000000000000539'; //1337
    const method_abi = contract.methods.fulfillProof(req.verifier, req.programHash, req.bounty, req.callbackContract, req.callbackSelector, req.input, output, proof).encodeABI();
    let tx = {
        from: signer.address,
        to: contract.options.address,
        data: method_abi,
        value: '0',
        gasPrice: '100000000000',
        gas: '3000000',
    }
    const gas_estimate = await web3.eth.estimateGas(tx);
    tx.gas = gas_estimate;

    const signedTx = await web3.eth.accounts.signTransaction(tx, signer.privateKey);
    await web3.eth
        .sendSignedTransaction(signedTx.rawTransaction)
        .once("transactionHash", (txhash: string) => {
            console.log("Transaction Sent!");
            console.log(`https://${network}.etherscan.io/tx/${txhash}`);
            console.log("\n");
        });
}

function getRequestFromEvent(event: any): ProofRequest {
    const decoded = web3.eth.abi.decodeLog(
        [
            {
                type: "address",
                name: "requester",
                indexed: true,
            },
            {
                type: "address",
                name: "verifier",
                indexed: true,
            },
            {
                type: "bytes32",
                name: "programHash",
                indexed: true,
            },
            {
                type: "uint256",
                name: "bounty",
                indexed: false,
            },
            {
                type: "address",
                name: "callbackContract",
                indexed: false,
            },
            {
                type: "bytes4",
                name: "callbackSelector",
                indexed: false,
            },
            {
                type: "bytes",
                name: "input",
                indexed: false,
            },
        ],
        event.data,
        [event.topics[0], event.topics[1], event.topics[2], event.topics[3]],
    );
    const req: ProofRequest = { requester: decoded.requester, verifier: decoded.verifier, programHash: decoded.programHash, bounty: decoded.bounty, callbackContract: decoded.callbackContract, callbackSelector: decoded.callbackSelector, input: decoded.input };
    return req;
}

async function listenForRequests() {
    const options = { topics: [web3.utils.sha3("ProofRequested(address,address,bytes32,uint256,address,bytes4,bytes)")] }

    const subscription = await web3.eth.subscribe("logs", options);
    subscription.on("data", async (event: any) => {
        const req = getRequestFromEvent(event);
        const id = await getRequestID(req);
        const status = await getStatus(id);
        switch (status) {
            case RequestStatus.NotFound:
                console.log("Request not found in marketplace");
                break;
            case RequestStatus.Fulfilled:
                console.log("Request already fulfilled");
                break;
            case RequestStatus.Pending:
                console.log("Pending request found! ID: ", id, "\n", req, "\nFulfilling...");
                await fulfill(req);
                break;
            default:
                console.log("Unknown request status: ", status);
                break;
        }
    });
}
listenForRequests();

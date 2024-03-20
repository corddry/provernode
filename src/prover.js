"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
var RequestStatus;
(function (RequestStatus) {
    RequestStatus[RequestStatus["NotFound"] = 0] = "NotFound";
    RequestStatus[RequestStatus["Pending"] = 1] = "Pending";
    RequestStatus[RequestStatus["Fulfilled"] = 2] = "Fulfilled";
})(RequestStatus || (RequestStatus = {}));
function getRequestID(req) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield contract.methods.getRequestID(req.verifier, req.programHash, req.bounty, req.callbackContract, req.callbackSelector, req.input).call();
    });
}
function getStatus(requestID) {
    return __awaiter(this, void 0, void 0, function* () {
        return Number(yield contract.methods.idToRequestStatus(requestID).call());
    });
}
function fulfill(req) {
    return __awaiter(this, void 0, void 0, function* () {
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
        };
        // const gas_estimate = await web3.eth.estimateGas(tx);
        // tx.gas = gas_estimate;
        const signedTx = yield web3.eth.accounts.signTransaction(tx, signer.privateKey);
        // console.log("Raw transaction data: " + signedTx.rawTransaction);
        yield web3.eth
            .sendSignedTransaction(signedTx.rawTransaction)
            .once("transactionHash", (txhash) => {
            console.log("Transaction Sent!");
            console.log(`https://${network}.etherscan.io/tx/${txhash}`);
            console.log("\n");
        });
    });
}
function getRequestFromEvent(event) {
    let decoded = web3.eth.abi.decodeLog([
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
    ], event.data, [event.topics[0], event.topics[1], event.topics[2], event.topics[3]]);
    let req = { requester: decoded.requester, verifier: decoded.verifier, programHash: decoded.programHash, bounty: decoded.bounty, callbackContract: decoded.callbackContract, callbackSelector: decoded.callbackSelector, input: decoded.input };
    return req;
}
function listenForRequests() {
    return __awaiter(this, void 0, void 0, function* () {
        const options = { topics: [web3.utils.sha3("ProofRequested(address,address,bytes32,uint256,address,bytes4,bytes)")] };
        let subscription = yield web3.eth.subscribe("logs", options);
        subscription.on("data", (event) => __awaiter(this, void 0, void 0, function* () {
            let req = getRequestFromEvent(event);
            let id = yield getRequestID(req);
            let status = yield getStatus(id);
            switch (status) {
                case RequestStatus.NotFound:
                    console.log("Request not found in marketplace");
                    break;
                case RequestStatus.Fulfilled:
                    console.log("Request already fulfilled");
                    break;
                case RequestStatus.Pending:
                    console.log("Pending request found! ID: ", id, "\n", req, "\n Fulfilling...");
                    yield fulfill(req);
                    break;
                default:
                    console.log("Unknown request status: ", status);
                    break;
            }
            // console.log(req, id);
            // let proof = fs.readFileSync(`proofs/${id}.proof`);
            // contract.methods.prove(req.verifier, req.programHash, req.bounty, req.callbackContract, req.callbackSelector, req.input, proof).send({ from: process.env.SEPOLIA_ADDRESS, gas: 3000000 });
        }));
    });
}
listenForRequests();

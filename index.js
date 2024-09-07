import { gql, request } from 'graphql-request'
import { ContractFactory, ethers } from 'ethers';
import * as fs from "fs/promises";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const GRAPH_URL = process.env.GRAPH_URL;

const ALEPH = ["https://rpc.alephzero-testnet.gelato.digital", "0xF3C6e33937b27db6d82011eA63b8fAe115a2D252"];
const CELO = ["https://alfajores-forno.celo-testnet.org", "0xF3C6e33937b27db6d82011eA63b8fAe115a2D252"];
const MANTLE = ["https://rpc.mantle.xyz", "0x890Adc5AAa55ADc33e15208A19aBA1d39E4a208D"];
const SEI = ["https://evm-rpc-arctic-1.sei-apis.com", "0x890Adc5AAa55ADc33e15208A19aBA1d39E4a208D"];
const ZIRCUIT = ["https://zircuit1-testnet.p2pify.com/", "0x80dAA0E39ec683971C4Bf4ee14c15383b5518BF7"];

let latestBet = Math.floor(new Date().getTime() / 1000);

function query() {
  return `{
    payments(first: 5, orderDirection: desc, orderBy: timestamp, where: {to: "0x1c86434ae71AB548772D6A6b19727589b59b6C99", timestamp_gt: ${latestBet} }) {
      id
      to
      from
      timestamp
      txHash
    }
  }`;
}

const PriceBetContract = new ContractFactory(
  await fs.readFile("price-bet.json", 'utf-8'),
  await fs.readFile("price-bet.bin", 'utf-8')
);

const TrustBetContract = new ContractFactory(
  await fs.readFile("trust-bet.json", 'utf-8'),
  await fs.readFile("trust-bet.bin", 'utf-8'),
);

const wallet = new ethers.Wallet(PRIVATE_KEY);

async function update(requestId, contracts) {
  const payload = {
    "contracts": contracts
  }
  
  const options = {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    method: "PUT",
    body: JSON.stringify(payload),
 }
 
  const response = await fetch(`https://159.69.185.109/events/${requestId}`, options);
}

async function main2() {
  console.log(`Current timestamp: ${latestBet}`)
  while (true) {
    try {
      const pendingPayments = await getPending();

      if(pendingPayments.length === 0) {
        console.log("No pending payments.");
        await delay(2500);
        continue;
      }
  
      const bets = await getBets();
      for (const payment of pendingPayments) {
        const request = bets.find(v => v.requestId === payment.txHash);
        if(!request) { 
          continue;
        }
  
        console.log(request)
  
        const contracts = {
          "azero": await deploy(request, ALEPH),
          "celo": await deploy(request, CELO),
          "zircuit": await deploy(request, ZIRCUIT),
          "mantle": await deploy(request, MANTLE),
          "sei": await deploy(request, SEI),
        };
  
        console.log(contracts);
  
        await update(request.requestId, contracts)
        latestBet = Math.max(latestBet, Math.floor(request.dueDate / 1000));
      }
    } catch {
      console.log("Error crashed.");
    }
  }
}

async function getPending() {
  try {
    const data = await request(GRAPH_URL, query());
    return data.payments;
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

async function getBets() {
  const data = await fetch("https://159.69.185.109/events/?skip=0&limit=200");
  return await data.json();
}

async function deploy(request, network) {
  const [rpc, staking] = network;
  console.log(`Deploying ${rpc}`);
  const provider = new ethers.JsonRpcProvider(rpc);
  const account = wallet.connect(provider);
  const contract = await deployContract(request, account, staking);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`Deployed: ${address}`);
  return address;
}

async function deployContract(request, account, staking) {
  if(request.predict) {
    const deployment = PriceBetContract.connect(account);
    const predict = request.predict;
    return deployment.deploy(
      ethers.encodeBytes32String(predict.symbol), 
      ethers.formatUnits(predict.price, "ether"), 
      Math.floor(request.dueDate / 1000),
      staking
    );
  } else {
    const deployment = TrustBetContract.connect(account);
    return deployment.deploy(
      Math.floor(request.dueDate / 1000),
      staking
    );
  }

}

async function delay(duration) {
  await new Promise(resolve => setTimeout(resolve, duration));
}

main2().catch((error) => {
    console.error(error);
    process.exit(-1);
});

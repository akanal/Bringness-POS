import crypto from "node:crypto";
import { validateBridgeAction, assertStartPayload, assertFinishPayload, TSE_BRIDGE_CONTRACT_VERSION } from "./tse-bridge-contract.js";

const action=validateBridgeAction(process.argv[2]||"");
let raw="";
for await (const chunk of process.stdin) raw+=chunk;
let payload={};
if(raw.trim()) payload=JSON.parse(raw);

const now=()=>new Date().toISOString();
const serialNumber="MOCK-SWISSBIT-NOT-CERTIFIED";

function output(value){
  process.stdout.write(JSON.stringify(value));
}

if(action==="status"){
  output({
    status:"test_mode",
    connection:"local_bridge",
    certified:false,
    serialNumber,
    deviceModel:"Swissbit simulator",
    sdkVersion:"mock",
    contractVersion:TSE_BRIDGE_CONTRACT_VERSION,
    warning:"SIMULATOR ONLY - NOT A CERTIFIED TSE"
  });
}else if(action==="start"){
  assertStartPayload(payload);
  output({
    transactionNumber:`MOCK-${crypto.randomUUID()}`,
    startedAt:now(),
    serialNumber,
    certified:false,
    warning:"SIMULATOR ONLY - NOT A CERTIFIED TSE"
  });
}else if(action==="finish"){
  assertFinishPayload(payload);
  const digest=crypto.createHash("sha256").update(JSON.stringify(payload)).digest("base64url");
  output({
    transactionNumber:String(payload.transactionNumber),
    serialNumber,
    signatureCounter:"0",
    signatureAlgorithm:"MOCK-SHA256",
    logTimeFormat:"iso-8601",
    finishedAt:now(),
    signature:`MOCK-${digest}`,
    publicKey:null,
    certified:false,
    warning:"SIMULATOR ONLY - NOT A CERTIFIED TSE"
  });
}else if(action==="cancel"){
  output({cancelled:true,cancelledAt:now(),certified:false,warning:"SIMULATOR ONLY - NOT A CERTIFIED TSE"});
}

import { spawn } from "node:child_process";
import { validateBridgeAction, assertStartPayload, assertFinishPayload, normalizeBridgeStatus, validateBridgeFinishResult } from "./tse-bridge-contract.js";

function runBridge(command,args=[],input=null){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:["pipe","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",d=>stdout+=d);
    child.stderr.on("data",d=>stderr+=d);
    child.on("error",reject);
    child.on("close",code=>{
      if(code!==0){
        const error=new Error(stderr.trim()||`Swissbit bridge exited with code ${code}`);
        error.code="SWISSBIT_BRIDGE_ERROR";
        error.exitCode=code;
        return reject(error);
      }
      try{ resolve(stdout.trim()?JSON.parse(stdout):{}); }
      catch(error){ error.code="SWISSBIT_BRIDGE_INVALID_RESPONSE"; reject(error); }
    });
    if(input!==null) child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

export function createSwissbitTseAdapter(options={}){
  const bridgeCommand=options.bridgeCommand||process.env.SWISSBIT_TSE_BRIDGE_COMMAND||"";
  const bridgeArgs=Array.isArray(options.bridgeArgs)?options.bridgeArgs:[];

  async function invoke(action,payload={}){
    validateBridgeAction(action);
    if(!bridgeCommand){
      const error=new Error("Swissbit TSE Bridge ist noch nicht konfiguriert");
      error.code="SWISSBIT_NOT_CONFIGURED";
      throw error;
    }
    return runBridge(bridgeCommand,[...bridgeArgs,action],payload);
  }

  return {
    provider:"swissbit",
    architecture:"hardware_sd",
    certified:null,
    async status(){
      try{
        const result=normalizeBridgeStatus(await invoke("status"));
        return {
          ...result,
          architecture:"hardware_sd",
          provider:"swissbit",
          requiresLocalBridge:true
        };
      }catch(error){
        if(error.code==="SWISSBIT_NOT_CONFIGURED"){
          return {
            status:"not_configured",
            architecture:"hardware_sd",
            connection:"not_connected",
            certified:false,
            provider:"swissbit",
            serialNumber:null,
            requiresLocalBridge:true
          };
        }
        throw error;
      }
    },
    async startTransaction(transaction){
      assertStartPayload(transaction);
      const result=await invoke("start",transaction);
      if(!result.transactionNumber){
        const error=new Error("Swissbit Bridge lieferte keine Transaktionsnummer");
        error.code="SWISSBIT_INVALID_START_RESPONSE";
        throw error;
      }
      return {
        transactionNumber:String(result.transactionNumber),
        startedAt:result.startedAt||new Date().toISOString(),
        serialNumber:result.serialNumber||null,
        certified:Boolean(result.certified)
      };
    },
    async finishTransaction(transaction){
      assertFinishPayload(transaction);
      const result=validateBridgeFinishResult(await invoke("finish",transaction));
      return {
        transactionNumber:String(result.transactionNumber),
        serialNumber:String(result.serialNumber),
        signatureCounter:result.signatureCounter!=null?String(result.signatureCounter):null,
        signatureAlgorithm:result.signatureAlgorithm||null,
        logTimeFormat:result.logTimeFormat||null,
        finishedAt:result.finishedAt||new Date().toISOString(),
        signature:String(result.signature),
        publicKey:result.publicKey||null,
        certified:Boolean(result.certified)
      };
    },
    async cancelTransaction(transaction){
      return invoke("cancel",transaction);
    }
  };
}

export const SWISSBIT_INTEGRATION_STATUS={
  state:"adapter_contract_ready",
  missing:[
    "Swissbit SDK package",
    "official SDK/API documentation",
    "real SD or microSD TSE for hardware validation",
    "exact bridge command and native library bindings"
  ],
  note:"The provider-neutral bridge contract and simulator are ready. No guessed Swissbit SDK calls are used; native bindings will be completed only from official Swissbit documentation."
};

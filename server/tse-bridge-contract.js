export const TSE_BRIDGE_ACTIONS = Object.freeze(["status","start","finish","cancel"]);

export function validateBridgeAction(action){
  if(!TSE_BRIDGE_ACTIONS.includes(action)){
    const error=new Error(`Unbekannte TSE-Bridge-Aktion: ${action}`);
    error.code="TSE_BRIDGE_UNKNOWN_ACTION";
    throw error;
  }
  return action;
}

export function assertStartPayload(payload={}){
  if(!payload.clientTransactionId) throw Object.assign(new Error("clientTransactionId fehlt"),{code:"TSE_BRIDGE_INVALID_START_PAYLOAD"});
  if(!payload.orderId) throw Object.assign(new Error("orderId fehlt"),{code:"TSE_BRIDGE_INVALID_START_PAYLOAD"});
  if(!payload.receiptNumber) throw Object.assign(new Error("receiptNumber fehlt"),{code:"TSE_BRIDGE_INVALID_START_PAYLOAD"});
  if(!Array.isArray(payload.items)) throw Object.assign(new Error("items fehlt"),{code:"TSE_BRIDGE_INVALID_START_PAYLOAD"});
  if(!Array.isArray(payload.payments)) throw Object.assign(new Error("payments fehlt"),{code:"TSE_BRIDGE_INVALID_START_PAYLOAD"});
  if(!Array.isArray(payload.vat)) throw Object.assign(new Error("vat fehlt"),{code:"TSE_BRIDGE_INVALID_START_PAYLOAD"});
  return payload;
}

export function assertFinishPayload(payload={}){
  if(!payload.transactionNumber) throw Object.assign(new Error("transactionNumber fehlt"),{code:"TSE_BRIDGE_INVALID_FINISH_PAYLOAD"});
  return payload;
}

export function normalizeBridgeStatus(result={}){
  return {
    status:String(result.status||"unknown"),
    connection:String(result.connection||"local_bridge"),
    certified:Boolean(result.certified),
    serialNumber:result.serialNumber?String(result.serialNumber):null,
    deviceModel:result.deviceModel?String(result.deviceModel):null,
    sdkVersion:result.sdkVersion?String(result.sdkVersion):null
  };
}

export function validateBridgeFinishResult(result={}){
  const required=["transactionNumber","serialNumber","signature"];
  const missing=required.filter(key=>!result[key]);
  if(missing.length){
    const error=new Error(`TSE-Bridge-Antwort unvollständig: ${missing.join(", ")}`);
    error.code="TSE_BRIDGE_INVALID_FINISH_RESPONSE";
    error.missing=missing;
    throw error;
  }
  return result;
}

export const TSE_BRIDGE_CONTRACT_VERSION="1.0";

import fs from "node:fs";
import {pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";

export function selectOperation({event, before, sha, inputOperation, inputTarget, changed, request}) {
  let operation, target, revision="";
  if(event==="workflow_dispatch") {
    operation=inputOperation;target=inputTarget;
    if(operation==="deploy")revision=sha;
  }else if(changed.includes("ops/request.json")){
    operation=request.operation;target=request.target;
    if(operation==="deploy")revision=request.revision||sha;
  }else{
    operation="deploy";target="pos";revision=sha;
  }
  if(!["status","backup","restart","deploy"].includes(operation)||!["all","pos","ai"].includes(target))throw Error("Unknown operation or target");
  if(["restart","deploy"].includes(operation)&&target==="all")throw Error("Choose one application");
  if(operation==="deploy"&&!/^[0-9a-f]{40}$/.test(revision))throw Error("Invalid deployment revision");
  return {operation,target,revision};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!process.env.GITHUB_OUTPUT)throw Error("This entry point requires GitHub Actions");
  const event=process.env.EVENT_NAME;
  const before=process.env.BEFORE_SHA||"";
  let changed=[];
  if(event==="push"){
    if(!/^[0-9a-f]{40}$/.test(before)||/^0+$/.test(before))throw Error("Missing previous revision");
    changed=execFileSync("git",["diff","--name-only",before,"HEAD"],{encoding:"utf8"}).trim().split("\n");
  }
  const request=JSON.parse(fs.readFileSync("ops/request.json","utf8"));
  const result=selectOperation({event,before,sha:process.env.GITHUB_SHA,inputOperation:process.env.INPUT_OPERATION,inputTarget:process.env.INPUT_TARGET,changed,request});
  fs.appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(result).map(([k,v])=>k+"="+v+"\n").join(""));
}

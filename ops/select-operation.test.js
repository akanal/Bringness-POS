import test from "node:test";
import assert from "node:assert/strict";
import {selectOperation} from "./select-operation.js";
const sha="a".repeat(40);
test("application changes deploy POS at the exact workflow revision",()=>{
  assert.deepEqual(selectOperation({event:"push",sha,changed:["server/start.js"]}),{operation:"deploy",target:"pos",revision:sha});
});
test("an explicit status request never deploys, even alongside source changes",()=>{
  assert.deepEqual(selectOperation({event:"push",sha,changed:["ops/request.json","server/start.js"],request:{operation:"status",target:"all"}}),{operation:"status",target:"all",revision:""});
});
test("manual AI operation uses an exact revision",()=>{
  assert.deepEqual(selectOperation({event:"workflow_dispatch",sha,inputOperation:"deploy",inputTarget:"ai"}),{operation:"deploy",target:"ai",revision:sha});
});
test("shell fragments and all-application destructive requests are rejected",()=>{
  for(const request of [{operation:"deploy;reboot",target:"pos"},{operation:"deploy",target:"all"},{operation:"restart",target:"all"},{operation:"deploy",target:"pos",revision:"$(cat /root/key)"}]){
    assert.throws(()=>selectOperation({event:"push",sha,changed:["ops/request.json"],request}));
  }
});

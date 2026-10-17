import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {handlePosLicenseWebhook} from "./pos-license-webhook-http.js";
async function request(method,body,contentType="application/x-www-form-urlencoded",deps={}) {
 const req=Readable.from([body]);req.url="/sandbox/billing/mollie/webhook";req.method=method;req.headers={"content-type":contentType};
 const res={status:0,payload:"",writeHead(status){this.status=status},end(value){this.payload=JSON.parse(value)}};
 const handled=await handlePosLicenseWebhook(req,res,deps);return {handled,...res};
}
test("GET never activates a license",async()=>{const r=await request("GET","id=tr_123");assert.equal(r.status,405)});
test("rejects JSON callbacks",async()=>{const r=await request("POST",'{"id":"tr_123"}',"application/json");assert.equal(r.status,415)});
test("rejects duplicate ID parameters",async()=>{const r=await request("POST","id=tr_123&id=tr_456");assert.equal(r.status,400)});
test("rejects extra callback fields",async()=>{const r=await request("POST","id=tr_123&status=paid");assert.equal(r.status,400)});
test("rejects oversized payloads",async()=>{const r=await request("POST","id=tr_"+ "a".repeat(1100));assert.equal(r.status,413)});
test("does not activate unknown checkout",async()=>{
 const r=await request("POST","id=tr_123","application/x-www-form-urlencoded",{lookupCheckout:async()=>null});
 assert.equal(r.status,202);assert.equal(r.payload.activated,false);
});
test("masks internal errors",async()=>{
 const r=await request("POST","id=tr_123","application/x-www-form-urlencoded",{lookupCheckout:async()=>{throw Error("private detail")}});
 assert.equal(r.status,503);assert.equal(JSON.stringify(r.payload).includes("private detail"),false);
});

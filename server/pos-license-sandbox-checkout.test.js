import test from "node:test";
import assert from "node:assert/strict";
import {createSandboxCheckout} from "./pos-license-sandbox-checkout.js";
const companyId="e28a88bc-fadc-4e3b-bb2a-984f8bd7f821";
test("creates Mollie TEST payment and stores checkout mapping",async()=>{
 const calls=[];
 const pool={query:async(...args)=>{calls.push(args);return {rows:[]}}};
 const fetcher=async(url,opts)=>{assert.equal(url,"https://api.mollie.com/v2/payments");const body=JSON.parse(opts.body);assert.equal(body.amount.value,"399.00");assert.equal(body.metadata.bringnessCompanyId,companyId);assert.equal(body.webhookUrl,"https://sandbox.example.org/sandbox/billing/mollie/webhook");return {ok:true,json:async()=>({id:"tr_123ABC",_links:{checkout:{href:"https://www.mollie.com/checkout/example"}}})}};
 const result=await createSandboxCheckout({pool,apiKey:"test_example",fetcher,companyId,ownerEmail:"owner@example.org",baseUrl:"https://sandbox.example.org"});
 assert.equal(result.paymentId,"tr_123ABC");
 assert.equal(calls.length,1);
 assert.equal(calls[0][1][5],"owner@example.org");
});
test("never accepts live API key",async()=>{
 await assert.rejects(()=>createSandboxCheckout({apiKey:"live_example",companyId,ownerEmail:"owner@example.org",baseUrl:"https://sandbox.example.org",pool:{},fetcher:()=>{throw Error("network must not run")}}),/test_key_required/);
});
test("rejects insecure redirect base",async()=>{
 await assert.rejects(()=>createSandboxCheckout({apiKey:"test_example",companyId,ownerEmail:"owner@example.org",baseUrl:"http://sandbox.example.org",pool:{},fetcher:()=>{throw Error("network must not run")}}),/https_required/);
});
test("never writes an unrecognized Mollie response",async()=>{
 let writes=0;
 await assert.rejects(()=>createSandboxCheckout({apiKey:"test_example",companyId,ownerEmail:"owner@example.org",baseUrl:"https://sandbox.example.org",pool:{query:()=>{writes++}},fetcher:async()=>({ok:true,json:async()=>({id:"bad",_links:{checkout:{href:"https://example.org"}}})})}),/invalid_provider_checkout/);
 assert.equal(writes,0);
});

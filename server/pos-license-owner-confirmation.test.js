import test from "node:test";
import assert from "node:assert/strict";
import { issueOwnerConfirmation, confirmOwnerEmail } from "./pos-license-owner-confirmation.js";

test("owner confirmation issues an expiring hash, not a stored raw token", async () => {
  let storedHash;
  const pool = { async query(sql, args) {
    assert.match(sql, /owner_token_expires_at=now\(\)\+interval '30 minutes'/);
    storedHash = args[1];
    return {rowCount:1,rows:[{owner_email:"owner@example.test"}]};
  }};
  const issued = await issueOwnerConfirmation(pool,"tr_ABC123");
  assert.equal(issued.ownerEmail,"owner@example.test");
  assert.match(issued.token,/^[a-f0-9]{64}$/);
  assert.match(storedHash,/^[a-f0-9]{64}$/);
  assert.notEqual(storedHash,issued.token);
});

test("owner confirmation only succeeds when token is atomically consumed", async () => {
  let calls=0;
  const pool={async query(sql,args) {
    assert.match(sql,/owner_token_expires_at>now\(\)/);
    assert.match(sql,/owner_email_confirmed_at IS NULL/);
    assert.notEqual(args[1],"a".repeat(64));
    return {rowCount:++calls===1?1:0};
  }};
  assert.equal(await confirmOwnerEmail(pool,"tr_ABC123","a".repeat(64)),true);
  assert.equal(await confirmOwnerEmail(pool,"tr_ABC123","a".repeat(64)),false);
});

test("malformed payment identifiers and tokens never touch database", async () => {
  const pool={async query(){throw Error("must not query")}};
  assert.equal(await confirmOwnerEmail(pool,"invalid","a".repeat(64)),false);
  assert.equal(await confirmOwnerEmail(pool,"tr_ABC123","bad"),false);
  await assert.rejects(issueOwnerConfirmation(pool,"invalid"),/invalid_payment_id/);
});

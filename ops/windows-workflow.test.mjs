import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const y=readFileSync(new URL('../.github/workflows/windows-desktop.yml',import.meta.url),'utf8');
test('Windows workflow contains exactly one signature verification and artifact upload',()=>{
  for(const name of ['Verify installer signature','Publish latest installer asset','actions/upload-artifact@v4']){
    assert.equal(y.split(name).length-1,1,name);
  }
});
test('Windows workflow has valid checksum check and no corrupted tail',()=>{
  assert.match(y,/\^\[0-9A-F\]\{64\}\$/);
  assert.doesNotMatch(y,/^\) \{ throw "Invalid installer SHA256" \}/m);
  assert.match(y,/id: signature/);
});
test('public installer release is gated to main and a valid signature',()=>{
  assert.match(y,/github\.ref == 'refs\/heads\/main'/);
  assert.match(y,/steps\.signature\.outputs\.signed == 'true'/);
});

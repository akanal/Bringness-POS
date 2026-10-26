import {test} from 'node:test';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
test('interactive configuration preserves unrelated environment and rejects insecure or injected secret writes',async()=>{await promisify(execFile)('python3',[fileURLToPath(new URL('../configure-shop-assistant.test.py',import.meta.url))]);});

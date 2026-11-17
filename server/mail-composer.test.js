import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComposedMail} from './mail-composer.js';
import {formatMail,supportFooter} from './mail-templates.js';
import {renderBringnessMail} from '../apps/web/public/admin/mail-renderer.js';
const message={requestKey:'11111111-1111-4111-8111-111111111111',to:'user@example.test',subject:'Ihre Nachricht',text:'Guten Tag,\n\nTest'};
test('composer accepts a single recipient and rejects headers, extra send controls and invalid identifiers',()=>{
 assert.equal(validateComposedMail({...message,to:' USER@example.test '}).to,'user@example.test');
 for(const change of [{to:'a@example.test,b@example.test'},{to:'a@example.test;b@example.test'},{to:'A <a@example.test>'},{to:'a@example.test\r\nBcc: b@example.test'},{subject:'Test\r\nBcc: b@example.test'},{requestKey:[message.requestKey]},{requestKey:'x'},{from:'evil@example.test'},{html:'<img src=x>'},{text:'x'.repeat(10001)},{text:' '},{subject:'x'.repeat(161)}])assert.throws(()=>validateComposedMail({...message,...change}),error=>error.status===400);
});
test('branded MIME message preserves attachments, text, reply address and exact secure links',()=>{
 const text='Guten Tag,\n\n<script>alert(1)</script>\nhttps://bringness.de/service/#activate=test&mode=one';
 const pdf={filename:'Beleg.pdf',content:Buffer.from('%PDF-test')};
 const output=formatMail({text,attachments:[pdf],subject:'Test'});
 assert(output.html.includes('&lt;script&gt;'));assert(!output.html.includes('<script>'));
 assert(output.html.includes('href="https://bringness.de/service/#activate=test&amp;mode=one"'));
 assert(output.html.includes('cid:bringness-logo@bringness.de'));assert(output.html.includes('#ff7628'));assert(output.html.includes('#071a2b'));
 assert.equal(output.attachments[0],pdf);assert.equal(output.attachments[1].content.readUInt32BE(0),0x89504e47);assert.equal(output.replyTo,'info@bringness.de');
 assert.equal(output.text,text+'\n\n'+supportFooter);
 const preview=renderBringnessMail({text,logoUrl:'https://bringness.de/assets/bringness-logo.png'});
 assert.equal(preview,output.html.replace('cid:bringness-logo@bringness.de','https://bringness.de/assets/bringness-logo.png'));
 assert(!renderBringnessMail({text:'https://user:password@example.test/'}).includes('href="https://user:'));
});

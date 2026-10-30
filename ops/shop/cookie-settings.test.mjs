import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
import {readChoice,preferencesAllowed,saveChoice,consentKey,preferenceKey} from '../../apps/web/public/shop/cookie-policy.js';
import {mountCookieSettings} from '../../apps/web/public/shop/cookie-settings.js';
const {JSDOM}=createRequire(import.meta.url)(dependency('jsdom','SHOP_JSDOM_PATH'));
test('first visit, explicit opt-in, reload, reopen and withdrawal preserve essential storage',()=>{
 const dom=new JSDOM('<body><footer></footer></body>',{url:'https://bringness.de/'}),d=dom.window.document,s=dom.window.localStorage;
 s.setItem('bringness-pos-token','fixture');s.setItem(preferenceKey,'/shop/?q=old');mountCookieSettings(d);
 const box=d.getElementById('shop-cookie-banner');assert.equal(box.hidden,false);assert.equal(preferencesAllowed(s),false);
 box.querySelector('[data-choice=preferences]').click();assert.equal(box.hidden,true);assert.equal(preferencesAllowed(s),true);
 mountCookieSettings(d);assert.equal(d.querySelectorAll('#shop-cookie-banner').length,1);
 d.querySelector('.shop-cookie-reopen').click();assert.equal(box.hidden,false);
 box.querySelector('[data-choice=necessary]').click();assert.equal(preferencesAllowed(s),false);assert.equal(s.getItem(preferenceKey),null);assert.equal(s.getItem('bringness-pos-token'),'fixture');
 box.remove();d.querySelector('.shop-cookie-reopen').remove();mountCookieSettings(d);assert.equal(d.getElementById('shop-cookie-banner').hidden,true);dom.window.close();
});
test('invalid/legacy choices and unavailable storage never authorize optional preferences',()=>{
 const dom=new JSDOM('',{url:'https://fixture.test'}),s=dom.window.localStorage;
 for(const value of ['all','{}','null','{"version":1,"preferences":"true"}','{"version":2,"preferences":true}']){s.setItem(consentKey,value);assert.equal(readChoice(s),null);assert.equal(preferencesAllowed(s),false);}
 const blocked={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
 assert.equal(preferencesAllowed(blocked),false);assert.equal(saveChoice(blocked,true),false);dom.window.close();
});

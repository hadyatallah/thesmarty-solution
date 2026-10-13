import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../buyer-interest/index.html',import.meta.url),'utf8');
const strategic=readFileSync(new URL('../strategic-connections.html',import.meta.url),'utf8');
const siteCss=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('buyer-interest landing stays email-only with no form or buyer-collection API',()=>{
 assert.match(html,/<!doctype html>/i);
 assert.doesNotMatch(html,/<form\b|<input\b|\/api\/irc-buyer-enquiry/i);
 assert.doesNotMatch(html,/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b/i);
 assert.doesNotMatch(html,/https:\/\/(api|forms?)\.hubspot\.com|js-eu1\.hsforms\.net/i);
 assert.match(html,/This page does not collect enquiry details through a browser form/);
 const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map(m=>m[0]);
 assert.equal(scripts.length,1);
 assert.match(scripts[0],/^<script src="\/script\.js\?v=20260927-footer-links" defer>/);
 assert.doesNotMatch(html,/<script>\s*[\s\S]*?<\/script>/i);
});

test('buyer and professional mailto are retained without naming customers or partner agents',()=>{
 assert.match(html,/mailto:info@thesmartysolution\.com\?subject=Cyprus%20or%20Greece%20property%20enquiry/);
 assert.match(html,/mailto:info@thesmartysolution\.com\?subject=Professional%20collaboration/);
 assert.match(html,/&amp;body=/);
 assert.doesNotMatch(html,/\b(HH Overseas|Jemma|Cyprus Emerald|PropertyLink)\b/i);
});

test('transparent TSS introduction role and informed sharing survive brand update',()=>{
 assert.match(html,/We do not charge prospective buyers for an initial introduction/i);
 assert.match(html,/Our services are funded by our business clients/i);
 assert.match(html,/before sharing/i);
 assert.match(html,/Sending an enquiry does not subscribe you to marketing emails/i);
 assert.match(html,/ask for appropriate permission first/i);
 assert.match(html,/privacy\.html/i);
 assert.match(html,/does not provide regulated property, investment, financial, tax, legal or immigration advice/i);
 assert.match(html,/passports, bank statements/i);
});

test('new buyer page reuses the actual shared site colors, fonts, header, footer and mobile nav',()=>{
 assert.match(siteCss,/:root\{--ink:#07182b;--ink2:#0d2942;--teal:#12c7c0;--teal2:#0a8f91;/);
 assert.match(html,/<link rel="stylesheet" href="\/style\.css\?v=20260925-phase7">/);
 assert.match(html,/<base href="\/">/);
 assert.match(html,/<meta name="theme-color" content="#07182b">/);
 assert.match(html,/<header class="header">/);
 assert.match(html,/<nav aria-label="Primary"><ul class="navlinks" id="navlinks">/);
 assert.match(html,/<footer class="footer">/);
 assert.match(html,/<img src="logo-mark-light\.png" alt="The Smarty Solution">/);
 assert.match(html,/family=Manrope/);
 assert.doesNotMatch(html,/:root\{/);
 assert.match(strategic,/<a class="btn dark" href="buyer-interest\/">Explore the buyer enquiry route/);
 assert.doesNotMatch(strategic,/<a class="maplink" href="buyer-interest\/">/);
});

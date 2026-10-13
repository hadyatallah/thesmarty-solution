import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../buyer-interest/index.html',import.meta.url),'utf8');

test('first-party property interest page has no webform, tracking or collection endpoint',()=>{
 assert.match(html,/<!doctype html>/i);
 assert.doesNotMatch(html,/<form\b/i);
 assert.doesNotMatch(html,/<input\b/i);
 assert.doesNotMatch(html,/<script\b/i);
 assert.doesNotMatch(html,/\bfetch\s*\(/i);
 assert.doesNotMatch(html,/localStorage|sessionStorage|HubSpot|Google Analytics|gtag\s*\(/i);
 assert.doesNotMatch(html,/https:\/\/(api|forms?)\.hubspot\.com|js-eu1\.hsforms\.net/i);
 assert.match(html,/No personal details are collected or stored by this page itself/i);
});
test('buyer-initiated mailto and referrer mailto keep partner identities private',()=>{
 assert.match(html,/mailto:info@thesmartysolution\.com\?subject=Cyprus%20or%20Greece%20property%20enquiry/);
 assert.match(html,/mailto:info@thesmartysolution\.com\?subject=Professional%20collaboration/);
 assert.match(html,/&amp;body=/);
 assert.doesNotMatch(html,/\b(HH Overseas|Jemma|Cyprus Emerald|PropertyLink)\b/i);
});
test('transparent intermediary position and privacy safety appear before any contact',()=>{
 assert.match(html,/We do not charge prospective buyers for an initial introduction/i);
 assert.match(html,/Our services are funded by our business clients/);
 assert.match(html,/before sharing/i);
 assert.match(html,/Sending an enquiry does not subscribe you to marketing emails/i);
 assert.match(html,/request the appropriate permission/i);
 assert.match(html,/\/privacy\.html/);
 assert.match(html,/does not provide regulated property, investment, financial, tax, legal or immigration advice/i);
 assert.match(html,/passports, bank statements/i);
});
test('existing fixed TSS logo is referenced instead of embedding/recreating assets',()=>{
 assert.match(html,/<img src="\/logo-mark-light\.png" alt="">/);
 assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1">/);
 assert.doesNotMatch(html,/<svg\b/i);
});

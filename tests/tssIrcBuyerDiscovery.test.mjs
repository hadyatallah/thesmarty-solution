import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const strategic=file("strategic-connections.html");
const sitemap=file("sitemap.xml");
const landing=file("buyer-interest/index.html");
test("public TSS strategic-connection page points to buyer-initiated enquiry",()=>{
 assert.match(strategic,/href="buyer-interest\/"/);
 assert.match(strategic,/Considering property in Cyprus or Greece/);
 assert.match(strategic,/will explain the intended professional recipient before any personal information is shared/i);
 assert.doesNotMatch(strategic,/HH Overseas|Jemma|Cyprus Emerald/);
});
test("public sitemap contains one exact canonical buyer route",()=>{
 const href="https://www.thesmartysolution.com/buyer-interest/";
 const matches=sitemap.split(href).length-1;
 assert.equal(matches,1);
 assert.ok(landing.includes('<link rel="canonical" href="'+href+'">'));
 assert.doesNotMatch(sitemap,/\/research-center\/|\/property-interest\//);
});
test("public buyer destination stays email-first and has no collection API",()=>{
 assert.match(landing,/mailto:info@thesmartysolution\.com\?subject=Cyprus%20or%20Greece%20property%20enquiry/);
 assert.doesNotMatch(landing,/<form\b|<script\b|\/api\/irc-buyer-enquiry/i);
 assert.match(landing,/No fee to buyers for initial introductions/);
});

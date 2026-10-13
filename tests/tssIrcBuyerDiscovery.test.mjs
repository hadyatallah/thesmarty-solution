import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const strategic=file("strategic-connections.html");
const sitemap=file("sitemap.xml");
const landing=file("buyer-interest/index.html");

test("the existing Strategic Connections page links to voluntary buyer enquiries, without replacement",()=>{
 assert.match(strategic,/What We Do · Strategic Connections/);
 assert.match(strategic,/href="buyer-interest\/"/);
 assert.match(strategic,/Considering property in Cyprus or Greece/);
 assert.match(strategic,/will explain the intended professional recipient before any personal information is shared/i);
 assert.doesNotMatch(strategic,/HH Overseas|Jemma|Cyprus Emerald/);
});
test("the unchanged public sitemap contains one exact canonical buyer route",()=>{
 const href="https://www.thesmartysolution.com/buyer-interest/";
 assert.equal(sitemap.split(href).length-1,1);
 assert.ok(landing.includes('<link rel="canonical" href="'+href+'">'));
 assert.doesNotMatch(sitemap,/\/research-center\/|\/property-interest\//);
});
test("the public buyer destination is email-first, visually shares TSS chrome and has no collection API",()=>{
 assert.match(landing,/mailto:info@thesmartysolution\.com\?subject=Cyprus%20or%20Greece%20property%20enquiry/);
 assert.doesNotMatch(landing,/<form\b|<input\b|\/api\/irc-buyer-enquiry/i);
 assert.match(landing,/No introduction fee for prospective buyers/);
 assert.match(landing,/<link rel="stylesheet" href="\/style\.css\?v=20260925-phase7">/);
 assert.match(landing,/<base href="\/">/);
 assert.match(landing,/<header class="header">/);
});

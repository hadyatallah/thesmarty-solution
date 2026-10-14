import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const home = read('index.html');
const what = read('divisions.html');
const strategic = read('strategic-connections.html');
const buyer = read('buyer-interest/index.html');
const css = read('style.css');
const origin = 'https://www.thesmartysolution.com/';
const href = 'buyer-interest/';
const linkMatches = text => [...text.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)].map(m=>m[1]);

test('ordinary user can find buyer enquiry directly from homepage Strategic Connections card',()=>{
 const card = home.match(/<article class="card"><h3>Find the right commercial connection<\/h3>[\s\S]*?<\/article>/)?.[0];
 assert.ok(card,'Strategic Connections card remains on the homepage');
 assert.match(card,/Explore Strategic Connections/);
 assert.match(card,/Looking to buy property in Cyprus or Greece\?/);
 assert.match(card,/href="buyer-interest\/"[^>]+data-cta-location="home-strategic-connections"/);
 assert.ok(linkMatches(card).includes(href));
 assert.equal(new URL(href,origin).pathname,'/buyer-interest/');
 assert.match(home,/<a href="divisions\.html">What We Do<\/a>/);
 assert.match(home,/Looking for property in Cyprus or Greece\?/);
 assert.match(home,/data-cta-location="home-hero-secondary"/);
});

test('What We Do remains business-led and offers one conspicuous buyer CTA',()=>{
 const serviceTitles=['Business Growth','Market Entry &amp; Representation','Strategic Connections','Opportunity Development','Business Systems'];
 for(const title of serviceTitles)assert.ok(what.includes('<h3>'+title+'</h3>'),title+' still visible');
 assert.match(what,/Business development built around the commercial objective\./);
 const buyerSection=what.match(/<div class="buyer-service-path"[\s\S]*?<\/a><\/div>/)?.[0];
 assert.ok(buyerSection,'New buyer enquiry pathway visible on What We Do');
 assert.match(buyerSection,/For prospective property buyers/);
 assert.match(buyerSection,/Buying property in Cyprus or Greece\?/);
 assert.match(buyerSection,/no fee to prospective buyers/i);
 assert.match(buyerSection,/permission before sharing your details/i);
 assert.match(buyerSection,/class="btn dark" href="buyer-interest\/"[^>]+data-cta-location="what-we-do"/);
 assert.equal(linkMatches(buyerSection).filter(x=>x===href).length,1);
 assert.ok(what.indexOf('buyer-service-path') < what.indexOf('<h2>How We Work</h2>'));
});

test('navigating through the existing Strategic Connections page also works',()=>{
 assert.match(what,/<a class="maplink" href="strategic-connections\.html">Explore service/);
 assert.match(strategic,/<a class="btn dark" href="buyer-interest\/">Explore the buyer enquiry route/);
 assert.match(buyer,/<h1>Considering a property in Cyprus or Greece\?<\/h1>/);
 assert.match(buyer,/mailto:info@thesmartysolution\.com\?subject=Cyprus%20or%20Greece%20property%20enquiry/);
 assert.match(buyer,/href="\/buyer-interest\/#how-we-work"/);
 assert.doesNotMatch(buyer,/<form\b|\/api\/irc-buyer-enquiry/i);
});

test('new pathways inherit the canonical TSS responsive design without exposing partners or rebuilding',()=>{
 assert.match(css,/:root\{--ink:#07182b;--ink2:#0d2942;--teal:#12c7c0/);
 assert.match(css,/\.buyer-service-path\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/@media\(max-width:760px\)\{\.buyer-service-path\{grid-template-columns:1fr;/);
 assert.match(css,/\.home-objectives \.home-buyer-path a\{[^}]*color:var\(--teal2\)/);
 assert.match(css,/\.home-hero \.home-buyer-hint a\{color:#5ce6df/);
 assert.match(css,/@media\(max-width:940px\)\{\.menu\{display:grid\}/);
 assert.ok(home.includes('href="style.css?v=20261013-buyer-discovery"'));
 assert.ok(what.includes('href="style.css?v=20261013-buyer-discovery"'));
 assert.ok(buyer.includes('href="/style.css?v=20260925-phase7"'));
 assert.match(home,/class="footer"/);
 assert.match(what,/class="footer"/);
 assert.doesNotMatch(home+'\n'+what,/HH Overseas|Jemma|Cyprus Emerald/);
 assert.equal(linkMatches(home).filter(x=>x===href).length,2);
 assert.equal(linkMatches(what).filter(x=>x===href).length,1);
});

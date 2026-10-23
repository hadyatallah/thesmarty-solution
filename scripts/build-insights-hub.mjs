import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderHub(data){
 const ids=new Set(),topics=new Map();
 for(const t of data.topics){if(!/^[a-z][a-z0-9-]*$/.test(t.id)||t.id==='all'||topics.has(t.id)||!t.label)throw Error('Invalid topic');topics.set(t.id,t.label);}
 for(const e of data.entries){
  if(!/^[a-z][a-z0-9-]*$/.test(e.id)||ids.has(e.id))throw Error('Invalid entry ID');ids.add(e.id);
  if(!['article','partner','resource'].includes(e.type)||!['draft','published'].includes(e.status))throw Error('Invalid entry type or status');
  if(e.type!=='partner'&&!topics.has(e.topic))throw Error('Unknown topic');
  if(e.type==='partner'&&!['editorial','commercial'].includes(e.relationshipType))throw Error('Partner relationship type required');
  for(const k of ['name','description','relationship','verifiedOn'])if(!e[k])throw Error('Missing '+k);
  for(const value of [e.url,...(e.image?[e.image]:[])]){if(!/^(https:\/\/|\/(?!\/))/.test(value)||/[\\\s]/.test(value))throw Error('Invalid URL');const u=new URL(value,'https://www.thesmartysolution.com');if(u.protocol!=='https:'||u.username||u.password)throw Error('Invalid URL');}
 }
 const entries=data.entries.filter(e=>e.status==='published');
 const cards=type=>entries.filter(e=>e.type===type).map(e=>`<article class="card hub-card" data-topic="${esc(e.topic||'')}" id="${esc(e.id)}">${e.image?`<img src="${esc(e.image)}" alt="" loading="lazy" width="640" height="360">`:''}<div class="hub-card-body"><p class="relationship">${esc(e.relationship)}${e.type==='article'?' · '+esc(topics.get(e.topic)):e.type==='partner'?' · '+(e.relationshipType==='editorial'?'Editorial collaboration':'Commercial partner'):''}</p><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p><a class="maplink" href="${esc(e.url)}">${e.type==='article'?'Read article':'Learn more'}<span class="sr-only">: ${esc(e.name)}</span> <span aria-hidden="true">→</span></a></div></article>`).join('');
 const topicLinks=[...topics].filter(([id])=>entries.some(e=>e.type==='article'&&e.topic===id)).map(([id,label])=>`<a href="/insights/#articles/${esc(id)}" data-topic-link="${esc(id)}">${esc(label)}</a>`).join('');
 return `<section class="hub-panel" id="articles" data-hub-panel="articles"><h2>Practical perspectives.</h2><p>Original TSS articles to help you ask better questions and make informed next steps.</p><nav class="hub-topics" aria-label="Article topics"><a href="/insights/#articles" data-topic-link="all">All articles</a>${topicLinks}</nav><div class="cards3">${cards('article')}</div></section>
 <section class="hub-panel" id="partners" data-hub-panel="partners"><h2>Relationships, clearly explained.</h2><p>Editorial collaborations and commercial partnerships are different. Each confirmed listing will explain its scope and link to relevant work.</p>${entries.some(e=>e.type==='partner')?'<div class="cards3">'+cards('partner')+'</div>':'<div class="hub-empty"><h3>A considered approach to collaboration.</h3><p>We are preparing this section. No organisations are currently listed as confirmed partners. If you have a relevant editorial or commercial collaboration in mind, tell us who it helps and what you would like to explore.</p><a class="btn dark" href="/contact.html">Discuss a collaboration</a></div>'}</section>
 <section class="hub-panel" id="resources" data-hub-panel="resources"><h2>A useful starting point.</h2><p>Selected information, grouped separately from partnerships. Our own pages are labelled as TSS information; an independent resource listing would not imply a commercial relationship.</p><div class="cards3">${cards('resource')}</div><p class="hub-disclosure">General information is not legal, financial or other regulated advice. A resource listing is not a guarantee of a provider’s services.</p></section>`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const d=JSON.parse(readFileSync(new URL('insights/catalog.json',root)));const s=readFileSync(new URL('insights/hub-shell.html',root),'utf8');writeFileSync(new URL('insights/index.html',root),s.replace('<!-- HUB -->',renderHub(d)));}

import {
  KITI_PUBLIC_FACTS,
  kitiFixture,
  deriveOperatingPhase,
  aggregateMandatory,
  candidateQueueGroup,
  outreachGate,
  packProjection,
  interpretMessage,
  validateDraftClaims
} from './kiti-pilot-model.js';

const fixture = kitiFixture();
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function badge(text,kind=''){
  return '<span class="badge '+kind+'">'+esc(text)+'</span>';
}

function renderHeader(){
  const phase = deriveOperatingPhase(fixture.opportunity,fixture.mandate,fixture.matches);
  $('phase').textContent=phase;
  $('status').textContent=fixture.opportunity.status;
  $('stage').textContent=fixture.opportunity.developmentStage;
  const gate=outreachGate({mandate:fixture.mandate,match:fixture.matches[0],suppressed:false,recipientKnown:true});
  $('authority').textContent=gate.allowed?'Outreach available':'Outreach blocked: '+gate.reason;
  $('authority').className='notice '+(gate.allowed?'ok':'block');
}

function overview(){
  const m=fixture.matches[0];
  const html=`
    <div class="cards">
      <div class="panel metric"><span>Operating phase</span><strong>${esc(deriveOperatingPhase(fixture.opportunity,fixture.mandate,fixture.matches))}</strong></div>
      <div class="panel metric"><span>Mandate</span><strong>${esc(fixture.mandate.status)}</strong><small>Research ${esc(fixture.mandate.authorityResearch)} · Outreach ${esc(fixture.mandate.authorityOutreach)}</small></div>
      <div class="panel metric"><span>Matches</span><strong>${fixture.matches.length}</strong></div>
      <div class="panel metric"><span>Next action</span><strong class="small-strong">Human qualification review</strong></div>
    </div>
    <div class="grid">
      <section class="panel">
        <h3>Opportunity at a glance</h3>
        ${[
          ['Location',KITI_PUBLIC_FACTS.location],
          ['Type',KITI_PUBLIC_FACTS.opportunityType],
          ['Site area',KITI_PUBLIC_FACTS.siteArea],
          ['Concept stage',KITI_PUBLIC_FACTS.conceptStage],
          ['Structures',KITI_PUBLIC_FACTS.structures.join(', ')],
          ['Due diligence',KITI_PUBLIC_FACTS.caveat]
        ].map(([k,v])=>`<div class="rowline"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
      </section>
      <section class="panel">
        <h3>Current Match</h3>
        <div class="rowline"><span>Company</span><strong>${esc(m.companyName)}</strong></div>
        <div class="rowline"><span>Qualification</span><strong>${esc(m.qualificationState)}</strong></div>
        <div class="rowline"><span>Engagement</span><strong>${esc(m.engagementState)}</strong></div>
        <div class="rowline"><span>Mandatory result</span><strong>${esc(aggregateMandatory(m.criteria))}</strong></div>
        <div class="rowline"><span>Queue</span><strong>${esc(candidateQueueGroup(m))}</strong></div>
      </section>
    </div>`;
  $('workspace').innerHTML=html;
}

function readiness(){
  const items=[
    ['Opportunity accepted',true,'Accepted'],
    ['Target criteria defined',fixture.mandate.criteriaReady,'Required before launch'],
    ['Information package ready',fixture.opportunity.informationPackageReady,'Approved material only'],
    ['Active Mandate',fixture.mandate.status==='Active','Authority-dependent'],
    ['Research authority',fixture.mandate.authorityResearch==='Granted','Granted'],
    ['Outreach authority',fixture.mandate.authorityOutreach==='Granted','External contact blocked until granted'],
    ['Disclosure ceiling',fixture.mandate.maxDisclosureLevel==='D1','Current ceiling '+fixture.mandate.maxDisclosureLevel]
  ];
  $('workspace').innerHTML='<section class="panel"><h3>Readiness</h3><p class="muted">This view explains what is ready and what blocks progression. It does not create a second status system.</p>'+
    items.map(([name,ready,note])=>`<div class="readiness"><span>${badge(ready?'Ready':'Blocked',ready?'ok':'block')} <strong>${esc(name)}</strong></span><span class="muted">${esc(note)}</span></div>`).join('')+
    '</section>';
}

function mandate(){
  const rows=[
    ['Research',fixture.mandate.authorityResearch],
    ['Outreach',fixture.mandate.authorityOutreach],
    ['Disclosure',fixture.mandate.authorityDisclosure],
    ['Introduction',fixture.mandate.authorityIntroduction],
    ['Representation',fixture.mandate.authorityRepresentation],
    ['Negotiation',fixture.mandate.authorityNegotiation],
    ['Binding',fixture.mandate.authorityBinding]
  ];
  $('workspace').innerHTML='<section class="panel"><h3>Mandate and authority</h3><p class="muted">Research-only acceptance fixture. This does not represent live Kiti commercial authority.</p>'+
  rows.map(([k,v])=>`<div class="rowline"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')+
  `<div class="rowline"><span>Maximum disclosure</span><strong>${esc(fixture.mandate.maxDisclosureLevel)}</strong></div></section>`;
}

function criteria(){
  const m=fixture.matches[0];
  const rows=m.criteria.map(c=>`<tr><td>${esc(c.type)}</td><td>${esc(c.name)}</td><td>${esc(c.outcome)}</td><td>${esc(c.outcome==='Unknown'?'Evidence required before relying on this criterion':'Recorded fixture evidence')}</td></tr>`).join('');
  $('workspace').innerHTML=`
    <section class="panel">
      <h3>Target criteria</h3>
      <p class="muted">Criteria are Mandate-specific. Mandatory, Preferred and Informational remain separate, and no numerical Match Score is used.</p>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Criterion</th><th>Outcome</th><th>Evidence treatment</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="notice block section-title"><strong>Appetite rule:</strong> developer capability and Kiti relevance do not establish current appetite. Current appetite remains Unknown in this fixture.</div>
    </section>`;
}

function communications(){
  $('workspace').innerHTML=`
    <section class="panel">
      <h3>Communications</h3>
      <p class="muted">Synthetic communication timeline only. The pilot does not read or send live Kiti email.</p>
      <div class="rowline"><span>Linked Match</span><strong>Gelfanco → Kiti</strong></div>
      <div class="rowline"><span>Current engagement</span><strong>Not Contacted</strong></div>
      <div class="rowline"><span>Outbound state</span><strong>BLOCKED · Outreach authority not granted</strong></div>
      <div class="rowline"><span>Assistant behavior</span><strong>Interpret and propose only</strong></div>
      <div class="notice block section-title">A positive reply may support an Interested proposal, but never automatically changes Qualification State.</div>
    </section>`;
}

function documents(){
  const docs=[
    ['Approved public teaser','D1','Approved','Eligible at current ceiling'],
    ['Developer information pack','D2','Pilot draft','Blocked at current D1 Mandate ceiling'],
    ['Planning / technical package','D3','Controlled fixture','Blocked pending authority and conditions'],
    ['NDA','D3 gate','Verification workflow','Does not itself raise Mandate authority']
  ];
  $('workspace').innerHTML=`
    <section class="panel">
      <h3>Documents and disclosure</h3>
      <p class="muted">Document metadata only. Restricted source material is not embedded in this pilot page.</p>
      <div class="table-wrap"><table><thead><tr><th>Document</th><th>Level</th><th>Status</th><th>Current treatment</th></tr></thead><tbody>
      ${docs.map(d=>`<tr><td>${esc(d[0])}</td><td>${esc(d[1])}</td><td>${esc(d[2])}</td><td>${esc(d[3])}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="notice block section-title">Protected Kiti categories remain outside the external projection: landowner identity, architect identity, people behind TSS, confidential studies and unapproved projections.</div>
    </section>`;
}

function presentation(){
  const publicRows=[
    ['Title',KITI_PUBLIC_FACTS.title],
    ['Location',KITI_PUBLIC_FACTS.location],
    ['Site area',KITI_PUBLIC_FACTS.siteArea],
    ['Concept stage',KITI_PUBLIC_FACTS.conceptStage],
    ['Potential structures',KITI_PUBLIC_FACTS.structures.join(', ')],
    ['Due diligence',KITI_PUBLIC_FACTS.caveat]
  ];
  const protectedRows=['Landowner identity','Architect identity','People behind TSS','Confidential studies','Unapproved projections'];
  $('workspace').innerHTML=`
    <div class="grid">
      <section class="panel">
        <h3>Approved D1 projection</h3>
        ${publicRows.map(([k,v])=>`<div class="rowline"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
      </section>
      <section class="panel">
        <h3>Internal-only / protected</h3>
        <p class="muted">Labels are shown to prove exclusion. No restricted values are rendered.</p>
        ${protectedRows.map(k=>`<div class="rowline"><span>${esc(k)}</span><strong>🔒 Not exposed</strong></div>`).join('')}
      </section>
    </div>`;
}

function activity(){
  const events=[
    ['09:00','Opportunity fixture loaded','Accepted · Targeting'],
    ['09:01','Research-only Mandate fixture loaded','Research Granted · Outreach Not Granted'],
    ['09:02','Target criteria evaluated','Mandatory PASS · appetite Unknown'],
    ['09:03','Gelfanco Match fixture surfaced','Under Qualification · Not Contacted'],
    ['09:04','Communication gate evaluated','BLOCKED · no external action']
  ];
  $('workspace').innerHTML=`
    <section class="panel">
      <h3>Activity and audit fixture</h3>
      <p class="muted">Synthetic events demonstrate the required reconstructable history. No live Activity rows are written.</p>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Result</th></tr></thead><tbody>
      ${events.map(e=>`<tr><td>${esc(e[0])}</td><td>${esc(e[1])}</td><td>${esc(e[2])}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
}

function matches(){
  const m=fixture.matches[0];
  const criteria=m.criteria.map(c=>`<tr><td>${esc(c.type)}</td><td>${esc(c.name)}</td><td>${esc(c.outcome)}</td></tr>`).join('');
  $('workspace').innerHTML=`
    <section class="panel">
      <div class="row"><div><h3>${esc(m.companyName)}</h3><p class="muted">${esc(m.companyId)}</p></div>${badge(candidateQueueGroup(m))}</div>
      <div class="grid compact">
        <div><strong>Qualification</strong><p>${esc(m.qualificationState)}</p></div>
        <div><strong>Engagement</strong><p>${esc(m.engagementState)}</p></div>
        <div><strong>Mandatory</strong><p>${esc(aggregateMandatory(m.criteria))}</p></div>
        <div><strong>Outreach</strong><p>${esc(outreachGate({mandate:fixture.mandate,match:m}).reason)}</p></div>
      </div>
      <h3>Criteria</h3>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Criterion</th><th>Outcome</th></tr></thead><tbody>${criteria}</tbody></table></div>
      <h3 class="section-title">Known gaps</h3>
      <div class="list">${m.gaps.map(g=>`<div class="gap">${esc(g)}</div>`).join('')}</div>
    </section>`;
}

function packs(){
  const facts={
    title:KITI_PUBLIC_FACTS.title,
    location:KITI_PUBLIC_FACTS.location,
    siteArea:KITI_PUBLIC_FACTS.siteArea,
    conceptStage:KITI_PUBLIC_FACTS.conceptStage,
    structures:KITI_PUBLIC_FACTS.structures.join(', '),
    caveat:KITI_PUBLIC_FACTS.caveat,
    landownerIdentity:'RESTRICTED TEST VALUE',
    confidentialStudies:'RESTRICTED TEST DOCUMENT'
  };
  const rules={
    title:{minLevel:'D1'},location:{minLevel:'D1'},siteArea:{minLevel:'D1'},conceptStage:{minLevel:'D1'},
    structures:{minLevel:'D1'},caveat:{minLevel:'D1'},landownerIdentity:{restricted:true},confidentialStudies:{restricted:true}
  };
  const projection=packProjection({facts,requestedLevel:'D3',mandateCeiling:fixture.mandate.maxDisclosureLevel,recipientLevel:'D2',fieldRules:rules});
  $('workspace').innerHTML=`
    <section class="panel">
      <h3>Opportunity Pack pre-generation check</h3>
      <div class="cards mini">
        <div class="panel metric"><span>Requested</span><strong>D3</strong></div>
        <div class="panel metric"><span>Mandate ceiling</span><strong>${esc(fixture.mandate.maxDisclosureLevel)}</strong></div>
        <div class="panel metric"><span>Recipient level</span><strong>D2</strong></div>
        <div class="panel metric"><span>Effective</span><strong>${esc(projection.effectiveLevel)}</strong></div>
      </div>
      <h3>Included facts</h3>
      <div class="list">${Object.entries(projection.included).map(([k,v])=>`<div class="rowline"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
      <h3 class="section-title">Excluded</h3>
      <div class="list">${projection.excluded.map(x=>`<div class="gap"><strong>${esc(x.key)}</strong> · ${esc(x.reason)}</div>`).join('')}</div>
    </section>`;
}

function assistant(){
  $('workspace').innerHTML=`
    <section class="panel">
      <h3>Communication interpretation fixture</h3>
      <p class="muted">Nothing is written or sent. This is proposal-only behavior.</p>
      <textarea id="messageInput">We are interested in the Kiti opportunity. Can you send the planning information and tell us whether the owner would consider a JV?</textarea>
      <div class="actions"><button class="primary" id="interpretBtn">Interpret message</button></div>
      <div id="assistantResult"></div>
    </section>`;
  $('interpretBtn').onclick=()=>{
    const result=interpretMessage($('messageInput').value);
    $('assistantResult').innerHTML=`
      <div class="assistant-card">
        <h3>Detected</h3>
        <div class="list">${result.detected.map(x=>`<div>${esc(x)}</div>`).join('')||'<div>Nothing material detected.</div>'}</div>
        <h3 class="section-title">Proposed CRM changes</h3>
        <div class="list">${result.proposals.map(x=>`<div class="rowline"><span>${esc(x.field)}</span><strong>${esc(x.value)}</strong></div>`).join('')||'<div>No state proposal.</div>'}</div>
        <p><strong>Qualification:</strong> NO CHANGE</p>
      </div>`;
  };
}

function analytics(){
  const states=['Identified','Research Required','Under Qualification','Qualified','Qualified With Gaps','Shortlisted','Outreach Approved','Interested','Introduced','Active Discussion','Outcome'];
  const values={'Identified':1,'Research Required':0,'Under Qualification':1,'Qualified':0,'Qualified With Gaps':0,'Shortlisted':0,'Outreach Approved':0,'Interested':0,'Introduced':0,'Active Discussion':0,'Outcome':0};
  $('workspace').innerHTML='<section class="panel"><h3>Kiti commercial progression</h3><p class="muted">Fixture counts only. No close probability or weighted pipeline.</p>'+
    states.map(s=>`<div class="rowline"><span>${esc(s)}</span><strong>${values[s]}</strong></div>`).join('')+
    '<div class="section-title"></div><div class="notice block">Governance attention: Outreach authority is not granted.</div></section>';
}

const views={Overview:overview,Readiness:readiness,Mandate:mandate,Criteria:criteria,Matches:matches,Communications:communications,Documents:documents,Packs:packs,Presentation:presentation,Activity:activity,Assistant:assistant,Analytics:analytics};

function selectView(name){
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  views[name]();
}

document.addEventListener('DOMContentLoaded',()=>{
  renderHeader();
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
  selectView('Overview');
  const draft='The fully approved planning project offers an 18% ROI on a 900 m² site.';
  const failures=validateDraftClaims(draft,{siteArea:'Approx. 859 m²'});
  $('validationExample').textContent=failures.length?failures.join(' · '):'No validation failures';
});

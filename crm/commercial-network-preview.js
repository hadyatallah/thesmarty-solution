(() => {
'use strict';

const fixture = Object.freeze({
  opportunity: {
    id: 'COP-SYNTHETIC-001',
    title: 'Synthetic Residential Development Opportunity',
    opportunityType: 'Land / Development',
    status: 'Accepted',
    developmentStage: 'Targeting',
    geographyCountry: 'Cyprus',
    geographyRegion: 'Larnaca District',
    geographyLocality: 'Synthetic Locality',
    sector: 'Residential Development',
    commercialStructure: 'Other / To Be Defined',
    owner: 'TSS QA',
    informationClass: 'TSS Restricted Intelligence',
    publicationStatus: 'Not Published',
    publicTitle: 'Synthetic Development Opportunity',
    publicSummary: 'Synthetic public-safe summary for layout testing only.',
    publicGeography: 'Larnaca District, Cyprus',
    publicOpportunityType: 'Residential Development',
    publicStructure: 'To Be Defined',
    publicCTA: 'Express Interest',
    documentFolderRef: '',
    keyDocumentRefs: []
  },
  mandate: {
    id: 'MAN-SYNTHETIC-001',
    status: 'Active',
    authorityResearch: 'Granted',
    authorityOutreach: 'Not Granted',
    authorityDisclosure: 'Conditional',
    authorityIntroduction: 'Not Granted',
    authorityRepresentation: 'Not Granted',
    authorityNegotiation: 'Not Granted',
    authorityBinding: 'Not Granted',
    maxDisclosureLevel: 'D1',
    restrictions: 'Synthetic fixture. External action prohibited.',
    legalProfessionalRoute: 'Review Required',
    owner: 'TSS QA'
  },
  criteria: [
    {label:'Developer capability evidenced', type:'Mandatory', result:'Supported'},
    {label:'Residential development relevance', type:'Mandatory', result:'Supported'},
    {label:'Cyprus relevance', type:'Preferred', result:'Supported'},
    {label:'Relevant project scale', type:'Preferred', result:'Unknown'},
    {label:'Current commercial appetite', type:'Informational', result:'Unknown'}
  ],
  matches: [
    {
      id:'MAT-SYNTHETIC-001',
      company:'Synthetic Developer A',
      qualificationState:'Under Qualification',
      engagementState:'Not Contacted',
      mandatoryCriteriaResult:'Supported',
      verificationGaps:'Current appetite unknown · capacity unknown',
      nextAction:'Review evidence gaps',
      followUp:'Not set',
      evidence:[
        {criterion:'Developer capability',result:'Supported',source:'Synthetic first-party evidence',freshness:'Current'},
        {criterion:'Current appetite',result:'Unknown',source:'No evidence available',freshness:'Unknown'}
      ]
    }
  ],
  activity: [
    {at:'2026-10-07T06:00:00+03:00',action:'Synthetic preview loaded',actor:'TSS QA',summary:'Read-only UI fixture. No business record created.'}
  ],
  documents: [],
  publicPresentation: {
    publicationStatus:'Not Published',
    fields:[
      ['Public title','Synthetic Development Opportunity'],
      ['Public geography','Larnaca District, Cyprus'],
      ['Public opportunity type','Residential Development'],
      ['Public structure','To Be Defined'],
      ['Public CTA','Express Interest']
    ]
  }
});

const sections = ['Overview','Mandate','Target Criteria','Matches','Activity','Documents','Public Presentation'];
let activeSection = 'Overview';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function operatingPhase(opportunity, mandate){
  if (!opportunity || opportunity.status !== 'Accepted') return 'PREPARE';
  const stage = opportunity.developmentStage || 'Preparation';
  const launchStages = ['Targeting','Qualification','Shortlist','Outreach','Interest'];
  const convertStages = ['Introduction','Active Discussion','Negotiation / Professional Handoff','Outcome'];
  const loadBlocked = !mandate || mandate.status !== 'Active' || mandate.authorityResearch === 'Not Granted' ||
    mandate.authorityOutreach !== 'Granted' || !fixture.criteria.some(c => c.type === 'Mandatory');
  if (stage === 'Preparation' || (launchStages.includes(stage) && loadBlocked)) return 'LOAD';
  if (launchStages.includes(stage)) return 'LAUNCH';
  if (convertStages.includes(stage)) return 'CONVERT';
  return 'PREPARE';
}

function readinessChecks(){
  const o=fixture.opportunity,m=fixture.mandate;
  return [
    ['Opportunity definition', Boolean(o.title && o.opportunityType && o.status),'Ready'],
    ['Commercial objective', false,'Attention Required'],
    ['Target counterparty criteria', fixture.criteria.some(c=>c.type==='Mandatory'),'Ready'],
    ['Mandate', m.status==='Active','Ready'],
    ['Research authority', m.authorityResearch==='Granted',m.authorityResearch],
    ['Outreach authority', m.authorityOutreach==='Granted',m.authorityOutreach],
    ['Disclosure authority', m.authorityDisclosure!=='Not Granted',m.authorityDisclosure],
    ['Professional / regulatory route', m.legalProfessionalRoute!=='Review Required',m.legalProfessionalRoute],
    ['Documents', fixture.documents.length>0,fixture.documents.length?'Ready':'Missing']
  ];
}

function statusCard(label,value){
  return '<div class="status-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
}

function kv(label,value){
  return '<div class="kv"><dt>'+esc(label)+'</dt><dd>'+esc(value || 'Unknown')+'</dd></div>';
}

function renderHeader(){
  const o=fixture.opportunity,m=fixture.mandate;
  document.getElementById('opportunityTitle').textContent=o.title;
  document.getElementById('opportunitySubtitle').textContent=[o.opportunityType,o.geographyLocality,o.geographyRegion,o.geographyCountry].filter(Boolean).join(' · ');
  const phase=operatingPhase(o,m);
  document.getElementById('statusStrip').innerHTML=[
    ['Operating Phase',phase],
    ['Opportunity Status',o.status],
    ['Development Stage',o.developmentStage],
    ['Mandate',m.status],
    ['Outreach',m.authorityOutreach],
    ['Disclosure Ceiling',m.maxDisclosureLevel],
    ['Owner',o.owner]
  ].map(x=>statusCard(...x)).join('');
  document.getElementById('attentionBanner').innerHTML='<strong>🔒 Outreach blocked</strong> This synthetic fixture has an Active Mandate for research but Outreach authority is Not Granted. The read-only preview intentionally keeps external communication unavailable.';
}

function renderTabs(){
  document.getElementById('workspaceTabs').innerHTML=sections.map(section =>
    '<button type="button" role="tab" aria-selected="'+(section===activeSection)+'" data-section="'+esc(section)+'">'+esc(section)+'</button>'
  ).join('');
  document.querySelectorAll('[data-section]').forEach(btn=>btn.addEventListener('click',()=>{activeSection=btn.dataset.section;renderTabs();renderPanel();}));
}

function renderOverview(){
  const o=fixture.opportunity;
  const checks=readinessChecks();
  return '<div class="grid">'+
    '<section class="panel"><h3>Opportunity summary</h3><dl>'+
      kv('Opportunity ID',o.id)+kv('Type',o.opportunityType)+kv('Sector',o.sector)+kv('Geography',[o.geographyLocality,o.geographyRegion,o.geographyCountry].filter(Boolean).join(', '))+
      kv('Commercial structure',o.commercialStructure)+kv('Information class',o.informationClass)+kv('Publication status',o.publicationStatus)+
    '</dl></section>'+
    '<section class="panel"><h3>Launch readiness</h3><div class="readiness">'+checks.map(([label,ok,state])=>
      '<div class="readiness-item"><strong>'+esc(label)+'</strong><div class="readiness-state '+(ok?'ready':'blocked')+'">'+esc(state)+'</div></div>'
    ).join('')+'</div><p class="notice">No readiness percentage is calculated. Blocking conditions remain explicit.</p></section>'+
    '<section class="panel full"><h3>Next action</h3><p>Complete the missing commercial objective and keep outreach blocked until explicit authority exists. This is synthetic preview content only.</p></section>'+
  '</div>';
}

function renderMandate(){
  const m=fixture.mandate;
  const authorities=[
    ['Research',m.authorityResearch],['Outreach',m.authorityOutreach],['Disclosure',m.authorityDisclosure],
    ['Introduction',m.authorityIntroduction],['Representation',m.authorityRepresentation],
    ['Negotiation',m.authorityNegotiation],['Binding',m.authorityBinding]
  ];
  return '<div class="grid"><section class="panel"><h3>Mandate summary</h3><dl>'+
    kv('Mandate ID',m.id)+kv('Status',m.status)+kv('Maximum disclosure',m.maxDisclosureLevel)+kv('Restrictions',m.restrictions)+kv('Professional route',m.legalProfessionalRoute)+
    '</dl></section><section class="panel"><h3>Authorities</h3>'+authorities.map(([name,value])=>'<div class="kv"><dt>'+esc(name)+'</dt><dd><span class="badge '+(value==='Granted'?'':'warn')+'">'+esc(value)+'</span></dd></div>').join('')+'</section></div>';
}

function renderCriteria(){
  return '<section class="panel"><div class="section-title"><h3>Target criteria</h3><span class="badge">Read only</span></div><div class="table-wrap"><table><thead><tr><th>Criterion</th><th>Type</th><th>Result</th></tr></thead><tbody>'+
    fixture.criteria.map(c=>'<tr><td>'+esc(c.label)+'</td><td>'+esc(c.type)+'</td><td><span class="badge '+(c.result==='Unknown'?'warn':'')+'">'+esc(c.result)+'</span></td></tr>').join('')+
    '</tbody></table></div><div class="mobile-cards">'+fixture.criteria.map(c=>'<div class="mobile-card"><strong>'+esc(c.label)+'</strong><span class="muted">'+esc(c.type)+'</span><div><span class="badge '+(c.result==='Unknown'?'warn':'')+'">'+esc(c.result)+'</span></div></div>').join('')+'</div></section>';
}

function renderMatches(){
  return '<section class="panel"><div class="section-title"><h3>Matches</h3><span class="badge">1 synthetic candidate</span></div><div class="table-wrap"><table><thead><tr><th>Candidate Company</th><th>Qualification</th><th>Engagement</th><th>Mandatory Criteria</th><th>Verification Gaps</th><th>Next Action</th></tr></thead><tbody>'+
    fixture.matches.map(m=>'<tr><td><strong>'+esc(m.company)+'</strong></td><td>'+esc(m.qualificationState)+'</td><td>'+esc(m.engagementState)+'</td><td>'+esc(m.mandatoryCriteriaResult)+'</td><td>'+esc(m.verificationGaps)+'</td><td>'+esc(m.nextAction)+'</td></tr>').join('')+
    '</tbody></table></div><div class="mobile-cards">'+fixture.matches.map(m=>'<article class="mobile-card"><strong>'+esc(m.company)+'</strong><span class="muted">'+esc(m.qualificationState)+' · '+esc(m.engagementState)+'</span><p>'+esc(m.verificationGaps)+'</p><small>'+esc(m.nextAction)+'</small></article>').join('')+'</div><div style="margin-top:14px">'+fixture.matches.map(m=>'<details><summary>Why '+esc(m.company)+'?</summary><p>Developer capability is supported while current appetite remains Unknown. The preview preserves that distinction.</p>'+m.evidence.map(e=>'<div class="kv"><dt>'+esc(e.criterion)+'</dt><dd>'+esc(e.result)+' · '+esc(e.source)+' · '+esc(e.freshness)+'</dd></div>').join('')+'</details>').join('')+'</div></section>';
}

function renderActivity(){
  return '<section class="panel"><h3>Activity</h3>'+fixture.activity.map(a=>'<div class="kv"><dt>'+esc(new Date(a.at).toLocaleString())+'</dt><dd><strong>'+esc(a.action)+'</strong><br>'+esc(a.summary)+'<br><small class="muted">'+esc(a.actor)+'</small></dd></div>').join('')+'</section>';
}

function renderDocuments(){
  return fixture.documents.length ? '<section class="panel"><h3>Documents</h3></section>' :
    '<div class="empty"><strong>No synthetic documents loaded.</strong><br>Document release controls are intentionally outside this first read-only shell.</div>';
}

function renderPublicPresentation(){
  const p=fixture.publicPresentation;
  return '<div class="grid"><section class="panel"><h3>Internal status</h3><dl>'+kv('Information class',fixture.opportunity.informationClass)+kv('Publication status',p.publicationStatus)+kv('Disclosure ceiling',fixture.mandate.maxDisclosureLevel)+'</dl></section><section class="panel"><h3>External projection</h3><dl>'+p.fields.map(([a,b])=>kv(a,b)).join('')+'</dl><p class="notice">Public-safe does not mean published. This synthetic projection is not published.</p></section></div>';
}

function renderPanel(){
  const renderers={
    'Overview':renderOverview,'Mandate':renderMandate,'Target Criteria':renderCriteria,'Matches':renderMatches,
    'Activity':renderActivity,'Documents':renderDocuments,'Public Presentation':renderPublicPresentation
  };
  document.getElementById('workspacePanel').innerHTML=renderers[activeSection]();
}

function init(){
  renderHeader();
  renderTabs();
  renderPanel();
  window.TSSCommercialNetworkPreview={
    fixture,
    operatingPhase,
    readinessChecks,
    get activeSection(){return activeSection;}
  };
  window.fixtureShellReady=true;
}
init();
})();

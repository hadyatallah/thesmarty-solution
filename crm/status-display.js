/* Read-only presentation. No provider, mailbox, backup or restore telemetry is
   part of the established getState contract used here. Never infer it from
   configured controls, emailEnabled, generic job names, or cached snapshots. */
(function(root){
  'use strict';
  const entities=['Companies','Contacts','Opportunities','Tickets','Tasks','Activity'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Retains the existing two-hour API-snapshot warning, not a provider SLA.
  const SNAPSHOT_WARNING_MS=2*60*60*1000;
  function timestamp(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))return null;
    const t=Date.parse(value),day=value.slice(0,10),d=new Date(day+'T00:00:00Z');
    if(!Number.isFinite(t)||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==day)return null;
    return t;
  }
  function snapshotStatus(snapshot,observation={},now=Date.now()){
    const at=timestamp(snapshot?.updatedAt),received=observation.receivedAt;
    let label='Not verified',reason='No verified timestamp is available.';
    if(at===null)reason='Snapshot timestamp is missing or invalid.';
    else if(at>now)reason='Snapshot timestamp is in the future.';
    else if(Number.isFinite(received)&&at>received)reason='Snapshot timestamp is later than its recorded receipt.';
    else if(observation.source==='cache'){label='Cached';reason='Saved locally; not a fresh server verification.';}
    else if(observation.refreshFailed){reason='Last refresh failed; an earlier snapshot is displayed.';}
    else if(observation.source!=='api'||!Number.isFinite(received)||received>now){reason='Snapshot receipt is not verified in this view.';}
    else if(now-at>SNAPSHOT_WARNING_MS){label='Stale';reason='API snapshot is more than 2 hours old.';}
    else {label='Observed';reason='API snapshot age is within the existing 2-hour warning window; this is not overall system health.';}
    return {label,reason,observedAt:at===null?'Not available':new Date(at).toISOString(),stale:at!==null&&at<=now&&now-at>SNAPSHOT_WARNING_MS};
  }
  function coverageStatus(snapshot){
    const rows=snapshot?.records||{},meta=snapshot?.coverage||snapshot?.dataCoverage||{};
    const absent=entities.filter(n=>!Array.isArray(rows[n]));
    const incomplete=entities.filter(n=>{
      const r=rows[n],m=meta[n];
      if(!Array.isArray(r)||m?.available===false||m?.complete!==true)return true;
      const ids=r.map(x=>String(x?.id??'').trim());
      return ids.some(x=>!x)||new Set(ids).size!==ids.length||(m.total!==undefined&&(!Number.isInteger(m.total)||m.total!==r.length));
    });
    return {label:absent.length?'Partial':incomplete.length?'Not verified':'Reported complete',detail:absent.length?'Missing loaded entities: '+absent.join(', '):incomplete.length?'Full coverage is not established for: '+incomplete.join(', '):'Completeness reported by the loaded snapshot for the six core entities; not a workbook audit.'};
  }
  function legacyClassificationHint(record,overlay){
    if(String(record?.classification??'').trim()||!Object.hasOwn(overlay||{},record?.id))return '';
    return '<p class="muted classification-hint">Legacy classification hint (display only; not verified): <strong>'+esc(overlay[record.id])+'</strong>. The workbook value is blank. This hint is not used in filters, assistant context, exports or saves.</p>';
  }
  function metric(label,value,detail){return '<div class="panel metric" style="min-width:0;overflow-wrap:anywhere"><span>'+esc(label)+'</span><strong style="font-size:22px">'+esc(value)+'</strong><small class="muted">'+esc(detail)+'</small></div>';}
  function systemHealth({snapshot,observation,integrity=[],cached=false,installed=false,now=Date.now(),sheet}){
    const status=snapshotStatus(snapshot,observation,now),coverage=coverageStatus(snapshot);
    const link=(gid,text)=>'<a target="_blank" rel="noopener noreferrer" href="'+esc(sheet+'#gid='+gid)+'">'+text+'</a>';
    return '<h2>System Health</h2><p class="muted">Read-only observations from the loaded CRM snapshot. Configuration, execution and recovery are separate checks.</p>'+
      '<div class="cards">'+metric('Loaded ID check',snapshot?.records?(integrity.length?'Attention':'No duplicates found'):'Not available','Only the loaded records are checked; this is not full data integrity.')+metric('API snapshot',status.label,status.reason)+metric('Core-entity coverage',coverage.label,coverage.detail)+metric('Backup execution','Not verified','Current configuration, successful execution and restore acceptance are not available in this view.')+'</div>'+
      '<section class="panel"><h3>Snapshot evidence</h3><p><strong>Observed timestamp:</strong> '+esc(status.observedAt)+'</p><p><strong>Source:</strong> '+esc(observation?.source==='cache'?'Local cache':observation?.source==='api'?'CRM getState response':'Not verified')+'</p>'+(status.stale?'<p class="warning">The displayed timestamp is more than 2 hours old. This warning concerns the API snapshot only.</p>':'')+'<p>'+esc(status.reason)+'</p><p class="muted">A recent response does not prove current mailbox processing, successful backups or a complete database.</p></section>'+
      '<div class="grid"><section class="panel"><h3>Automation evidence</h3><p><strong>Backup configuration:</strong> Not verified in this view.</p><p><strong>Last successful backup / latest failed run:</strong> Not available in this view.</p><p><strong>Outlook processing and reply monitoring:</strong> Not verified. Schedule, connected mailbox and last successful processing are not available here.</p><p><strong>Outreach and follow-up execution:</strong> Not verified. System Control describes configuration; run records require separate verification.</p><p class="muted">A Completed Gmail job does not prove Outlook processing. An ON control does not prove execution; an older success does not clear a later failure.</p><div class="toolbar">'+link('945494362','Inspect System Control')+link('731237999','Inspect Automation Log')+'<button onclick="refresh()">Refresh CRM snapshot</button></div></section>'+
      '<section class="panel"><h3>Recovery references</h3><p><strong>Historical baseline workbook link:</strong> Not verified. The old fixed reference is not a verified latest backup and is not offered as a recovery candidate.</p><p><strong>Checkpoint date and contents:</strong> Not available in this view.</p><p><strong>Restore acceptance:</strong> Not verified. A workbook copy alone does not recover application source, deployments, triggers, settings or provider access.</p><p class="muted">Use the restricted recovery evidence to select a dated, verified workbook-only candidate. This view does not publish private evidence links.</p><a target="_blank" rel="noopener noreferrer" href="'+esc(sheet)+'">Open operational master workbook (not a backup)</a></section></div>'+
      '<section class="panel"><h3>Local workspace</h3><p><strong>Validated local snapshot available:</strong> '+(cached?'Yes':'No')+'</p><p><strong>Display mode:</strong> '+(installed?'Installed app detected':'Browser')+'</p><p class="muted">Display mode is not proof of a valid session or future session continuity.</p></section>';
  }
  function outreachView({sheet}){
    return '<h2>Outreach</h2><p class="muted">Commercial outreach queue and approval workflow. This page does not verify a scheduler, connected mailbox or completed send.</p><div class="cards">'+metric('Approval workflow','Required','Sending requires the existing governed approval process; opening this view grants no approval.')+metric('Current send limit','Not verified','Inspect the current governed configuration; no fixed limit is asserted here.')+metric('Outlook reply processing','Not verified','No verified schedule or processing receipt is available in this view.')+metric('Outbound policy','TSS mailbox','Approved outreach uses info@thesmartysolution.com; connection status is not verified here.')+'</div><div class="grid"><section class="panel"><h3>Workflow, not an execution receipt</h3><p>Research and select the company, prepare the message, then use the existing approval and ready-to-send controls. A configured workflow does not prove that automation ran or that correspondence was delivered.</p><p>Review replies before qualification. A reply alone is not a qualified lead; create an opportunity only through the governed process.</p></section><section class="panel"><h3>Provider evidence</h3><p><strong>Last observed successful Outlook processing:</strong> Not available in this view.</p><p><strong>Latest failure and schedule:</strong> Not available in this view.</p><p>Gmail completion records cannot establish Outlook processing. Cached data and configuration controls cannot establish a successful current run.</p></section></div><div class="toolbar"><a target="_blank" rel="noopener noreferrer" href="'+esc(sheet+'#gid=1028813583')+'">Open Outreach queue</a><button onclick="go(\'Companies\')">Companies</button><button onclick="go(\'Opportunities\')">Opportunities</button></div>';
  }
  root.TSSStatusDisplay=Object.freeze({snapshotStatus,coverageStatus,legacyClassificationHint,systemHealth,outreachView});
})(typeof window!=='undefined'?window:globalThis);

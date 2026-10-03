// Pure read-side rules. This module never mutates CRM records.
export const VERSION = 'tss-cc-0.1.0';
export const normalize = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/\b(ltd|limited|llc|plc)\b/g, '').replace(/[^\p{L}\p{N}@.]+/gu, ' ').trim().replace(/\s+/g, ' ');
export const closed = r => [r.status, r.stage].some(x => ['Done','Cancelled','Closed','Resolved','Won','Lost','Do not contact','Not suitable'].includes(x));
export const day = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Nicosia',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v));
export const age = (v, now) => validDate(v) ? Math.floor((now - Date.parse(v)) / 86400000) : null;
export class CRMAdapter {
  constructor(snapshot) { this.snapshot = snapshot || {}; }
  rows(entity) { return Array.isArray(this.snapshot.records?.[entity]) ? this.snapshot.records[entity] : []; }
  coverage(entity) {
    const meta = this.snapshot.coverage?.[entity] || this.snapshot.dataCoverage?.[entity];
    const available = Array.isArray(this.snapshot.records?.[entity]) && meta?.available !== false;
    return {available, loaded:this.rows(entity).length, total:meta?.total ?? null, complete:available && meta?.complete === true, source:'CRM getState', asOf:this.snapshot.updatedAt || null};
  }
  lookup(query) {
    const q = String(query || '').trim();
    const rows = this.rows('Companies');
    const id = rows.filter(r => String(r.id).toLowerCase() === q.toLowerCase());
    let hits = id.length ? id : rows.filter(r => normalize(r.name) === normalize(q));
    if (!hits.length && q.includes('@')) hits = rows.filter(r => String(r.email || '').trim().toLowerCase() === q.toLowerCase());
    if (!hits.length && q.length >= 3) hits = rows.filter(r => normalize(r.name).startsWith(normalize(q) + ' '));
    return {status:hits.length === 1 ? 'found' : hits.length ? 'ambiguous' : 'unknown', candidates:hits.map(r => ({id:r.id,name:r.name})), record:hits.length === 1 ? hits[0] : null};
  }
  dossier(query) {
    const match = this.lookup(query);
    if (!match.record) return match;
    const id = match.record.id, sections = {}, coverage = {};
    for (const e of ['Contacts','Opportunities','Tasks','Tickets','Email Activity','Outreach','Proposal Tracker','Revenue Tracker']) {
      sections[e] = this.rows(e).filter(r => r.companyId === id);
      coverage[e] = this.coverage(e);
    }
    const ids = new Set([id, ...Object.values(sections).flat().map(r => r.id).filter(Boolean)]);
    sections.Activity = this.rows('Activity').filter(r => ids.has(r.recordId));
    coverage.Activity = this.coverage('Activity');
    return {...match,sections,coverage,nextAction:match.record.nextAction || null};
  }
  control(key) { return this.rows('System Control').find(r => r.setting === key)?.value; }
  attention(now = new Date()) {
    const today = day(now), items = [], limitations = [];
    for (const e of ['Companies','Tasks','Tickets','Opportunities']) {
      if (!this.coverage(e).available) limitations.push(e + ' unavailable');
      for (const r of this.rows(e)) {
        if (closed(r)) continue;
        const due = r.dueDate || r.followUp;
        if (validDate(due) && due.slice(0,10) <= today) items.push({kind:due.slice(0,10)<today?'overdue':'due_today',entity:e,id:r.id,name:r.name,date:due});
        if ((e === 'Opportunities' || (e === 'Companies' && ['Prospect','Qualified Lead','Opportunity'].includes(r.lifecycle))) && !String(r.nextAction || '').trim()) items.push({kind:'missing_next_action',entity:e,id:r.id,name:r.name});
        if (e === 'Opportunities') {
          // Owner is not a live operational schema field today. Do not invent one.
          if ((this.snapshot.fields?.Opportunities || []).includes('owner') && !r.owner) items.push({kind:'missing_owner',entity:e,id:r.id,name:r.name});
          const threshold = Number(this.control('opportunityInactivityDays'));
          const days = age(r.updatedAt || r.createdAt,now);
          if (threshold > 0 && days !== null && days >= threshold) items.push({kind:'dormant',entity:e,id:r.id,name:r.name,days,threshold});
        }
      }
    }
    if (!(Number(this.control('opportunityInactivityDays')) > 0)) limitations.push('Opportunity inactivity rule unavailable; dormant classification withheld');
    if (!(this.snapshot.fields?.Opportunities || []).includes('owner')) limitations.push('Opportunity ownership is not exposed by the current schema');
    return {asOf:now.toISOString(),period:'Current open records as of '+today,populations:Object.fromEntries(['Companies','Opportunities','Tasks','Tickets'].map(e=>[e,this.coverage(e)])),items,limitations};
  }
  quality() {
    const duplicates = [], issues = [], seen = new Map();
    for (const e of ['Companies','Contacts']) {
      const groups = new Map();
      for (const r of this.rows(e)) {
        const idKey=e+':'+r.id;
        if(seen.has(idKey)) issues.push({kind:'duplicate_id',entity:e,id:r.id});
        seen.set(idKey,true);
        if (!r.id || !r.name) issues.push({kind:'incomplete',entity:e,id:r.id,missing:!r.id?'id':'name'});
        if(e==='Companies' && !r.email && !r.phone && !r.website) issues.push({kind:'incomplete',entity:e,id:r.id,missing:'contact route'});
        const signals = [['name',normalize(r.name)],['email',String(r.email||'').trim().toLowerCase()]];
        for (const [kind,key] of signals) if (key) {
          const scoped = e==='Contacts' && kind==='name' ? key+':'+(r.companyId||r.id) : key;
          const k=kind+':'+scoped;
          if(!groups.has(k))groups.set(k,[]);
          groups.get(k).push(r.id);
        }
      }
      for(const [signal,ids] of groups) if(ids.length>1) duplicates.push({entity:e,signal:signal.split(':')[0],ids:[...new Set(ids)],reviewRequired:true});
    }
    const companies=new Set(this.rows('Companies').map(r=>r.id));
    for(const e of ['Contacts','Tasks','Tickets','Opportunities']) for(const r of this.rows(e)) {
      if(this.coverage('Companies').complete && r.companyId && !companies.has(r.companyId)) issues.push({kind:'broken_relationship',entity:e,id:r.id});
      for(const [field,values] of Object.entries(this.snapshot.enums?.[e]||{})) if(r[field] && Array.isArray(values) && !values.includes(r[field])) issues.push({kind:'unrecognized_value_preserved',entity:e,id:r.id,field});
    }
    return {duplicates,issues,limitations:this.coverage('Companies').complete?[]:['Relationship checks incomplete: company population not proven complete']};
  }
  weekly(now=new Date()) {
    const from=new Date(now.getTime()-7*86400000).toISOString();
    return {period:{from,to:now.toISOString()},pipelinePopulation:'Current open opportunities, not historical pipeline',pipeline:this.rows('Opportunities').filter(r=>!closed(r)),recentActivity:this.rows('Activity').filter(r=>validDate(r.createdAt)&&r.createdAt>=from&&Date.parse(r.createdAt)<=now),activityCoverage:this.coverage('Activity'),attention:this.attention(now),quality:this.quality()};
  }
}

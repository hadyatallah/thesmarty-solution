// Generated from command-center/taskdates.js by scripts/build-task-metrics.mjs.
(()=>{
// Pure read-side calendar/task rules. No records, credentials or storage are changed.
const CRM_TIME_ZONE = 'Asia/Nicosia';
const DAY_MS = 86400000;
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {timeZone:CRM_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
function calendarToday(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(d.getTime())) throw new Error('INVALID_AS_OF_DATE');
  const parts = Object.fromEntries(DAY_FORMAT.formatToParts(d).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function exactDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
function calendarDate(value) {
  if (value === null || value === undefined || value === '') return null;
  // Google Sheets serial dates are wall-calendar values, not Unix milliseconds.
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value >= 2958466) return null;
    return new Date(Date.UTC(1899,11,30)+Math.floor(value)*DAY_MS).toISOString().slice(0,10);
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isFinite(value.getTime()) ? calendarToday(value.getTime()) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (exactDay(text)) return text;
  // Do not guess locale dates, numeric strings or offset-free local timestamps.
  const m = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || !exactDay(m[1]) || +m[2]>23 || +m[3]>59 || +(m[4]||0)>59) return null;
  if (m[5] !== 'Z' && (+m[5].slice(1,3)>23 || +m[5].slice(4)>59)) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? calendarToday(time) : null;
}
function addCalendarDays(value, count) {
  if (!exactDay(value) || !Number.isInteger(count)) throw new Error('INVALID_CALENDAR_OFFSET');
  return new Date(Date.parse(value+'T00:00:00Z')+count*DAY_MS).toISOString().slice(0,10);
}
function calendarWeekday(value) {
  if (!exactDay(value)) throw new Error('INVALID_CALENDAR_DAY');
  return new Date(value+'T00:00:00Z').getUTCDay();
}
function isClosedRecord(record = {}) {
  return [record.status,record.stage].some(v => ['Done','Cancelled','Closed','Resolved','Won','Lost','Do not contact','Not suitable'].includes(v));
}
function isOpenTask(record) {
  return !!record && String(record.id ?? '').trim() !== '' && record.status === 'Open';
}
function isActionOpen(entity, record) {
  return !!record && String(record.id ?? '').trim() !== '' && (entity === 'Tasks' ? isOpenTask(record) : !isClosedRecord(record));
}
function recordDueValue(entity, record = {}) {
  return entity === 'Tasks' ? record.dueDate : (record.dueDate || record.followUp);
}
function dueState(entity, record, now = new Date()) {
  if (!isActionOpen(entity, record)) return 'inactive';
  const raw = recordDueValue(entity, record), date = calendarDate(raw);
  if (!date) return raw === null || raw === undefined || String(raw).trim() === '' ? 'undated' : 'invalid';
  const today = calendarToday(now);
  return date < today ? 'overdue' : date === today ? 'due_today' : date <= addCalendarDays(today,3) ? 'due_soon' : 'future';
}
function isInternalQA(record = {}, companies = []) {
  const labelled = r => !!r && (r.classification === 'Internal QA' || /^TSS\s+(?:INTERNAL\s+(?:EMAIL\s+)?QA|QA)(?:\s|$)/i.test(String(r.name || '')));
  // Report explicit QA labels separately. No customer email or private fixture-ID list.
  return labelled(record) || companies.some(c => c.id === record.companyId && labelled(c));
}
function taskSummary(tasks = [], companies = [], now = new Date()) {
  const all = Array.isArray(tasks) ? tasks.filter(r => r && String(r.id ?? '').trim()) : [];
  const open = all.filter(isOpenTask), count = kind => open.filter(r => dueState('Tasks',r,now) === kind).length;
  const qa = all.filter(r => isInternalQA(r,companies));
  return {loaded:all.length,open:open.length,overdue:count('overdue'),dueToday:count('due_today'),dueSoon:count('due_soon'),undated:count('undated'),invalidDate:count('invalid'),unrecognizedStatus:all.filter(r => !['Open','Done','Cancelled'].includes(r.status)).length,qa:{loaded:qa.length,open:qa.filter(isOpenTask).length,overdue:qa.filter(r => dueState('Tasks',r,now)==='overdue').length}};
}
function recordCoverage(snapshot = {}, entity) {
  const rows = snapshot.records?.[entity], meta = snapshot.coverage?.[entity] || snapshot.dataCoverage?.[entity];
  const available = Array.isArray(rows) && meta?.available !== false;
  const loaded = Array.isArray(rows) ? rows.length : 0;
  const total = Number.isInteger(meta?.total) && meta.total >= 0 ? meta.total : null;
  const ids = (Array.isArray(rows) ? rows : []).map(r => String(r?.id ?? '').trim());
  const wellFormed = ids.every(Boolean) && new Set(ids).size === ids.length;
  return {available,loaded,total,complete:available && wellFormed && meta?.complete===true && (total===null || total===loaded),source:'CRM getState',asOf:snapshot.updatedAt || null};
}

globalThis.TSSTaskMetrics=Object.freeze({CRM_TIME_ZONE,calendarToday,calendarDate,addCalendarDays,calendarWeekday,isClosedRecord,isOpenTask,isActionOpen,recordDueValue,dueState,isInternalQA,taskSummary,recordCoverage});
})();

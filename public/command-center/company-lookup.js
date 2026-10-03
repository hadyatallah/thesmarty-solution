// Read-only intent routing. Searching CRM records never requires an AI call.
import {normalize} from './crm.js';

const clean = value => String(value || '').trim().replace(/[.!?]+$/, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
const reserved = /\b(?:attention|priorities|daily|weekly|management|review|report|reports|duplicate|duplicates|incomplete|quality|inconsistent|incoming|unanswered|prospects|research|content|social|story|reel|fail|failed|overnight|healthy|health|integration|outlook|approval|notification|yesterday|overdue|dormant|help)\b/i;
const instructions = /\b(?:create|add|update|edit|delete|remove|merge|send|write|draft|prepare|schedule|set|mark|log|record|change|cancel|approve|reject|qualify|contacted|called|spoke|received|sent|replied|remind|explain|compare|analy[sz]e)\b/i;
const question = /^(?:i|we|you|can|could|would|should|how|why|what|who|which|when|where|is|are|do|does|has|have|please|hello|hi|test)\b/i;
const filtered = /\b(?:with|without|where|whose|due|today|tomorrow|next|all|list|highest|lowest|priority|sorted|sort|between|and|or|contacts|tasks|tickets|opportunities|emails|messages)\b/i;

function exactIdentity(q, crm) {
  const n = normalize(q), lower = q.toLowerCase();
  return !!n && crm.rows('Companies').some(r =>
    String(r.id || '').toLowerCase() === lower ||
    normalize(r.name) === n ||
    (r.email && String(r.email).trim().toLowerCase() === lower));
}
function simpleName(q) {
  return q.length >= 2 && q.length <= 160 && q.split(/\s+/).length <= 12 &&
    /[\p{L}\p{N}]/u.test(q) && /^[\p{L}\p{N}\s@.&+()'’\/-]+$/u.test(q) &&
    !question.test(q) && !instructions.test(q) && !reserved.test(q) && !filtered.test(q);
}

export function companyLookupQuery(command, crm) {
  const raw = String(command || '').trim();
  if (!raw || /[\r\n]/.test(raw)) return null;
  const q = clean(raw);
  // An exact account name can contain words such as "Outlook" or "New Homes".
  if (exactIdentity(q, crm)) return q;
  const explicit = q.match(/^(?:(?:please\s+)?(?:lookup|look up|find|search(?:\s+for)?|show(?:\s+me)?|open|summari[sz]e)|tell me (?:everything )?about|give me everything about)\s+(.+)$/i);
  if (explicit) {
    const target = clean(explicit[1].replace(/^(?:the\s+)?(?:company|account|record)(?:\s+for)?\s+/i, ''));
    if (exactIdentity(target, crm)) return target;
    if (simpleName(target)) return target;
    // Explicit lookup/summary commands keep their existing read-only behavior.
    if (/^(?:lookup|look up|summari[sz]e|tell me (?:everything )?about|give me everything about)\b/i.test(q) && !instructions.test(target)) return target;
    return null;
  }
  // Unknown names also get a local no-match response, not an AI quota error.
  return simpleName(q) ? q : null;
}

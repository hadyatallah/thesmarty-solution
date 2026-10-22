export function nicosiaDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function seasonActive(season, date) {
  const offset = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Nicosia', timeZoneName: 'shortOffset' }).formatToParts(date).find(x => x.type === 'timeZoneName').value;
  return season === (offset === 'GMT+3' ? 'summer' : 'winter');
}
export function safeFailureCode(error) {
  const message = String(error?.message || '');
  if (/^[A-Z][A-Z0-9_]{2,90}$/.test(message)) return message;
  const status = Number(error?.response?.status || error?.status || 0);
  return status >= 400 && status <= 599 ? `GOOGLE_AUTH_HTTP_${status}` : 'RUNTIME_PROVIDER_FAILURE';
}

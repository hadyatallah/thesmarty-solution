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

// Revalidate at the persistence boundary; never spread provider-controlled objects.
export function safeIndexDiagnostics(error) {
  const value = error?.indexDiagnostics;
  if (!/^INDEX_API_[45]\d{2}$/.test(String(error?.message || '')) || !value ||
      value.upstreamStatus !== Number(error.message.slice(-3))) return undefined;
  const result = { upstreamStatus: value.upstreamStatus };
  if (Number.isInteger(value.elapsedMs) && value.elapsedMs >= 0 && value.elapsedMs <= 60000) result.elapsedMs = value.elapsedMs;
  if (['application/json', 'text/html', 'text/plain', 'other'].includes(value.responseType)) result.responseType = value.responseType;
  if (Number.isInteger(value.retryAfterSeconds) && value.retryAfterSeconds >= 0 && value.retryAfterSeconds <= 999999) result.retryAfterSeconds = value.retryAfterSeconds;
  return result;
}

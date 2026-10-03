// Server-owned policy. Do not accept timezone or hours from an action payload.
export const EMAIL_HOURS = Object.freeze({timeZone:'Asia/Nicosia',startHour:9,endHour:17,weekdays:[1,2,3,4,5]});
export function emailWindowOpen(at) {
 if(!(at instanceof Date)||!Number.isFinite(at.getTime()))return false;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:EMAIL_HOURS.timeZone,weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
 return ['Mon','Tue','Wed','Thu','Fri'].includes(parts.weekday)&&Number(parts.hour)>=9&&Number(parts.hour)<17;
}
export function enforceEmailWindow(action,at) {
 if(String(action.entity).toLowerCase()==='email'&&String(action.operation).toLowerCase()==='send'&&!emailWindowOpen(at))throw Object.assign(Error('EMAIL_OUTSIDE_BUSINESS_HOURS'),{code:'EMAIL_OUTSIDE_BUSINESS_HOURS',definitelyNotExecuted:true});
}

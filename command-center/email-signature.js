export const TSS_EMAIL_SIGNATURE='Regards,\n\nThe Smarty Solution\nConnect · Develop · Invest.\ninfo@thesmartysolution.com\n+35799810330\nhttps://www.thesmartysolution.com';
const priorSignature=TSS_EMAIL_SIGNATURE.slice('Regards,\n\n'.length);
export function withTssSignature(value){
 let text=String(value||'').replace(/\r\n/g,'\n').trim();
 // Strip only recognizable trailing TSS signatures, not arbitrary message content.
 while(text.endsWith(TSS_EMAIL_SIGNATURE)||text.endsWith(priorSignature)){
  text=text.slice(0,text.length-(text.endsWith(TSS_EMAIL_SIGNATURE)?TSS_EMAIL_SIGNATURE.length:priorSignature.length)).trimEnd();
 }
 text=text.replace(/(?:\n|^)(?:Regards,|Best regards,|Kind regards,)\s*$/i,'').trimEnd();
 return (text?text+'\n\n':'')+TSS_EMAIL_SIGNATURE;
}
export function assertTssSignature(value){
 if(typeof value!=='string'||!value.endsWith(TSS_EMAIL_SIGNATURE)||value.split(priorSignature).length!==2)throw Error('EMAIL_SIGNATURE_INVALID');
 return value;
}

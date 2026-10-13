/**
 * International Research Center v1: independently testable permission gate.
 * Research findings are NOT permission to contact. Fail closed on ambiguity.
 */
export const truthy = v => /^(true|yes|1)$/i.test(String(v ?? "").trim());
export const normEmail = v => String(v ?? "").trim().toLowerCase();
export const isEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normEmail(v));
export const isUrl = v => { try { return new URL(String(v)).protocol === "https:"; } catch { return false; } };
export const objects = rows => {
  if (!Array.isArray(rows) || !rows.length) return [];
  const [headers, ...items] = rows;
  return items.filter(r => String(r?.[0] ?? "").trim()).map((r,i) =>
    Object.assign(Object.fromEntries(headers.map((h,j)=>[String(h),String(r[j]??"")])),{_rowNumber:i+2}));
};
export const settings = rows => Object.fromEntries(objects(rows).map(r => [r.key,r.value]));
export const eligibility = (entry, context) => {
  const hold=reason=>({eligible:false,reason,entry});
  const email=normEmail(entry.recipientEmail), date=String(context.now||new Date().toISOString());
  if(!/^IRC-MSG-[\w-]+$/.test(entry.queueId||"")) return hold("INVALID_ID");
  if(entry.status!=="READY" || !truthy(entry.sendApproved) || truthy(entry.optedOut)) return hold("NOT_APPROVED");
  if(!isEmail(email)) return hold("INVALID_EMAIL");
  if(context.suppressed.has(email)) return hold("SUPPRESSED");
  if(!entry.reviewedBy?.trim() || !entry.reviewedAt?.trim()) return hold("REVIEW_REQUIRED");
  if(entry.sendAfter && String(entry.sendAfter)>date) return hold("TOO_EARLY");
  if(!entry.permissionEvidenceURL?.trim()) return hold("MISSING_PERMISSION_PROOF");
  if(!entry.messageTemplate || !["buyer-v1","partner-v1"].includes(entry.messageTemplate)) return hold("TEMPLATE_UNKNOWN");
  if(context.previouslyContacted.has(email)) return hold("ALREADY_CONTACTED");
  if(entry.leadType==="Buyer"){
    const buyer=context.buyers.get(entry.leadId);
    if(!buyer || normEmail(buyer.email)!==email) return hold("BUYER_IDENTITY_HOLD");
    if(!["OPT_IN","REQUESTED"].includes(buyer.contactPermission)) return hold("BUYER_CONSENT_REQUIRED");
    if(!buyer.contactPermissionAt || !buyer.requestEvidence) return hold("BUYER_PROOF_INCOMPLETE");
    if(!["OPT_IN","REQUESTED"].includes(entry.permissionBasis)) return hold("BUYER_BASIS_INVALID");
    if(entry.recipientClass!=="Individual") return hold("CLASS_CONFLICT");
  }else if(entry.leadType==="Referral"){
    const partner=context.partners.get(entry.leadId);
    if(!partner || normEmail(partner.publicEmail)!==email) return hold("PARTNER_IDENTITY_HOLD");
    const basis=entry.permissionBasis;
    if(basis==="PARTNER_INVITATION"){
      if(entry.jurisdiction!=="UK" || entry.recipientClass!=="Corporate" || !isUrl(entry.permissionEvidenceURL)) return hold("B2B_BASIS_REVIEW");
    }else if(basis!=="OPT_IN") return hold("REFERRAL_PERMISSION_REQUIRED");
    if(!isUrl(partner.sourceURL) || !partner.verification) return hold("PARTNER_SOURCE_REQUIRED");
  }else return hold("UNKNOWN_LEAD_TYPE");
  return {eligible:true,entry,email};
};
export const chooseEligible=(data,now,max=10)=>{
  const queues=objects(data.queue),buyerRows=objects(data.buyers),partnerRows=objects(data.partners),supRows=objects(data.suppressions);
  const suppressed=new Set(supRows.map(r=>normEmail(r.emailLower)));
  const previouslyContacted=new Set(queues.filter(r=>["SENT","SUBMITTED","RESERVED","NEEDS_RECONCILIATION"].includes(r.status)).map(r=>normEmail(r.recipientEmail)));
  const ctx={now,buyers:new Map(buyerRows.map(r=>[r.buyerId,r])),partners:new Map(partnerRows.map(r=>[r.referralId,r])),suppressed,previouslyContacted};
  const chosen=[],held=[],seen=new Set();
  for(const entry of queues){
    const outcome=eligibility(entry,ctx);
    if(!outcome.eligible){held.push({queueId:entry.queueId,reason:outcome.reason});continue;}
    if(seen.has(outcome.email)){held.push({queueId:entry.queueId,reason:"SAME_DAY_DUPLICATE"});continue;}
    if(chosen.length>=Math.min(10,Math.max(0,Number(max)||0))){held.push({queueId:entry.queueId,reason:"DAILY_CAP"});continue;}
    chosen.push(outcome);seen.add(outcome.email);
  }
  return {chosen,held};
};
export const messageFor=(e)=>{
  const name=String(e.recipientName||"").trim();
  const greeting=name?("Hi "+name+","):"Hello,";
  const optOut="If you would prefer no further contact, reply 'no thanks' and we will record your preference.";
  const footer="\n\nThe Smarty Solution LTD\nConnect · Develop · Invest.\ninfo@thesmartysolution.com\nhttps://www.thesmartysolution.com";
  if(e.messageTemplate==="buyer-v1")return {
    subject:"Your Cyprus or Greece property enquiry",
    body:[greeting,"Thank you for your enquiry about property in Cyprus or Greece.","The Smarty Solution helps clarify requirements and, with your permission, arrange introductions to suitable local professionals. We don't charge prospective buyers for introductions. TSS may be paid by business clients for its services.","If you wish to proceed, please let us know your preferred area, property type, broad budget and timeframe. We will explain who would receive your details and ask before sharing anything.",optOut].join("\n\n")+footer
  };
  return {
    subject:"Exploring a potential property and relocation collaboration",
    body:[greeting,"I'm contacting you from The Smarty Solution LTD, a Cyprus-based business-development and research company.","We are exploring potential cooperation with organisations that support people considering property or relocation in Cyprus and Greece. We do not charge prospective buyers or referring organisations for introductions. Our business clients fund the service.","If this complements your organisation's work, would you be open to a short exchange by email about suitable introductions, permitted channels and a possible collaboration? We would not share a buyer's information without the buyer's permission.",optOut].join("\n\n")+footer
  };
};

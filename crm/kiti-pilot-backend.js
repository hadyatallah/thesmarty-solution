export const DEV2_CN_BACKEND_CONTRACT = Object.freeze({
  acceptedReport: 'TSS_P123_DEV2_Backend_Runtime_Acceptance_2026-10-03',
  backendVersion: 'tss-cn-workflow-v1',
  read: 'getCommercialNetworkState',
  candidates: 'getCommercialNetworkCandidates',
  prepareTransition: 'prepareCommercialNetworkTransition',
  communicationGate: 'getCommercialNetworkCommunicationGate'
});

const ALLOWED_CALLS = new Set(Object.values(DEV2_CN_BACKEND_CONTRACT).filter(v=>typeof v==='string' && v.startsWith('get') || v==='prepareCommercialNetworkTransition'));

function requireRpc(rpc){
  if(typeof rpc!=='function') throw Error('KITI_PILOT_RPC_REQUIRED');
  return rpc;
}

function requireText(value,code){
  const v=String(value||'').trim();
  if(!v) throw Error(code);
  return v;
}

export function mapBackendCriterionResult(criterion={}){
  const raw=String(criterion.result||'Unknown');
  const issues=(criterion.evidence||[]).map(e=>String(e.issue||'')).filter(Boolean);
  if(raw==='Satisfied') return 'Meets';
  if(raw==='Failed') return 'Does Not Meet';
  if(issues.some(x=>/contradictory/i.test(x))) return 'Conflicting / Review Required';
  if(issues.some(x=>/stale/i.test(x))) return 'Stale / Revalidation Required';
  return 'Unknown';
}

export function mapBackendMandatoryResult(evaluation={}){
  const mapped=(evaluation.criteria||[])
    .filter(c=>c.type==='Mandatory')
    .map(c=>mapBackendCriterionResult(c));
  if(mapped.some(x=>x==='Does Not Meet')) return 'FAIL';
  if(mapped.some(x=>x==='Conflicting / Review Required')) return 'REVIEW REQUIRED';
  if(!mapped.length || mapped.some(x=>x==='Unknown'||x==='Stale / Revalidation Required')) return 'INCOMPLETE';
  return 'PASS';
}

export function normalizeCandidateEvaluation(evaluation={}){
  const criteria=(evaluation.criteria||[]).map(c=>({
    id:c.id,
    type:c.type,
    name:c.label,
    outcome:mapBackendCriterionResult(c),
    expected:c.expected,
    evidence:Array.isArray(c.evidence)?c.evidence:[],
    gap:c.gap||''
  }));
  return {
    backendVersion:evaluation.version||DEV2_CN_BACKEND_CONTRACT.backendVersion,
    companyId:evaluation.companyId||'',
    mandateId:evaluation.mandateId||'',
    mandateVersion:evaluation.mandateVersion||'',
    evaluatedAt:evaluation.evaluatedAt||'',
    mandatoryCriteriaResult:mapBackendMandatoryResult({...evaluation,criteria:evaluation.criteria||[]}),
    backendMandatoryCriteriaResult:evaluation.mandatoryCriteriaResult||'',
    criteria,
    gaps:Array.isArray(evaluation.gaps)?evaluation.gaps:[],
    suppressed:Boolean(evaluation.suppressed),
    restrictions:String(evaluation.restrictions||''),
    candidateState:String(evaluation.candidateState||''),
    existingMatch:evaluation.existingMatch||null,
    evidenceFingerprint:evaluation.evidenceFingerprint||'',
    externalAction:false
  };
}

export function createKitiDev2Client(rpc){
  const invoke=requireRpc(rpc);
  async function call(name,...args){
    if(!ALLOWED_CALLS.has(name)) throw Error('KITI_PILOT_CALL_NOT_ALLOWED:'+name);
    return invoke(name,...args);
  }
  return Object.freeze({
    async readState(token,{purpose='commercial-network',includeArchived=false}={}){
      requireText(token,'KITI_PILOT_TOKEN_REQUIRED');
      return call(DEV2_CN_BACKEND_CONTRACT.read,token,{purpose,includeArchived});
    },
    async readCandidates(token,mandateId,{purpose='commercial-network',offset=0,limit=50,companyId=''}={}){
      requireText(token,'KITI_PILOT_TOKEN_REQUIRED');
      requireText(mandateId,'KITI_PILOT_MANDATE_REQUIRED');
      const options={purpose,offset,limit};
      if(companyId) options.companyId=companyId;
      const result=await call(DEV2_CN_BACKEND_CONTRACT.candidates,token,mandateId,options);
      return {...result,candidates:(result.candidates||[]).map(normalizeCandidateEvaluation)};
    },
    async prepareQualificationTransition(token,matchId,target,{
      purpose='commercial-network',
      expectedVersion,
      requestId,
      reason='',
      disclosureLevel='',
      recipientContactId='',
      rejectionReason=''
    }={}){
      requireText(token,'KITI_PILOT_TOKEN_REQUIRED');
      requireText(matchId,'KITI_PILOT_MATCH_REQUIRED');
      requireText(target,'KITI_PILOT_TARGET_REQUIRED');
      if(expectedVersion===undefined||expectedVersion===null||String(expectedVersion)==='') throw Error('KITI_PILOT_VERSION_REQUIRED');
      requireText(requestId,'KITI_PILOT_REQUEST_REQUIRED');
      const options={purpose,expectedVersion:String(expectedVersion),requestId,reason,disclosureLevel,recipientContactId,rejectionReason};
      return call(DEV2_CN_BACKEND_CONTRACT.prepareTransition,token,matchId,target,options);
    },
    async communicationGate(token,matchId,{purpose='commercial-network'}={}){
      requireText(token,'KITI_PILOT_TOKEN_REQUIRED');
      requireText(matchId,'KITI_PILOT_MATCH_REQUIRED');
      return call(DEV2_CN_BACKEND_CONTRACT.communicationGate,token,matchId,{purpose});
    }
  });
}

export function syntheticDev2RpcFixture(){
  const calls=[];
  const rpc=async(name,...args)=>{
    calls.push({name,args:structuredClone(args)});
    if(name==='getCommercialNetworkState') return {
      roles:[],signals:[],commercialOpportunities:[],mandates:[],matches:[],partnerRelationships:[],
      coverage:{},enums:{},permissions:{canRead:true,canWrite:true,externalCommunication:false},
      updatedAt:'2026-10-06T09:00:00Z'
    };
    if(name==='getCommercialNetworkCandidates') return {
      version:'tss-cn-workflow-v1',total:1,offset:0,limit:50,candidates:[{
        version:'tss-cn-workflow-v1',
        companyId:'TSS-CY-001',
        mandateId:args[1],
        mandateVersion:'1',
        evaluatedAt:'2026-10-06T09:00:00Z',
        mandatoryCriteriaResult:'Satisfied',
        criteria:[
          {id:'developer-role',label:'Developer Role',type:'Mandatory',result:'Satisfied',expected:'Developer',evidence:[{recordId:'CNR-SYN',issue:''}],gap:''},
          {id:'current-appetite',label:'Current appetite',type:'Informational',result:'Unknown',expected:'Current',evidence:[],gap:'Evidence needed'}
        ],
        gaps:[{id:'current-appetite',type:'Informational',label:'Current appetite',reason:'Evidence needed'}],
        suppressed:false,restrictions:'',candidateState:'Evidence ready for human review',
        existingMatch:'MAT-SYN',evidenceFingerprint:'fixture-fingerprint',externalAction:false
      }]
    };
    if(name==='prepareCommercialNetworkTransition') return {
      id:'CC-SYN-PROPOSAL',status:'proposed',externalAction:false,expectedOutcome:'Human review only'
    };
    if(name==='getCommercialNetworkCommunicationGate') return {
      allowed:false,reasons:['Outreach authority is not granted'],externalSend:false,controlledWorkflowOnly:true,
      matchId:args[1],companyId:'TSS-CY-001',checkedAt:'2026-10-06T09:00:00Z'
    };
    throw Error('UNEXPECTED_FIXTURE_RPC:'+name);
  };
  return {rpc,calls};
}

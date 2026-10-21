#!/usr/bin/env bash
# Read-only by default; adds only two exact production WIF trust bindings.
set -euo pipefail
exec python3 - "$@" <<'PY'
import json, subprocess, sys, shutil, copy
from pathlib import Path
P='tss-crm-508908'; N='103840050410'; POOL='vercel-research-center'
PREFIX='principal://iam.googleapis.com/projects/'+N+'/locations/global/workloadIdentityPools/'+POOL+'/subject/'
SUB='owner:tss21:project:thesmarty-solution-agent:environment:production'
MEMBER=PREFIX+SUB
ACCOUNTS={k:'tss-'+v+'@'+P+'.iam.gserviceaccount.com' for k,v in [('reader','whatsapp-inbox-reader'),('writer','admin-session-writer')]}
DB='projects/'+P+'/databases/(default)'
MODE=sys.argv[1] if len(sys.argv)==2 else '--preflight'
if len(sys.argv)>2 or MODE not in ['--preflight','--apply','--verify']:raise SystemExit('Usage: bash tss-admin-production-iam.sh [--preflight|--apply|--verify]')
REPORT={'mode':MODE,'project':P,'subject':SUB,'member':MEMBER,'changes':[],'missingBindings':[],'liveTokenExchange':'NOT_TESTED: requires production deployment after release approval','collectionIsolation':'APPLICATION ONLY; writer database-wide create, reader project-wide get/list'}
def check(ok,msg):
 if not ok:raise RuntimeError(msg)
def run(args):
 r=subprocess.run(['gcloud',*args,'--project='+P,'--format=json','--quiet'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('GCLOUD_READ_OR_WRITE_FAILED: '+' '.join(args[:3]))
 return json.loads(r.stdout or '{}')
def policy(sa):return run(['iam','service-accounts','get-iam-policy',sa])
def trusted(p):return any(b.get('role')=='roles/iam.workloadIdentityUser' and MEMBER in b.get('members',[]) and not b.get('condition') for b in p.get('bindings',[]))
def stable(db):return {k:v for k,v in db.items() if k not in ['etag','earliestVersionTime']}
def snapshot():
 project=run(['projects','describe',P]);check(str(project.get('projectNumber'))==N,'Project mismatch')
 provider=run(['iam','workload-identity-pools','providers','describe','vercel','--workload-identity-pool='+POOL,'--location=global'])
 check(provider.get('state')=='ACTIVE' and not provider.get('disabled'),'Provider disabled')
 check(provider.get('oidc',{}).get('issuerUri')=='https://oidc.vercel.com/tss21','Unexpected issuer')
 check(provider.get('attributeMapping',{}).get('google.subject')=='assertion.sub','Unexpected subject mapping')
 # Never guess how an unfamiliar CEL condition affects production trust.
 check(not provider.get('attributeCondition'),'Provider has a condition requiring separate evaluation; no change made')
 database=run(['firestore','databases','describe','--database=(default)']);check(database.get('locationId')=='europe-west1','Unexpected database')
 policies={k:policy(sa) for k,sa in ACCOUNTS.items()}
 approved={MEMBER,PREFIX+SUB.replace(':production',':preview')}
 for k,p in policies.items():
  for b in p.get('bindings',[]):
   check(b.get('role')=='roles/iam.workloadIdentityUser' and not b.get('condition') and set(b.get('members',[]))<=approved,'Unexpected existing impersonation trust for '+k)
 roles={}; grants={k:[] for k in ACCOUNTS}
 for ancestor in run(['projects','get-ancestors',P]):
  kind=ancestor['type'];ident=str(ancestor['id'])
  args={'project':['projects','get-iam-policy',P],'folder':['resource-manager','folders','get-iam-policy',ident],'organization':['organizations','get-iam-policy',ident]}.get(kind)
  check(args is not None,'Unknown ancestor')
  for b in run(args).get('bindings',[]):
   check(not any(m in b.get('members',[]) for m in ['allUsers','allAuthenticatedUsers']),'Public inherited grant requires review')
   for k,sa in ACCOUNTS.items():
    if 'serviceAccount:'+sa not in b.get('members',[]):continue
    role=b['role']
    if role not in roles:
     check(not role.startswith('organizations/'),'Organization custom role requires separate review')
     role_id=role.split('/')[-1] if role.startswith('projects/'+P+'/roles/') else role
     roles[role]=run(['iam','roles','describe',role_id])
     check(not roles[role].get('deleted') and roles[role].get('stage')!='DISABLED','Disabled data role')
    perms=set(roles[role].get('includedPermissions',[]));allowed={'datastore.entities.create'} if k=='writer' else {'datastore.entities.get','datastore.entities.list'}
    check(perms<=allowed and perms,'Unexpected inherited/direct permissions for '+k)
    condition=b.get('condition')
    if k=='writer':check(condition and condition.get('expression')=='resource.name == "'+DB+'"','Writer database condition mismatch')
    grants[k].append({'scope':kind,'role':role,'condition':condition,'permissions':sorted(perms)})
 check(all(grants.values()),'Missing existing data permissions; this script will not grant data roles')
 check(set(p for g in grants['reader'] for p in g['permissions'])=={'datastore.entities.get','datastore.entities.list'},'Reader get/list incomplete')
 webhook=policy('tss-whatsapp-webhook@'+P+'.iam.gserviceaccount.com')
 return {'provider':provider,'database':stable(database),'policies':policies,'grants':grants,'webhook':webhook}
try:
 check(shutil.which('gcloud'),'gcloud unavailable; run in authenticated Google Cloud Shell')
 before=snapshot();REPORT['provider']={k:before['provider'].get(k) for k in ['name','attributeCondition','attributeMapping','oidc']};REPORT['dataGrants']=before['grants'];REPORT['trustPoliciesBefore']=before['policies']
 REPORT['inheritanceLimits']='Direct service-account and public ancestor grants inspected. Group membership, deny policies and principal access boundaries not proven.'
 for k,sa in ACCOUNTS.items():
  check(any(b.get('role')=='roles/iam.workloadIdentityUser' and PREFIX+SUB.replace(':production',':preview') in b.get('members',[]) and not b.get('condition') for b in before['policies'][k].get('bindings',[])),'Approved preview trust missing for '+k)
  if not trusted(before['policies'][k]):REPORT['missingBindings'].append({'serviceAccount':sa,'role':'roles/iam.workloadIdentityUser','member':MEMBER})
 print(json.dumps({'proposedChanges':REPORT['missingBindings'],'scope':'Impersonation only. Existing reader get/list and writer create permissions unchanged.'},indent=2))
 if MODE=='--apply' and REPORT['missingBindings']:
  with open('/dev/tty','r+') as tty:
   tty.write('Type APPLY TSS PRODUCTION WIF to apply exactly the bindings above: ');tty.flush()
   check(tty.readline().strip()=='APPLY TSS PRODUCTION WIF','Confirmation not supplied')
  for change in REPORT['missingBindings']:
   run(['iam','service-accounts','add-iam-policy-binding',change['serviceAccount'],'--role=roles/iam.workloadIdentityUser','--member='+MEMBER,'--condition=None'])
   check(trusted(policy(change['serviceAccount'])),'Independent trust readback failed')
   REPORT['changes'].append(change)
 after=snapshot()
 for field in ['provider','database','grants','webhook']:check(before[field]==after[field],'Protected configuration changed: '+field)
 # Verify each SA policy differs only by the exact allowed production member.
 def normalized(p):
  p=copy.deepcopy(p);p.pop('etag',None)
  for b in p.get('bindings',[]):
   if b.get('role')=='roles/iam.workloadIdentityUser' and not b.get('condition'):b['members']=[m for m in b.get('members',[]) if m!=MEMBER]
  p['bindings']=[b for b in p.get('bindings',[]) if b.get('members')]
  for b in p['bindings']:b['members']=sorted(b['members'])
  p['bindings']=sorted(p['bindings'],key=lambda b:json.dumps(b,sort_keys=True))
  return p
 for k in ACCOUNTS:check(normalized(before['policies'][k])==normalized(after['policies'][k]),'Unrelated trust changed: '+k)
 REPORT['trustPoliciesAfter']=after['policies']
 ready=all(trusted(p) for p in after['policies'].values())
 REPORT['result']='IAM_READBACK_PASS' if ready else 'MISSING_PRODUCTION_BINDINGS'
 if MODE in ['--apply','--verify']:check(ready,'Production trust incomplete')
 REPORT['protectedConfigurationReadback']='PASS'
except Exception as e:REPORT['result']='BLOCKED';REPORT['error']=str(e)
finally:
 path=Path.home()/'tss-admin-production-iam-report.json';path.write_text(json.dumps(REPORT,indent=2)+'\n');print(json.dumps(REPORT,indent=2));print('Sanitized report: '+str(path))
if REPORT['result']=='BLOCKED':sys.exit(1)
PY

#!/usr/bin/env python3
# Approved audit setup, default read-only. No provider tokens are printed.
import copy, hashlib, json, os, shutil, subprocess, sys, re, urllib.request, urllib.error
from pathlib import Path

PROJECT='tss-crm-508908'
NUMBER='103840050410'
POOL='vercel-research-center'
PROVIDER='vercel'
WRITER='tss-whatsapp-operations@'+PROJECT+'.iam.gserviceaccount.com'
READER='tss-whatsapp-inbox-reader@'+PROJECT+'.iam.gserviceaccount.com'
WEBHOOK='tss-whatsapp-webhook@'+PROJECT+'.iam.gserviceaccount.com'
ROLE_ID='tssWhatsappOperationsLedger'
ROLE='projects/'+PROJECT+'/roles/'+ROLE_ID
SUBJECT='owner:tss21:project:thesmarty-solution-agent:environment:preview'
PRINCIPAL='principal://iam.googleapis.com/projects/'+NUMBER+'/locations/global/workloadIdentityPools/'+POOL+'/subject/'+SUBJECT
DATABASE='projects/'+PROJECT+'/databases/(default)'
EXPRESSION='resource.name == "'+DATABASE+'"'
CONDITION='expression='+EXPRESSION+',title=tssWhatsappOperationsDefaultDatabase,description=Create/read/list only in the existing default database; collection enforced by application code'
mode=sys.argv[1] if len(sys.argv)>1 else '--preflight'
if (mode=='--readback' and (len(sys.argv)!=3 or not re.fullmatch(r'[a-f0-9]{64}_acceptance',sys.argv[2]))) or (mode!='--readback' and (len(sys.argv)>2 or mode not in ('--preflight','--apply','--verify'))):
    raise SystemExit('Usage: python3 tss-whatsapp-infrastructure.py [--preflight|--apply|--verify|--readback MANIFEST_ID]')
if not shutil.which('gcloud'):raise SystemExit('BLOCKED: gcloud is not installed. Run this script in Google Cloud Shell.')
report={'project':PROJECT,'mode':mode,'auditIdentity':WRITER,'role':ROLE,'permissionScope':{'permissions':['datastore.entities.create','datastore.entities.get','datastore.entities.list'],'resource':DATABASE,'iamCollectionIsolation':False,'applicationCollections':['tss_whatsapp_operations']},'wifSubject':SUBJECT,'changes':[],'liveImpersonation':'NOT_TESTED: must run from the approved Vercel preview, never by granting the Cloud Shell user impersonation','liveAuditRuntime':'PENDING','mailAuthorization':'EXTERNAL_MICROSOFT_ADMIN_REQUIRED','schedulerAndMonitor':'NOT_CREATED_FREE_QUOTA_UNVERIFIED'}

def run(args, optional_missing=False):
    command=['gcloud',*args,'--project='+PROJECT,'--format=json','--quiet']
    p=subprocess.run(command,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode:
        if optional_missing and 'PERMISSION_DENIED' not in p.stderr and ('NOT_FOUND' in p.stderr or 'not found' in p.stderr.lower()):return None
        # Avoid echoing free-form provider data or account/token information.
        category='PERMISSION_DENIED' if 'PERMISSION_DENIED' in p.stderr else 'NOT_FOUND' if 'NOT_FOUND' in p.stderr else 'GCLOUD_COMMAND_FAILED'
        raise RuntimeError(category+': '+ ' '.join(args[:3]))
    return json.loads(p.stdout) if p.stdout.strip() else {}

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'))
def digest(value):return hashlib.sha256(canonical(value).encode()).hexdigest()
def compare_protected(before,after):
    # Google documents earliestVersionTime as continuously updated output metadata.
    # Preserve updateTime and every configuration field. Record etag separately:
    # it is a server checksum of other fields, including changing output metadata.
    differences={}
    for key in ('provider','readerPolicy','webhookPolicy','adminPolicy','database'):
        old=copy.deepcopy(before[key]);new=copy.deepcopy(after[key])
        if key=='database':
            report['databaseVersionWindow']={'before':old.pop('earliestVersionTime',None),'after':new.pop('earliestVersionTime',None),'ignoredForConfigurationComparison':True}
            report['databaseEtags']={'before':old.pop('etag',None),'after':new.pop('etag',None),'recordedSeparately':True}
            report['databaseConfigurationSnapshots']={'before':old,'after':new}
        if digest(old)!=digest(new):
            differences[key]=[field for field in sorted(set(old)|set(new)) if old.get(field)!=new.get(field)]
    report['protectedResourceChangedFields']=differences
    check(not differences,'Protected resource changed during execution: '+','.join(differences))
    report['protectedResourceReadback']='PASS: provider, Admin/reader/webhook policies and database configuration unchanged; earliestVersionTime and etag recorded separately'

def sa_policy(email):return run(['iam','service-accounts','get-iam-policy',email])
def bindings(policy,member):return [b for b in policy.get('bindings',[]) if member in b.get('members',[])]
def check(condition,message):
    if not condition:raise RuntimeError(message)

def snapshot():
    project=run(['projects','describe',PROJECT])
    check(str(project.get('projectNumber'))==NUMBER,'Project number mismatch')
    services=run(['services','list','--enabled'])
    names={s.get('config',{}).get('name') for s in services}
    required={'iam.googleapis.com','iamcredentials.googleapis.com','sts.googleapis.com','firestore.googleapis.com'}
    check(required<=names,'Required API is not enabled. No API will be enabled by this script.')
    provider=run(['iam','workload-identity-pools','providers','describe',PROVIDER,'--workload-identity-pool='+POOL,'--location=global'])
    check(provider.get('state')=='ACTIVE' and not provider.get('disabled',False),'Existing WIF provider is not active')
    check(provider.get('attributeMapping',{}).get('google.subject')=='assertion.sub','Cannot verify exact subject mapping; provider must not be changed')
    reader_policy=sa_policy(READER)
    check(any(b.get('role')=='roles/iam.workloadIdentityUser' and PRINCIPAL in b.get('members',[]) and not b.get('condition') for b in reader_policy.get('bindings',[])),
          'Exact preview subject not found in existing reader trust. Stop: do not guess or broaden trust.')
    database=run(['firestore','databases','describe','--database=(default)'])
    check(database.get('locationId')=='europe-west1','Unexpected Firestore database region')
    ancestors=run(['projects','get-ancestors',PROJECT])
    policies=[]
    for ancestor in ancestors:
        kind=ancestor.get('type'); ident=str(ancestor.get('id'))
        if kind=='project': policy=run(['projects','get-iam-policy',PROJECT])
        elif kind=='folder':policy=run(['resource-manager','folders','get-iam-policy',ident])
        elif kind=='organization':policy=run(['organizations','get-iam-policy',ident])
        else:raise RuntimeError('Unknown ancestor type')
        policies.append({'type':kind,'id':ident,'policy':policy})
    check(any(p['type']=='project' for p in policies),'Project IAM policy missing')
    writer_sa=run(['iam','service-accounts','describe',WRITER],optional_missing=True)
    writer_policy=sa_policy(WRITER) if writer_sa else {'bindings':[]}
    role=run(['iam','roles','describe',ROLE_ID],optional_missing=True)
    return {'provider':provider,'readerPolicy':reader_policy,'webhookPolicy':sa_policy(WEBHOOK),'adminPolicy':sa_policy('tss-admin-session-writer@'+PROJECT+'.iam.gserviceaccount.com'),'database':database,'policies':policies,'writerSA':writer_sa,'writerPolicy':writer_policy,'role':role}

def audit(s):
    if s['writerSA']:
        check(not s['writerSA'].get('disabled',False),'Existing audit identity is disabled')
        check(not run(['iam','service-accounts','keys','list','--iam-account='+WRITER,'--managed-by=user']),'Existing audit identity has user-managed keys; no changes allowed')
    reader_grants=[];writer_grants=[];public=[]
    resolved={}
    for scope in s['policies']:
        for b in scope['policy'].get('bindings',[]):
            members=b.get('members',[])
            if any(m in members for m in ('allUsers','allAuthenticatedUsers')):public.append({'scope':scope['type'],'role':b.get('role')})
            for email,target in ((READER,reader_grants),(WRITER,writer_grants)):
                if 'serviceAccount:'+email not in members:continue
                role=b['role']
                if role not in resolved:
                    if role.startswith('projects/'+PROJECT+'/roles/'):
                        resolved[role]=run(['iam','roles','describe',role.split('/')[-1]])
                    elif role.startswith('organizations/'):
                        org=role.split('/')[1]
                        # Avoid the project selector for organization-level role lookup.
                        p=subprocess.run(['gcloud','iam','roles','describe',role.split('/')[-1],'--organization='+org,'--format=json','--quiet'],text=True,capture_output=True)
                        check(p.returncode==0,'Cannot inspect inherited organization role')
                        resolved[role]=json.loads(p.stdout)
                    else:resolved[role]=run(['iam','roles','describe',role])
                target.append({'scope':scope['type'],'role':role,'condition':b.get('condition'),'permissions':resolved[role].get('includedPermissions',[])})
    report['readerAllowBindings']=reader_grants
    report['auditAllowBindings']=writer_grants
    report['publicAllowBindings']=public
    report['inheritanceLimits']='Direct service-account and public allow bindings inspected at project/folder/organization levels. Group membership, deny policies, principal access boundaries and organization constraints are not established by this allow-policy audit. Live WIF and Firestore tests remain required.'
    check(not public,'Public inherited/project IAM grants require owner review before claiming isolation')
    reader_permissions=set(p for b in reader_grants for p in b['permissions'])
    check({'datastore.entities.get','datastore.entities.list'}<=reader_permissions,'Reader get/list permissions were not demonstrated')
    check(not ({'datastore.entities.create','datastore.entities.update','datastore.entities.delete','secretmanager.versions.access'}&reader_permissions),'Reader has unexpected write/secret permissions; no changes made')
    if s['role']:
        check(not s['role'].get('deleted') and s['role'].get('stage')!='DISABLED','Existing custom role disabled or deleted')
        check(set(s['role'].get('includedPermissions',[]))=={'datastore.entities.create','datastore.entities.get','datastore.entities.list'},'Existing role has different permissions. Refusing to overwrite it.')
    for b in writer_grants:
        check(b['scope']=='project' and b['role']==ROLE and b.get('condition',{}).get('expression')==EXPRESSION,
              'Writer already has an unexpected or inherited grant. Refusing to alter or conceal it.')
    for b in s['writerPolicy'].get('bindings',[]):
        check(b.get('role')=='roles/iam.workloadIdentityUser' and set(b.get('members',[]))=={PRINCIPAL} and not b.get('condition'),
              'Dedicated writer already has unexpected impersonation grants. Refusing to expand trust.')
    report['existingWifProvider']={'name':s['provider'].get('name'),'issuer':s['provider'].get('oidc',{}).get('issuerUri'),'attributeCondition':s['provider'].get('attributeCondition'),'subjectMapping':s['provider'].get('attributeMapping',{}).get('google.subject')}

def verify(s):
    audit(s)
    check(s['writerSA'] and s['writerSA'].get('email')==WRITER and not s['writerSA'].get('disabled',False),'Writer service account is missing or disabled')
    check(s['role'] is not None,'Custom role missing')
    project=next(p['policy'] for p in s['policies'] if p['type']=='project')
    check(any(b['role']==ROLE and b.get('condition',{}).get('expression')==EXPRESSION for b in bindings(project,'serviceAccount:'+WRITER)),'Database-conditioned create binding missing')
    check(any(b.get('role')=='roles/iam.workloadIdentityUser' and PRINCIPAL in b.get('members',[]) for b in s['writerPolicy'].get('bindings',[])),'Exact preview impersonation binding missing')
    keys=run(['iam','service-accounts','keys','list','--iam-account='+WRITER,'--managed-by=user'])
    check(not keys,'Dedicated writer has user-managed keys. Script will not delete them or claim keyless isolation.')
    report['iamReadback']='PASS'
    report['wifTrustReadback']='PASS: exact subject binding and unchanged provider; token exchange is NOT yet proven'

def independent_readback(manifest_id):
    p=subprocess.run(['gcloud','auth','print-access-token'],text=True,capture_output=True)
    check(p.returncode==0 and p.stdout.strip(),'Owner access token unavailable')
    token=p.stdout.strip()
    root='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/tss_whatsapp_operations/'
    def read_record(identifier,authenticated=True):
        check(re.fullmatch(r'[a-f0-9]{64}_[a-z0-9_]{1,80}',identifier) is not None,'Invalid record reference')
        req=urllib.request.Request(root+identifier,headers={'Authorization':'Bearer '+token} if authenticated else {})
        with urllib.request.urlopen(req,timeout=15) as response:data=json.load(response)
        row=json.loads(data['fields']['record']['stringValue']);original=row.pop('recordHash')
        actual=hashlib.sha256(json.dumps(row,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        check(original==actual,'Record hash differs from persisted content')
        row['recordHash']=original;return row
    manifest=read_record(manifest_id)
    check(manifest.get('kind')=='audit_acceptance_run' and manifest.get('synthetic') is True,'Not a synthetic acceptance manifest')
    refs=manifest.get('references',[]);check(1<=len(refs)<=30,'Unexpected reference count')
    for ref in refs:check(read_record(ref['id'])['recordHash']==ref['recordHash'],'Independent readback mismatch')
    try:
        read_record(manifest_id,False)
        raise RuntimeError('Unauthenticated Firestore read unexpectedly allowed')
    except urllib.error.HTTPError as error:check(error.code in (401,403),'Unexpected anonymous read response')
    report.update(result='INDEPENDENT_READBACK_PASS',runId=manifest['runId'],manifestId=manifest_id,
      independentlyReadRecords=len(refs)+1,anonymousReadDenied=True,tests=manifest['tests'],actualWhatsAppTransmissions=manifest['actualWhatsAppTransmissions'],actualEmailTransmissions=manifest['actualEmailTransmissions'])

try:
    if mode=='--readback':
        independent_readback(sys.argv[2])
        raise SystemExit(0)
    print('PROPOSED IAM CHANGES (no data writes):')
    print('1. Create dedicated service account only if absent: '+WRITER)
    print('2. Create custom role only if absent: '+ROLE+' => datastore.entities.create/get/list only')
    print('3. Grant that role at project level with condition: '+EXPRESSION)
    print('   ACTUAL SCOPE: create/read/list documents throughout the default database. No collection-level IAM isolation.')
    print('   Only application code limits creates/reads/lists to tss_whatsapp_operations.')
    print('4. Add roles/iam.workloadIdentityUser on the dedicated writer for exactly: '+PRINCIPAL)
    print('   This subject covers preview deployments of this project, not one Git branch.')
    print('No pool/provider edits, existing identity edits, keys, API enablement, billing changes or diagnostic impersonation grants. No Meta/mail sending.')
    before=snapshot();audit(before)
    try:
        billing=run(['billing','projects','describe',PROJECT]);report['billingEnabled']=billing.get('billingEnabled',False)
        report['schedulerFreeTier']='UNVERIFIED: shared billing-account job inventory and quota usage require inspection before any job is created'
    except Exception:
        report['schedulerFreeTier']='UNVERIFIED: billing inventory unavailable; no job created'
    if mode=='--apply':
        # --apply is the explicit operation authorized by the owner on 22 October 2026.
        # No interactive repetition, credentials, token output or paid provisioning.
        if not before['writerSA']:
            run(['iam','service-accounts','create','tss-whatsapp-operations','--display-name=TSS WhatsApp operations ledger'])
            check(run(['iam','service-accounts','describe',WRITER]).get('email')==WRITER,'Service account create readback failed')
            report['changes'].append('created dedicated service account, read back')
        if not before['role']:
            run(['iam','roles','create',ROLE_ID,'--title=TSS WhatsApp operations ledger','--description=Create get list only for immutable WhatsApp ledger; default-database IAM scope','--permissions=datastore.entities.create,datastore.entities.get,datastore.entities.list','--stage=GA'])
            check(set(run(['iam','roles','describe',ROLE_ID]).get('includedPermissions',[]))=={'datastore.entities.create','datastore.entities.get','datastore.entities.list'},'Role create readback failed')
            report['changes'].append('created custom role, read back')
        current=run(['projects','get-iam-policy',PROJECT])
        if not any(b.get('role')==ROLE and b.get('condition',{}).get('expression')==EXPRESSION for b in bindings(current,'serviceAccount:'+WRITER)):
            run(['projects','add-iam-policy-binding',PROJECT,'--member=serviceAccount:'+WRITER,'--role='+ROLE,'--condition='+CONDITION])
            current=run(['projects','get-iam-policy',PROJECT])
            check(any(b.get('role')==ROLE and b.get('condition',{}).get('expression')==EXPRESSION for b in bindings(current,'serviceAccount:'+WRITER)),'Project grant readback failed')
            report['changes'].append('added database-conditioned create grant, read back')
        current=sa_policy(WRITER)
        if not any(b.get('role')=='roles/iam.workloadIdentityUser' and PRINCIPAL in b.get('members',[]) for b in current.get('bindings',[])):
            run(['iam','service-accounts','add-iam-policy-binding',WRITER,'--member='+PRINCIPAL,'--role=roles/iam.workloadIdentityUser','--condition=None'])
            check(any(b.get('role')=='roles/iam.workloadIdentityUser' and PRINCIPAL in b.get('members',[]) for b in sa_policy(WRITER).get('bindings',[])),'WIF grant readback failed')
            report['changes'].append('added exact preview subject impersonation, read back')
        after=snapshot();verify(after)
        compare_protected(before,after)
    elif mode=='--verify':
        verify(before)
        after=snapshot();verify(after)
        compare_protected(before,after)
    else:report['iamReadback']='PREFLIGHT ONLY: no changes applied'
    report['result']='PREFLIGHT_PASS' if mode=='--preflight' else 'IAM_CONFIGURATION_VERIFIED_LIVE_ACCEPTANCE_PENDING'
except Exception as error:
    report['result']='BLOCKED';report['error']=str(error)
finally:
    # Sanitized report contains policy facts, never keys, OAuth tokens or credentials.
    output=Path.cwd()/'tss-whatsapp-infrastructure-report.json'
    output.write_text(json.dumps(report,indent=2)+'\n');os.chmod(output,0o600)
    print(json.dumps(report,indent=2));print('Sanitized report: '+str(output))
if report.get('result')=='BLOCKED':raise SystemExit(1)

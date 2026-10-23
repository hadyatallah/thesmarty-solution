#!/usr/bin/env python3
"""Read-only review of NEW Production trigger/trust requirements. No keys or writes."""
import json, subprocess, sys
PROJECT='tss-crm-508908'
SUBJECT='principal://iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/subject/owner:tss21:project:thesmarty-solution-agent:environment:production'
def read(args):
    result=subprocess.run(['gcloud',*args,'--format=json','--quiet'],capture_output=True,text=True)
    if result.returncode: raise RuntimeError('provider_read_denied:'+args[0]+':'+args[1])
    return json.loads(result.stdout or '{}')
def policies():
    checks=[]
    for account,role in [('tss-whatsapp-owner-mail','roles/iam.serviceAccountOpenIdTokenCreator'),('tss-whatsapp-operations','roles/iam.workloadIdentityUser')]:
        email=account+'@'+PROJECT+'.iam.gserviceaccount.com'
        policy=read(['iam','service-accounts','get-iam-policy',email,'--project='+PROJECT])
        present=any(b.get('role')==role and SUBJECT in b.get('members',[]) and not b.get('condition') for b in policy.get('bindings',[]))
        checks.append({'identity':email,'requiredRoleOnThatAccountOnly':role,'productionSubjectBound':present})
    return checks
try:
    report={'mode':'READ_ONLY_NO_CHANGES','newProductionTrust':policies(),'scheduleCandidate':'*/10 * * * * UTC','target':'https://www.thesmartysolution.com/api/tss-whatsapp-notify','schedulerIdentity':'tss-whatsapp-notify-scheduler@'+PROJECT+'.iam.gserviceaccount.com','changes':[]}
    services=read(['services','list','--enabled','--project='+PROJECT])
    enabled={x.get('config',{}).get('name') for x in services}
    report['schedulerApiEnabled']='cloudscheduler.googleapis.com' in enabled
    report['monitoringApiEnabled']='monitoring.googleapis.com' in enabled
    billing=read(['billing','projects','describe',PROJECT]);account=billing.get('billingAccountName','')
    if not account: raise RuntimeError('billing_account_inventory_unavailable')
    projects=read(['billing','projects','list','--billing-account='+account.split('/')[-1]])
    count=0; inventories=[]
    for linked in projects:
        name=linked.get('projectId')
        if not name: raise RuntimeError('billing_project_identity_unavailable')
        services=read(['services','list','--enabled','--project='+name])
        if not any(x.get('config',{}).get('name')=='cloudscheduler.googleapis.com' for x in services): continue
        locations=read(['scheduler','locations','list','--project='+name])
        subtotal=0
        for location in locations:
            region=location.get('locationId') or location.get('name','').split('/')[-1]
            if not region: raise RuntimeError('scheduler_region_unavailable')
            subtotal+=len(read(['scheduler','jobs','list','--location='+region,'--project='+name]))
        count+=subtotal;inventories.append({'project':name,'jobCountIncludingPaused':subtotal})
    report['billingAccountJobCount']=count
    report['schedulerFreeSlotCurrentlyAvailable']=count<3
    report['schedulerInventory']=inventories
    report['permissionApprovalRequired']=any(not x['productionSubjectBound'] for x in report['newProductionTrust'])
    report['monitorChannelConsent']='NOT_VERIFIED: no new alert email authorized by this operation'
    print(json.dumps(report,indent=2))
except Exception as error:
    print(json.dumps({'mode':'READ_ONLY_NO_CHANGES','result':'BLOCKED','error':str(error),'changes':[]}));sys.exit(1)

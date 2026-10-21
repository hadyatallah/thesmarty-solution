"""Exercise the Cloud Shell script with a fake CLI. Never contacts Google Cloud."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/'scripts/tss-admin-session-writer-iam.sh'
CODE=SCRIPT.read_text().split("<<'PY'\n",1)[1].rsplit('\nPY',1)[0]
PROJECT='tss-crm-508908'
WRITER='tss-admin-session-writer@'+PROJECT+'.iam.gserviceaccount.com'
READER='tss-whatsapp-inbox-reader@'+PROJECT+'.iam.gserviceaccount.com'
WEBHOOK='tss-whatsapp-webhook@'+PROJECT+'.iam.gserviceaccount.com'
ROLE='projects/'+PROJECT+'/roles/tssAdminSessionCreator'
PRINCIPAL='principal://iam.googleapis.com/projects/103840050410/locations/global/workloadIdentityPools/vercel-research-center/subject/owner:tss21:project:thesmarty-solution-agent:environment:preview'
EXPR='resource.name == "projects/tss-crm-508908/databases/(default)"'

class FakeCloud:
 def __init__(self):
  self.calls=[];self.writer=None;self.role=None;self.writerPolicy={'bindings':[]};self.dbReads=0;self.changeDatabase=False
  self.readerPolicy={'bindings':[{'role':'roles/iam.workloadIdentityUser','members':[PRINCIPAL]}]}
  self.projectPolicy={'bindings':[{'role':'projects/'+PROJECT+'/roles/tssWhatsappInboxReader','members':['serviceAccount:'+READER]}]}
 def run(self,command,**kwargs):
  self.calls.append(command)
  a=[s for s in command[1:] if not s.startswith(('--project=','--format=')) and s!='--quiet']
  missing=False
  if a[:2]==['projects','describe']:data={'projectNumber':'103840050410'}
  elif a[:2]==['services','list']:data=[{'config':{'name':n}} for n in ['iam.googleapis.com','iamcredentials.googleapis.com','sts.googleapis.com','firestore.googleapis.com']]
  elif a[:3]==['iam','workload-identity-pools','providers']:data={'state':'ACTIVE','attributeMapping':{'google.subject':'assertion.sub'},'oidc':{'issuerUri':'https://oidc.vercel.com/tss21'}}
  elif a[:3]==['firestore','databases','describe']:
   self.dbReads+=1
   data={'locationId':'europe-west1','earliestVersionTime':str(self.dbReads),'updateTime':'fixed-config-version','deleteProtectionState':'DELETE_PROTECTION_ENABLED'}
   if self.changeDatabase and self.dbReads>1:data['deleteProtectionState']='DELETE_PROTECTION_DISABLED'
  elif a[:2]==['projects','get-ancestors']:data=[{'type':'project','id':'103840050410'}]
  elif a[:2]==['projects','get-iam-policy']:data=self.projectPolicy
  elif a[:3]==['iam','service-accounts','describe']:data=self.writer;missing=data is None
  elif a[:3]==['iam','service-accounts','get-iam-policy']:
   data=self.readerPolicy if a[3]==READER else {'bindings':[]} if a[3]==WEBHOOK else self.writerPolicy
  elif a[:3]==['iam','roles','describe']:
   data={'includedPermissions':['datastore.entities.get','datastore.entities.list']} if a[3]=='tssWhatsappInboxReader' else self.role;missing=data is None
  elif a[:3]==['iam','service-accounts','create']:self.writer={'email':WRITER};data=self.writer
  elif a[:3]==['iam','roles','create']:self.role={'includedPermissions':['datastore.entities.create'],'stage':'GA'};data=self.role
  elif a[:2]==['projects','add-iam-policy-binding']:
   self.projectPolicy['bindings'].append({'role':ROLE,'members':['serviceAccount:'+WRITER],'condition':{'expression':EXPR}});data=self.projectPolicy
  elif a[:3]==['iam','service-accounts','add-iam-policy-binding']:
   self.writerPolicy['bindings'].append({'role':'roles/iam.workloadIdentityUser','members':[PRINCIPAL]});data=self.writerPolicy
  elif a[:4]==['iam','service-accounts','keys','list']:data=[]
  else:raise AssertionError('Unexpected CLI command: '+repr(a))
  return subprocess.CompletedProcess(command,1 if missing else 0,stdout='' if missing else json.dumps(data),stderr='NOT_FOUND' if missing else '')
 def mutations(self):return [c for c in self.calls if any(x in c for x in ['create','add-iam-policy-binding','set-iam-policy','update','delete','enable'])]

class ScriptTests(unittest.TestCase):
 def execute(self,cloud,mode=None):
  with tempfile.TemporaryDirectory() as directory:
   previous=os.getcwd();os.chdir(directory)
   try:
    with patch('sys.argv',['-']+([mode] if mode else [])),patch('shutil.which',return_value='/fake/gcloud'),patch('subprocess.run',side_effect=cloud.run),patch('builtins.open',return_value=io.StringIO('APPLY TSS ADMIN SESSION WRITER\n')),contextlib.redirect_stdout(io.StringIO()):
     try:exec(compile(CODE,str(SCRIPT),'exec'),{})
     except SystemExit as error:self.assertEqual(error.code,1)
    return json.loads(Path('tss-admin-session-writer-report.json').read_text())
   finally:os.chdir(previous)
 def test_default_preflight_is_read_only(self):
  cloud=FakeCloud();r=self.execute(cloud);self.assertEqual(r['result'],'PREFLIGHT_PASS');self.assertEqual(cloud.mutations(),[])
 def test_apply_exact_grants_independent_readback_and_idempotence(self):
  cloud=FakeCloud();r=self.execute(cloud,'--apply');self.assertEqual(r['iamReadback'],'PASS');self.assertEqual(len(cloud.mutations()),4)
  self.assertEqual(cloud.role['includedPermissions'],['datastore.entities.create'])
  self.assertEqual(cloud.writerPolicy['bindings'][0]['members'],[PRINCIPAL])
  self.assertEqual(cloud.projectPolicy['bindings'][-1]['condition']['expression'],EXPR)
  self.assertFalse(r['permissionScope']['iamCollectionIsolation'])
  cloud.calls=[];r=self.execute(cloud,'--apply');self.assertEqual(r['iamReadback'],'PASS');self.assertEqual(cloud.mutations(),[])
 def test_unknown_subject_blocks_without_writes(self):
  cloud=FakeCloud();cloud.readerPolicy={'bindings':[]};r=self.execute(cloud,'--apply');self.assertEqual(r['result'],'BLOCKED');self.assertEqual(cloud.mutations(),[])
 def test_existing_broader_role_is_never_overwritten(self):
  cloud=FakeCloud();cloud.role={'includedPermissions':['datastore.entities.create','datastore.entities.delete']};r=self.execute(cloud,'--apply');self.assertEqual(r['result'],'BLOCKED');self.assertEqual(cloud.mutations(),[])

 def test_moving_version_timestamp_does_not_mask_configuration_checks(self):
  cloud=FakeCloud();r=self.execute(cloud,'--apply');self.assertEqual(r['protectedResourceReadback'].split(':')[0],'PASS')
  self.assertNotEqual(r['databaseVersionWindow']['before'],r['databaseVersionWindow']['after'])
  self.assertEqual(r['databaseConfigurationSnapshots']['before'],r['databaseConfigurationSnapshots']['after'])
 def test_real_database_change_still_blocks_and_names_field(self):
  cloud=FakeCloud();cloud.changeDatabase=True;r=self.execute(cloud,'--apply')
  self.assertEqual(r['result'],'BLOCKED');self.assertEqual(r['protectedResourceChangedFields'],{'database':['deleteProtectionState']})
 def test_verify_is_read_only_and_checks_configuration(self):
  cloud=FakeCloud();self.execute(cloud,'--apply');cloud.calls=[]
  r=self.execute(cloud,'--verify');self.assertEqual(r['iamReadback'],'PASS');self.assertEqual(cloud.mutations(),[])

if __name__=='__main__':unittest.main()

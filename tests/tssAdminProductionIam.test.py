"""No cloud calls: verify exact production trust writes and protected readbacks."""
import contextlib, copy, io, json, tempfile, unittest, importlib.util
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('writer_tests',Path(__file__).with_name('tssAdminWriterIam.test.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
FakeCloud,WRITER,READER,ROLE,EXPR,PRINCIPAL=[getattr(module,k) for k in ['FakeCloud','WRITER','READER','ROLE','EXPR','PRINCIPAL']]
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/tss-admin-production-iam.sh'
CODE=SCRIPT.read_text().split("<<'PY'\n",1)[1].rsplit('\nPY',1)[0]
PROD=PRINCIPAL.replace(':preview',':production')
class Cloud(FakeCloud):
 def __init__(self):
  super().__init__();self.writerPolicy=copy.deepcopy(self.readerPolicy);self.role={'includedPermissions':['datastore.entities.create'],'stage':'GA'}
  self.projectPolicy['bindings'].append({'role':ROLE,'members':['serviceAccount:'+WRITER],'condition':{'expression':EXPR}})
  self.condition=None;self.dropWrite=False
 def run(self,c,**kw):
  a=c[1:]
  if a[:3]==['iam','service-accounts','add-iam-policy-binding']:
   self.calls.append(c)
   assert '--member='+PROD in c and '--condition=None' in c and '--role=roles/iam.workloadIdentityUser' in c
   if not self.dropWrite:
    p=self.writerPolicy if a[3]==WRITER else self.readerPolicy
    p['bindings'][0]['members'].append(PROD)
   import subprocess
   return subprocess.CompletedProcess(c,0,stdout='{}')
  r=super().run(c,**kw)
  if a[:3]==['iam','workload-identity-pools','providers'] and self.condition:
   d=json.loads(r.stdout);d['attributeCondition']=self.condition;r.stdout=json.dumps(d)
  return r
class Tty(io.StringIO):
 def write(self,text):return len(text)
class Tests(unittest.TestCase):
 def execute(self,cloud,mode='--preflight',confirm='APPLY TSS PRODUCTION WIF\n'):
  with tempfile.TemporaryDirectory() as tmp:
   with patch('sys.argv',['-',mode]),patch('shutil.which',return_value='/fake/gcloud'),patch('subprocess.run',side_effect=cloud.run),patch('builtins.open',return_value=Tty(confirm)),patch('pathlib.Path.home',return_value=Path(tmp)),contextlib.redirect_stdout(io.StringIO()):
    try:exec(compile(CODE,str(SCRIPT),'exec'),{})
    except SystemExit as e:self.assertEqual(e.code,1)
   return json.loads((Path(tmp)/'tss-admin-production-iam-report.json').read_text())
 def test_default_readonly_exact_missing(self):
  c=Cloud();r=self.execute(c);self.assertEqual(r['result'],'MISSING_PRODUCTION_BINDINGS');self.assertEqual(len(r['missingBindings']),2);self.assertEqual(c.mutations(),[])
 def test_apply_only_two_trust_bindings_readback_idempotent(self):
  c=Cloud();r=self.execute(c,'--apply');self.assertEqual(r['result'],'IAM_READBACK_PASS');self.assertEqual(len(c.mutations()),2)
  c.calls=[];self.assertEqual(self.execute(c,'--apply')['result'],'IAM_READBACK_PASS');self.assertEqual(c.mutations(),[])
  self.assertEqual(self.execute(c,'--verify')['protectedConfigurationReadback'],'PASS')
 def test_unexpected_condition_blocks(self):
  c=Cloud();c.condition='assertion.environment == "preview"';self.assertEqual(self.execute(c,'--apply')['result'],'BLOCKED');self.assertEqual(c.mutations(),[])
 def test_broad_data_role_blocks(self):
  c=Cloud();c.role['includedPermissions'].append('datastore.entities.delete');self.assertEqual(self.execute(c,'--apply')['result'],'BLOCKED');self.assertEqual(c.mutations(),[])
 def test_real_database_change_blocks(self):
  c=Cloud();c.changeDatabase=True;self.assertEqual(self.execute(c,'--apply')['result'],'BLOCKED')
 def test_missing_confirmation_never_writes(self):
  c=Cloud();self.assertEqual(self.execute(c,'--apply','NO\n')['result'],'BLOCKED');self.assertEqual(c.mutations(),[])
 def test_failed_independent_readback_blocks(self):
  c=Cloud();c.dropWrite=True;self.assertEqual(self.execute(c,'--apply')['result'],'BLOCKED')
if __name__=='__main__':unittest.main()

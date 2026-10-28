import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('idrive-archive.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ArchiveTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.source=self.root/'source';self.source.write_bytes(b'synthetic database and PDF\0'*1000);self.source.chmod(0o600);self.key=os.urandom(32)
 def tearDown(self):self.temp.cleanup()
 def test_roundtrip_random_nonce_private_and_exclusive(self):
  first=self.root/'a';second=self.root/'b';out=self.root/'out';m.encrypt(self.source,first,self.key);m.encrypt(self.source,second,self.key);self.assertNotEqual(first.read_bytes(),second.read_bytes());m.decrypt(first,out,self.key);self.assertEqual(out.read_bytes(),self.source.read_bytes());self.assertEqual(out.stat().st_mode&0o777,0o600)
  with self.assertRaises(FileExistsError):m.decrypt(first,out,self.key)
  with self.assertRaises(FileExistsError):m.encrypt(self.source,first,self.key)
 def test_tamper_wrong_key_and_truncation_never_publish_plaintext(self):
  envelope=self.root/'enc';m.encrypt(self.source,envelope,self.key);original=envelope.read_bytes()
  for data,key in [(original[:-1],self.key),(original[:-16]+bytes([original[-16]^1])+original[-15:],self.key),(original,os.urandom(32)),(b'invalid',self.key)]:
   envelope.write_bytes(data);out=self.root/'restore'
   with self.assertRaises(Exception):m.decrypt(envelope,out,key)
   self.assertFalse(out.exists());self.assertFalse(list(self.root.glob('.restore-*')))
 def test_key_never_rotated_and_symlinks_rejected(self):
  path=self.root/'key';key=m.recovery_key(path);self.assertEqual(len(key),32);self.assertEqual(m.recovery_key(path),key);path.chmod(0o644)
  with self.assertRaises(ValueError):m.recovery_key(path)
  path.unlink();path.symlink_to(self.source)
  with self.assertRaises(OSError):m.recovery_key(path)
 def test_archive_restores_only_verified_sql_and_excludes_key(self):
  bundle=self.root/'bundle';out=self.root/'sql';m.bundle_backup(self.source,bundle,{'app.env':self.source});m.verified_sql(bundle,out);self.assertEqual(out.read_bytes(),self.source.read_bytes())
  key=self.root/'idrive-recovery.key';key.write_bytes(self.key);key.chmod(0o600)
  with self.assertRaises(ValueError):m.bundle_backup(self.source,self.root/'bad',{'key':key})
 def test_unsafe_archive_entries_never_extract(self):
  for name in ('../cluster.sql','/cluster.sql','configuration/../../other'):
   bundle=self.root/'bad';bundle.unlink(missing_ok=True)
   with tarfile.open(bundle,'w') as archive:
    info=tarfile.TarInfo(name);info.size=1;archive.addfile(info,io.BytesIO(b'x'))
   with self.assertRaises(ValueError):m.verified_sql(bundle,self.root/'restore')
   self.assertFalse((self.root/'restore').exists())
 def client(self,*,corrupt=False,encryption='AES256'):
  client=Mock();stored={}
  def put(**args):stored[args['Key']]=args['Body'].read();self.assertNotIn('ACL',args);self.assertEqual(args['IfNoneMatch'],'*');self.assertEqual(args['Bucket'],m.bootstrap.BUCKET)
  client.put_object.side_effect=put
  client.get_object.side_effect=lambda **args:{'Body':io.BytesIO((b'bad' if corrupt else stored[args['Key']])),'ServerSideEncryption':encryption}
  return client
 def test_upload_exact_readback_no_delete_or_policy_write(self):
  client=self.client();target=m.upload_verified(client,self.source,'backups/test.bnenc',self.root);self.assertEqual(target.read_bytes(),self.source.read_bytes());client.delete_object.assert_not_called();client.put_bucket_policy.assert_not_called()
 def test_upload_corrupt_or_unencrypted_readback_fails(self):
  for kwargs in ({'corrupt':True},{'encryption':None}):
   with self.assertRaises(ValueError):m.upload_verified(self.client(**kwargs),self.source,'backups/test.bnenc',self.root)
 def test_foreign_key_never_uploaded(self):
  client=self.client()
  with self.assertRaises(ValueError):m.upload_verified(client,self.source,'../invalid',self.root)
  client.put_object.assert_not_called()
 def test_documents_are_exact_private_previews_and_replay_is_durable(self):
  payload=b'%PDF-'+b'x'*120;sha=__import__('hashlib').sha256(payload).hexdigest();row={'company':'11111111-1111-4111-8111-111111111111','id':'22222222-2222-4222-8222-222222222222','sha256':sha}
  client=self.client()
  with patch.object(m,'pdf_documents',return_value=iter([(row,payload)])):self.assertEqual(m.archive_documents(client,self.key,self.root,self.root),1)
  with patch.object(m,'pdf_documents',return_value=iter([(row,payload)])):self.assertEqual(m.archive_documents(client,self.key,self.root,self.root),0)
  self.assertEqual(client.put_object.call_count,1);state=json.loads((self.root/'documents.json').read_text());self.assertEqual(next(iter(state.values()))['kind'],'invoice_preview')
 def test_failed_document_upload_does_not_mark_complete(self):
  client=Mock();client.put_object.side_effect=RuntimeError('synthetic');row={'company':'x','id':'y','sha256':'a'*64}
  with patch.object(m,'pdf_documents',return_value=iter([(row,b'%PDF-'+b'x'*100)])):
   with self.assertRaises(RuntimeError):m.archive_documents(client,self.key,self.root,self.root)
  self.assertFalse((self.root/'documents.json').exists())
 def test_restore_only_runs_in_disposable_networkless_container(self):
  calls=[]
  def fake(args,**kwargs):
   calls.append(args)
   if args[-1].startswith('SELECT json_agg'):return b'["postgres"]'
   return b''
  with patch.object(m,'command',side_effect=fake):m.restore_drill(self.source,{'databases':['postgres']})
  create=calls[0];self.assertEqual(create[create.index('--network')+1],'none');self.assertIn('POSTGRES_DB=postgres',create);name=create[create.index('--name')+1];self.assertTrue(name.startswith('bringness-recovery-'));self.assertTrue(any(x[:3]==['docker','exec','-i'] and x[3]==name for x in calls));self.assertEqual(calls[-1],['docker','rm','-f',name])

class RecoveryWrapTest(unittest.TestCase):
 def test_password_wrap_recovers_exact_key_and_rejects_wrong_password_or_tamper(self):
  key=os.urandom(32);password='Synthetic-only-long-recovery-passphrase';wrapped=m.wrap_key(key,password)
  self.assertEqual(m.unwrap_key(wrapped,password),key)
  self.assertNotIn(key,wrapped)
  for data,pw in [(wrapped,password+'wrong'),(wrapped[:-1]+bytes([wrapped[-1]^1]),password),(wrapped[:-2],password)]:
   with self.assertRaises(Exception):m.unwrap_key(data,pw)
  with self.assertRaises(ValueError):m.wrap_key(key,'short')

if __name__=='__main__':unittest.main()

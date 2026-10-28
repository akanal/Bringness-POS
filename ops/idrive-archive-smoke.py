"""Disposable real PostgreSQL recovery acceptance; fake object store, no provider calls."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import uuid
from unittest.mock import Mock
spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('idrive-archive.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
name='bringness-archive-ci-'+uuid.uuid4().hex[:12];created=False
try:
 m.command(['docker','run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=postgres','postgres:16'],timeout=180);created=True
 for attempt in range(60):
  try:m.command(['docker','exec',name,'pg_isready','-U','postgres'],timeout=5);break
  except Exception:time.sleep(1)
 else:raise RuntimeError('source not ready')
 m.db_sql('CREATE DATABASE archive_fixture',name)
 m.db_sql("CREATE TABLE recovery_fixture(id integer PRIMARY KEY, body text NOT NULL);INSERT INTO recovery_fixture VALUES(1,'synthetic exact recovery');",name,'archive_fixture')
 m.db_sql("CREATE TABLE shop_invoice_preview_files(company_id uuid,checkout_id uuid PRIMARY KEY,pdf_sha256 text,pdf bytea);",name,'archive_fixture')
 pdf=b'%PDF-'+b'synthetic-preview'*10;sha=__import__('hashlib').sha256(pdf).hexdigest()
 m.db_sql("INSERT INTO shop_invoice_preview_files VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','"+sha+"',decode('"+pdf.hex()+"','hex'));",name,'archive_fixture')
 with tempfile.TemporaryDirectory() as work:
  root=Path(work);key=os.urandom(32);sql=root/'cluster.sql';m.dump_cluster(sql,name);bundle=root/'bundle';m.bundle_backup(sql,bundle,{});encrypted=root/'encrypted';m.encrypt(bundle,encrypted,key)
  client=Mock();stored={}
  def put(**args):stored[args['Key']]=args['Body'].read()
  client.put_object.side_effect=put;client.get_object.side_effect=lambda **args:{'Body':io.BytesIO(stored[args['Key']]),'ServerSideEncryption':'AES256'}
  readback=m.upload_verified(client,encrypted,'backups/ci.bnenc',root);restored_bundle=root/'verified';m.decrypt(readback,restored_bundle,key);restored=root/'restored.sql';m.verified_sql(restored_bundle,restored)
  def verify(container,admin):
   value=m.command(['docker','exec',container,'psql','-X','-qAt','-U',admin,'-d','archive_fixture','-c','SELECT body FROM recovery_fixture WHERE id=1']).strip()
   assert value==b'synthetic exact recovery'
   value=m.command(['docker','exec',container,'psql','-X','-qAt','-U',admin,'-d','archive_fixture','-c',"SELECT encode(pdf,'hex') FROM shop_invoice_preview_files"]).strip()
   assert value.decode()==pdf.hex()
  m.restore_drill(restored,m.cluster_facts(name),verify)
  assert m.archive_documents(client,key,root,root,name)==1
  assert m.archive_documents(client,key,root,root,name)==0
  state=json.loads((root/'documents.json').read_text());assert len(state)==1
 print('PASS: real PostgreSQL cluster dump, encrypted upload/readback, authenticated decryption, separate networkless restore with exact row/PDF, PDF archive and durable replay. Synthetic data only.')
finally:
 if created:m.command(['docker','rm','-f','-v',name],timeout=60)

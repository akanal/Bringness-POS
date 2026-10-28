#!/usr/bin/env python3
"""Root-only secondary archive; no public routes, deletion or live database restore."""
import argparse
import datetime as dt
import fcntl
import hashlib
import getpass
import warnings
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import tempfile
import time
import tarfile
import uuid
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

spec=importlib.util.spec_from_file_location('bootstrap',Path(__file__).with_name('configure-idrive-documents.py'))
bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
ROOT=Path('/opt/bringness-pos/config')
STATE=Path('/var/lib/bringness-idrive')
MAGIC=b'BRINGNESS-IDRIVE-ARCHIVE-1\n'
MAX=4*1024**3
PHASE='Vorbereitung'


def private_read(path,limit):
    path=Path(path);bootstrap.check_parent(path)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077 or info.st_nlink!=1 or info.st_size>limit:raise ValueError('unsafe-file')
        return stream.read(limit+1)


def recovery_key(path):
    path=Path(path);bootstrap.check_parent(path)
    try:fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    except FileExistsError:pass
    else:
        with os.fdopen(fd,'wb') as stream:stream.write(secrets.token_bytes(32));stream.flush();os.fsync(stream.fileno())
    key=private_read(path,32)
    if len(key)!=32:raise ValueError('invalid-key')
    return key


WRAP_MAGIC=b'BRINGNESS-RECOVERY-KEY-1\n'


def wrap_key(key,passphrase):
    if not isinstance(passphrase,str) or not 20<=len(passphrase)<=512 or len(key)!=32:raise ValueError('recovery-passphrase')
    salt=secrets.token_bytes(16);nonce=secrets.token_bytes(12)
    wrapping=hashlib.pbkdf2_hmac('sha256',passphrase.encode(),salt,600000,32)
    return WRAP_MAGIC+salt+nonce+AESGCM(wrapping).encrypt(nonce,key,WRAP_MAGIC)


def unwrap_key(data,passphrase):
    offset=len(WRAP_MAGIC)
    if not data.startswith(WRAP_MAGIC) or len(data)!=offset+16+12+48:raise ValueError('recovery-envelope')
    salt=data[offset:offset+16];nonce=data[offset+16:offset+28]
    wrapping=hashlib.pbkdf2_hmac('sha256',passphrase.encode(),salt,600000,32)
    return AESGCM(wrapping).decrypt(nonce,data[offset+28:],WRAP_MAGIC)


def prepare_recovery():
    if not __import__('sys').stdin.isatty():raise ValueError('interactive-console-required')
    key=recovery_key(ROOT/'idrive-recovery.key');key_sha=hashlib.sha256(key).hexdigest();receipt=STATE/'recovery-ready.json'
    if receipt.exists():
        value=json.loads(private_read(receipt,4096))
        if value.get('keySha256')!=key_sha:raise ValueError('recovery-key-mismatch')
        print('Vorhandener Wiederherstellungsschutz bleibt erhalten.');return
    print('Einmaliges NEUES Wiederherstellungspasswort waehlen (mindestens20 Zeichen).')
    print('In deinem Passwortmanager speichern. Nicht das IDrive-Passwort verwenden. Nicht in den Chat senden.')
    with warnings.catch_warnings():
        warnings.simplefilter('error',getpass.GetPassWarning)
        passphrase=getpass.getpass('Neues Wiederherstellungspasswort (verdeckt): ')
        confirmation=getpass.getpass('Wiederholen (verdeckt): ')
    if passphrase!=confirmation:raise ValueError('recovery-passphrase-mismatch')
    wrapped=wrap_key(key,passphrase)
    config=bootstrap.read_config(bootstrap.CONFIG);client=bootstrap.make_client(config['access_key_id'],config['secret_access_key'])
    try:
        bootstrap.verify_bucket_policy(client)
        with tempfile.TemporaryDirectory(dir=STATE,prefix='recovery-') as work:
            source=Path(work)/'recovery.bnenc';source.write_bytes(wrapped);source.chmod(0o600)
            object_key='backups/recovery/'+key_sha[:16]+'-'+uuid.uuid4().hex+'.bnenc'
            readback=upload_verified(client,source,object_key,work)
            if not secrets.compare_digest(unwrap_key(readback.read_bytes(),passphrase),key):raise ValueError('recovery-key-roundtrip')
        value={'version':1,'keySha256':key_sha,'object':object_key,'wrappedSha256':hashlib.sha256(wrapped).hexdigest()}
        fd=os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as out:json.dump(value,out);out.flush();os.fsync(out.fileno())
        print('PASS: Wiederherstellungsschluessel mit deinem Passwort geschuetzt in IDrive abgelegt und geprueft.')
    finally:client.close()


def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(1024**2),b''):h.update(block)
    return h.hexdigest()


def encrypt(source,target,key):
    nonce=secrets.token_bytes(12);cipher=Cipher(algorithms.AES(key),modes.GCM(nonce)).encryptor();cipher.authenticate_additional_data(MAGIC)
    with open(source,'rb') as src,open(target,'xb') as dest:
        os.chmod(target,0o600);dest.write(MAGIC+nonce);size=0
        for block in iter(lambda:src.read(1024**2),b''):
            size+=len(block)
            if size>MAX:raise ValueError('archive-too-large')
            dest.write(cipher.update(block))
        dest.write(cipher.finalize());dest.write(cipher.tag);dest.flush();os.fsync(dest.fileno())


def decrypt(source,target,key):
    # Keep unauthenticated plaintext private; publish only after the GCM tag passes.
    source,target=Path(source),Path(target)
    if target.exists() or target.is_symlink():raise FileExistsError()
    with tempfile.TemporaryDirectory(dir=target.parent,prefix='.restore-') as work:
        tmp=Path(work)/'verified';size=source.stat().st_size
        with open(source,'rb') as src,open(tmp,'xb') as dest:
            os.chmod(tmp,0o600)
            if src.read(len(MAGIC))!=MAGIC or size<len(MAGIC)+28 or size>MAX+len(MAGIC)+28:raise ValueError('bad-envelope')
            nonce=src.read(12);src.seek(-16,2);tag=src.read(16);src.seek(len(MAGIC)+12)
            cipher=Cipher(algorithms.AES(key),modes.GCM(nonce,tag)).decryptor();cipher.authenticate_additional_data(MAGIC)
            remaining=size-len(MAGIC)-28
            while remaining:
                block=src.read(min(1024**2,remaining))
                if not block:raise ValueError('truncated')
                dest.write(cipher.update(block));remaining-=len(block)
            dest.write(cipher.finalize());dest.flush();os.fsync(dest.fileno())
        os.link(tmp,target,follow_symlinks=False)


def command(args,*,output=None,input_file=None,timeout=1800):
    # Provider/database command output is never printed: dumps may contain secrets.
    result=subprocess.run(args,stdin=input_file,stdout=output if output is not None else subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=timeout,check=True)
    return result.stdout


def db_sql(sql,container='bringness-db',database=''):
    # SQL is supplied only by this module; POSTGRES_USER is expanded inside the container.
    return command(['docker','exec',container,'sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${2:-${POSTGRES_DB:-postgres}}" -c "$1"','sh',sql,database],timeout=120)


def dump_cluster(path,container='bringness-db'):
    with open(path,'xb') as out:
        os.chmod(path,0o600)
        command(['docker','exec',container,'sh','-c','exec pg_dumpall -U "${POSTGRES_USER:-postgres}"'],output=out)
    if Path(path).stat().st_size<100:raise ValueError('empty-dump')


def cluster_facts(container='bringness-db'):
    # Database names/counts only; no user data. Each pg_dump database is a consistent
    # snapshot; pg_dumpall is not a single transaction across different databases.
    raw=db_sql("SELECT json_build_object('databases',coalesce(json_agg(datname ORDER BY datname),'[]'),'serverVersion',current_setting('server_version_num')::integer) FROM pg_database WHERE NOT datistemplate",container)
    value=json.loads(raw)
    if not isinstance(value.get('databases'),list) or not value['databases']:raise ValueError('cluster-facts')
    return value


def bundle_backup(sql,target,configuration=None):
    files=configuration if configuration is not None else {
        'pos-app.env':Path('/opt/bringness-pos/config/app.env'),
        'platform-app.env':Path('/opt/bringness/config/app.env'),
        'Caddyfile':Path('/etc/caddy/Caddyfile'),
        'idrive-documents.json':bootstrap.CONFIG,
    }
    with tarfile.open(target,'x') as archive:
        os.chmod(target,0o600);archive.add(sql,arcname='cluster.sql',recursive=False)
        for label,path in files.items():
            if not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}',label):raise ValueError('configuration-label')
            path=Path(path)
            if path.resolve()!=path or path.is_symlink():raise ValueError('linked-configuration')
            info=path.stat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o022 or info.st_size>1048576:raise ValueError('unsafe-configuration')
            if path.name=='idrive-recovery.key':raise ValueError('recovery-key-must-stay-separate')
            archive.add(path,arcname='configuration/'+label,recursive=False)


def verified_sql(bundle,target):
    with tarfile.open(bundle,'r') as archive:
        entries=archive.getmembers();names=[entry.name for entry in entries]
        if len(names)!=len(set(names)) or 'cluster.sql' not in names:raise ValueError('archive-members')
        for entry in entries:
            if not entry.isfile() or not re.fullmatch(r'cluster\.sql|configuration/[A-Za-z0-9_.-]{1,80}',entry.name) or entry.size>MAX:raise ValueError('archive-member')
        member=archive.getmember('cluster.sql')
        with archive.extractfile(member) as src,open(target,'xb') as dest:
            os.chmod(target,0o600)
            for block in iter(lambda:src.read(1024**2),b''):dest.write(block)


def restore_image(facts):
    major=int(facts.get('serverVersion',160000))//10000
    if major not in (13,14,15,16,17,18):raise ValueError('unsupported-postgres-major')
    return 'postgres:'+str(major)


def restore_drill(sql,expected,verify=None):
    name='bringness-recovery-'+uuid.uuid4().hex[:12];admin='recovery_'+uuid.uuid4().hex[:12];created=False
    try:
        command(['docker','run','-d','--name',name,'--network','none','--memory','1g','--cpus','1','--tmpfs','/var/lib/postgresql/data:rw,size=4g','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER='+admin,'-e','POSTGRES_DB=postgres',restore_image(expected)],timeout=180);created=True
        for attempt in range(60):
            try:command(['docker','exec',name,'pg_isready','-U',admin],timeout=5);break
            except subprocess.CalledProcessError:time.sleep(1)
        else:raise ValueError('restore-not-ready')
        with open(sql,'rb') as stream:
            command(['docker','exec','-i',name,'psql','-X','-v','ON_ERROR_STOP=1','-U',admin,'-d','postgres'],input_file=stream)
        raw=command(['docker','exec',name,'psql','-X','-qAt','-U',admin,'-d','postgres','-c',"SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate"],timeout=60)
        if json.loads(raw)!=expected['databases']:raise ValueError('restore-databases-mismatch')
        if verify is not None:verify(name,admin)
    finally:
        if created:command(['docker','rm','-f',name],timeout=60)


def upload_verified(client,source,key,work):
    if not re.fullmatch(r'(backups|documents)/[a-zA-Z0-9/_.-]{1,240}\.bnenc',key):raise ValueError('object-key')
    size=Path(source).stat().st_size;sha=digest(source)
    with open(source,'rb') as stream:
        client.put_object(Bucket=bootstrap.BUCKET,Key=key,Body=stream,ContentLength=size,IfNoneMatch='*',ServerSideEncryption='AES256',ContentType='application/octet-stream',Metadata={'sha256':sha,'format':'bringness-encrypted-archive-v1'})
    response=client.get_object(Bucket=bootstrap.BUCKET,Key=key);body=response['Body'];received=0;h=hashlib.sha256();target=Path(work)/('readback-'+uuid.uuid4().hex)
    try:
        with open(target,'xb') as out:
            os.chmod(target,0o600)
            while True:
                block=body.read(min(1024**2,size-received+1))
                if not block:break
                received+=len(block)
                if received>size:raise ValueError('readback-too-long')
                h.update(block);out.write(block)
    finally:body.close()
    if received!=size or h.hexdigest()!=sha or response.get('ServerSideEncryption')!='AES256':raise ValueError('readback-mismatch')
    return target


def pdf_documents_in_database(database,container='bringness-db'):
    exists=db_sql("SELECT to_regclass('public.shop_invoice_preview_files') IS NOT NULL",container,database).strip()
    if exists!=b't':return
    last='00000000-0000-0000-0000-000000000000'
    while True:
        # Bound every result to one PDF; never render or issue a new invoice.
        raw=db_sql("SELECT json_build_object('company',company_id,'id',checkout_id,'sha256',pdf_sha256,'pdf',encode(pdf,'hex')) FROM shop_invoice_preview_files WHERE checkout_id>'"+last+"'::uuid ORDER BY checkout_id LIMIT 1",container,database).strip()
        if not raw:break
        row=json.loads(raw)
        for name in ('company','id'):
            if str(uuid.UUID(row[name]))!=row[name]:raise ValueError('document-id')
        payload=bytes.fromhex(row['pdf'])
        if not 100<=len(payload)<=2097152 or not payload.startswith(b'%PDF-') or hashlib.sha256(payload).hexdigest()!=row['sha256']:raise ValueError('document-digest')
        last=row['id'];row['database']=hashlib.sha256(database.encode()).hexdigest()[:16];yield row,payload


def pdf_documents(container='bringness-db'):
    for database in cluster_facts(container)['databases']:
        yield from pdf_documents_in_database(database,container)


def archive_documents(client,key,work,state,container='bringness-db'):
    done_path=Path(state)/'documents.json';done=json.loads(private_read(done_path,8*1024**2)) if done_path.exists() else {}
    count=0
    for row,payload in pdf_documents(container):
        identity=(row.get('database','default')+'/')+row['company']+'/'+row['id']+'/'+row['sha256']
        if identity in done:continue
        source=Path(work)/('document-'+uuid.uuid4().hex);source.write_bytes(payload);source.chmod(0o600);encrypted=source.with_suffix('.bnenc');encrypt(source,encrypted,key)
        # Retry creates an additional immutable encrypted copy; never overwrites/deletes.
        object_key='documents/invoice-previews/'+identity+'/'+uuid.uuid4().hex+'.bnenc'
        readback=upload_verified(client,encrypted,object_key,work);restored=source.with_suffix('.verified');decrypt(readback,restored,key)
        if digest(restored)!=row['sha256']:raise ValueError('document-restore')
        done[identity]={'object':object_key,'kind':'invoice_preview','sha256':row['sha256']};count+=1
        for path in (source,encrypted,readback,restored):path.unlink()
    temporary=Path(state)/('documents-'+uuid.uuid4().hex)
    with open(temporary,'x') as stream:os.chmod(temporary,0o600);json.dump(done,stream);stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,done_path)
    return count


def run(config_path=bootstrap.CONFIG,root=ROOT,state=STATE):
    global PHASE
    os.umask(0o077)
    root,state=Path(root),Path(state)
    for directory in (root,state):
        if directory.is_symlink() or directory.resolve()!=directory:raise ValueError('linked-directory')
        info=directory.stat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&(0o077 if directory==state else 0o022):raise ValueError('unsafe-directory')
    fd=os.open(state/'run.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        config=bootstrap.read_config(config_path);key=recovery_key(root/'idrive-recovery.key');recovery=json.loads(private_read(state/'recovery-ready.json',4096))
        if recovery.get('keySha256')!=hashlib.sha256(key).hexdigest():raise ValueError('recovery-not-ready')
        client=bootstrap.make_client(config['access_key_id'],config['secret_access_key'])
        try:
            PHASE='Verbindung und Bucket-Regeln';bootstrap.probe(client,bootstrap.AnonymousClient(),additional_anonymous=bootstrap.AnonymousClient(virtual_host=True))
            with tempfile.TemporaryDirectory(dir=state,prefix='run-') as work:
                PHASE='Datenbank sichern';sql=Path(work)/'cluster.sql';facts=cluster_facts();dump_cluster(sql)
                PHASE='Verschluesseln';bundle=Path(work)/'backup.tar';bundle_backup(sql,bundle);encrypted=Path(work)/'cluster.bnenc';encrypt(bundle,encrypted,key)
                now=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ');object_key='backups/netcup/'+now+'-'+uuid.uuid4().hex+'.bnenc'
                PHASE='Cloud-Sicherung pruefen';readback=upload_verified(client,encrypted,object_key,work);restored_bundle=Path(work)/'restored.tar';decrypt(readback,restored_bundle,key)
                if digest(bundle)!=digest(restored_bundle):raise ValueError('bundle-digest')
                restored=Path(work)/'restored.sql';verified_sql(restored_bundle,restored)
                if digest(restored)!=digest(sql):raise ValueError('restore-digest')
                PHASE='Isolierte Wiederherstellung';restore_drill(restored,facts)
                PHASE='PDF-Archiv';documents=archive_documents(client,key,work,state)
                result={'version':1,'at':now,'backupObject':object_key,'encryptedSha256':digest(encrypted),'sourceSha256':digest(sql),'databaseRestore':'passed','databases':facts['databases'],'newPreviewPdfs':documents,'recoveryObject':recovery['object']}
                # Remote manifest contains no key and is itself encrypted.
                manifest=Path(work)/'manifest.json';manifest.write_text(json.dumps(result));manifest.chmod(0o600);manifest_enc=Path(work)/'manifest.bnenc';encrypt(manifest,manifest_enc,key);upload_verified(client,manifest_enc,'backups/netcup/'+now+'-'+uuid.uuid4().hex+'-manifest.bnenc',work)
                temporary=state/'last-success.next';temporary.write_text(json.dumps(result)+'\n');temporary.chmod(0o600);os.replace(temporary,state/'last-success.json')
                print('PASS: Verschluesselte Cloud-Sicherung zurueckgelesen, entschluesselt und in separater Datenbank wiederhergestellt.')
                print('Neue vorhandene Vorschau-PDFs archiviert: '+str(documents)+'. Keine Rechnung neu ausgestellt.')
        finally:client.close()


if __name__=='__main__':
    try:
        parser=argparse.ArgumentParser();parser.add_argument('operation',choices=('run','prepare'));args=parser.parse_args()
        if os.geteuid()!=0:raise ValueError('root-required')
        if args.operation=='prepare':
            prepare_recovery();raise SystemExit(0)
        operation_fd=os.open('/run/bringness-operations.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
        with os.fdopen(operation_fd,'w') as operation_lock:
            fcntl.flock(operation_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            run()
    except (Exception,KeyboardInterrupt):
        print('Nicht abgeschlossen. Schritt: '+PHASE+'. Private Diagnose pruefen; keine geheimen Details ausgegeben.',file=__import__('sys').stderr);raise SystemExit(1)

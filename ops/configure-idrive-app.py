#!/usr/bin/env python3
"""Stage protected app environment from existing protected IDrive credentials."""
import importlib.util
import os
from pathlib import Path
import re
import stat
import sys
spec=importlib.util.spec_from_file_location('bootstrap',Path(__file__).with_name('configure-idrive-documents.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
APP=Path('/opt/bringness-pos/config/app.env')
NAMES=('SHOP_DOCUMENT_STORAGE','SHOP_IDRIVE_ACCESS_KEY_ID','SHOP_IDRIVE_SECRET_ACCESS_KEY')
def stage(output,app=APP,config=m.CONFIG):
 app,output=Path(app),Path(output);m.check_parent(app);m.check_parent(output)
 fd=os.open(app,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  info=os.fstat(stream.fileno())
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077 or info.st_nlink!=1 or info.st_size>1024**2:raise ValueError('unsafe-app-env')
  original=stream.read(1024**2+1).decode('utf-8')
 credentials=m.read_config(config)
 values=dict(SHOP_DOCUMENT_STORAGE='idrive',SHOP_IDRIVE_ACCESS_KEY_ID=credentials['access_key_id'],SHOP_IDRIVE_SECRET_ACCESS_KEY=credentials['secret_access_key'])
 found={};kept=[]
 for line in original.splitlines(keepends=True):
  match=re.match(r'^([A-Z0-9_]+)=(.*?)(?:\r?\n)?$',line)
  if match and match[1] in NAMES:
   name,value=match[1],match[2]
   if name in found or value!=values[name] and not(name=='SHOP_DOCUMENT_STORAGE' and value=='disabled'):raise ValueError('existing-storage-conflict')
   found[name]=value
  else:
   if any(line.lstrip().startswith(name) for name in NAMES):raise ValueError('ambiguous-storage-config')
   kept.append(line)
 content=''.join(kept)
 if content and not content.endswith('\n'):content+='\n'
 content+=''.join(name+'='+values[name]+'\n' for name in NAMES)
 fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
 return output
if __name__=='__main__':
 try:
  if os.geteuid()!=0 or len(sys.argv)!=3 or sys.argv[1]!='stage':raise ValueError('explicit-root-stage-required')
  stage(sys.argv[2]);print('Geschuetzte App-Konfiguration vorbereitet. Keine Zugangsdaten ausgegeben.')
 except Exception:
  print('App-Konfiguration nicht geaendert. Geschuetzte Dateien, Rechte und vorhandene Speichereinstellung pruefen; keine geheimen Details ausgegeben.',file=sys.stderr);raise SystemExit(1)

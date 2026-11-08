import io
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
MOCK = r"""#!/usr/bin/env python3
import sys,os,json,tarfile,io
from pathlib import Path
name=Path(sys.argv[0]).name
args=sys.argv[1:]
statefile=Path(os.environ['MOCK_STATE'])
state=json.loads(statefile.read_text())
state.setdefault('calls',[]).append([name]+args)
def save():statefile.write_text(json.dumps(state))
if name=='docker':
    command=args[0]
    if command=='inspect':
        c=state['containers'].get(args[-1])
        if not c:save();sys.exit(1)
        print(c['port'] if 'HostPort' in args[2] else c['status'])
    elif command=='run' and '-d' in args:
        container=args[args.index('--name')+1]
        port=args[args.index('-p')+1].split(':')[1]
        state['containers'][container]={'port':port,'status':'running'}
    elif command=='rename':
        state['containers'][args[2]]=state['containers'].pop(args[1])
    elif command in ['start','stop']:
        state['containers'][args[1]]['status']='running' if command=='start' else 'exited'
    elif command=='rm':
        state['containers'].pop(args[-1],None)
    elif command=='logs':print('download pricing ready.')
elif name=='curl':
    if '-o' in args:
        dest=args[args.index('-o')+1]
        with tarfile.open(dest,'w:gz') as tf:
            for f in ['package.json','server/test.js','db/schema.sql','apps/web/index.html']:
                content=b'{}'
                info=tarfile.TarInfo('source/'+f);info.size=len(content);tf.addfile(info,io.BytesIO(content))
    elif any(a.startswith('https://bringness-pos.de') for a in args) and state.get('fail_public'):
        save();sys.exit(22)
    else:print('{}')
save()
"""

class OperationsTest(unittest.TestCase):
    def deploy(self, fail_public=False, source_transfer=False, bad_source=False):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            bins=root/'bin';bins.mkdir()
            helper=bins/'mock';helper.write_text(MOCK);helper.chmod(0o700)
            for command in ['docker','curl','systemctl','caddy']:(bins/command).symlink_to(helper)
            for path in ['opt/bringness/config','opt/bringness/backups','opt/bringness-pos/config','etc/caddy','run']:
                (root/path).mkdir(parents=True,exist_ok=True)
            (root/'opt/bringness/config/backup.sh').write_text('#!/bin/sh\nexit 0\n')
            (root/'opt/bringness-pos/config/app.env').write_text('PRIVATE_SECRET=do-not-print-this\n')
            caddy=root/'etc/caddy/Caddyfile'
            original='bringness-pos.de { reverse_proxy 127.0.0.1:3005 }\nbringness-ai.com { reverse_proxy 127.0.0.1:3000 }\n'
            caddy.write_text(original)
            state=root/'state.json'
            state.write_text(json.dumps({'containers':{'bringness-pos':{'port':'3005','status':'running'}},'fail_public':fail_public}))
            script=(ROOT/'netcup-command.sh').read_text().replace('/usr/local/lib/bringness/netcup-source.py',str(ROOT/'netcup-source.py'))
            for prefix in ['/opt/bringness','/etc/caddy','/var/log/bringness-operations','/run/bringness-operations.lock']:
                script=script.replace(prefix,str(root)+prefix)
            script=script.replace('export PATH=','export PATH='+str(bins)+':')
            executable=root/'operate.sh';executable.write_text(script)
            env={**os.environ,'SSH_ORIGINAL_COMMAND':'deploy pos '+'a'*40,'MOCK_STATE':str(state)}
            payload=None
            if source_transfer:
                out=io.BytesIO()
                with tarfile.open(fileobj=out,mode='w:gz',format=tarfile.PAX_FORMAT,pax_headers={'comment':'a'*40}) as tf:
                    for name in ['package.json','server/start.js','apps/web/public/pos/index.html','db/schema.sql']:
                        info=tarfile.TarInfo('source/'+name);info.size=2;tf.addfile(info,io.BytesIO(b'{}'))
                payload=out.getvalue()
                digest='0'*64 if bad_source else hashlib.sha256(payload).hexdigest()
                env['SSH_ORIGINAL_COMMAND']='deploy-source pos '+'a'*40+' '+digest+' '+str(len(payload))
            result=subprocess.run(['bash',str(executable)],env=env,input=payload.decode('latin1') if payload else None,capture_output=True,text=True,encoding='latin1')
            containers=json.loads(state.read_text())['containers']
            self.assertNotIn('do-not-print-this',result.stdout+result.stderr)
            if source_transfer:
                self.assertFalse(any("codeload.github.com" in " ".join(call) for call in json.loads(state.read_text())["calls"]))
            if fail_public or bad_source:
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(caddy.read_text(),original)
                self.assertEqual(containers,{'bringness-pos':{'port':'3005','status':'running'}})
            else:
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertEqual(containers['bringness-pos'],{'port':'3006','status':'running'})
                self.assertIn('127.0.0.1:3006',caddy.read_text())
                self.assertIn('127.0.0.1:3000',caddy.read_text())
                self.assertTrue(any(k.startswith('bringness-pos-previous-') and v['status']=='exited' for k,v in containers.items()))

    def test_success_keeps_previous_container_and_changes_only_pos_proxy(self):
        self.deploy()

    def test_failed_public_health_check_restores_proxy_and_keeps_old_app_running(self):
        self.deploy(fail_public=True)

    def test_uploaded_source_deploys_without_public_github_download(self):
        self.deploy(source_transfer=True)

    def test_invalid_uploaded_source_preserves_the_running_application(self):
        self.deploy(source_transfer=True,bad_source=True)

    def test_uploaded_source_health_failure_rolls_back(self):
        self.deploy(source_transfer=True,fail_public=True)

    def test_invalid_ssh_command_cannot_run_shell_fragments(self):
        result=subprocess.run(['bash',str(ROOT/'netcup-command.sh')],env={**os.environ,'SSH_ORIGINAL_COMMAND':'status all; echo hacked'},capture_output=True,text=True)
        self.assertEqual(result.returncode,64)
        self.assertNotIn('hacked',result.stdout)

if __name__=='__main__':
    unittest.main()

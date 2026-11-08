import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github/workflows/netcup-operations.yml"
SCRIPT = textwrap.dedent(WORKFLOW.read_text().split("- name: Run authenticated server operation", 1)[1].split("run: |\n", 1)[1])
MOCK_SSH = '''#!/usr/bin/env python3
import json,os,pathlib,sys
p=pathlib.Path(os.environ['MOCK_SSH_STATE']);events=json.loads(p.read_text());command=sys.argv[-1];events.append(command);p.write_text(json.dumps(events))
if command.startswith('status '):
 print('Source transfer: ssh-archive-v1' if os.environ['MOCK_CAPABILITY']=='yes' else 'bringness-pos: running')
elif command.startswith('deploy-source '):
 pathlib.Path(os.environ['MOCK_SSH_UPLOAD']).write_bytes(sys.stdin.buffer.read())
 print('Fixture deploy completed')
else: print('Fixture operation completed')
'''


class WorkflowTest(unittest.TestCase):
    def execute(self, capability=True, operation="deploy", target="pos"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.DEVNULL)
            git("init")
            (root / "fixture").write_text("Synthetic private source")
            git("add", "fixture")
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture")
            revision = git("rev-parse", "HEAD").decode().strip()
            bins = root / "bin"
            bins.mkdir()
            ssh = bins / "ssh"
            ssh.write_text(MOCK_SSH)
            ssh.chmod(0o700)
            state, upload = root / "state.json", root / "received.tgz"
            state.write_text("[]")
            env = {**os.environ, "PATH": str(bins) + ":" + os.environ["PATH"],
                   "NETCUP_SSH_KEY": "synthetic-private-key", "NETCUP_KNOWN_HOSTS": "synthetic-host",
                   "OPERATION": operation, "TARGET": target, "REVISION": revision,
                   "MOCK_SSH_STATE": str(state), "MOCK_SSH_UPLOAD": str(upload),
                   "MOCK_CAPABILITY": "yes" if capability else "no"}
            result = subprocess.run(["bash", "-c", SCRIPT], cwd=root, env=env, input=b"", capture_output=True)
            self.assertNotIn(b"synthetic-private-key", result.stdout + result.stderr)
            events = json.loads(state.read_text())
            if operation != "deploy":
                self.assertEqual(result.returncode, 0)
                self.assertEqual(events, [operation + " " + target])
                self.assertFalse(upload.exists())
            elif not capability:
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(events, ["status " + target])
                self.assertFalse(upload.exists())
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(events[0], "status " + target)
                parts = events[1].split()
                data = upload.read_bytes()
                self.assertEqual(parts[:3], ["deploy-source", target, revision])
                self.assertEqual(parts[3], hashlib.sha256(data).hexdigest())
                self.assertEqual(int(parts[4]), len(data))
                with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as source:
                    self.assertEqual(source.pax_headers["comment"], revision)
                    self.assertEqual(source.extractfile("source/fixture").read(), b"Synthetic private source")

    def test_uploads_exact_archive_over_ssh(self):
        self.execute()

    def test_ai_uses_the_same_private_transport(self):
        self.execute(target="ai")

    def test_old_handler_stops_before_any_deploy(self):
        self.execute(capability=False)

    def test_backup_remains_unchanged(self):
        self.execute(operation="backup", target="all")


if __name__ == "__main__":
    unittest.main()

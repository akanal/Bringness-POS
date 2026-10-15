import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent

class SandboxPreflightTests(unittest.TestCase):
    def test_rejects_missing_read_only_flag(self):
        result = subprocess.run(["bash", str(ROOT / "netcup-sandbox-preflight.sh")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 64)
        self.assertIn("Use --read-only", result.stdout + result.stderr)

    def test_socket_inspection_failure_is_not_reported_as_free(self):
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = Path(tmp)
            docker = bin_dir / "docker"
            docker.write_text("#!/bin/sh\\nexit 0\\n")
            docker.chmod(0o755)
            ss = bin_dir / "ss"
            ss.write_text("#!/bin/sh\\nexit 1\\n")
            ss.chmod(0o755)
            env = {**os.environ, "PATH": str(bin_dir) + ":" + os.environ["PATH"]}
            result = subprocess.run(["bash", str(ROOT / "netcup-sandbox-preflight.sh"), "--read-only"], capture_output=True, text=True, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("unknown (socket inspection failed)", result.stdout)
            self.assertNotIn("no TCP listener observed", result.stdout)
    def test_inspects_without_mutating_or_printing_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = Path(tmp)
            calls = bin_dir / "calls.txt"
            docker = bin_dir / "docker"
            docker.write_text("""#!/bin/sh
printf '%s\\n' "$*" >> "$SANDBOX_TEST_CALLS"
case "$1" in inspect) exit 0;; network) exit 0;; *) exit 90;; esac
""")
            docker.chmod(0o755)
            ss = bin_dir / "ss"
            ss.write_text("#!/bin/sh\necho 'State Recv-Q Send-Q Local Address:Port Peer Address:Port'\n")
            ss.chmod(0o755)
            env = {**os.environ, "PATH": str(bin_dir) + ":" + os.environ["PATH"], "SANDBOX_TEST_CALLS": str(calls)}
            result = subprocess.run(["bash", str(ROOT / "netcup-sandbox-preflight.sh"), "--read-only"], capture_output=True, text=True, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("No containers, databases, services or files were changed.", result.stdout)
            self.assertNotIn("SECRET", result.stdout)
            invoked = calls.read_text().splitlines()
            self.assertEqual(invoked, ["inspect bringness-pos", "inspect bringness-app", "inspect bringness-db", "network inspect bringness-internal"])

if __name__ == "__main__":
    unittest.main()

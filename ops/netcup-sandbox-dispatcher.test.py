import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent

class DispatcherTests(unittest.TestCase):
    def run_dispatch(self, command):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / "preflight.sh"
            fake.write_text("#!/bin/sh\nprintf '%s\\n' \"$1\"\n")
            fake.chmod(0o755)
            script = (ROOT / "netcup-sandbox-dispatcher.sh").read_text().replace(
                "/usr/local/libexec/bringness/netcup-sandbox-preflight.sh", str(fake)
            )
            dispatch = Path(tmp) / "dispatch.sh"
            dispatch.write_text(script)
            return subprocess.run(["bash", str(dispatch)], env={**os.environ, "SSH_ORIGINAL_COMMAND": command},
                                  capture_output=True, text=True)
    def test_only_exact_read_only_operation(self):
        result = self.run_dispatch("sandbox-preflight read-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "--read-only")
    def test_rejects_injected_and_mutating_commands(self):
        for cmd in ["sandbox-preflight read-only; reboot", "sandbox-preflight read-only && whoami",
                    "sandbox-preflight", "sandbox-preflight write", "deploy pos", "status all", ""]:
            with self.subTest(cmd=cmd):
                result = self.run_dispatch(cmd)
                self.assertEqual(result.returncode, 64)
                self.assertIn("Unsupported sandbox operation", result.stderr)

if __name__ == "__main__":
    unittest.main()

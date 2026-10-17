import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent

class NetcupSandboxCommandTests(unittest.TestCase):
    def run_command(self, original):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            helper = root / "sandbox-preflight.sh"
            helper.write_text("#!/bin/sh\nprintf '%s\\n' \"$1\"\n")
            helper.chmod(0o700)
            script = (ROOT / "netcup-command.sh").read_text().replace(
                "/usr/local/libexec/bringness/netcup-sandbox-preflight.sh", str(helper))
            handler = root / "handler.sh"
            handler.write_text(script)
            return subprocess.run(["bash", str(handler)], env={**os.environ, "SSH_ORIGINAL_COMMAND": original},
                                  capture_output=True, text=True)
    def test_read_only_command_accepted(self):
        result = self.run_command("sandbox-preflight read-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "--read-only")
    def test_rejects_mutation_and_injection(self):
        for command in ["sandbox-preflight", "sandbox-preflight write", "sandbox-preflight read-only; id",
                        "sandbox-preflight read-only && echo injected", "sandbox-preflight read-only extra"]:
            with self.subTest(command=command):
                result = self.run_command(command)
                self.assertEqual(result.returncode, 64)
                self.assertIn("Invalid operation", result.stderr)

if __name__ == "__main__":
    unittest.main()

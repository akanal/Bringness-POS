"""Orchestration checks using synthetic downloads and stubbed privileged steps."""
import os
from pathlib import Path
import pty
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent


class RunnerTest(unittest.TestCase):
    def run_case(self, mode='ok', argument=None):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            commands = temp / 'commands'
            commands.mkdir()
            work = temp / 'work'
            work.mkdir()
            log = temp / 'log'
            fake = temp / 'fake-python'
            fake.write_text('''#!/bin/bash
echo "$*" >> "$TEST_LOG"
if [[ "$TEST_MODE" == pip-fail && "$*" == *"pip install"* ]]; then exit 9; fi
if [[ "$TEST_MODE" == tests-fail && "$1" == configure-idrive-documents.test.py ]]; then exit 8; fi
''')
            fake.chmod(0o700)
            stubs = {
                'id': 'echo 0',
                'mktemp': 'echo "$TEST_WORK"',
                'curl': '''if [[ "$TEST_MODE" == download-fail ]]; then exit 22; fi
args=("$@")
url="${args[${#args[@]}-3]}"
file="${args[${#args[@]}-1]}"
cp "$TEST_SOURCE/${url##*/}" "$file"
if [[ "$TEST_MODE" == tamper && "$file" == configure-idrive-documents.py ]]; then echo tampered >> "$file"; fi''',
                'python3': '''if [[ "$1" == -m && "$2" == venv ]]; then
  mkdir -p "$3/bin"
  cp "$TEST_FAKE" "$3/bin/python"
else
  cat >/dev/null
fi''',
            }
            for name, body in stubs.items():
                path = commands / name
                path.write_text('#!/bin/bash\nset -eu\n' + body + '\n')
                path.chmod(0o700)
            env = dict(os.environ, PATH=str(commands) + ':' + os.environ['PATH'],
                       TEST_MODE=mode, TEST_LOG=str(log), TEST_WORK=str(work),
                       TEST_SOURCE=str(ROOT), TEST_FAKE=str(fake))
            master, slave = pty.openpty()
            try:
                command = ['bash', str(ROOT / 'idrive-connect.sh')] + ([argument] if argument else [])
                result = subprocess.run(command,
                                        stdin=slave, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, env=env, timeout=15)
            finally:
                os.close(master)
                os.close(slave)
            return result.returncode, log.read_text() if log.exists() else ''

    def test_success_installs_and_tests_before_connection(self):
        code, log = self.run_case()
        self.assertEqual(code, 0)
        self.assertLess(log.index('pip install'), log.index('configure-idrive-documents.test.py'))
        self.assertLess(log.index('configure-idrive-documents.test.py'), log.index('configure-idrive-documents.py '))

    def test_tampered_download_never_executes_python(self):
        code, log = self.run_case('tamper')
        self.assertNotEqual(code, 0)
        self.assertEqual(log, '')

    def test_failed_download_never_executes_python(self):
        code, log = self.run_case('download-fail')
        self.assertNotEqual(code, 0)
        self.assertEqual(log, '')

    def test_pip_failure_stops_before_tests_or_connection(self):
        code, log = self.run_case('pip-fail')
        self.assertNotEqual(code, 0)
        self.assertNotIn('configure-idrive-documents', log)

    def test_test_failure_stops_before_connection(self):
        code, log = self.run_case('tests-fail')
        self.assertNotEqual(code, 0)
        self.assertNotIn('configure-idrive-documents.py ', log)

    def test_inspect_runs_only_inspection_after_tests(self):
        code, log = self.run_case(argument='inspect')
        self.assertEqual(code, 0)
        self.assertIn('configure-idrive-documents.py inspect', log)
        self.assertNotIn('configure-idrive-documents.py setup', log)
        self.assertNotIn('configure-idrive-documents.py check', log)


if __name__ == '__main__':
    unittest.main()

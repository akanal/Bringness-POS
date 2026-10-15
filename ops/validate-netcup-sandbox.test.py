import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("validator", Path(__file__).with_name("validate-netcup-sandbox.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
password = "a_very_long_unique_test_password_123"
base = f"DATABASE_URL=postgresql://sandbox_app:{password}@sandbox-db:5432/bringness_billing_sandbox\nMOLLIE_API_KEY=test_abcdefghijklmnopqrstuvwxyz\n"

class ValidatorTests(unittest.TestCase):
    def test_startup_requires_matching_runtime_and_secret(self):
        import os, subprocess, tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            from pathlib import Path
            p = Path(tmp) / 'password'
            p.write_text(password)
            with patch.object(module.pathlib, 'Path', wraps=Path):
                pass
        self.assertTrue(module.validate(base.replace('sandbox-db', 'bringness-db'), password))
    def test_valid_synthetic_config(self):
        self.assertEqual(module.validate(base, password), [])
    def test_rejects_live_key(self):
        self.assertTrue(module.validate(base.replace("test_abcdefghijklmnopqrstuvwxyz", "live_abcdefghijklmnopqrstuvwxyz"), password))
    def test_rejects_production_database(self):
        self.assertTrue(module.validate(base.replace("@sandbox-db", "@bringness-db"), password))
    def test_rejects_wrong_password(self):
        self.assertTrue(module.validate(base, "another_long_password_value_123"))
    def test_rejects_production_email(self):
        self.assertTrue(module.validate(base + "SMTP_HOST=production-mail.example\n", password))
    def test_rejects_overridden_runtime(self):
        self.assertTrue(module.validate(base + "APP_MODE=combined\n", password))
    def test_rejects_duplicate_database_key(self):
        self.assertTrue(module.validate(base + "DATABASE_URL=postgresql://user@host/db\n", password))

if __name__ == "__main__":
    unittest.main()

import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("validator", Path(__file__).with_name("validate-netcup-sandbox.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
password = "a_very_long_unique_test_password_123"
base = f"DATABASE_URL=postgresql://sandbox_app:{password}@sandbox-db:5432/bringness_billing_sandbox\nMOLLIE_API_KEY=test_abcdefghijklmnopqrstuvwxyz\n"

class ValidatorTests(unittest.TestCase):
    def test_runtime_guard_is_invoked_by_container(self):
        dockerfile = Path(__file__).with_name("netcup-sandbox.Dockerfile").read_text()
        compose = Path(__file__).with_name("netcup-sandbox.compose.yml").read_text()
        self.assertIn("validate-netcup-sandbox.py --runtime", dockerfile)
        self.assertIn("sandbox_db_password", compose)
        self.assertIn("    secrets:\n      - sandbox_db_password", compose)
    def test_valid_synthetic_config(self):
        self.assertEqual(module.validate(base, password), [])
    def test_rejects_live_key(self):
        self.assertTrue(module.validate(base.replace("test_abcdefghijklmnopqrstuvwxyz", "live_abcdefghijklmnopqrstuvwxyz"), password))
    def test_rejects_production_database(self):
        self.assertTrue(module.validate(base.replace("@sandbox-db", "@bringness-db"), password))
    def test_rejects_wrong_database_port(self):
        self.assertTrue(module.validate(base.replace(":5432/", ":5433/"), password))
    def test_rejects_database_query_overrides(self):
        self.assertTrue(module.validate(base.replace("bringness_billing_sandbox", "bringness_billing_sandbox?host=production"), password))
    def test_rejects_wrong_password(self):
        self.assertTrue(module.validate(base, "another_long_password_value_123"))
    def test_rejects_production_email(self):
        self.assertTrue(module.validate(base + "SMTP_HOST=production-mail.example\n", password))
    def test_rejects_mail_password(self):
        self.assertTrue(module.validate(base + "SMTP_PASSWORD=synthetic_secret\\n", password))
    def test_rejects_overridden_runtime(self):
        self.assertTrue(module.validate(base + "APP_MODE=combined\n", password))
    def test_rejects_duplicate_database_key(self):
        self.assertTrue(module.validate(base + "DATABASE_URL=postgresql://user@host/db\n", password))

if __name__ == "__main__":
    unittest.main()

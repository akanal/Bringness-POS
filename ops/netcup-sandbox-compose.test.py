import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent

class ComposeIsolationTests(unittest.TestCase):
    def test_sandbox_has_separate_database_and_local_only_port(self):
        source = (ROOT / "netcup-sandbox.compose.yml").read_text()
        self.assertIn("bringness_billing_sandbox", source)
        self.assertIn("sandbox_pgdata:", source)
        self.assertIn("sandbox_private:", source)
        self.assertIn('"127.0.0.1:3015:3000"', source)
        self.assertIn("sandbox-db-password.txt", source)
        self.assertIn("pos-license-sandbox-init.sql:/docker-entrypoint-initdb.d/", source)
        self.assertNotIn("bringness-internal", source)
        self.assertNotIn("/opt/bringness", source)
        self.assertNotIn("bringness-pos/config/app.env", source)
    def test_dockerfile_contains_only_application_sources(self):
        source = (ROOT / "netcup-sandbox.Dockerfile").read_text()
        self.assertNotIn("COPY . .", source)
        self.assertNotIn("sandbox.test.env", source)
        self.assertNotIn("sandbox-db-password", source)
        self.assertIn("COPY server ./server", source)
        self.assertIn("node server/pos-license-sandbox-start.js", source)
        self.assertNotIn("npm start", source)
        self.assertNotIn("COPY apps/web", source)
        self.assertNotIn("COPY db", source)

    def test_billing_only_entrypoint_never_starts_pos_workers(self):
        source = (ROOT.parent / "server" / "pos-license-sandbox-start.js").read_text()
        self.assertIn("handlePosLicenseWebhook", source)
        self.assertNotIn("server/start.js", source.split("const pool")[1])
        self.assertNotIn("migrateBilling", source)

if __name__ == "__main__":
    unittest.main()

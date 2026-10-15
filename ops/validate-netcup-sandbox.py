#!/usr/bin/env python3
"""Fail-closed validation of sandbox configuration; prints no secret values."""
import os
import pathlib
import re
import sys
from urllib.parse import urlsplit, unquote

HERE = pathlib.Path(__file__).resolve().parent
REQUIRED = {"DATABASE_URL", "MOLLIE_API_KEY"}

def validate(env_text: str, db_password: str) -> list[str]:
    errors = []
    values = {}
    for raw in env_text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            errors.append("Malformed environment line")
            continue
        key, value = line.split("=", 1)
        if key in values:
            errors.append("Duplicate environment key")
        values[key] = value.strip().strip('"').strip("'")
    if REQUIRED - values.keys():
        errors.append("Missing required sandbox environment keys")
    mollie = values.get("MOLLIE_API_KEY", "")
    if not re.fullmatch(r"test_[A-Za-z0-9_-]{12,}", mollie):
        errors.append("Mollie TEST key required")
    if any(k in values for k in ("NODE_ENV", "APP_MODE", "PGHOST", "PGDATABASE", "PGUSER")):
        errors.append("Runtime isolation keys must be set by Compose")
    if any("live_" in value for value in values.values()):
        errors.append("LIVE credentials forbidden")
    url = values.get("DATABASE_URL", "")
    try:
        parsed = urlsplit(url)
        if (parsed.scheme not in ("postgres", "postgresql") or parsed.hostname != "sandbox-db"
                or parsed.port != 5432 or parsed.path != "/bringness_billing_sandbox"
                or parsed.username != "sandbox_app" or parsed.query or parsed.fragment):
            errors.append("Dedicated sandbox database URL required")
        if not parsed.password or unquote(parsed.password) != db_password.strip():
            errors.append("Database password does not match isolated secret")
    except ValueError:
        errors.append("Invalid sandbox database URL")
    if len(db_password.strip()) < 24:
        errors.append("Sandbox database password too short")
    forbidden = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_PASSWORD",
                 "BREVO_API_KEY", "FISKALY_API_KEY", "MOLLIE_LIVE_KEY",
                 "SENDGRID_API_KEY", "RESEND_API_KEY")
    if any(k in values for k in forbidden):
        errors.append("Outbound production integrations forbidden")
    return errors

def main():
    runtime = "--runtime" in sys.argv[1:]
    env_file = HERE / "sandbox.test.env"
    password_file = pathlib.Path("/run/secrets/sandbox_db_password") if runtime else HERE / "sandbox-db-password.txt"
    if (not runtime and not env_file.is_file()) or not password_file.is_file():
        print("Sandbox configuration files missing", file=sys.stderr)
        return 2
    if runtime:
        # Compose owns runtime isolation keys, so exclude only those from the
        # env-file validation while independently checking their exact values.
        expected = {"APP_MODE": "pos", "PORT": "3000", "PGHOST": "sandbox-db",
                    "PGDATABASE": "bringness_billing_sandbox", "PGUSER": "sandbox_app", "NODE_ENV": "test"}
        errors = ["Unexpected sandbox runtime setting"] if any(os.environ.get(k) != v for k, v in expected.items()) else []
        values = "\n".join(f"{k}={v}" for k, v in os.environ.items()
                           if k in REQUIRED or k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER",
                           "SMTP_PASS", "SMTP_PASSWORD", "BREVO_API_KEY", "FISKALY_API_KEY",
                           "MOLLIE_LIVE_KEY", "SENDGRID_API_KEY", "RESEND_API_KEY"))
        errors += validate(values, password_file.read_text())
    else:
        errors = validate(env_file.read_text(), password_file.read_text())
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 2
    print("Sandbox credentials and database isolation validated; no secrets printed.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

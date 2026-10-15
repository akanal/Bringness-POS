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
        if parsed.scheme not in ("postgres", "postgresql") or parsed.hostname != "sandbox-db" or parsed.path != "/bringness_billing_sandbox" or parsed.username != "sandbox_app":
            errors.append("Dedicated sandbox database URL required")
        if not parsed.password or unquote(parsed.password) != db_password.strip():
            errors.append("Database password does not match isolated secret")
    except ValueError:
        errors.append("Invalid sandbox database URL")
    if len(db_password.strip()) < 24:
        errors.append("Sandbox database password too short")
    if any(k in values for k in ("SMTP_HOST", "BREVO_API_KEY", "FISKALY_API_KEY", "MOLLIE_LIVE_KEY")):
        errors.append("Outbound production integrations forbidden")
    return errors

def main():
    env_file = HERE / "sandbox.test.env"
    password_file = HERE / "sandbox-db-password.txt"
    if not env_file.is_file() or not password_file.is_file():
        print("Sandbox configuration files missing", file=sys.stderr)
        return 2
    errors = validate(env_file.read_text(), password_file.read_text())
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 2
    print("Sandbox credentials and database isolation validated; no secrets printed.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

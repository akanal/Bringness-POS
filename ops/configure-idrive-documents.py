#!/usr/bin/env python3
"""Interactive Netcup bootstrap; never accepts credentials in arguments or env."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid
import warnings
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ENDPOINT = 'https://s3.eu-central-1.idrivee2.com'
REGION = 'eu-central-1'
BUCKET = 'bringness-documents'
CONFIG = Path('/opt/bringness-pos/config/idrive-documents.json')
PHASE = 'Vorbereitung'


def safe_failure(error, phase=None):
    """Only fixed allowlisted messages; never interpolate exception/request text."""
    reasons = {
        'access-format': 'Access Key ID hat ein ungueltiges Format. Keine E-Mail und kein Kontopasswort verwenden.',
        'secret-format': 'Secret Access Key hat ein ungueltiges Format. Vollstaendig und ohne Leerzeichen eingeben.',
        'config-already-exists': 'Konfiguration existiert bereits und wurde nicht ersetzt.',
        'unsafe-parent': 'Konfigurationsverzeichnis hat unsichere Rechte.',
        'linked-parent': 'Konfigurationsverzeichnis ist verknuepft; Einrichtung angehalten.',
        'content-or-encryption-mismatch': 'Testdaten oder Verschluesselungsbestaetigung stimmen nicht ueberein.',
        'anonymous-result-inconclusive': 'Der anonyme Zugriffstest ist nicht eindeutig; nichts freigegeben.',
        'anonymous-access-allowed': 'Anonymer Zugriff auf das Testobjekt war moeglich; Einrichtung angehalten.',
        'anonymous-network-failure': 'Unangemeldeter HTTPS-Test konnte den Endpunkt nicht verlaesslich erreichen.',
    }
    message = 'Ursache nicht eindeutig. Keine geheimen Fehlerdetails ausgegeben.'
    if isinstance(error, ValueError) and len(error.args) == 1 and isinstance(error.args[0], str):
        message = reasons.get(error.args[0], message)
    from botocore.exceptions import ClientError, EndpointConnectionError, ConnectTimeoutError, ReadTimeoutError, SSLError
    if isinstance(error, ClientError):
        code = error.response.get('Error', {}).get('Code')
        message = {
            'InvalidAccessKeyId': 'Access Key ID wird von IDrive nicht erkannt.',
            'SignatureDoesNotMatch': 'Signatur abgelehnt: Secret, Endpunkt und Serverzeit pruefen.',
            'AccessDenied': 'IDrive verweigert diesen Schritt. Bucket-Zuweisung und Zugriffsrechte pruefen.',
            'NoSuchBucket': 'Bucket am eingestellten Endpunkt nicht gefunden.',
            'NotImplemented': 'IDrive unterstuetzt eine benoetigte Schutzfunktion nicht. Kein unsicherer Ersatzversuch.',
            'InvalidArgument': 'IDrive lehnt eine Anforderung ab. Endpunkt und unterstuetzte Schutzfunktionen pruefen.',
            'RequestTimeTooSkewed': 'Serverzeit weicht zu stark ab.',
            'AuthorizationHeaderMalformed': 'Signaturregion oder Endpunkt wird abgelehnt.',
            'InvalidRequest': 'IDrive lehnt die Anfrage ab. Keine Schutzfunktion automatisch entfernt.',
        }.get(code, message)
    elif isinstance(error, (EndpointConnectionError, ConnectTimeoutError, ReadTimeoutError, SSLError)):
        message = 'Netzwerk-, TLS- oder Zeitlimitfehler beim IDrive-Endpunkt.'
    # phase is internal; never permit externally supplied diagnostics into logs.
    stages = {'Vorbereitung', 'Schluesseleingabe', 'Schluesselformat', 'SDK-Vorbereitung',
              'Testupload', 'Testdatei lesen', 'Anonymen Zugriff pruefen', 'Geschuetzt speichern'}
    stage = phase if phase in stages else PHASE if PHASE in stages else 'Vorbereitung'
    return 'Nicht abgeschlossen. Schritt: ' + stage + '. ' + message


def validate_credentials(access, secret):
    if not isinstance(access, str) or not re.fullmatch(r'[A-Za-z0-9_-]{12,128}', access):
        raise ValueError('access-format')
    if not isinstance(secret, str) or not re.fullmatch(r'[A-Za-z0-9/+=_-]{16,256}', secret):
        raise ValueError('secret-format')


def read_config(path):
    path = Path(path)
    check_parent(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077 or info.st_nlink != 1 or info.st_size > 8192:
            raise ValueError('unsafe-config')
        config = json.loads(stream.read(8193))
    if set(config) != {'endpoint', 'region', 'bucket', 'access_key_id', 'secret_access_key'}:
        raise ValueError('config-fields')
    if (config['endpoint'], config['region'], config['bucket']) != (ENDPOINT, REGION, BUCKET):
        raise ValueError('config-target')
    validate_credentials(config['access_key_id'], config['secret_access_key'])
    return config


def check_parent(path):
    if path.parent.resolve() != path.parent:
        raise ValueError('linked-parent')
    info = path.parent.stat()
    if info.st_uid != os.geteuid() or info.st_mode & 0o022:
        raise ValueError('unsafe-parent')


def save_new_config(path, access, secret):
    validate_credentials(access, secret)
    path = Path(path)
    check_parent(path)
    config = dict(endpoint=ENDPOINT, region=REGION, bucket=BUCKET,
                  access_key_id=access, secret_access_key=secret)
    # Exclusive hard-link publication: no truncation, overwrite, symlink following
    # or partially written destination. Staged inode is private from creation.
    import tempfile
    fd, temporary = tempfile.mkstemp(prefix='.idrive-next-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(config, stream)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path, follow_symlinks=False)
    finally:
        os.unlink(temporary)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def make_client(access, secret, unsigned=False):
    import boto3
    from botocore import UNSIGNED
    from botocore.config import Config
    return boto3.client('s3', endpoint_url=ENDPOINT, region_name=REGION,
        aws_access_key_id=access, aws_secret_access_key=secret,
        config=Config(signature_version=UNSIGNED if unsigned else 's3v4',
            connect_timeout=10, read_timeout=15, retries={'total_max_attempts': 1},
            s3={'addressing_style': 'path'},
            request_checksum_calculation='when_required', response_checksum_validation='when_required'))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class AnonymousClient:
    """Independent unsigned HTTPS GET: no SDK signing, redirects or proxy credentials."""
    def get_object(self, *, Bucket, Key):
        from botocore.exceptions import ClientError
        if Bucket != BUCKET or not re.fullmatch(r'_bringness-connection-checks/[0-9a-f]{32}\.txt', Key):
            raise ValueError('probe-id')
        request = urllib.request.Request(ENDPOINT + '/' + BUCKET + '/' + Key,
                                         headers={'Accept': 'application/xml'}, method='GET')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            response = opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            try:
                data = error.read(8193)
            finally:
                error.close()
            if error.code != 403 or len(data) > 8192:
                raise ValueError('anonymous-result-inconclusive') from None
            try:
                root = ET.fromstring(data)
                code = root.findtext('Code')
            except ET.ParseError:
                raise ValueError('anonymous-result-inconclusive') from None
            if root.tag != 'Error' or code not in ('AccessDenied', 'Forbidden', '403'):
                raise ValueError('anonymous-result-inconclusive') from None
            raise ClientError({'Error': {'Code': code},
                               'ResponseMetadata': {'HTTPStatusCode': 403}}, 'GetObject') from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ValueError('anonymous-network-failure') from None
        if response.status != 200:
            response.close()
            raise ValueError('anonymous-result-inconclusive')
        return {'Body': response}

    def close(self):
        pass


def probe(client, anonymous, identifier=None):
    global PHASE
    from botocore.exceptions import ClientError
    identifier = identifier or uuid.uuid4().hex
    if not re.fullmatch(r'[0-9a-f]{32}', identifier):
        raise ValueError('probe-id')
    key = '_bringness-connection-checks/' + identifier + '.txt'
    body = b'Bringness IDrive connection check. Synthetic data only.\n'
    # Explicit private ACL; never enables public access. No fallback that drops
    # this protection or the no-overwrite condition when unsupported.
    PHASE = 'Testupload'
    client.put_object(Bucket=BUCKET, Key=key, Body=body, ACL='private',
        ServerSideEncryption='AES256', IfNoneMatch='*', ContentType='text/plain',
        Metadata={'sha256': hashlib.sha256(body).hexdigest()})
    PHASE = 'Testdatei lesen'
    response = client.get_object(Bucket=BUCKET, Key=key)
    stream = response['Body']
    try:
        actual = stream.read(len(body) + 1)
    finally:
        stream.close()
    if actual != body or response.get('ServerSideEncryption') != 'AES256':
        raise ValueError('content-or-encryption-mismatch')
    PHASE = 'Anonymen Zugriff pruefen'
    try:
        public = anonymous.get_object(Bucket=BUCKET, Key=key)
    except ClientError as error:
        metadata = error.response.get('ResponseMetadata', {})
        if metadata.get('HTTPStatusCode') != 403 or error.response.get('Error', {}).get('Code') not in ('AccessDenied', 'Forbidden', '403'):
            raise ValueError('anonymous-result-inconclusive') from None
    else:
        public['Body'].close()
        raise ValueError('anonymous-access-allowed')
    # No delete API: retain this one tiny synthetic object for owner inspection.
    return key


def owner_only_acl(response):
    if not isinstance(response, dict):
        return False
    owner = response.get('Owner', {}).get('ID')
    grants = response.get('Grants')
    if not isinstance(owner, str) or not owner or not isinstance(grants, list) or len(grants) != 1:
        return False
    grant = grants[0]
    if not isinstance(grant, dict) or not isinstance(grant.get('Grantee'), dict):
        return False
    grantee = grant['Grantee']
    return (grant.get('Permission') == 'FULL_CONTROL' and grantee.get('Type') == 'CanonicalUser'
            and grantee.get('ID') == owner and not grantee.get('URI') and not grantee.get('EmailAddress'))


def describe_acl(response):
    """Print only bounded structural facts; never identifiers, emails or raw values."""
    if not isinstance(response, dict):
        return 'ACL-Antwort fehlt'
    owner_data = response.get('Owner')
    owner = owner_data.get('ID') if isinstance(owner_data, dict) else None
    owner_exists = isinstance(owner, str) and bool(owner)
    grants = response.get('Grants')
    if not isinstance(grants, list) or len(grants) > 100:
        return 'Eigentuemer-ID vorhanden=' + str(owner_exists) + '; Grants fehlen/ungueltig'
    descriptions = ['Eigentuemer-ID vorhanden=' + str(owner_exists), 'Grants=' + str(len(grants))]
    groups = {'http://acs.amazonaws.com/groups/global/AllUsers': 'OEFFENTLICH-ALLE',
              'http://acs.amazonaws.com/groups/global/AuthenticatedUsers': 'ALLE-AUTHENTIFIZIERTEN',
              'http://acs.amazonaws.com/groups/s3/LogDelivery': 'LOG-DELIVERY'}
    for grant in grants:
        if not isinstance(grant, dict) or not isinstance(grant.get('Grantee'), dict):
            descriptions.append('ungueltiger Grant')
            continue
        grantee = grant['Grantee']
        kind = grantee.get('Type')
        if kind not in ('CanonicalUser', 'Group', 'AmazonCustomerByEmail'):
            kind = 'Typ fehlt/unbekannt'
        permission = grant.get('Permission')
        if permission not in ('FULL_CONTROL', 'READ', 'WRITE', 'READ_ACP', 'WRITE_ACP'):
            permission = 'Recht fehlt/unbekannt'
        same = owner_exists and grantee.get('ID') == owner
        uri = grantee.get('URI')
        group = groups.get(uri, 'ANDERE-GRUPPE' if uri else 'KEINE-GRUPPE') if isinstance(uri, (str, type(None))) else 'UNGUELTIGE-GRUPPE'
        descriptions.append(kind + '/' + permission + '/Eigentuemer=' + str(same) + '/' + group)
    return '; '.join(descriptions)


def inspect_access(client):
    """Read only: exact existing synthetic object, bucket ACL and policy state."""
    from botocore.exceptions import ClientError
    key = '_bringness-connection-checks/5889d47ddcb44013a0388860b7f77256.txt'
    operations = (
        ('Testdatei-ACL', 'get_object_acl', dict(Bucket=BUCKET, Key=key)),
        ('Bucket-ACL', 'get_bucket_acl', dict(Bucket=BUCKET)),
        ('Bucket-Policy', 'get_bucket_policy', dict(Bucket=BUCKET)),
        ('Policy-Status', 'get_bucket_policy_status', dict(Bucket=BUCKET)),
    )
    for label, method, arguments in operations:
        try:
            response = getattr(client, method)(**arguments)
            if method in ('get_object_acl', 'get_bucket_acl'):
                result = 'NUR EIGENTUEMER' if owner_only_acl(response) else 'NICHT ALS EIGENTUEMER-EXKLUSIV BESTAETIGT'
                result += '\n  ' + describe_acl(response)
            elif method == 'get_bucket_policy':
                result = 'POLICY VORHANDEN; Inhalt wird nicht ausgegeben'
            else:
                value = response.get('PolicyStatus', {}).get('IsPublic')
                result = 'IsPublic=false' if value is False else 'IsPublic=true' if value is True else 'UNKLARE ANTWORT'
        except ClientError as error:
            code = error.response.get('Error', {}).get('Code')
            if method in ('get_bucket_policy', 'get_bucket_policy_status') and code == 'NoSuchBucketPolicy':
                result = 'KEINE BUCKET-POLICY'
            elif code in ('AccessDenied', 'Forbidden', '403'):
                result = 'LESERECHT FEHLT'
            elif code in ('NotImplemented', 'MethodNotAllowed', 'InvalidRequest'):
                result = 'OPERATION NICHT VERFUEGBAR'
            elif code == 'NoSuchKey':
                result = 'TESTDATEI NICHT GEFUNDEN'
            else:
                result = 'UNBEKANNTE API-ANTWORT; keine geheimen Details ausgegeben'
        except Exception:
            result = 'PRUEFUNG NICHT MOEGLICH; keine geheimen Details ausgegeben'
        print(label + ': ' + result)
    print('Nur gelesen. Keine Datei, Freigabe oder Zugangsdaten gespeichert/geaendert.')


def main():
    global PHASE
    parser = argparse.ArgumentParser(description='Bringness IDrive: setup or explicit connection test')
    parser.add_argument('operation', choices=('setup', 'check', 'inspect'))
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('root-required')
    if args.operation in ('setup', 'inspect'):
        if not sys.stdin.isatty():
            raise ValueError('interactive-console-required')
        if args.operation == 'setup':
            check_parent(CONFIG)
            if os.path.lexists(CONFIG):
                raise ValueError('config-already-exists')
            print('Only Frankfurt-2 / bringness-documents. No migration, deletion or restart.')
            print('One tiny synthetic test object will remain in the bucket.')
        else:
            print('Nur Zugriffsrechte der vorhandenen Testdatei und des Buckets lesen. Keine Aenderung.')
        PHASE = 'Schluesseleingabe'
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            access = getpass.getpass('IDrive access key ID (hidden): ')
            secret = getpass.getpass('IDrive secret access key (hidden): ')
        PHASE = 'Schluesselformat'
        validate_credentials(access, secret)
    else:
        config = read_config(CONFIG)
        access, secret = config['access_key_id'], config['secret_access_key']
    PHASE = 'SDK-Vorbereitung'
    signed = make_client(access, secret)
    if args.operation == 'inspect':
        try:
            inspect_access(signed)
        finally:
            signed.close()
        return
    anonymous = AnonymousClient()
    try:
        key = probe(signed, anonymous)
    finally:
        signed.close()
        anonymous.close()
    if args.operation == 'setup':
        PHASE = 'Geschuetzt speichern'
        save_new_config(CONFIG, access, secret)
    print('PASS: upload, exact readback, AES256 and anonymous access denial for the test object.')
    print('Retained synthetic object: ' + key)
    print('No application document storage has been activated. App integration remains separate.')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        # SDK exception details may contain signed requests, identifiers or URLs.
        print(safe_failure(error), file=sys.stderr)
        sys.exit(1)

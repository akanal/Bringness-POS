import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError
from botocore.exceptions import ClientError

spec = importlib.util.spec_from_file_location('setup', Path(__file__).with_name('configure-idrive-documents.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
A, S = 'syntheticaccess123456', 'syntheticsecret1234567890'


class SetupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.parent = Path(self.temp.name)
        self.path = self.parent / 'config.json'

    def tearDown(self):
        self.temp.cleanup()

    def test_private_config_roundtrip(self):
        m.save_new_config(self.path, A, S)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(m.read_config(self.path)['secret_access_key'], S)
        self.assertEqual(self.path.stat().st_nlink, 1)

    def test_existing_config_not_overwritten(self):
        self.path.write_text('preserve')
        with self.assertRaises(FileExistsError):
            m.save_new_config(self.path, A, S)
        self.assertEqual(self.path.read_text(), 'preserve')
        self.assertEqual(list(self.parent.iterdir()), [self.path])

    def test_symlink_not_followed(self):
        target = self.parent / 'original'
        target.write_text('preserve')
        self.path.symlink_to(target)
        with self.assertRaises(OSError):
            m.save_new_config(self.path, A, S)
        self.assertEqual(target.read_text(), 'preserve')
        with self.assertRaises(OSError):
            m.read_config(self.path)

    def test_world_readable_config_denied(self):
        m.save_new_config(self.path, A, S)
        self.path.chmod(0o644)
        with self.assertRaises(ValueError):
            m.read_config(self.path)

    def test_unsafe_parent_denied(self):
        self.parent.chmod(0o777)
        with self.assertRaises(ValueError):
            m.save_new_config(self.path, A, S)
        self.assertFalse(self.path.exists())

    def test_foreign_endpoint_denied(self):
        m.save_new_config(self.path, A, S)
        config = json.loads(self.path.read_text())
        config['endpoint'] = 'https://example.invalid'
        self.path.write_text(json.dumps(config))
        with self.assertRaises(ValueError):
            m.read_config(self.path)

    def test_bad_secret_no_file(self):
        for secret in ('bad\nvalue', 'short', 'x' * 257):
            with self.assertRaises(ValueError):
                m.save_new_config(self.path, A, secret)
        self.assertFalse(self.path.exists())

    def clients(self, code='AccessDenied', status=403, public=False, body=None, encryption='AES256'):
        signed, anonymous = Mock(), Mock()
        signed.get_object.return_value = {'Body': io.BytesIO(body if body is not None else b'Bringness IDrive connection check. Synthetic data only.\n'), 'ServerSideEncryption': encryption}
        if public:
            anonymous.get_object.return_value = {'Body': io.BytesIO(b'public')}
        else:
            anonymous.get_object.side_effect = ClientError({'Error': {'Code': code}, 'ResponseMetadata': {'HTTPStatusCode': status}}, 'GetObject')
        return signed, anonymous

    def test_probe_private_encrypted_no_delete(self):
        signed, anonymous = self.clients()
        key = m.probe(signed, anonymous, 'a' * 32)
        request = signed.put_object.call_args.kwargs
        self.assertEqual(request['Bucket'], m.BUCKET)
        self.assertEqual(request['ACL'], 'private')
        self.assertEqual(request['ServerSideEncryption'], 'AES256')
        self.assertEqual(request['IfNoneMatch'], '*')
        self.assertTrue(key.startswith('_bringness-connection-checks/'))
        self.assertFalse(signed.delete_object.called)
        self.assertFalse(signed.delete_bucket.called)
        self.assertFalse(signed.put_bucket_policy.called)

    def test_public_read_fails(self):
        signed, anonymous = self.clients(public=True)
        with self.assertRaises(ValueError):
            m.probe(signed, anonymous)

    def test_not_found_or_provider_failure_not_private_proof(self):
        for code, status in [('NoSuchKey', 404), ('InternalError', 500), ('InvalidAccessKeyId', 403)]:
            signed, anonymous = self.clients(code, status)
            with self.assertRaises(ValueError):
                m.probe(signed, anonymous)

    def test_corrupt_or_unencrypted_read_fails(self):
        for kwargs in ({'body': b'changed'}, {'encryption': None}):
            signed, anonymous = self.clients(**kwargs)
            with self.assertRaises(ValueError):
                m.probe(signed, anonymous)
            self.assertFalse(anonymous.get_object.called)

    def test_upload_failure_no_fallback_or_retry(self):
        signed, anonymous = self.clients()
        signed.put_object.side_effect = RuntimeError('synthetic failure')
        with self.assertRaises(RuntimeError):
            m.probe(signed, anonymous)
        self.assertEqual(signed.put_object.call_count, 1)
        self.assertFalse(signed.get_object.called)
        self.assertFalse(anonymous.get_object.called)

    def test_sdk_fixed_endpoint_no_retry_and_anonymous_unsigned(self):
        signed = m.make_client(A, S)
        unsigned = m.make_client(A, S, unsigned=True)
        try:
            from botocore import UNSIGNED
            self.assertEqual(signed.meta.endpoint_url, m.ENDPOINT)
            self.assertEqual(signed.meta.config.signature_version, 's3v4')
            self.assertEqual(unsigned.meta.config.signature_version, UNSIGNED)
            self.assertEqual(signed.meta.config.retries['total_max_attempts'], 1)
        finally:
            signed.close()
            unsigned.close()

    def test_safe_errors_never_echo_provider_messages_or_requests(self):
        error = ClientError({'Error': {'Code': 'AccessDenied', 'Message': S},
                             'ResponseMetadata': {'RequestId': S}}, S)
        text = m.safe_failure(error, 'Testupload')
        self.assertIn('Testupload', text)
        self.assertIn('Zugriffsrechte', text)
        self.assertNotIn(S, text)

    def test_unknown_codes_and_errors_never_echo_secrets(self):
        errors = [ValueError(S), RuntimeError(S),
                  ClientError({'Error': {'Code': S, 'Message': S}}, S)]
        for error in errors:
            self.assertNotIn(S, m.safe_failure(error, S))

    def test_format_errors_are_distinguished(self):
        self.assertIn('Access Key ID', m.safe_failure(ValueError('access-format')))
        self.assertIn('Secret Access Key', m.safe_failure(ValueError('secret-format')))

    def test_provider_reasons_are_allowlisted(self):
        for code, expected in [('NoSuchBucket', 'nicht gefunden'),
                               ('SignatureDoesNotMatch', 'Signatur'),
                               ('NotImplemented', 'Schutzfunktion'),
                               ('InvalidAccessKeyId', 'nicht erkannt')]:
            error = ClientError({'Error': {'Code': code, 'Message': S}}, S)
            text = m.safe_failure(error)
            self.assertIn(expected, text)
            self.assertNotIn(S, text)

    def test_failed_probe_reports_upload_stage(self):
        signed, anonymous = self.clients()
        signed.put_object.side_effect = ValueError(S)
        with self.assertRaises(ValueError):
            m.probe(signed, anonymous)
        self.assertEqual(m.PHASE, 'Testupload')

    def test_failed_read_reports_read_stage(self):
        signed, anonymous = self.clients()
        signed.get_object.side_effect = RuntimeError(S)
        with self.assertRaises(RuntimeError):
            m.probe(signed, anonymous)
        self.assertEqual(m.PHASE, 'Testdatei lesen')

    def test_failed_anonymous_probe_reports_privacy_stage(self):
        signed, anonymous = self.clients(public=True)
        with self.assertRaises(ValueError):
            m.probe(signed, anonymous)
        self.assertEqual(m.PHASE, 'Anonymen Zugriff pruefen')

    def raw_error(self, status, body):
        return HTTPError('https://synthetic.invalid', status, 'synthetic', {}, io.BytesIO(body))

    def test_raw_anonymous_denial_matches_exact_object_without_auth(self):
        error = self.raw_error(403, b'<Error><Code>AccessDenied</Code></Error>')
        with patch.object(m.urllib.request, 'build_opener') as build:
            build.return_value.open.side_effect = error
            with self.assertRaises(ClientError) as raised:
                m.AnonymousClient().get_object(Bucket=m.BUCKET, Key='_bringness-connection-checks/' + 'a'*32 + '.txt')
            self.assertEqual(raised.exception.response['Error']['Code'], 'AccessDenied')
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, m.ENDPOINT + '/' + m.BUCKET + '/_bringness-connection-checks/' + 'a'*32 + '.txt')
            self.assertFalse(request.has_header('Authorization'))
            self.assertFalse(request.has_header('Cookie'))
            self.assertEqual(build.return_value.open.call_args.kwargs['timeout'], 15)
            self.assertEqual(build.call_args.args[0].proxies, {})

    def test_raw_anonymous_redirect_is_not_followed(self):
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://foreign.invalid'))

    def test_raw_anonymous_inconclusive_responses_fail_closed(self):
        cases = [(403, b'<Error><Code>InvalidAccessKeyId</Code></Error>'),
                 (403, b''), (403, b'x'*8193), (404, b''), (500, b''), (302, b'')]
        for status, body in cases:
            with patch.object(m.urllib.request, 'build_opener') as build:
                build.return_value.open.side_effect = self.raw_error(status, body)
                with self.assertRaisesRegex(ValueError, 'anonymous-result-inconclusive'):
                    m.AnonymousClient().get_object(Bucket=m.BUCKET, Key='_bringness-connection-checks/'+'a'*32+'.txt')

    def test_raw_public_success_is_still_rejected_by_probe(self):
        signed, _ = self.clients()
        response = Mock(status=200)
        with patch.object(m.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value = response
            with self.assertRaisesRegex(ValueError, 'anonymous-access-allowed'):
                m.probe(signed, m.AnonymousClient())
            response.close.assert_called_once()

    def test_raw_anonymous_network_error_has_safe_reason(self):
        with patch.object(m.urllib.request, 'build_opener') as build:
            build.return_value.open.side_effect = URLError(S)
            with self.assertRaises(ValueError) as raised:
                m.AnonymousClient().get_object(Bucket=m.BUCKET, Key='_bringness-connection-checks/'+'a'*32+'.txt')
            self.assertNotIn(S, m.safe_failure(raised.exception))

    def test_raw_anonymous_foreign_target_never_sent(self):
        with patch.object(m.urllib.request, 'build_opener') as build:
            for bucket, key in [('foreign', 'x'), (m.BUCKET, '../x')]:
                with self.assertRaises(ValueError):
                    m.AnonymousClient().get_object(Bucket=bucket, Key=key)
            build.assert_not_called()


if __name__ == '__main__':
    unittest.main()

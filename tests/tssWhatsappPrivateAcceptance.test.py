import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts/tss-whatsapp-private-acceptance.py'
spec = importlib.util.spec_from_file_location('private_acceptance', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateAcceptanceTests(unittest.TestCase):
    settings = {'appSecret': 'SYNTHETIC_APP_SECRET_FOR_TESTS',
                'verifyToken': 'SYNTHETIC_VERIFY_TOKEN_FOR_TESTS_' * 2,
                'allowedPairs': [module.TEST_PAIR]}

    def test_allowlist_must_remain_exactly_the_existing_test_pair(self):
        module.validate_config(self.settings)
        for pairs in [[], [dict(wabaId='2247151412732806', phoneNumberId='1378287792033123')],
                      [module.TEST_PAIR, dict(wabaId='other', phoneNumberId='other')]]:
            with self.assertRaises(RuntimeError):
                module.validate_config({**self.settings, 'allowedPairs': pairs})

    def test_fixture_is_only_test_inbound(self):
        value = module.fixture('synthetic', 123)['entry'][0]
        self.assertEqual(value['id'], module.TEST_PAIR['wabaId'])
        message = value['changes'][0]['value']['messages'][0]
        self.assertEqual(message['from'], '15550000000')
        self.assertIn('SYNTHETIC', message['text']['body'])

    def test_missing_auth_never_prints_command_output_or_secrets(self):
        result = type('Result', (), {'returncode': 1, 'stdout': b'PRIVATE', 'stderr': b'PRIVATE'})()
        with patch.object(module.subprocess, 'run', return_value=result):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(module.run(), 1)
        self.assertNotIn('PRIVATE', output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['failedStage'], 'existing_secret_read')

    def test_wrong_allowlist_stops_before_network(self):
        output = io.StringIO()
        with patch.object(module, 'command', return_value=json.dumps({**self.settings, 'allowedPairs': []})), \
             patch.object(module, 'request') as request, contextlib.redirect_stdout(output):
            self.assertEqual(module.run(), 1)
            request.assert_not_called()

    def test_transport_failure_reports_only_fixed_stage(self):
        output = io.StringIO()
        with patch.object(module, 'command', side_effect=[json.dumps(self.settings), 'PRIVATE_TOKEN']), \
             patch.object(module, 'request', side_effect=RuntimeError('PRIVATE_URL_AND_TOKEN')), \
             contextlib.redirect_stdout(output):
            self.assertEqual(module.run(), 1)
        text = output.getvalue()
        for secret in ['PRIVATE_TOKEN', 'PRIVATE_URL_AND_TOKEN', self.settings['appSecret'], self.settings['verifyToken']]:
            self.assertNotIn(secret, text)
        self.assertEqual(json.loads(text)['failedStage'], 'challenge')


if __name__ == '__main__':
    unittest.main()

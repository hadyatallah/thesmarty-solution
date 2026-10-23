#!/usr/bin/env python3
"""Owner Cloud Shell acceptance. No secret output, IAM edits or Graph sends.

Requires an existing authenticated gcloud session with Secret Manager read and
Firestore read access. It signs one synthetic inbound fixture in memory and
posts only to the pinned TSS webhook. It never enables outbound messaging.
"""
import hashlib
import hmac
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

PROJECT = 'tss-crm-508908'
WEBHOOK = 'https://www.thesmartysolution.com/api/tss-whatsapp-webhook'
TEST_PAIR = {'wabaId': '2882413005471663', 'phoneNumberId': '1378287792033123'}
BODY = 'TSS SYNTHETIC ACCEPTANCE ONLY. No customer message or outbound send.'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=25) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def command(arguments):
    result = subprocess.run(arguments, capture_output=True, timeout=40, check=False)
    if result.returncode:
        raise RuntimeError('existing_google_session_required')
    return result.stdout.decode().strip()


def validate_config(settings):
    if settings.get('allowedPairs') != [TEST_PAIR]:
        raise RuntimeError('existing_test_only_allowlist_required')
    if not isinstance(settings.get('appSecret'), str) or len(settings['appSecret']) < 16:
        raise RuntimeError('existing_secret_invalid')
    if not isinstance(settings.get('verifyToken'), str) or len(settings['verifyToken']) < 32:
        raise RuntimeError('existing_secret_invalid')


def fixture(message_id, now):
    return {'object': 'whatsapp_business_account', 'entry': [{
        'id': TEST_PAIR['wabaId'], 'changes': [{'field': 'messages', 'value': {
            'messaging_product': 'whatsapp',
            'metadata': {'phone_number_id': TEST_PAIR['phoneNumberId']},
            'messages': [{'id': message_id, 'timestamp': str(now),
                          'from': '15550000000', 'type': 'text', 'text': {'body': BODY}}]
        }}]}]}


def run():
    stage = 'existing_secret_read'
    report = {'kind': 'signed_synthetic_inbound_only', 'customerMessagesSent': 0,
              'metaGraphCalls': 0, 'iamChanges': 0, 'tests': {}}
    try:
        settings = json.loads(command(['gcloud', 'secrets', 'versions', 'access', '2',
                                      '--secret=tss-whatsapp-webhook-config', '--project=' + PROJECT]))
        validate_config(settings)
        report['tests']['existing_test_configuration'] = True
        token = command(['gcloud', 'auth', 'print-access-token'])
        stage = 'challenge'
        challenge = 'TSS_SYNTHETIC_' + uuid.uuid4().hex
        query = urllib.parse.urlencode({'hub.mode': 'subscribe',
                                        'hub.verify_token': settings['verifyToken'], 'hub.challenge': challenge})
        status, data = request(WEBHOOK + '?' + query)
        report['tests']['correct_challenge'] = status == 200 and data.decode() == challenge
        assert report['tests']['correct_challenge']
        bad_query = urllib.parse.urlencode({'hub.mode': 'subscribe',
                                            'hub.verify_token': 'INVALID_SYNTHETIC_TOKEN', 'hub.challenge': challenge})
        report['tests']['wrong_challenge'] = request(WEBHOOK + '?' + bad_query)[0] == 403
        assert report['tests']['wrong_challenge']
        stage = 'signed_ingestion'
        message_id = 'wamid.TSS_SYNTHETIC_ACCEPTANCE_' + uuid.uuid4().hex
        payload = fixture(message_id, int(time.time()))
        raw = json.dumps(payload, separators=(',', ':')).encode()
        sign = lambda body: 'sha256=' + hmac.new(settings['appSecret'].encode(), body, hashlib.sha256).hexdigest()
        headers = {'Content-Type': 'application/json', 'x-hub-signature-256': sign(raw)}
        bad_headers = {**headers, 'x-hub-signature-256': 'sha256=' + '0' * 64}
        report['tests']['invalid_hmac'] = request(WEBHOOK, raw, bad_headers)[0] == 401
        assert report['tests']['invalid_hmac']
        identity = ['meta_whatsapp_cloud_api', 'message', TEST_PAIR['wabaId'], TEST_PAIR['phoneNumberId'], message_id]
        key = hashlib.sha256(json.dumps(identity, separators=(',', ':')).encode()).hexdigest()
        document_url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/tss_whatsapp_inbox/' + key
        auth = {'Authorization': 'Bearer ' + token}
        assert request(document_url, headers=auth)[0] == 404
        status, response = request(WEBHOOK, raw, headers)
        report['tests']['signed_ingestion'] = status == 200 and response == b'EVENT_RECEIVED'
        assert report['tests']['signed_ingestion']
        stage = 'independent_firestore_readback'
        status, data = request(document_url, headers=auth)
        assert status == 200
        document = json.loads(data)
        event = json.loads(document['fields']['event']['stringValue'])
        assert event['eventKey'] == key and event['messageId'] == message_id
        assert event['wabaId'] == TEST_PAIR['wabaId'] and event['phoneNumberId'] == TEST_PAIR['phoneNumberId']
        assert event['payload']['text']['body'] == BODY
        report['tests']['independent_firestore_readback'] = True
        stage = 'replay'
        assert request(WEBHOOK, raw, headers)[0] == 200
        status, data = request(document_url, headers=auth)
        replay_document = json.loads(data)
        assert status == 200 and replay_document['createTime'] == document['createTime']
        assert replay_document['updateTime'] == document['updateTime']
        report['tests']['replay_preserves_single_document'] = True
        stage = 'account_rejection'
        payload['entry'][0]['id'] = '9999999999999999'
        unauthorized = json.dumps(payload, separators=(',', ':')).encode()
        assert request(WEBHOOK, unauthorized, {**headers, 'x-hub-signature-256': sign(unauthorized)})[0] == 403
        report['tests']['unauthorized_waba'] = True
        payload['entry'][0]['id'] = TEST_PAIR['wabaId']
        payload['entry'][0]['changes'][0]['value']['metadata']['phone_number_id'] = '9999999999999999'
        unauthorized = json.dumps(payload, separators=(',', ':')).encode()
        assert request(WEBHOOK, unauthorized, {**headers, 'x-hub-signature-256': sign(unauthorized)})[0] == 403
        report['tests']['unauthorized_phone'] = True
        report.update(ok=True, eventKey=key, receivedAt=document['fields']['receivedAt']['timestampValue'],
                      firestoreCreateTime=document['createTime'], adminInboxReadback='pending_owner_UI_check')
    except Exception:
        # No exception repr, command output, request URLs, tokens or private data.
        report.update(ok=False, failedStage=stage, error='private_acceptance_not_complete')
    print(json.dumps(report, indent=2))
    return 0 if report.get('ok') else 1


if __name__ == '__main__':
    sys.exit(run())

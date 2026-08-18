import hashlib
import hmac
import json
from unittest.mock import patch

from django.test import override_settings
from rest_framework.test import APITestCase

from socials.models import WebhookEvent


def sign(body, secret):
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f'sha256={digest}'


@override_settings(
    META_APP_SECRET='secret123',
    META_WEBHOOK_VERIFY_TOKEN='verify-me',
)
class WebhookTests(APITestCase):
    def test_verify_handshake_success(self):
        response = self.client.get(
            '/api/webhooks/meta/',
            {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'verify-me',
                'hub.challenge': '12345',
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), '12345')

    def test_verify_handshake_bad_token(self):
        response = self.client.get(
            '/api/webhooks/meta/',
            {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'wrong',
                'hub.challenge': '12345',
            },
        )
        self.assertEqual(response.status_code, 403)

    @patch('socials.views.process_webhook_event')
    def test_valid_signature_persists_event_and_dispatches(self, mock_task):
        payload = {'object': 'page', 'entry': [{'id': 'p1', 'messaging': []}]}
        body = json.dumps(payload).encode()
        response = self.client.post(
            '/api/webhooks/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256=sign(body, 'secret123'),
        )
        self.assertEqual(response.status_code, 200)
        event = WebhookEvent.objects.get()
        self.assertEqual(event.object_type, 'page')
        self.assertTrue(event.signature_valid)
        self.assertFalse(event.processed)
        mock_task.delay.assert_called_once_with(event.id)

    def test_invalid_signature_rejected_and_not_persisted(self):
        body = json.dumps({'object': 'page', 'entry': []}).encode()
        response = self.client.post(
            '/api/webhooks/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256='sha256=deadbeef',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_missing_signature_rejected(self):
        body = json.dumps({'object': 'page', 'entry': []}).encode()
        response = self.client.post(
            '/api/webhooks/meta/', data=body, content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(META_APP_SECRET='')
    def test_empty_app_secret_rejects_signature_signed_with_empty_key(self):
        body = json.dumps({'object': 'page', 'entry': []}).encode()
        response = self.client.post(
            '/api/webhooks/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256=sign(body, ''),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    @override_settings(META_WEBHOOK_VERIFY_TOKEN='')
    def test_empty_verify_token_rejects_verification(self):
        response = self.client.get(
            '/api/webhooks/meta/',
            {
                'hub.mode': 'subscribe',
                'hub.verify_token': '',
                'hub.challenge': '12345',
            },
        )
        self.assertEqual(response.status_code, 403)

from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from core.models import Tenant
from socials.models import ConnectedPage, MetaConnection, WebhookEvent

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class MetaConnectionTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')

    def test_token_stored_encrypted_and_retrievable(self):
        conn = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fb123', status='connected'
        )
        conn.set_access_token('EAAG-user-token')
        conn.save()
        conn.refresh_from_db()
        self.assertNotIn('EAAG-user-token', conn.access_token_encrypted)
        self.assertEqual(conn.get_access_token(), 'EAAG-user-token')

    def test_one_connection_per_channel_identity(self):
        MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        MetaConnection.objects.create(tenant=self.tenant, fb_user_id='ig-9')
        MetaConnection.objects.create(tenant=self.tenant, fb_user_id='wa-15551234')
        with self.assertRaises(Exception):
            MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')


@override_settings(FERNET_KEY=TEST_KEY)
class ConnectedPageTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.conn = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fb123'
        )

    def test_page_token_round_trip(self):
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.conn,
            page_id='page1', name='Acme Store'
        )
        page.set_access_token('EAAG-page-token')
        page.save()
        page.refresh_from_db()
        self.assertEqual(page.get_access_token(), 'EAAG-page-token')
        self.assertEqual(page.status, 'connected')


class WebhookEventTests(TestCase):
    def test_defaults(self):
        event = WebhookEvent.objects.create(
            object_type='page', payload={'entry': []}, signature_valid=True
        )
        self.assertFalse(event.processed)
        self.assertIsNotNone(event.received_at)

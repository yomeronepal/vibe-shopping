from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from core.models import Tenant
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection


def make_page(tenant):
    connection = MetaConnection.objects.create(tenant=tenant, fb_user_id='fb1')
    return ConnectedPage.objects.create(
        tenant=tenant, connection=connection, page_id='p1', name='Store'
    )


class InboxModelTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.page = make_page(self.tenant)
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita'
        )

    def test_customer_unique_per_tenant_platform_and_id(self):
        with self.assertRaises(IntegrityError):
            Customer.objects.create(
                tenant=self.tenant, platform='facebook', platform_user_id='psid1'
            )

    def test_conversation_defaults_and_uniqueness(self):
        convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer, platform='facebook'
        )
        self.assertEqual(convo.status, 'new')
        self.assertEqual(convo.unread_count, 0)
        with self.assertRaises(IntegrityError):
            Conversation.objects.create(
                tenant=self.tenant, page=self.page, customer=self.customer, platform='facebook'
            )

    def test_message_dedup_key_unique(self):
        convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer, platform='facebook'
        )
        Message.objects.create(
            conversation=convo, direction='in', text='hi',
            platform_message_id='mid1', sent_at=timezone.now(),
        )
        with self.assertRaises(IntegrityError):
            Message.objects.create(
                conversation=convo, direction='in', text='hi again',
                platform_message_id='mid1', sent_at=timezone.now(),
            )

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection


class ConversationSearchTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', status='connected',
        )
        self.sita = self.make_conversation('psid1', 'Sita Sharma', 'kalo polo kati ho?', status='waiting_business')
        self.ram = self.make_conversation('psid2', 'Ram Thapa', 'delivery kahile huncha?', status='resolved')

    def make_conversation(self, psid, name, text, status='open'):
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id=psid, name=name,
        )
        conversation = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer,
            platform='facebook', status=status, last_message_at=timezone.now(),
            last_message_preview=text[:120],
        )
        Message.objects.create(
            conversation=conversation, direction='in', text=text,
            platform_message_id=f'm-{psid}', sent_at=timezone.now(),
        )
        return conversation

    def search(self, q, extra=''):
        return self.client.get(f'/api/inbox/conversations/?q={q}{extra}')

    def test_search_by_customer_name(self):
        response = self.search('sita')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['customer']['name'], 'Sita Sharma')

    def test_search_by_message_text(self):
        response = self.search('delivery')
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['customer']['name'], 'Ram Thapa')

    def test_search_no_match(self):
        response = self.search('pashmina')
        self.assertEqual(response.data, [])

    def test_search_combines_with_status_filter(self):
        Message.objects.create(
            conversation=self.ram, direction='in', text='kalo polo chahiyo',
            platform_message_id='m-extra', sent_at=timezone.now(),
        )
        response = self.search('kalo', '&status=waiting_business')
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['customer']['name'], 'Sita Sharma')

    def test_search_returns_distinct_conversations(self):
        Message.objects.create(
            conversation=self.sita, direction='in', text='kalo polo L size?',
            platform_message_id='m-dup', sent_at=timezone.now(),
        )
        response = self.search('kalo')
        ids = [c['id'] for c in response.data]
        self.assertEqual(len(ids), len(set(ids)))


class ConversationTagTests(ConversationSearchTests):
    def patch_tags(self, conversation, tags):
        return self.client.patch(
            f'/api/inbox/conversations/{conversation.id}/', {'tags': tags}, format='json',
        )

    def test_set_and_return_tags(self):
        response = self.patch_tags(self.sita, ['VIP', 'wholesale'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['tags'], ['VIP', 'wholesale'])
        self.sita.refresh_from_db()
        self.assertEqual(self.sita.tags, ['VIP', 'wholesale'])

    def test_tags_cleaned_deduped_and_capped(self):
        response = self.patch_tags(self.sita, ['  VIP  ', 'VIP', '', 'x' * 50] + [f't{i}' for i in range(12)])
        self.assertEqual(response.status_code, 200)
        tags = response.data['tags']
        self.assertEqual(tags[0], 'VIP')
        self.assertEqual(len(tags), 10)
        self.assertTrue(all(len(tag) <= 30 for tag in tags))

    def test_rejects_non_list_tags(self):
        response = self.patch_tags(self.sita, 'VIP')
        self.assertEqual(response.status_code, 400)

    def test_clearing_tags(self):
        self.patch_tags(self.sita, ['VIP'])
        response = self.patch_tags(self.sita, [])
        self.assertEqual(response.data['tags'], [])

    def test_search_matches_tags(self):
        self.patch_tags(self.ram, ['wholesale'])
        response = self.search('wholesale')
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['customer']['name'], 'Ram Thapa')

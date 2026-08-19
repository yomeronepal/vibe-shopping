from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import AITokenUsage, Order, OrderItem, Product, SocialMediaPost, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection


class AnalyticsSummaryTests(APITestCase):
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
        self.product = Product.objects.create(
            tenant=self.tenant, name='Shawl', price=1000, stock=10,
            status='published', is_active=True,
        )
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer,
            platform='facebook', last_message_at=timezone.now(),
        )
        now = timezone.now()
        Message.objects.create(
            conversation=self.convo, direction='in', text='price?',
            platform_message_id='m1', sent_at=now - timedelta(minutes=10),
        )
        Message.objects.create(
            conversation=self.convo, direction='out', text='Rs. 1000', sent_by_ai=True,
            platform_message_id='m2', sent_at=now - timedelta(minutes=6),
        )
        for i, order_status in enumerate(('completed', 'completed', 'cancelled', 'returned')):
            order = Order.objects.create(
                tenant=self.tenant, total_amount=1000, status=order_status,
                customer_phone='9800000000' if i < 2 else '',
                metadata={'source': 'chat_bot', 'conversation_id': self.convo.id} if i == 0 else {},
            )
            OrderItem.objects.create(order=order, product=self.product, quantity=1, price=1000)
        SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='Shawl post', status='posted', platform_post_id='fb1',
            metadata={'engagement': {'likes': 10, 'comments': 3, 'shares': 1}},
        )
        AITokenUsage.objects.create(
            tenant=self.tenant, ai_provider='gemini', operation_type='bot_reply',
            input_tokens=100, output_tokens=50, total_tokens=150, estimated_cost=0.001,
        )
        AITokenUsage.objects.create(
            tenant=self.tenant, ai_provider='claude', operation_type='bot_reply',
            input_tokens=100, output_tokens=0, total_tokens=100, success=False,
        )

    @patch('vendor.analytics_views.fetch_follower_counts', return_value={'facebook': 120, 'instagram': 80})
    def get_summary(self, mock_followers):
        return self.client.get('/api/vendor/analytics/summary/?days=30')

    def test_sales_metrics(self):
        data = self.get_summary().data['sales']
        self.assertEqual(data['total_orders'], 2)
        self.assertEqual(data['revenue'], 2000.0)
        self.assertEqual(data['average_order_value'], 1000.0)
        self.assertEqual(data['cancelled_orders'], 1)
        self.assertEqual(data['returned_orders'], 1)
        self.assertEqual(data['repeat_customers'], 1)
        self.assertEqual(data['best_sellers'][0]['name'], 'Shawl')
        self.assertEqual(data['conversion_rate'], 1.0)

    def test_social_metrics(self):
        data = self.get_summary().data['social']
        self.assertEqual(data['messages_received'], 1)
        self.assertEqual(data['comments_received'], 0)
        self.assertEqual(data['average_response_minutes'], 4.0)
        self.assertEqual(data['followers']['facebook'], 120)
        self.assertEqual(data['best_posts'][0]['engagement'], 14)
        self.assertEqual(data['best_products'][0]['name'], 'Shawl')

    def test_ai_metrics(self):
        data = self.get_summary().data['ai']
        self.assertEqual(data['ai_conversations'], 1)
        self.assertEqual(data['resolution_rate'], 1.0)
        self.assertEqual(data['ai_orders'], 1)
        self.assertEqual(data['ai_conversion_rate'], 1.0)
        providers = {row['provider']: row for row in data['usage']}
        self.assertEqual(providers['gemini']['tokens'], 150)
        self.assertEqual(data['failed_calls'], 1)

    def test_requires_vendor(self):
        self.client.credentials()
        response = self.client.get('/api/vendor/analytics/summary/')
        self.assertEqual(response.status_code, 401)

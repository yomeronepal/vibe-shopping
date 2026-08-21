from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, SocialMediaPost, Tenant, VendorProfile
from socials.services.boost_advisor import compute_boost_advice, get_boost_advice


class BoostAdvisorTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Boost Shop', subdomain='boostshop', metadata={})
        self.user = User.objects.create_user(username='boost_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def make_product(self, name, price=1000, stock=10, **kwargs):
        return Product.objects.create(
            tenant=self.tenant, name=name, price=price, stock=stock,
            status='published', is_active=True, **kwargs,
        )

    def make_post(self, product, likes=0, comments=0, shares=0, platform='facebook'):
        return SocialMediaPost.objects.create(
            tenant=self.tenant, product=product, platform=platform,
            status='posted', post_url=f'https://fb.com/post-{product.id}',
            caption=f'{product.name} now available!',
            metadata={'engagement': {'likes': likes, 'comments': comments, 'shares': shares}},
        )

    def make_order(self, product, quantity=1):
        order = Order.objects.create(
            tenant=self.tenant, user=None, total_amount=product.price,
            status='pending_delivery', payment_method='cash', order_type='online',
            customer_name='Buyer', metadata={},
        )
        OrderItem.objects.create(order=order, product=product, quantity=quantity, price=product.price)
        return order


@patch('socials.services.boost_advisor.generate_reasonings', side_effect=lambda t, items: items)
class ScoringTests(BoostAdvisorTestBase):
    def test_ranks_by_engagement_and_orders(self, _):
        weak = self.make_product('Weak Item')
        strong = self.make_product('Strong Item')
        self.make_post(weak, likes=2)
        self.make_post(strong, likes=10, comments=5)
        self.make_order(strong)
        advice = compute_boost_advice(self.tenant)
        names = [item['product']['name'] for item in advice['recommendations']]
        self.assertEqual(names[0], 'Strong Item')

    def test_out_of_stock_products_excluded(self, _):
        gone = self.make_product('Gone Item', stock=0)
        self.make_post(gone, likes=50)
        advice = compute_boost_advice(self.tenant)
        self.assertEqual(advice['recommendations'], [])

    def test_low_stock_warning_and_budget_plan(self, _):
        product = self.make_product('Scarce Item', price=3000, stock=2)
        self.make_post(product, likes=8)
        advice = compute_boost_advice(self.tenant)
        item = advice['recommendations'][0]
        self.assertTrue(any('stock' in warning for warning in item['warnings']))
        self.assertEqual(item['suggested']['daily_budget'], 360)
        self.assertEqual(item['suggested']['days'], 5)
        self.assertEqual(item['suggested']['total_budget'], 1800)

    def test_services_always_boostable(self, _):
        service = self.make_product('Photo Session', price=8000, stock=0, item_type='service')
        self.make_post(service, likes=4)
        advice = compute_boost_advice(self.tenant)
        self.assertEqual(advice['recommendations'][0]['product']['name'], 'Photo Session')


@patch('socials.services.boost_advisor.generate_reasonings', side_effect=lambda t, items: items)
class CacheAndEndpointTests(BoostAdvisorTestBase):
    def test_advice_cached_between_calls(self, _):
        product = self.make_product('Cached Item')
        self.make_post(product, likes=3)
        first = get_boost_advice(self.tenant)
        self.make_post(self.make_product('Newer Item'), likes=99)
        second = get_boost_advice(self.tenant)
        self.assertEqual(first['generated_at'], second['generated_at'])
        refreshed = get_boost_advice(self.tenant, refresh=True)
        self.assertNotEqual(first['generated_at'], refreshed['generated_at'])

    def test_endpoint_returns_recommendations(self, _):
        product = self.make_product('Endpoint Item')
        self.make_post(product, likes=6)
        response = self.client.get('/api/socials/boost-advisor/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['recommendations']), 1)
        item = response.data['recommendations'][0]
        self.assertEqual(item['product']['name'], 'Endpoint Item')
        self.assertIn('suggested', item)
        self.assertEqual(item['suggested']['goal'], 'More messages')

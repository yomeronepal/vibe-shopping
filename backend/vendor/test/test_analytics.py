from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile, Product

class AnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Analytics Shop', subdomain='analytics', is_active=True)
        self.vendor_user = User.objects.create_user(username='vendor_ana', email='v@ana.com', password='pw')
        VendorProfile.objects.create(user=self.vendor_user, tenant=self.tenant)
        
        self.customer_user = User.objects.create_user(username='cust_ana', email='c@ana.com', password='pw')
        
        self.product = Product.objects.create(
            tenant=self.tenant,
            name='Vibe Shirt',
            price=20.00,
            stock=100,
            is_active=True,
            metadata={'vibe_tags': ['Retro', 'Streetwear']}
        )

    def test_analytics_tracking_and_retrieval(self):
        # 1. Track View (Public)
        resp = self.client.post('/api/vendor/analytics/track/', {
            'product_id': self.product.id,
            'event_type': 'view',
            'country': 'US'
        })
        self.assertEqual(resp.status_code, 201)

        # 2. Track Add to Cart (Public)
        resp = self.client.post('/api/vendor/analytics/track/', {
            'product_id': self.product.id,
            'event_type': 'add_to_cart',
            'country': 'JP'
        })
        self.assertEqual(resp.status_code, 201)

        # 3. Purchase (Requires Auth, triggers event)
        self.client.force_login(self.customer_user)
        resp = self.client.post('/api/orders/create_order/', {
            'items': [{'product_id': self.product.id, 'quantity': 1}],
            'payment_method': 'card'
        }, format='json', HTTP_X_TENANT_SUBDOMAIN='analytics')
        self.assertEqual(resp.status_code, 201)

        # 4. Check Vibe Analytics (Vendor)
        self.client.force_login(self.vendor_user)
        resp = self.client.get('/api/vendor/analytics/vibes/')
        self.assertEqual(resp.status_code, 200)
        
        data = resp.data
        retro = next((item for item in data if item['vibe'] == 'Retro'), None)
        self.assertIsNotNone(retro)
        self.assertGreaterEqual(retro['views'], 1)
        self.assertGreaterEqual(retro['add_to_cart'], 1)
        self.assertGreaterEqual(retro['purchases'], 1)

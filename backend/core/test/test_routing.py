from django.test import TestCase
from rest_framework.test import APIClient
from core.models import Tenant, Product
from django.utils.text import slugify
from django.test import override_settings

@override_settings(ALLOWED_HOSTS=['*'], TENANT_BASE_DOMAIN='vibe-shopping.com')
class RoutingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.store_name = 'Header Shop'
        self.subdomain = 'header-shop'
        self.tenant = Tenant.objects.create(name=self.store_name, subdomain=self.subdomain, is_active=True)
        self.product = Product.objects.create(
            tenant=self.tenant, 
            name='Header Product', 
            price=10.0, 
            is_active=True
        )

    def test_header_routing(self):
        # Access with Correct Header
        response = self.client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN=self.subdomain)
        self.assertEqual(response.status_code, 200)
        products = response.data.get('results', response.data)
        self.assertTrue(len(products) > 0)
        self.assertEqual(products[0]['name'], 'Header Product')

        # Access with Wrong Header
        response = self.client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN='wrong-shop')
        products_wrong = response.data.get('results', response.data)
        self.assertEqual(len(products_wrong), 0)

    def test_subdomain_routing(self):
        host = f"{self.subdomain}.vibe-shopping.com"
        response = self.client.get('/api/public/products/', HTTP_HOST=host)
        self.assertEqual(response.status_code, 200)
        products = response.data.get('results', response.data)
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0]['name'], 'Header Product')

        wrong_host = "wrong.vibe-shopping.com"
        response = self.client.get('/api/public/products/', HTTP_HOST=wrong_host)
        products_wrong = response.data.get('results', response.data)
        self.assertEqual(len(products_wrong), 0)

    def test_tenant_conflict(self):
        # Create another tenant
        other_tenant = Tenant.objects.create(name='Other Shop', subdomain='other-shop', is_active=True)
        
        # Unauthenticated access to other shop via header
        response = self.client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN='other-shop')
        self.assertEqual(response.status_code, 200) # Public access allowed
        
        # Note: Logic in verify_tenant_conflict showed 403 for Authenticated User A accessing B.
        # But here we are unauthenticated.

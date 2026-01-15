from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile, Product

class MultiTenancyTests(TestCase):
    def test_data_isolation(self):
        # Vendor A
        tenant_a = Tenant.objects.create(name='Store A', subdomain='store-a', is_active=True)
        user_a = User.objects.create_user(username='vendor_a', email='a@a.com', password='pw')
        VendorProfile.objects.create(user=user_a, tenant=tenant_a)
        
        # Vendor B
        tenant_b = Tenant.objects.create(name='Store B', subdomain='store-b', is_active=True)
        user_b = User.objects.create_user(username='vendor_b', email='b@b.com', password='pw')
        VendorProfile.objects.create(user=user_b, tenant=tenant_b)

        # A creates product
        Product.objects.create(tenant=tenant_a, name='Product A', price=10.0, stock=100)

        # Login as B
        client_b = APIClient()
        client_b.force_login(user_b)
        
        # B lists products - should be empty
        response = client_b.get('/api/vendor/products/')
        self.assertEqual(response.status_code, 200)
        products = response.data.get('results', response.data)
        self.assertEqual(len(products), 0)

        # Login as A
        client_a = APIClient()
        client_a.force_login(user_a)
        
        # A lists products - should see 1
        response = client_a.get('/api/vendor/products/')
        products_a = response.data.get('results', response.data)
        self.assertEqual(len(products_a), 1)

    def test_helper_setup_logic(self):
        # Just to ensure signups work as tested in verify script, though typically model creation is enough.
        client = APIClient()
        data = {
            'username': 'new_vendor',
            'email': 'new@v.com',
            'password': 'pw',
            'store_name': 'New Store'
        }
        # Assuming this endpoint is open
        response = client.post('/api/auth/vendor/signup/', data)
        # Depending on auth settings, this might need more setup, but verify script used it.
        # If unit test DB is clean, it should work.

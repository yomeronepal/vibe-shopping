from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile, Product
from django.core.files.uploadedfile import SimpleUploadedFile

class ProductCreationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Vendor Creator', subdomain='vendor-create', is_active=True)
        self.user = User.objects.create_user(username='vendor_creator', email='v@c.com', password='password')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant)
        self.client.force_login(self.user)

    def test_create_product_success(self):
        img_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
        image = SimpleUploadedFile(name='test_product.gif', content=img_data, content_type='image/gif')
        
        data = {
            'name': 'AI Product',
            'description': 'Needs AI analysis',
            'price': 99.99,
            'stock': 5,
            'image': image,
        }
        
        response = self.client.post('/api/vendor/products/', data, format='multipart')
        self.assertEqual(response.status_code, 201)
        
        product_id = response.data['id']
        p = Product.objects.get(id=product_id)
        
        self.assertEqual(p.status, 'draft')
        self.assertEqual(p.tenant, self.tenant)
        self.assertTrue(bool(p.image))

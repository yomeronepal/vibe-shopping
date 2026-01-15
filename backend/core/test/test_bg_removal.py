from django.test import TestCase
from rest_framework.test import APIClient
from core.models import Product, Tenant, VendorProfile
from django.contrib.auth.models import User
from core.tasks import remove_background_task
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock

class BgRemovalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='BG Store', subdomain='bg', is_active=True)
        self.user = User.objects.create_user(username='bg_user', email='b@b.com', password='pw')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant)
        self.client.force_login(self.user)
        
        # Valid 1x1 GIF
        img_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
        image = SimpleUploadedFile('test.gif', img_data, 'image/gif')
        self.product = Product.objects.create(tenant=self.tenant, name='Messy Product', image=image, price=20.0)

    def test_remove_background_endpoint(self):
        with patch('core.tasks.remove_background_task.delay') as mock_task:
            resp = self.client.post(f'/api/vendor/products/{self.product.id}/remove-background/')
            self.assertEqual(resp.status_code, 202)
            mock_task.assert_called_with(self.product.id, 'Product')

    def test_remove_background_task_logic(self):
        mock_clean_data = b'cleaned_image_bytes'
        
        # Patch sys.modules to mock rembg before it's imported inside the task
        with patch.dict('sys.modules', {'rembg': MagicMock(remove=MagicMock(return_value=mock_clean_data))}):
            remove_background_task(self.product.id, 'Product')
            
            self.product.refresh_from_db()
            self.assertTrue(bool(self.product.processed_image))
            self.assertIn(f"uploads/{self.tenant.subdomain}/products/", self.product.processed_image.name)


import os
import django
import sys
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from core.models import Product, Tenant, VendorProfile
from django.contrib.auth.models import User
from core.tasks import remove_background_task

def verify_bg_removal():
    print("Starting Background Removal Verification...")
    client = APIClient()
    
    # Setup
    tenant, _ = Tenant.objects.get_or_create(name='BG Store', defaults={'subdomain': 'bg', 'is_active': True})
    user, _ = User.objects.get_or_create(username='bg_user', defaults={'email': 'b@b.com', 'password': 'pw'})
    VendorProfile.objects.get_or_create(user=user, tenant=tenant)
    client.force_login(user)

    # valid gif
    img_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    image = SimpleUploadedFile('test.gif', img_data, 'image/gif')
    
    product = Product.objects.create(tenant=tenant, name='Messy Product', image=image, price=20.0)

    # Test API Endpoint
    print("\nCalling remove-background endpoint...")
    with patch('core.tasks.remove_background_task.delay') as mock_task:
        resp = client.post(f'/api/products/{product.id}/remove-background/')
        if resp.status_code == 202:
            print("SUCCESS: Endpoint returned 202.")
            mock_task.assert_called_with(product.id, 'Product')
            print("SUCCESS: Task triggered.")
        else:
            print(f"FAILED: {resp.status_code}")
            return

    # Verify Task Logic (Mocking rembg)
    print("\nVerifying Task Logic...")
    
    # Mock rembg.remove to return specific "cleaned" bytes
    mock_clean_data = b'cleaned_image_bytes'
    
    # We strip imports inside the task, so we need to patch specifically.
    # The task has local imports: from rembg import remove
    # Checking where to patch... since it's inside the function, patching 'core.tasks.remove' won't work easily if it's not imported at top level.
    # However, `sys.modules` patching might work or mocking `rembg` before import.
    
    with patch.dict('sys.modules', {'rembg': MagicMock(remove=MagicMock(return_value=mock_clean_data))}):
        remove_background_task(product.id, 'Product')
        
        product.refresh_from_db()
        if product.processed_image:
            print(f"SUCCESS: Processed Image saved: {product.processed_image.name}")
            # Check tenant path
            if f"uploads/{tenant.subdomain}/products/" in product.processed_image.name:
                 print("SUCCESS: Correct Tenant Path.")
            else:
                 print(f"FAILED: Incorrect path: {product.processed_image.name}")
        else:
            print("FAILED: No processed image saved.")

if __name__ == '__main__':
    verify_bg_removal()

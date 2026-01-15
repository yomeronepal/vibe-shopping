
import os
import django
import sys
from django.core.files.uploadedfile import SimpleUploadedFile

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile, Product

def verify_product_creation():
    print("Starting Product Creation Verification...")
    client = APIClient()
    
    # Setup Data
    name_a = 'Vendor Creator'
    tenant_a, _ = Tenant.objects.get_or_create(name=name_a, defaults={'subdomain': 'vendor-create', 'is_active': True})
    user_a, _ = User.objects.get_or_create(username='vendor_creator', defaults={'email': 'v@c.com', 'password': 'password'})
    VendorProfile.objects.get_or_create(user=user_a, tenant=tenant_a)
    
    client.force_login(user=user_a)
    
    # Valid 1x1 GIF
    valid_image_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    
    # Create Dummy Image
    image = SimpleUploadedFile(name='test_product.gif', content=valid_image_data, content_type='image/gif')
    gallery1 = SimpleUploadedFile(name='gallery1.gif', content=valid_image_data, content_type='image/gif')
    
    # Payload
    data = {
        'name': 'AI Product',
        'description': 'Needs AI analysis',
        'price': 99.99,
        'stock': 5,
        'image': image,
        # 'gallery_images': [gallery1] # Sending list of files via client is tricky in simple dict, usually need multipart
    }
    
    # Sending multipart data
    # Note: DRF test client handles multipart if data contains file objects
    print("\nCreating product via API...")
    response = client.post('/api/products/', data, format='multipart')
    
    if response.status_code == 201:
        print(f"SUCCESS: Product Created (ID: {response.data['id']})")
        product_id = response.data['id']
        
        # Verify DB
        p = Product.objects.get(id=product_id)
        print(f"DB Check: Status={p.status}, Tenant={p.tenant.name}, HasImage={bool(p.image)}")
        
        if p.status == 'draft' and p.tenant == tenant_a and p.image:
             print("VERIFICATION PASSED: Draft status, Tenant assigned, Image saved.")
        else:
             print("VERIFICATION FAILED: Incorrect data.")
    else:
        print(f"FAILED: {response.status_code}")
        print(response.data)

if __name__ == '__main__':
    verify_product_creation()

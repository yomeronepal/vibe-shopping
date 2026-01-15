
import os
import django
import sys
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from core.models import Product, Tenant, VendorProfile
from django.contrib.auth.models import User
from core.tasks import detect_vibe

def verify_copy_generation():
    print("Starting Copy Generation Verification...")
    client = APIClient()
    
    # Setup
    tenant, _ = Tenant.objects.get_or_create(name='Copy Store', defaults={'subdomain': 'copy', 'is_active': True})
    user, _ = User.objects.get_or_create(username='copy_user', defaults={'email': 'c@c.com', 'password': 'pw'})
    VendorProfile.objects.get_or_create(user=user, tenant=tenant)
    client.force_login(user)

    # valid gif
    img_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    image = SimpleUploadedFile('test.gif', img_data, 'image/gif')
    
    product = Product.objects.create(tenant=tenant, name='Old Title', image=image, price=10.0)

    # Mock Gemini Service returning Nepali title
    mock_response = {
        'success': True,
        'data': {
            'title': 'Red Sari (Rato Sari)',
            'description': 'Beautiful sari. Ramro cha.',
            'tags': ['sari'],
            'seo_keywords': ['red sari', 'rato sari']
        }
    }
    
    print("\nCalling generate-copy endpoint...")
    # We patch the analyze method called by the task. 
    # But since the view calls the task asynchronously (delay), 
    # in integration tests without a worker, we might need to mock "delay" or force it eager.
    
    # Method 1: Mocking the task call to ensure endpoint works
    # Method 2: Allowing it to run if CELERY_TASK_ALWAYS_EAGER=True (common in tests)
    # Let's verify the endpoint returns 202 first.
    
    with patch('core.tasks.detect_vibe.delay') as mock_task:
        resp = client.post(f'/api/products/{product.id}/generate-copy/')
        if resp.status_code == 202:
            print("SUCCESS: Endpoint returned 202 Accepted.")
            mock_task.assert_called_with(product.id)
            print("SUCCESS: Task triggered.")
        else:
            print(f"FAILED: {resp.status_code}")
            return

    # Now verify the LOGIC by running the task manually with mock
    print("\nVerifying Task Logic for Romanized Nepali...")
    with patch('core.services.gemini_service.GeminiProductAnalyzer.analyze_product_image', return_value=mock_response):
        detect_vibe(product.id)
        
        product.refresh_from_db()
        print(f"New Title: {product.ai_generated_title}")
        print(f"New Desc: {product.ai_generated_description}")
        
        if "(Rato Sari)" in product.ai_generated_title:
             print("SUCCESS: Romanized Nepali title found.")
        else:
             print("FAILED: Title not updated correctly.")

if __name__ == '__main__':
    verify_copy_generation()

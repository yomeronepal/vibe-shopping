
import os
import django
import sys
from django.core.files.uploadedfile import SimpleUploadedFile

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from core.models import Product, Tenant, VendorProfile
from django.contrib.auth.models import User
from core.tasks import detect_vibe
from unittest.mock import patch

def verify_vibe_detection():
    print("Starting Vibe Detection Verification...")
    
    # Setup Tenant/User
    tenant, _ = Tenant.objects.get_or_create(name='Vibe Vendor', defaults={'subdomain': 'vibe', 'is_active': True})
    user, _ = User.objects.get_or_create(username='vibe_user', defaults={'email': 'v@v.com', 'password': 'pw'})
    VendorProfile.objects.get_or_create(user=user, tenant=tenant)

    # Valid 1x1 GIF
    valid_image_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    image = SimpleUploadedFile(name='vibe.gif', content=valid_image_data, content_type='image/gif')

    # Create Product
    product = Product.objects.create(
        tenant=tenant,
        name='Vibe Test Product',
        price=50.00,
        image=image,
        status='draft'
    )
    print(f"Created Product {product.id}")

    # Mock the Analyzer response to avoid real API call/cost and ensure deterministic test
    # We want to verify the TASK logic handles the response correctly.
    mock_data = {
        'success': True,
        'data': {
            'vibe_tags': ['Cyberpunk', 'Neon'],
            'confidence_score': 0.98,
            'suggested_price_range': '45-60',
            'tags': ['shirt', 'cool']
        }
    }

    with patch('core.services.gemini_service.GeminiProductAnalyzer.analyze_product_image', return_value=mock_data):
        print("Running detect_vibe task (simulated)...")
        detect_vibe(product.id)
        
        # Reload
        product.refresh_from_db()
        meta = product.metadata
        print(f"Product Metadata: {meta}")
        
        if meta.get('vibe_tags') == ['Cyberpunk', 'Neon'] and meta.get('confidence_score') == 0.98:
            print("SUCCESS: Vibe data detected and stored.")
        else:
            print("FAILED: Vibe data missing.")

if __name__ == '__main__':
    verify_vibe_detection()

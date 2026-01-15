
import os
import django
import sys

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from core.models import Tenant, Product
from django.utils.text import slugify

def verify_header_routing():
    print("Starting Header Routing Verification...")
    client = APIClient()
    
    # Ensure tenant exists
    store_name = 'Header Store'
    subdomain = slugify(store_name)
    try:
        tenant, created = Tenant.objects.get_or_create(name=store_name, defaults={'subdomain': subdomain, 'is_active': True})
        if created:
             print(f"Created tenant {subdomain}")
        
        # Ensure product exists
        Product.objects.create(
            tenant=tenant, 
            name='Header Product', 
            price=10.0, 
            description='Test',
            is_active=True
        )
    except Exception as e:
        print(f"Setup error: {e}")

    # Test
    print(f"\nAccessing with X-Tenant-Subdomain: {subdomain} ...")
    response = client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN=subdomain)
    
    products = response.data.get('results', response.data)
    if len(products) > 0 and products[0]['name'] == 'Header Product':
        print("SUCCESS: Product found via Header.")
    else:
        print(f"FAILED: Expected product, found {len(products)}")
        print(response.data)

if __name__ == '__main__':
    verify_header_routing()


import os
import django
import sys

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, Product, VendorProfile
from django.utils.text import slugify

def verify_subdomain_routing():
    print("Starting Subdomain Routing Verification...")
    client = APIClient()
    
    # Clean up previous test data if exists
    try:
        username = 'subdomain_vendor'
        store_name = 'Subdomain Store'
        subdomain = slugify(store_name)
        
        User.objects.filter(username=username).delete()
        Tenant.objects.filter(subdomain=subdomain).delete()
    except Exception as e:
        print(f"Cleanup warning: {e}")

    # 1. Signup Vendor with Subdomain
    print("\n1. Signing up Vendor...")
    signup_data = {
        'username': 'subdomain_vendor',
        'email': 'subdomain@example.com',
        'password': 'password123',
        'store_name': 'Subdomain Store'
    }
    response = client.post('/api/auth/vendor/signup/', signup_data)
    if response.status_code != 201:
        print(f"FAILED: Signup failed. {response.content}")
        return
    print(f"SUCCESS: Vendor created for store '{signup_data['store_name']}'.")
    
    # Get Tenant details
    tenant = Tenant.objects.get(name=signup_data['store_name'])
    print(f"Tenant Subdomain: {tenant.subdomain}")
    
    # 2. Create a Product
    print("\n2. Creating Product...")
    client.force_authenticate(user=User.objects.get(username='subdomain_vendor'))
    product_data = {
        'name': 'Exclusive Subdomain Product',
        'price': '99.99',
        'stock': 10,
        'description': 'Only available on this subdomain',
        'is_active': True # Explicitly set to True
    }
    response = client.post('/api/products/', product_data)
    if response.status_code != 201:
        print(f"FAILED: Product creation failed. {response.content}")
        return
    print("SUCCESS: Product created.")
    
    # 3. Access via Validation Subdomain (Should Succeed)
    # Use TENANT_BASE_DOMAIN if set, else default
    base_domain = os.environ.get('TENANT_BASE_DOMAIN', 'vibe-shopping.com')
    host = f"{tenant.subdomain}.{base_domain}"
    print(f"\n3. Accessing via Host: {host} (Base: {base_domain}) ...")
    
    client_public = APIClient()
    # Pass HTTP_HOST to simulate subdomain request
    response = client_public.get('/api/public/products/', HTTP_HOST=host)
    
    products = response.data.get('results', response.data)
    if len(products) == 1 and products[0]['name'] == 'Exclusive Subdomain Product':
        print("SUCCESS: Product found via subdomain.")
    else:
        print(f"FAILED: Expected 1 product, found {len(products)}")
        return

    # 4. Access via Wrong Subdomain (Should Fail to find product)
    wrong_host = "wrong-store.vibe-shopping.com"
    print(f"\n4. Accessing via Wrong Host: {wrong_host} ...")
    
    response = client_public.get('/api/public/products/', HTTP_HOST=wrong_host)
    products = response.data.get('results', response.data)
    
    if len(products) == 0:
        print("SUCCESS: No products found on wrong subdomain.")
    else:
        print(f"FAILED: Expected 0 products, found {len(products)}")
        return
        
    print("\nVERIFICATION COMPLETE: SUBDOMAIN ROUTING WORKING")

if __name__ == '__main__':
    verify_subdomain_routing()

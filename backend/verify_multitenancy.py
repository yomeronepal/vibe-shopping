
import os
import django
import sys

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User
from core.models import Tenant, Product
import json

def verify_multitenancy():
    print("Starting Multi-Tenancy Verification...")
    client = APIClient()
    
    # 1. Signup Vendor A
    print("\n1. Signing up Vendor A...")
    vendor_a_data = {
        'username': 'vendor_a',
        'email': 'vendor_a@example.com',
        'password': 'password123',
        'store_name': 'Store A'
    }
    response = client.post('/api/auth/vendor/signup/', vendor_a_data)
    if response.status_code != 201:
        print(f"FAILED: Vendor A signup failed. {response.content}")
        return
    print("SUCCESS: Vendor A created.")
    
    # Authenticate Vendor A
    client.force_authenticate(user=User.objects.get(username='vendor_a'))
    
    # 2. Signup Vendor B
    print("\n2. Signing up Vendor B...")
    client_b = APIClient() # New client for B
    vendor_b_data = {
        'username': 'vendor_b',
        'email': 'vendor_b@example.com',
        'password': 'password123',
        'store_name': 'Store B'
    }
    response = client_b.post('/api/auth/vendor/signup/', vendor_b_data)
    if response.status_code != 201:
        print(f"FAILED: Vendor B signup failed. {response.content}")
        return
    print("SUCCESS: Vendor B created.")

    # 3. Vendor A creates a product
    print("\n3. Vendor A creating product...")
    product_data = {
        'name': 'Product A',
        'price': '10.00',
        'stock': 100,
        'description': 'Description A'
    }
    response = client.post('/api/products/', product_data)
    if response.status_code != 201:
        print(f"FAILED: Product creation failed. {response.content}")
        return
    product_id = response.data['id']
    print("SUCCESS: Product A created.")
    
    # 4. Vendor B checking products
    print("\n4. Vendor B checking products...")
    client_b.force_authenticate(user=User.objects.get(username='vendor_b'))
    response = client_b.get('/api/products/')
    if response.status_code != 200:
         print(f"FAILED: Vendor B list failed. {response.content}")
         return
    
    products = response.data.get('results', response.data)
    
    if len(products) != 0:
        print(f"FAILED: Vendor B should see 0 products, saw {len(products)}")
        print("Debugging leaked products:")
        for p in products:
            if isinstance(p, dict):
                print(f" - ID: {p.get('id')}, Name: {p.get('name')}, TenantID: {p.get('tenant')}")
            else:
                print(f" - Unexpected item: {p}")
        
        # Check Vendor B's tenant
        vb = User.objects.get(username='vendor_b')
        if hasattr(vb, 'vendor_profile'):
             print(f"Vendor B Tenant: {vb.vendor_profile.tenant.id} - {vb.vendor_profile.tenant.name}")
        else:
             print("Vendor B has NO profile!")
        return
    print("SUCCESS: Vendor B sees 0 products.")
    
    # 5. Vendor A checking products
    print("\n5. Vendor A checking products...")
    response = client.get('/api/products/')
    products_a = response.data.get('results', response.data)
    if len(products_a) != 1:
        print(f"FAILED: Vendor A should see 1 product, saw {len(products_a)}")
        return
    print("SUCCESS: Vendor A sees 1 product.")
    
    # 6. Public Access Check
    print("\n6. Anonymous Access Check...")
    client_public = APIClient()
    response = client_public.get('/api/products/')
    if response.status_code != 403:
         print(f"FAILED: Anonymous should be 403, got {response.status_code}")
         return
    print("SUCCESS: Anonymous access blocked.")

    print("\nVERIFICATION COMPLETE: ALL TESTS PASSED")

if __name__ == '__main__':
    # Clean up before run
    try:
        User.objects.filter(username__in=['vendor_a', 'vendor_b']).delete()
        Tenant.objects.filter(name__in=['Store A', 'Store B']).delete()
    except:
        pass
    verify_multitenancy()

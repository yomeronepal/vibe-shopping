
import os
import django
import sys

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile
from django.utils.text import slugify

def verify_tenant_conflict():
    print("Starting Tenant Conflict Verification...")
    client = APIClient()
    
    # Setup Data
    # Tenant A
    name_a = 'Conflict Store A'
    sub_a = slugify(name_a)
    tenant_a, _ = Tenant.objects.get_or_create(name=name_a, defaults={'subdomain': sub_a, 'is_active': True})
    user_a, _ = User.objects.get_or_create(username='user_a', defaults={'email': 'a@a.com', 'password': 'password'})
    VendorProfile.objects.get_or_create(user=user_a, tenant=tenant_a)
    
    # Tenant B
    name_b = 'Conflict Store B'
    sub_b = slugify(name_b)
    tenant_b, _ = Tenant.objects.get_or_create(name=name_b, defaults={'subdomain': sub_b, 'is_active': True})
    
    # Test 1: Authenticated User A accessing Tenant A Domain (Should PASS)
    print("\n1. User A accessing Store A Domain...")
    client.force_login(user=user_a)
    response = client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN=sub_a)
    
    if response.status_code == 200:
        print(f"SUCCESS: Access granted (Status: {response.status_code})")
    else:
        print(f"FAILED: Access denied (Status: {response.status_code})")
        print(response.content)

    # Test 2: Authenticated User A accessing Tenant B Domain (Should FAIL - 403)
    print("\n2. User A accessing Store B Domain...")
    client.force_login(user=user_a)
    response = client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN=sub_b)
    
    if response.status_code == 403:
        print(f"SUCCESS: Access denied as expected (Status: {response.status_code})")
    else:
        print(f"FAILED: Should be 403, got {response.status_code}")
        print(response.content)

    # Test 3: Unauthenticated accessing Tenant B Domain (Should PASS - Public Access)
    print("\n3. Public accessing Store B Domain...")
    client.logout()
    response = client.get('/api/public/products/', HTTP_X_TENANT_SUBDOMAIN=sub_b)
    
    if response.status_code == 200:
         print(f"SUCCESS: Public access granted (Status: {response.status_code})")
    else:
         print(f"FAILED: Public access denied (Status: {response.status_code})")

    print("\nVERIFICATION COMPLETE")

if __name__ == '__main__':
    verify_tenant_conflict()

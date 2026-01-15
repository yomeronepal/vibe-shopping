
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

def verify_refactor():
    print("Verifying Refactor...")
    client = APIClient()
    
    # 1. Check Public Routes (Core)
    print("Checking Public Health...")
    resp = client.get('/api/health/')
    if resp.status_code == 200:
        print("SUCCESS: /api/health/ accessible.")
    else:
        print(f"FAILED: /api/health/ {resp.status_code}")

    # 2. Check Vendor Signup Route (Vendor App)
    print("Checking Vendor Signup...")
    # Was /api/auth/vendor/signup/, Now /api/vendor/signup/
    resp = client.post('/api/vendor/signup/', {}) # Expect 400 Bad Request (validation) not 404
    if resp.status_code == 400:
        print("SUCCESS: /api/vendor/signup/ accessible.")
    else:
        print(f"FAILED: /api/vendor/signup/ returned {resp.status_code}")

    # 3. Check Vendor Product Route (Vendor App)
    print("Checking Vendor Products...")
    # Auth required
    tenant, _ = Tenant.objects.get_or_create(name='Refactor Shop', defaults={'subdomain': 'ref', 'is_active': True})
    user, _ = User.objects.get_or_create(username='ref_user', defaults={'email': 'r@r.com', 'password': 'pw'})
    VendorProfile.objects.get_or_create(user=user, tenant=tenant)
    client.force_login(user)
    
    resp = client.get('/api/vendor/products/')
    if resp.status_code == 200:
        print("SUCCESS: /api/vendor/products/ accessible.")
    else:
        print(f"FAILED: /api/vendor/products/ returned {resp.status_code}")

if __name__ == '__main__':
    verify_refactor()

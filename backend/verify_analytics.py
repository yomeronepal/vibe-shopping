
import os
import django
import sys
# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile, Product, Order, ProductEvent

def verify_analytics():
    print("Verifying Analytics (BE-09)...")
    client = APIClient()
    
    # 1. Setup Data
    tenant, _ = Tenant.objects.get_or_create(name='Analytics Shop', defaults={'subdomain': 'analytics', 'is_active': True})
    vendor_user, _ = User.objects.get_or_create(username='vendor_ana', defaults={'email': 'v@ana.com', 'password': 'pw'})
    VendorProfile.objects.get_or_create(user=vendor_user, tenant=tenant)
    
    customer_user, _ = User.objects.get_or_create(username='cust_ana', defaults={'email': 'c@ana.com', 'password': 'pw'})
    
    product = Product.objects.create(
        tenant=tenant,
        name='Vibe Shirt',
        price=20.00,
        stock=100,
        is_active=True,
        metadata={'vibe_tags': ['Retro', 'Streetwear']}
    )
    
    # 2. Public Tracking (View)
    print("Tracking View...")
    resp = client.post('/api/vendor/analytics/track/', {
        'product_id': product.id,
        'event_type': 'view',
        'country': 'US'
    }, format='json')
    if resp.status_code != 201:
        print(f"FAILED Track View: {resp.status_code} {resp.data}")
        return

    # 3. Public Tracking (Add to Cart)
    print("Tracking Add to Cart...")
    resp = client.post('/api/vendor/analytics/track/', {
        'product_id': product.id,
        'event_type': 'add_to_cart',
        'country': 'JP'
    }, format='json')
    if resp.status_code != 201:
        print(f"FAILED Track Cart: {resp.status_code}")
        return

    # 4. Purchase (Triggers Event)
    print("Making Purchase...")
    client.force_login(customer_user)
    resp = client.post('/api/orders/create_order/', {
        'items': [{'product_id': product.id, 'quantity': 1}],
        'payment_method': 'card'
    }, format='json', HTTP_X_TENANT_SUBDOMAIN='analytics')
    
    if resp.status_code != 201:
        print(f"FAILED Purchase: {resp.status_code} {resp.data}")
        return
        
    # 5. Vendor Analytics Check
    print("Checking Vibe Analytics...")
    client.force_login(vendor_user)
    resp = client.get('/api/vendor/analytics/vibes/')
    
    if resp.status_code == 200:
        data = resp.data
        print(f"Analytics Data: {data}")
        
        # Expect 'Retro' and 'Streetwear' to have: 1 view, 1 cart, 1 purchase
        retro = next((item for item in data if item['vibe'] == 'Retro'), None)
        if retro:
            if (retro['views'] >= 1 and 
                retro['add_to_cart'] >= 1 and 
                retro['purchases'] >= 1):
                print("VERIFICATION PASSED: Analytics data matches.")
            else:
                print("VERIFICATION FAILED: Counts incorrect.")
        else:
            print("VERIFICATION FAILED: 'Retro' vibe not found.")
    else:
        print(f"FAILED Analytics GET: {resp.status_code}")

if __name__ == '__main__':
    verify_analytics()

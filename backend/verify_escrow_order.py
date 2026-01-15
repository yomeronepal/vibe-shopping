
import os
import django
import sys

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from rest_framework.test import APIClient
from core.models import Tenant, VendorProfile, Product, Order, EscrowLedger, Wallet
from django.contrib.auth.models import User

def verify_escrow_order():
    print("Starting Escrow Order Verification...")
    client = APIClient()
    
    # 1. Setup Store & Vendor
    tenant, _ = Tenant.objects.get_or_create(name='Escrow Shop', defaults={'subdomain': 'escrow-shop', 'is_active': True})
    vendor_user, _ = User.objects.get_or_create(username='vendor_e', defaults={'email': 'v@e.com', 'password': 'pw'})
    VendorProfile.objects.get_or_create(user=vendor_user, tenant=tenant)
    
    # Ensure Wallet (should be created by order if not exists, but verifying creation too)
    
    # 2. Setup Product
    product = Product.objects.create(
        tenant=tenant,
        name='Expensive Item',
        price=100.00,
        stock=10,
        is_active=True
    )
    
    # 3. Setup Customer
    customer, _ = User.objects.get_or_create(username='customer_e', defaults={'email': 'c@e.com', 'password': 'pw'})
    client.force_login(customer)
    
    # 4. Place Order
    print("Placing Order...")
    payload = {
        'items': [{'product_id': product.id, 'quantity': 2}],
        'payment_method': 'card'
    }
    
    # Must use subdomain header for tenant resolution
    response = client.post('/api/orders/create_order/', payload, format='json', HTTP_X_TENANT_SUBDOMAIN='escrow-shop')
    
    if response.status_code == 201:
        print(f"SUCCESS: Order Created (ID: {response.data['order_id']})")
        
        # 5. Verify Ledger and Wallet
        order = Order.objects.get(id=response.data['order_id'])
        ledger = EscrowLedger.objects.get(order=order)
        wallet = Wallet.objects.get(tenant=tenant)
        product.refresh_from_db()

        print(f"Order Status: {order.status}")
        print(f"Ledger Status: {ledger.status}, Amount: {ledger.amount}")
        print(f"Wallet Balance: {wallet.balance}")
        print(f"Product Stock: {product.stock}")
        
        if (order.status == 'pending_delivery' and 
            ledger.status == 'held' and 
            wallet.balance == 0 and 
            product.stock == 8):
            print("VERIFICATION PASSED: payment held in escrow.")
        else:
            print("VERIFICATION FAILED: logic incorrect.")
            
    else:
        print(f"FAILED: {response.status_code}")
        print(response.data)

if __name__ == '__main__':
    verify_escrow_order()

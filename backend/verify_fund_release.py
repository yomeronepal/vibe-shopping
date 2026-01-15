
import os
import django
import sys
from datetime import timedelta
from django.utils import timezone

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings')
django.setup()

from core.models import Tenant, VendorProfile, Order, EscrowLedger, Wallet, WalletTransaction
from django.contrib.auth.models import User
from core.tasks import release_escrow_funds

def verify_fund_release():
    print("Starting Fund Release Verification...")
    
    # 1. Setup
    tenant, _ = Tenant.objects.get_or_create(name='Release Shop', defaults={'subdomain': 'rel-shop', 'is_active': True})
    vendor_user, _ = User.objects.get_or_create(username='vendor_r', defaults={'email': 'v@r.com', 'password': 'pw'})
    customer, _ = User.objects.get_or_create(username='customer_r', defaults={'email': 'c@r.com', 'password': 'pw'})
    
    wallet, _ = Wallet.objects.get_or_create(tenant=tenant)
    initial_balance = wallet.balance
    print(f"Initial Wallet Balance: {initial_balance}")
    
    # 2. Create Order (Delivered long ago)
    order = Order.objects.create(
        tenant=tenant,
        user=customer,
        total_amount=50.00,
        status='delivered',
        payment_method='card'
    )
    
    # Force updated_at to be 3 days ago (72 hours)
    past_time = timezone.now() - timedelta(hours=72)
    Order.objects.filter(id=order.id).update(updated_at=past_time)
    
    ledger = EscrowLedger.objects.create(
        order=order,
        amount=50.00,
        status='held'
    )
    
    print(f"Created Order #{order.id} (Delivered 72h ago) with Held Escrow.")
    
    # 3. Run Task
    print("Running release_escrow_funds task...")
    release_escrow_funds()
    
    # 4. Verify
    order.refresh_from_db()
    ledger.refresh_from_db()
    wallet.refresh_from_db()
    
    print(f"Order Status: {order.status}")
    print(f"Ledger Status: {ledger.status}")
    print(f"Wallet Balance: {wallet.balance}")
    
    transaction = WalletTransaction.objects.filter(wallet=wallet).last()
    if transaction:
        print(f"Transaction Logged: {transaction}")
    
    if (order.status == 'completed' and 
        ledger.status == 'released' and 
        wallet.balance == initial_balance + 50.00):
        print("VERIFICATION PASSED: Funds released automatically.")
    else:
        print("VERIFICATION FAILED.")

if __name__ == '__main__':
    verify_fund_release()

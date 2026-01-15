from django.test import TestCase
from rest_framework.test import APIClient
from core.models import Tenant, VendorProfile, Product, Order, EscrowLedger, Wallet, WalletTransaction
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from core.tasks import release_escrow_funds

class EscrowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Escrow Shop', subdomain='escrow-shop', is_active=True)
        self.vendor_user = User.objects.create_user(username='vendor_e', email='v@e.com', password='pw')
        VendorProfile.objects.create(user=self.vendor_user, tenant=self.tenant)
        self.wallet = Wallet.objects.create(tenant=self.tenant)
        
        self.product = Product.objects.create(
            tenant=self.tenant,
            name='Expensive Item',
            price=100.00,
            stock=10,
            is_active=True
        )
        
        self.customer = User.objects.create_user(username='customer_e', email='c@e.com', password='pw')
        self.client.force_login(self.customer)

    def test_create_order_creates_escrow(self):
        payload = {
            'items': [{'product_id': self.product.id, 'quantity': 2}],
            'payment_method': 'card'
        }
        
        response = self.client.post('/api/orders/create_order/', payload, format='json', HTTP_X_TENANT_SUBDOMAIN='escrow-shop')
        self.assertEqual(response.status_code, 201)
        
        order_id = response.data['order_id']
        order = Order.objects.get(id=order_id)
        ledger = EscrowLedger.objects.get(order=order)
        self.wallet.refresh_from_db()
        self.product.refresh_from_db()
        
        self.assertEqual(order.status, 'pending_delivery')
        self.assertEqual(ledger.status, 'held')
        self.assertEqual(self.wallet.balance, 0)
        self.assertEqual(self.product.stock, 8)

    def test_release_escrow_funds_task(self):
        # Create delivered order from past
        order = Order.objects.create(
            tenant=self.tenant,
            user=self.customer,
            total_amount=50.00,
            status='delivered',
            payment_method='card'
        )
        
        # Force updated_at to be 72 hours ago
        past_time = timezone.now() - timedelta(hours=72)
        # We need to update directly on QuerySet to bypass auto_now
        Order.objects.filter(id=order.id).update(updated_at=past_time)
        
        ledger = EscrowLedger.objects.create(
            order=order,
            amount=50.00,
            status='held'
        )
        
        initial_balance = self.wallet.balance
        
        # Run Task
        release_escrow_funds()
        
        # Verify
        order.refresh_from_db()
        ledger.refresh_from_db()
        self.wallet.refresh_from_db()
        
        self.assertEqual(order.status, 'completed')
        self.assertEqual(ledger.status, 'released')
        self.assertEqual(self.wallet.balance, initial_balance + 50.00)
        
        transaction = WalletTransaction.objects.filter(wallet=self.wallet).last()
        self.assertIsNotNone(transaction)

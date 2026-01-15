from django.db import models

# Create your models here.

class TimeStampedModel(models.Model):
    """
    Abstract base model that provides self-updating
    'created_at' and 'updated_at' fields.
    """
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True



class Tenant(TimeStampedModel):
    """
    Represents a store or vendor organization.
    """
    name = models.CharField(max_length=255)
    subdomain = models.SlugField(max_length=255, unique=True, null=True, blank=True)
    subscription = models.CharField(max_length=50, default='Trial')
    is_active = models.BooleanField(default=False)

    def __str__(self):
        return self.name

class VendorProfile(TimeStampedModel):
    """
    Links a User to a Tenant with a specific role.
    """
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='vendor_profile')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='members')
    role = models.CharField(max_length=50, default='owner')

    def __str__(self):
        return f"{self.user.username} - {self.tenant.name}"

class Product(TimeStampedModel):
    """
    Product model for e-commerce items with AI-generated metadata
    """
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='products', null=True, blank=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    # AI Generated Fields
    ai_generated_title = models.CharField(max_length=500, blank=True)
    ai_generated_description = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)  # ['fashion', 'premium', ...]
    category = models.CharField(max_length=100, blank=True)
    subcategory = models.CharField(max_length=100, blank=True)
    metadata = models.JSONField(default=dict, blank=True)  # attributes, occasions, etc.
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    def product_image_path(instance, filename):
        tenant_slug = instance.tenant.subdomain if instance.tenant and instance.tenant.subdomain else 'default'
        return f'uploads/{tenant_slug}/products/{filename}'

    # Image
    image = models.ImageField(upload_to=product_image_path, null=True, blank=True)
    processed_image = models.ImageField(upload_to=product_image_path, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return self.name

class ProductImage(TimeStampedModel):
    """
    Additional images for a product.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    
    def product_gallery_path(instance, filename):
        tenant_slug = instance.product.tenant.subdomain if instance.product.tenant and instance.product.tenant.subdomain else 'default'
        return f'uploads/{tenant_slug}/products/gallery/{filename}'
        
    image = models.ImageField(upload_to=product_gallery_path)
    processed_image = models.ImageField(upload_to=product_gallery_path, null=True, blank=True)
    alt_text = models.CharField(max_length=255, blank=True)
    
    
    def __str__(self):
        return f"Image for {self.product.name}"

class Wallet(TimeStampedModel):
    """
    Vendor's digital wallet.
    Funds are credited here only after Escrow release.
    """
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    def __str__(self):
        return f"Wallet for {self.tenant.name} - ${self.balance}"

class WalletTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('credit', 'Credit'),
        ('debit', 'Debit'),
    ]
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    description = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.transaction_type} ${self.amount} - {self.description}"

class Order(TimeStampedModel):
    ORDER_STATUS_CHOICES = [
        ('pending_payment', 'Pending Payment'),
        ('pending_delivery', 'Pending Delivery'), # Paid & in Escrow
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('completed', 'Completed'), # Funds Released
        ('cancelled', 'Cancelled'), # Funds Refunded
        ('disputed', 'Disputed'),
    ]
    
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='orders')
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='orders')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES, default='pending_payment')
    payment_method = models.CharField(max_length=50, default='credit_card')
    
    def __str__(self):
        return f"Order #{self.id} - {self.tenant.name}"

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2) # Snapshot of price at purchase
    
    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

class EscrowLedger(TimeStampedModel):
    """
    Tracks funds held in escrow for an order.
    """
    ESCROW_STATUS_CHOICES = [
        ('held', 'Held'),
        ('released', 'Released'),
        ('refunded', 'Refunded'),
    ]
    
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='escrow')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=ESCROW_STATUS_CHOICES, default='held')
    
    def __str__(self):
        return f"Escrow #{self.id} - {self.status}"

class ProductEvent(TimeStampedModel):
    EVENT_TYPES = [
        ('view', 'View'),
        ('add_to_cart', 'Add to Cart'),
        ('purchase', 'Purchase'),
    ]
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES)
    country = models.CharField(max_length=100, blank=True, null=True)
    
    def __str__(self):
        return f"{self.event_type} - {self.product.name}"

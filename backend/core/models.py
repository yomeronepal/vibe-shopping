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
    metadata = models.JSONField(default=dict, blank=True)

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


class Theme(TimeStampedModel):
    """
    Represents a shop theme with color configuration.
    Default themes (is_default=True) are shared templates.
    Vendor-specific themes have a tenant FK.
    AI-generated themes have is_ai_generated=True.
    """
    # Identification
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    
    # Ownership
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, 
        related_name='themes', 
        null=True, blank=True,
        help_text="Null for default themes, set for vendor-specific themes"
    )
    is_default = models.BooleanField(
        default=False,
        help_text="True for system-wide template themes"
    )
    is_ai_generated = models.BooleanField(
        default=False,
        help_text="True for AI-generated themes from logo analysis"
    )
    
    # Color Configuration - 12 theme colors
    primary = models.CharField(max_length=50, default='#8A2BE2')
    accent = models.CharField(max_length=50, default='#a855f7')
    background = models.CharField(max_length=50, default='#f5f3f8')
    surface = models.CharField(max_length=50, default='#ffffff')
    text = models.CharField(max_length=50, default='#1a1a2e')
    text_secondary = models.CharField(max_length=50, default='#6b7280')
    border = models.CharField(max_length=50, default='#e5e7eb')
    card_bg = models.CharField(max_length=50, default='#ffffff')
    button_bg = models.CharField(max_length=50, default='#8A2BE2')
    button_text = models.CharField(max_length=50, default='#ffffff')
    gradient = models.CharField(max_length=255, default='linear-gradient(135deg, #8A2BE2 0%, #a855f7 100%)')
    text_gradient = models.CharField(max_length=255, default='linear-gradient(135deg, #8A2BE2, #E040FB)')
    
    # AI Analysis metadata
    brand_style = models.CharField(max_length=100, blank=True)
    brand_keywords = models.JSONField(default=list, blank=True)
    recommendation_reason = models.TextField(blank=True)

    class Meta:
        unique_together = [['tenant', 'slug']]  # Unique slug per tenant
        ordering = ['-is_default', '-is_ai_generated', 'created_at']

    def __str__(self):
        prefix = "[DEFAULT]" if self.is_default else f"[{self.tenant.name}]" if self.tenant else "[ORPHAN]"
        return f"{prefix} {self.name}"

    def to_dict(self):
        """Return theme as dictionary for API response."""
        return {
            'id': self.id,
            'slug': self.slug,
            'name': self.name,
            'description': self.description,
            'is_default': self.is_default,
            'is_ai_generated': self.is_ai_generated,
            'colors': {
                'primary': self.primary,
                'accent': self.accent,
                'background': self.background,
                'surface': self.surface,
                'text': self.text,
                'textSecondary': self.text_secondary,
                'border': self.border,
                'cardBg': self.card_bg,
                'buttonBg': self.button_bg,
                'buttonText': self.button_text,
                'gradient': self.gradient,
                'textGradient': self.text_gradient,
            },
            'brand_style': self.brand_style,
            'brand_keywords': self.brand_keywords,
            'recommendation_reason': self.recommendation_reason,
        }

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
    tags = models.JSONField(default=list, blank=True)
    category = models.CharField(max_length=100, blank=True)
    subcategory = models.CharField(max_length=100, blank=True)
    vibe_tags = models.JSONField(default=list, blank=True)
    weather_tags = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    stock_by_size = models.JSONField(default=dict, blank=True) # {"S": 10, "M": 5}
    
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
    
    # POS System Fields
    product_code = models.CharField(max_length=20, unique=True, blank=True, db_index=True,
                                     help_text="Unique product code/SKU for POS checkout")
    qr_code = models.ImageField(upload_to='qr_codes/', null=True, blank=True,
                                 help_text="QR code image for quick product checkout")

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return self.name

class ProductVariant(TimeStampedModel):
    """
    Product variants for different colors.
    Each variant has its own images and stock management.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')

    color_name = models.CharField(max_length=50)
    color_hex = models.CharField(max_length=7, blank=True)

    stock_by_size = models.JSONField(default=dict, blank=True)

    is_default = models.BooleanField(default=False)

    class Meta:
        unique_together = [['product', 'color_name']]
        ordering = ['-is_default', 'color_name']

    def __str__(self):
        return f"{self.product.name} - {self.color_name}"

    @property
    def total_stock(self):
        """Calculate total stock across all sizes."""
        return sum(self.stock_by_size.values()) if self.stock_by_size else 0

class ProductImage(TimeStampedModel):
    """
    Additional images for a product.
    Can be associated with a specific variant (color) or the main product.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name='images', null=True, blank=True)

    def product_gallery_path(instance, filename):
        tenant_slug = instance.product.tenant.subdomain if instance.product.tenant and instance.product.tenant.subdomain else 'default'
        return f'uploads/{tenant_slug}/products/gallery/{filename}'

    image = models.ImageField(upload_to=product_gallery_path)
    processed_image = models.ImageField(upload_to=product_gallery_path, null=True, blank=True)
    alt_text = models.CharField(max_length=255, blank=True)
    display_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['display_order', 'created_at']

    def __str__(self):
        if self.variant:
            return f"Image for {self.product.name} - {self.variant.color_name}"
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
        ('preparing', 'Preparing'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('completed', 'Completed'), # Funds Released
        ('cancelled', 'Cancelled'), # Funds Refunded
        ('returned', 'Returned'),
        ('disputed', 'Disputed'),
    ]
    
    ORDER_TYPE_CHOICES = [
        ('online', 'Online'),
        ('pos', 'Point of Sale'),
    ]
    
    PAYMENT_METHOD_CHOICES = [
        ('credit_card', 'Credit Card'),
        ('debit_card', 'Debit Card'),
        ('cash', 'Cash'),
        ('mobile_payment', 'Mobile Payment'),
        ('bank_transfer', 'Bank Transfer'),
    ]
    
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='orders')
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='orders', null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES, default='pending_payment')
    
    # POS System Fields
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='online',
                                   help_text="Order source: online or POS")
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHOD_CHOICES, default='credit_card')
    
    # Customer info for POS orders (when no user account)
    customer_name = models.CharField(max_length=255, blank=True, help_text="Customer name for POS orders")
    customer_phone = models.CharField(max_length=20, blank=True, help_text="Customer phone for POS orders")
    customer_email = models.EmailField(blank=True, help_text="Customer email for POS orders")
    metadata = models.JSONField(default=dict, blank=True,
                                help_text="Source info and collected order details (e.g. chat bot fields)")
    
    def __str__(self):
        return f"Order #{self.id} - {self.tenant.name}"

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    size = models.CharField(max_length=20, blank=True, default='')
    color = models.CharField(max_length=50, blank=True, default='')
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

class SocialMediaPost(TimeStampedModel):
    """
    Track posts made to social media platforms.
    """
    PLATFORM_CHOICES = [
        ('instagram', 'Instagram'),
        ('facebook', 'Facebook'),
        ('tiktok', 'TikTok'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('pending', 'Pending'),
        ('posted', 'Posted'),
        ('failed', 'Failed'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='social_posts', null=True, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='social_posts')
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # Post details
    caption = models.TextField(blank=True)
    image = models.ImageField(upload_to='uploads/social_posts/', null=True, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    post_format = models.CharField(
        max_length=10,
        choices=[('feed', 'Feed'), ('story', 'Story')],
        default='feed',
    )
    post_url = models.URLField(blank=True, null=True)
    platform_post_id = models.CharField(max_length=255, blank=True)
    
    # Analytics and metadata
    metadata = models.JSONField(default=dict, blank=True)  # likes, comments, errors, etc.
    error_message = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'platform']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        product_label = self.product.name if self.product else 'free-form'
        return f"{self.platform} - {product_label} ({self.status})"

class AITokenUsage(TimeStampedModel):
    """
    Track AI token usage for cost monitoring and analytics.
    """
    AI_PROVIDER_CHOICES = [
        ('gemini', 'Google Gemini'),
        ('openai', 'OpenAI'),
    ]

    OPERATION_TYPE_CHOICES = [
        ('product_analysis', 'Product Image Analysis'),
        ('logo_analysis', 'Logo Analysis'),
        ('description_generation', 'Description Generation'),
        ('tag_generation', 'Tag Generation'),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='ai_usage')
    user = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='ai_usage')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name='ai_usage')

    ai_provider = models.CharField(max_length=20, choices=AI_PROVIDER_CHOICES)
    operation_type = models.CharField(max_length=50, choices=OPERATION_TYPE_CHOICES)

    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)

    estimated_cost = models.DecimalField(max_digits=10, decimal_places=6, default=0.000000)

    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['product']),
            models.Index(fields=['ai_provider']),
            models.Index(fields=['operation_type']),
        ]

    def __str__(self):
        return f"{self.ai_provider} - {self.operation_type} ({self.total_tokens} tokens)"

    def save(self, *args, **kwargs):
        if not self.total_tokens:
            self.total_tokens = self.input_tokens + self.output_tokens

        if not self.estimated_cost:
            self.estimated_cost = self.calculate_cost()

        super().save(*args, **kwargs)

    def calculate_cost(self):
        """
        Calculate estimated cost based on provider and token usage.
        Prices as of 2025 (per 1M tokens):
        - Gemini 2.0 Flash: Input $0.075, Output $0.30
        - OpenAI GPT-4o-mini: Input $0.15, Output $0.60
        """
        if self.ai_provider == 'gemini':
            input_cost = (self.input_tokens / 1_000_000) * 0.075
            output_cost = (self.output_tokens / 1_000_000) * 0.30
        elif self.ai_provider == 'openai':
            input_cost = (self.input_tokens / 1_000_000) * 0.15
            output_cost = (self.output_tokens / 1_000_000) * 0.60
        else:
            return 0.0

        return input_cost + output_cost

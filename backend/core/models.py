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


class Product(TimeStampedModel):
    """
    Product model for e-commerce items with AI-generated metadata
    """
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
    
    # Image
    image = models.ImageField(upload_to='products/', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return self.name

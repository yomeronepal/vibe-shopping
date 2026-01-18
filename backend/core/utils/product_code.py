"""
Utility functions for generating unique product codes (SKUs)
"""
import random
import string
from core.models import Product


def generate_product_code(prefix='VB', length=8):
    """
    Generate a unique product code/SKU.
    Format: PREFIX-XXXXXXXX (e.g., VB-A7K9M2N4)
    
    Args:
        prefix: Code prefix (default: 'VB' for Vibe)
        length: Length of random part (default: 8)
    
    Returns:
        str: Unique product code
    """
    while True:
        # Generate random alphanumeric string (excluding similar-looking chars: 0, O, I, 1)
        chars = string.ascii_uppercase + string.digits
        chars = chars.replace('O', '').replace('I', '').replace('0', '').replace('1', '')
        
        random_part = ''.join(random.choices(chars, k=length))
        code = f"{prefix}-{random_part}"
        
        # Check if code already exists
        if not Product.objects.filter(product_code=code).exists():
            return code


def generate_sequential_code(tenant_id, prefix=None):
    """
    Generate sequential product code based on tenant's product count.
    Format: TENANT-0001, TENANT-0002, etc.
    
    Args:
        tenant_id: Tenant ID
        prefix: Optional custom prefix
    
    Returns:
        str: Sequential product code
    """
    from core.models import Tenant
    
    try:
        tenant = Tenant.objects.get(id=tenant_id)
        tenant_prefix = prefix or tenant.subdomain[:4].upper() or 'SHOP'
    except Tenant.DoesNotExist:
        tenant_prefix = prefix or 'SHOP'
    
    # Count existing products for this tenant
    count = Product.objects.filter(tenant_id=tenant_id).count() + 1
    
    # Generate code with zero padding
    code = f"{tenant_prefix}-{count:04d}"
    
    # Ensure uniqueness (in case of deletions)
    counter = count
    while Product.objects.filter(product_code=code).exists():
        counter += 1
        code = f"{tenant_prefix}-{counter:04d}"
    
    return code

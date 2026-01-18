"""
Django signals for automatic product code and QR code generation
"""
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from core.models import Product
from core.utils.product_code import generate_product_code, generate_sequential_code
from core.services.qr_service import QRCodeService
import logging

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Product)
def generate_product_code_on_create(sender, instance, **kwargs):
    """
    Auto-generate unique product code when creating a new product.
    """
    if not instance.pk and not instance.product_code:
        # New product without code
        if instance.tenant_id:
            # Generate sequential code for tenant
            instance.product_code = generate_sequential_code(instance.tenant_id)
        else:
            # Generate random code
            instance.product_code = generate_product_code()
        
        logger.info(f"Generated product code: {instance.product_code}")


@receiver(post_save, sender=Product)
def generate_qr_code_on_create(sender, instance, created, **kwargs):
    """
    Generate QR code after product is created and has an ID.
    """
    if created and instance.product_code and not instance.qr_code:
        try:
            qr_file = QRCodeService.generate_product_qr(instance.id, instance.product_code)
            
            if qr_file:
                instance.qr_code.save(qr_file.name, qr_file, save=True)
                logger.info(f"Generated QR code for product {instance.id}: {instance.product_code}")
            else:
                logger.warning(f"Failed to generate QR code for product {instance.id}")
                
        except Exception as e:
            logger.error(f"Error generating QR code for product {instance.id}: {e}")

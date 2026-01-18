"""
QR Code generation service for product checkout
"""
import qrcode
from io import BytesIO
from django.core.files import File
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class QRCodeService:
    """Generate QR codes for products"""
    
    @staticmethod
    def generate_product_qr(product_id, product_code):
        """
        Generate QR code for product that links to POS checkout page.
        
        Args:
            product_id: Product ID
            product_code: Product code/SKU
        
        Returns:
            File object containing QR code image
        """
        try:
            # Generate checkout URL
            # In production, use actual domain from settings
            base_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
            checkout_url = f"{base_url}/pos/checkout?code={product_code}"
            
            # Create QR code
            qr = qrcode.QRCode(
                version=1,  # Size of QR code (1-40)
                error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction
                box_size=10,  # Size of each box in pixels
                border=4,  # Border size in boxes
            )
            
            qr.add_data(checkout_url)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save to BytesIO
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            # Create Django File object
            file_name = f'product_{product_code}_qr.png'
            return File(buffer, name=file_name)
            
        except Exception as e:
            logger.error(f"QR code generation failed for product {product_id}: {e}")
            return None
    
    @staticmethod
    def generate_simple_qr(data, filename='qr_code.png'):
        """
        Generate simple QR code from any data.
        
        Args:
            data: String data to encode
            filename: Output filename
        
        Returns:
            File object containing QR code image
        """
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=10,
                border=4,
            )
            
            qr.add_data(data)
            qr.make(fit=True)
            
            img = qr.make_image(fill_color="black", back_color="white")
            
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            return File(buffer, name=filename)
            
        except Exception as e:
            logger.error(f"QR code generation failed: {e}")
            return None

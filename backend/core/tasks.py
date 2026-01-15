from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(Exception,), retry_kwargs={'max_retries': 3, 'countdown': 5})
def send_email_task(self, recipient_email, subject, message):
    """
    Send email asynchronously using Celery.
    
    Args:
        recipient_email: Email address of the recipient
        subject: Email subject
        message: Email message body
    
    Returns:
        str: Success message or error
    """
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
        logger.info(f"Email sent successfully to {recipient_email}")
        return f"Email sent to {recipient_email}"
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
        raise


@shared_task(bind=True, autoretry_for=(Exception,), retry_kwargs={'max_retries': 3, 'countdown': 10})
def process_order_task(self, order_id):
    """
    Process order asynchronously.
    
    Args:
        order_id: ID of the order to process
    
    Returns:
        dict: Order processing result
    """
    try:
        # Example: Process order logic here
        # This could involve payment processing, inventory updates, etc.
        logger.info(f"Processing order {order_id}")
        
        # Simulated processing
        # order = Order.objects.get(id=order_id)
        # order.status = 'processing'
        # order.save()
        
        logger.info(f"Order {order_id} processed successfully")
        return {
            'status': 'success',
            'order_id': order_id,
            'message': 'Order processed successfully'
        }
    except Exception as e:
        logger.error(f"Failed to process order {order_id}: {str(e)}")
        raise


@shared_task
def cleanup_old_data():
    """
    Scheduled task to clean up old data.
    Runs daily at 2:00 AM (configured in celery.py beat_schedule)
    """
    try:
        logger.info("Starting cleanup of old data")
        
        # Example: Delete old session data, logs, etc.
        # OldData.objects.filter(created_at__lt=timezone.now() - timedelta(days=30)).delete()
        
        logger.info("Cleanup completed successfully")
        return "Cleanup completed"
    except Exception as e:
        logger.error(f"Cleanup task failed: {str(e)}")
        raise


@shared_task
def generate_report_task(report_type):
    """
    Generate various reports asynchronously.
    
    Args:
        report_type: Type of report to generate
    
    Returns:
        str: Report generation status
    """
    try:
        logger.info(f"Generating {report_type} report")
        
        # Example: Generate sales report, inventory report, etc.
        # report_data = generate_report(report_type)
        # save_report(report_data)
        
        logger.info(f"{report_type} report generated successfully")
        return f"{report_type} report generated"
    except Exception as e:
        logger.error(f"Failed to generate {report_type} report: {str(e)}")
        raise

@shared_task
def process_product_ai_task(product_id):
    """
    Async task to analyze product image and update metadata.
    """
    from .models import Product
    from .services.gemini_service import GeminiProductAnalyzer
    
    try:
        logger.info(f"Starting AI analysis for product {product_id}")
        product = Product.objects.get(id=product_id)
        
        if not product.image:
             logger.warning(f"Product {product_id} has no image. Skipping AI analysis.")
             return

        # Read image bytes using storage API to ensure compatibility
        with product.image.open('rb') as f:
            image_data = f.read()

        analyzer = GeminiProductAnalyzer()
        result = analyzer.analyze_product_image(image_data, price=float(product.price) if product.price else 0)

        if result['success']:
            data = result['data']
            product.ai_generated_title = data.get('title', '')
            product.ai_generated_description = data.get('description', '')
            product.tags = data.get('tags', [])
            product.category = data.get('category', '')
            product.subcategory = data.get('subcategory', '')
            product.metadata = {
                'attributes': data.get('attributes'),
                'target_audience': data.get('target_audience'),
                'occasions': data.get('occasions'),
                'season': data.get('season'),
                'care_instructions': data.get('care_instructions'),
                'seo_keywords': data.get('seo_keywords'),
                'selling_points': data.get('selling_points'),
                'similar_styles': data.get('similar_styles')
            }
            product.save()
            logger.info(f"Updated product {product_id} with AI data.")
        else:
            logger.error(f"AI Analysis failed for {product_id}: {result.get('error')}")
            
    except Product.DoesNotExist:
        logger.error(f"Product {product_id} not found.")
    except Exception as e:
        logger.error(f"Error processing product {product_id}: {e}")

@shared_task
def detect_vibe(product_id):
    """
    Dedicated method for Vibe Detection as per BE-04.
    In reality, it reuses the same analyzer but focuses on extracting 'vibe' data
    and updating the product specifically for this purpose.
    """
    from .models import Product
    from .services.gemini_service import GeminiProductAnalyzer
    
    try:
        logger.info(f"Starting Vibe Detection for product {product_id}")
        product = Product.objects.get(id=product_id)
        
        if not product.image:
             return

        with product.image.open('rb') as f:
            image_data = f.read()

        analyzer = GeminiProductAnalyzer()
        result = analyzer.analyze_product_image(image_data, price=float(product.price) if product.price else 0)

        if result['success']:
            data = result['data']
            
            # Update Standard Copy (BE-05)
            if 'title' in data:
                product.ai_generated_title = data['title']
            if 'description' in data:
                product.ai_generated_description = data['description']

            # Enrich metadata with vibe specifics (BE-04)
            if 'vibe_tags' in data:
                product.metadata['vibe_tags'] = data['vibe_tags']
            if 'confidence_score' in data:
                product.metadata['confidence_score'] = data['confidence_score']
            if 'suggested_price_range' in data:
                product.metadata['suggested_price_range'] = data['suggested_price_range']
                
            # Also update tags if they are part of it
            if 'tags' in data: # Fallback or merge
                 # ensure unique
                 current_tags = set(product.tags)
                 new_tags = set(data.get('tags', []))
                 product.tags = list(current_tags.union(new_tags))

            product.save()
            logger.info(f"Vibe detection completed for {product_id}: {data.get('vibe_tags')}")
        else:
            logger.error(f"Vibe detection failed: {result.get('error')}")

    except Exception as e:
        logger.error(f"Error in detect_vibe for {product_id}: {e}")

@shared_task
def remove_background_task(instance_id, model_name='Product'):
    """
    Remove background from image using rembg (BE-06).
    """
    from .models import Product, ProductImage
    from django.core.files.base import ContentFile
    import io
    
    try:
        logger.info(f"Starting background removal for {model_name} {instance_id}")
        
        if model_name == 'Product':
            instance = Product.objects.get(id=instance_id)
        elif model_name == 'ProductImage':
            instance = ProductImage.objects.get(id=instance_id)
        else:
            logger.error(f"Unknown model {model_name}")
            return

        if not instance.image:
            logger.warning("No image to process.")
            return

        # Import inside task to avoid import errors if lib missing or slow load
        from rembg import remove
        from PIL import Image

        # Read image
        with instance.image.open('rb') as f:
            input_data = f.read()

        # Remove background
        output_data = remove(input_data)
        
        # Save as PNG (to keep transparency)
        # Construct filename
        original_name = str(instance.image.name).split('/')[-1]
        new_name = f"clean_{original_name.split('.')[0]}.png"
        
        # Save to processed_image field
        instance.processed_image.save(new_name, ContentFile(output_data), save=True)
        
        logger.info(f"Background removed for {model_name} {instance_id}")

    except Exception as e:
        logger.error(f"Background removal failed for {instance_id}: {e}")

@shared_task
def release_escrow_funds():
    """
    Scheduled task to release escrow funds after return window (BE-08).
    Default window: 48 hours after delivery.
    """
    from django.utils import timezone
    from datetime import timedelta
    from django.db import transaction
    from .models import EscrowLedger, WalletTransaction, Order, Wallet
    
    RETURN_WINDOW_HOURS = 48
    cutoff_time = timezone.now() - timedelta(hours=RETURN_WINDOW_HOURS)
    
    # Logic:
    # Find Ledgers that are 'held'
    # LINKED to Orders that are 'delivered'
    # AND Order was updated (assumed delivery time) before cutoff.
    # Ideally Order should have 'delivered_at', using 'updated_at' for MVP since we change status to provided choice.
    
    eligible_ledgers = EscrowLedger.objects.filter(
        status='held',
        order__status='delivered',
        order__updated_at__lt=cutoff_time
    ).select_related('order', 'order__tenant')
    
    logger.info(f"Refunding {eligible_ledgers.count()} eligible orders.")
    
    for ledger in eligible_ledgers:
        try:
            with transaction.atomic():
                order = ledger.order
                tenant = order.tenant
                wallet = Wallet.objects.get(tenant=tenant)
                
                # 1. Update Ledger
                ledger.status = 'released'
                ledger.save()
                
                # 2. Credit Wallet
                wallet.balance += ledger.amount
                wallet.save()
                
                # 3. Log Transaction
                WalletTransaction.objects.create(
                    wallet=wallet,
                    amount=ledger.amount,
                    transaction_type='credit',
                    description=f"Escrow release for Order #{order.id}"
                )
                
                # 4. Complete Order
                order.status = 'completed'
                order.save()
                
                logger.info(f"Released ${ledger.amount} for Order #{order.id}")
                
        except Exception as e:
            logger.error(f"Failed to release funds for Order #{ledger.order.id}: {e}")

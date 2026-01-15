from celery import shared_task
try:
    from rembg import remove
except ImportError:
    remove = None
from PIL import Image
import io
import os
from django.core.files.base import ContentFile
from .models import Product
import logging

logger = logging.getLogger(__name__)

@shared_task
def remove_background_task(product_id):
    """
    Celery task to remove background from product image
    and save it to processed_image field.
    """
    try:
        product = Product.objects.get(id=product_id)
        
        if remove is None:
            logger.error("rembg library not installed or failed to import. Skipping background removal.")
            return

        if not product.image:
            logger.warning(f"Product {product_id} has no image to process.")
            return

        logger.info(f"Processing background removal for Product {product_id}")

        # Open image from storage
        image_bytes = product.image.read()
        
        # Remove background
        processed_bytes = remove(image_bytes)
        
        # Create filename for processed image
        original_name = os.path.basename(product.image.name)
        name, ext = os.path.splitext(original_name)
        processed_filename = f"{name}_nobg.png" # Force PNG for transparency

        # Save to processed_image field
        # ContentFile needed to wrap raw bytes for Django FileField
        product.processed_image.save(
            processed_filename,
            ContentFile(processed_bytes),
            save=True
        )
        
        logger.info(f"Successfully removed background for Product {product_id}")
        
    except Product.DoesNotExist:
        logger.error(f"Product {product_id} not found.")
    except Exception as e:
        logger.error(f"Failed to remove background for Product {product_id}: {e}")

@shared_task
def generate_product_details_task(channel_name, product_id, price=None):
    """
    Celery task to generate product details using Gemini AI
    and send the result back via WebSockets.
    """
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    from .services.gemini_service import GeminiProductAnalyzer
    
    channel_layer = get_channel_layer()
    
    try:
        # Notify start
        async_to_sync(channel_layer.send)(
            channel_name,
            {
                'type': 'task_update',
                'data': {
                    'status': 'processing',
                    'message': 'Analyzing image features...'
                }
            }
        )
        
        product = Product.objects.get(id=product_id)
        if not product.image:
             raise ValueError("Product has no image")
             
        # Read image
        image_bytes = product.image.read()
        
        # Analyze
        analyzer = GeminiProductAnalyzer()
        result = analyzer.analyze_product_image(image_bytes, price)
        
        if result.get('success'):
            async_to_sync(channel_layer.send)(
                channel_name,
                {
                    'type': 'task_update',
                    'data': {
                        'status': 'completed',
                        'data': result['data']
                    }
                }
            )
        else:
             async_to_sync(channel_layer.send)(
                channel_name,
                {
                    'type': 'task_update',
                    'data': {
                        'status': 'error',
                        'error': result.get('error', 'Unknown AI error')
                    }
                }
             )
             
    except Exception as e:
        logger.error(f"Error in generate_product_details_task: {e}")
        async_to_sync(channel_layer.send)(
            channel_name,
            {
                'type': 'task_update',
                'data': {
                    'status': 'error',
                    'error': str(e)
                }
            }
        )

@shared_task
def post_to_social_media_task(social_post_id, product_id, platform, caption):
    """
    Celery task to post product to social media platform.
    """
    from .models import SocialMediaPost, Product
    from .services.social_media import InstagramService, FacebookService, TikTokService
    
    try:
        social_post = SocialMediaPost.objects.get(id=social_post_id)
        product = Product.objects.get(id=product_id)
        tenant = product.tenant
        
        # Get image URL (prefer processed image)
        request = None  # We need to build absolute URL
        image_url = product.processed_image.url if product.processed_image else product.image.url
        
        # Make it absolute URL if needed
        if not image_url.startswith('http'):
            from django.contrib.sites.models import Site
            site = Site.objects.get_current()
            image_url = f"https://{site.domain}{image_url}"
        
        # Get social media credentials from tenant metadata
        social_media = tenant.metadata.get('social_media', {})
        platform_data = social_media.get(platform, {})
        
        if not platform_data.get('connected'):
            raise ValueError(f"{platform} account not connected")
        
        access_token = platform_data.get('access_token')
        if not access_token:
            raise ValueError(f"No access token for {platform}")
        
        # Initialize service
        if platform == 'instagram':
            service = InstagramService(access_token)
            instagram_account_id = platform_data.get('instagram_account_id')
            result = service.post_product(image_url, caption, instagram_account_id=instagram_account_id)
        elif platform == 'facebook':
            service = FacebookService(access_token)
            page_id = platform_data.get('page_id')
            result = service.post_product(image_url, caption, page_id=page_id)
        elif platform == 'tiktok':
            service = TikTokService(access_token)
            result = service.post_product(image_url, caption)
        else:
            raise ValueError(f"Unsupported platform: {platform}")
        
        # Update post record
        if result.get('success'):
            social_post.status = 'posted'
            social_post.post_url = result.get('post_url')
            social_post.platform_post_id = result.get('post_id')
            logger.info(f"Successfully posted product {product_id} to {platform}")
        else:
            social_post.status = 'failed'
            social_post.error_message = result.get('error', 'Unknown error')
            logger.error(f"Failed to post product {product_id} to {platform}: {result.get('error')}")
        
        social_post.metadata = result
        social_post.save()
        
    except SocialMediaPost.DoesNotExist:
        logger.error(f"SocialMediaPost {social_post_id} not found")
    except Product.DoesNotExist:
        logger.error(f"Product {product_id} not found")
    except Exception as e:
        logger.error(f"Error posting to {platform}: {e}")
        try:
            social_post.status = 'failed'
            social_post.error_message = str(e)
            social_post.save()
        except:
            pass

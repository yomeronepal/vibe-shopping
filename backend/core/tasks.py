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

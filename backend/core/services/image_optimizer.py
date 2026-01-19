from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

class ImageOptimizer:
    """
    Service to optimize images before sending to AI models.
    Reduces token usage and improves processing speed.
    """

    MAX_DIMENSION = 1024
    JPEG_QUALITY = 85
    WEBP_QUALITY = 85

    @staticmethod
    def optimize_for_ai(image_data: bytes, output_format: str = 'JPEG') -> bytes:
        """
        Optimize image for AI processing by resizing and compressing.

        Args:
            image_data: Original image bytes
            output_format: Output format ('JPEG' or 'WEBP')

        Returns:
            Optimized image bytes
        """
        try:
            img = Image.open(io.BytesIO(image_data))

            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            original_width, original_height = img.size

            if original_width > ImageOptimizer.MAX_DIMENSION or original_height > ImageOptimizer.MAX_DIMENSION:
                if original_width > original_height:
                    new_width = ImageOptimizer.MAX_DIMENSION
                    new_height = int((original_height / original_width) * ImageOptimizer.MAX_DIMENSION)
                else:
                    new_height = ImageOptimizer.MAX_DIMENSION
                    new_width = int((original_width / original_height) * ImageOptimizer.MAX_DIMENSION)

                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                logger.info(f"Resized image from {original_width}x{original_height} to {new_width}x{new_height}")

            output_buffer = io.BytesIO()

            if output_format.upper() == 'WEBP':
                img.save(output_buffer, format='WEBP', quality=ImageOptimizer.WEBP_QUALITY, method=6)
            else:
                img.save(output_buffer, format='JPEG', quality=ImageOptimizer.JPEG_QUALITY, optimize=True)

            optimized_data = output_buffer.getvalue()

            original_size_kb = len(image_data) / 1024
            optimized_size_kb = len(optimized_data) / 1024
            reduction_percent = ((original_size_kb - optimized_size_kb) / original_size_kb) * 100

            logger.info(f"Image optimized: {original_size_kb:.2f}KB -> {optimized_size_kb:.2f}KB ({reduction_percent:.1f}% reduction)")

            return optimized_data

        except Exception as e:
            logger.error(f"Error optimizing image: {e}")
            return image_data

    @staticmethod
    def optimize_for_storage(image_data: bytes, max_dimension: int = 2048, quality: int = 90) -> bytes:
        """
        Optimize image for storage while maintaining higher quality.

        Args:
            image_data: Original image bytes
            max_dimension: Maximum width or height
            quality: JPEG quality (0-100)

        Returns:
            Optimized image bytes
        """
        try:
            img = Image.open(io.BytesIO(image_data))

            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            original_width, original_height = img.size

            if original_width > max_dimension or original_height > max_dimension:
                if original_width > original_height:
                    new_width = max_dimension
                    new_height = int((original_height / original_width) * max_dimension)
                else:
                    new_height = max_dimension
                    new_width = int((original_width / original_height) * max_dimension)

                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            output_buffer = io.BytesIO()
            img.save(output_buffer, format='JPEG', quality=quality, optimize=True)

            return output_buffer.getvalue()

        except Exception as e:
            logger.error(f"Error optimizing image for storage: {e}")
            return image_data

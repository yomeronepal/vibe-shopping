from google import genai
from google.genai import types
from django.conf import settings
from PIL import Image
import io
import json
import logging

logger = logging.getLogger(__name__)


class GeminiProductAnalyzer:
    """
    Service to analyze product images using Google Gemini AI
    and generate comprehensive e-commerce details
    """
    
    def __init__(self):
        api_key = settings.GOOGLE_AI_API_KEY
        if not api_key:
            raise ValueError("GOOGLE_AI_API_KEY not configured in settings")
        
        self.client = genai.Client(api_key=api_key)
        self.model = 'gemini-2.5-flash'  # Using Gemini 2.5 Flash for multimodal
    
    def analyze_product_image(self, image_data: bytes, price: float = None) -> dict:
        """
        Analyze product image and generate comprehensive details
        
        Args:
            image_data: Image file bytes
            price: Optional product price
            
        Returns:
            dict with success status and data/error
        """
        try:
            # Convert bytes to PIL Image
            image = Image.open(io.BytesIO(image_data))
            
            # Craft detailed prompt for maximum tag generation
            price_context = f"The product is priced at ${price}." if price else ""
            
            prompt = f"""
Analyze this product image in extreme detail and provide comprehensive e-commerce information.

{price_context}

Generate a JSON response with the following structure. Be as detailed and specific as possible, especially with tags:

{{
    "title": "Create a compelling, SEO-optimized product title (max 60 characters)",
    "description": "Write a detailed, persuasive product description (250-350 words). Include features, benefits, materials, use cases, and appeal.",
    
    "tags": [
        "Generate 20-30 highly specific, searchable tags covering:
        - Product type/category
        - Style (casual, formal, vintage, modern, minimalist, bohemian)
        - Colors (all visible colors)
        - Materials/fabrics
        - Patterns (solid, striped, floral, geometric)
        - Occasions (work, party, casual, formal, beach, gym)
        - Season (summer, winter, spring, fall, all-season)
        - Target demographic (men, women, unisex, teens, adults)
        - Fit/cut (slim, regular, oversized, fitted)
        - Features (pockets, zipper, buttons, sleeveless, long-sleeve)
        - Trends (trending, bestseller, new-arrival, classic)
        - Brand style (luxury, budget-friendly, eco-friendly, sustainable)
        - Activity (sports, yoga, running, hiking, office)"
    ],
    
    "category": "Main product category",
    "subcategory": "More specific subcategory",
    
    "attributes": {{
        "color": ["primary color", "secondary color"],
        "material": ["main material", "secondary material"],
        "style": "overall style (e.g., casual chic, streetwear, formal business)",
        "fit": "fit type",
        "pattern": "pattern type",
        "sleeve_length": "sleeve style if applicable",
        "neckline": "neckline style if applicable",
        "length": "garment length if applicable"
    }},
    
    "target_audience": {{
        "gender": "primary gender target",
        "age_range": "age range (e.g., 18-35, 25-45)",
        "lifestyle": "target lifestyle (e.g., active, professional, casual)"
    }},
    
    "occasions": ["list 5-10 occasions this product is suitable for"],
    
    "season": ["applicable seasons"],
    
    "care_instructions": "Brief care/maintenance tips if determinable",
    
    "seo_keywords": ["15-20 keywords for search optimization"],
    
    "selling_points": ["5-7 unique selling points or benefits"],
    
    "similar_styles": ["3-5 similar style keywords for recommendations"]
}}

Be extremely thorough with tags - include every relevant descriptor you can identify from the image.
Return ONLY valid JSON, no markdown formatting.
"""
            
            # Generate content using new google.genai API
            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    types.Part.from_bytes(
                        data=image_data,
                        mime_type='image/jpeg',
                    ),
                    prompt
                ]
            )
            
            result_text = response.text.strip()
            
            # Clean up response (remove markdown if present)
            if result_text.startswith('```json'):
                result_text = result_text[7:]
            elif result_text.startswith('```'):
                result_text = result_text[3:]
            
            if result_text.endswith('```'):
                result_text = result_text[:-3]
            
            # Parse JSON
            result = json.loads(result_text.strip())
            
            logger.info(f"Successfully generated product details with {len(result.get('tags', []))} tags")
            
            return {
                'success': True,
                'data': result
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {e}")
            return {
                'success': False,
                'error': f'Failed to parse AI response: {str(e)}'
            }
        except Exception as e:
            logger.error(f"Error in Gemini analysis: {e}")
            return {
                'success': False,
                'error': str(e)
            }

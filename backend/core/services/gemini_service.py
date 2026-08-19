from google import genai
from google.genai import types
from django.conf import settings
from PIL import Image
import io
import json
import logging
import base64
import time
from .image_optimizer import ImageOptimizer

logger = logging.getLogger(__name__)

def retry_with_exponential_backoff(max_retries=3, base_delay=1):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    error_str = str(e)
                    if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str or 'rate_limit' in error_str.lower():
                        if attempt < max_retries - 1:
                            delay = base_delay * (2 ** attempt)
                            logger.warning(f"Rate limit hit, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                            time.sleep(delay)
                        else:
                            logger.error(f"Max retries reached after {max_retries} attempts")
                            raise
                    else:
                        raise
            return None
        return wrapper
    return decorator

@retry_with_exponential_backoff(max_retries=3, base_delay=2)
def analyze_with_openai(image_data: bytes, prompt: str, is_logo: bool = False) -> dict:
    """
    Fallback AI analysis using OpenAI GPT-4o-mini (low-cost model)
    """
    try:
        from openai import OpenAI

        api_key = settings.OPENAI_API_KEY
        if not api_key or api_key == 'your-openai-api-key-here':
            raise ValueError("OPENAI_API_KEY not configured")

        client = OpenAI(api_key=api_key)

        base64_image = base64.b64encode(image_data).decode('utf-8')

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000,
            temperature=0.7
        )

        result_text = response.choices[0].message.content.strip()

        if result_text.startswith('```json'):
            result_text = result_text[7:]
        elif result_text.startswith('```'):
            result_text = result_text[3:]

        if result_text.endswith('```'):
            result_text = result_text[:-3]

        result = json.loads(result_text.strip())

        logger.info(f"OpenAI analysis successful (model: gpt-4o-mini)")
        return result

    except Exception as e:
        logger.error(f"OpenAI analysis failed: {e}")
        raise


PRODUCT_JSON_SPEC = """Generate a JSON response with the following structure. Be as detailed and specific as possible, especially with tags:

{
    "title": "Create a compelling, SEO-optimized product title in English followed by Romanized Nepali in brackets (e.g., 'Red Velvet Sari (Rato Velvet Sari)') (max 100 characters)",
    "description": "Write a detailed, persuasive product description (250-350 words). Include features, benefits, materials, use cases, and appeal. Use English primarily but mix in common Romanized Nepali fashion terms where natural.",
    
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
    
    "vibe_tags": ["List 3-5 specific fashion vibes. MUST include if applicable: Traditional, Cultural, Musical, Party, Concert, Festival, Bohemain, Streetwear, Minimalist, Y2K"],

    "weather_tags": [
        {
            "tag": "Weather condition (Sunny/Rainy/Windy/Cold/Hot/Snowy/Humid/Mild/All-Weather)",
            "fit": "1-2 sentences explaining why this product suits this weather. Mention specific features like fabric breathability, insulation, water resistance, UV protection, or temperature regulation."
        }
    ],

    "confidence_score": 0.95,
    
    "suggested_price_range": "25.00 - 45.00",
    
    "category": "Main product category",
    "subcategory": "More specific subcategory",
    
    "attributes": {
        "color": ["primary color", "secondary color"],
        "material": ["main material", "secondary material"],
        "style": "overall style (e.g., casual chic, streetwear, formal business)",
        "fit": "fit type",
        "pattern": "pattern type",
        "sleeve_length": "sleeve style if applicable",
        "neckline": "neckline style if applicable",
        "length": "garment length if applicable"
    },
    
    "target_audience": {
        "gender": "primary gender target",
        "age_range": "age range (e.g., 18-35, 25-45)",
        "lifestyle": "target lifestyle (e.g., active, professional, casual)"
    },
    
    "occasions": ["list 5-10 occasions this product is suitable for"],
    
    "season": ["applicable seasons"],
    
    "care_instructions": "Brief care/maintenance tips if determinable",
    
    "seo_keywords": ["15-20 keywords for search optimization"],
    
    "selling_points": ["5-7 unique selling points or benefits"],
    
    "similar_styles": ["3-5 similar style keywords for recommendations"]
}"""


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
        self.model = getattr(settings, 'GEMINI_ASSISTANT_MODEL', 'gemini-2.5-flash')

    def _generate_with_retry(self, image_data: bytes, prompt: str, max_retries=3, base_delay=2):
        for attempt in range(max_retries):
            try:
                return self.client.models.generate_content(
                    model=self.model,
                    contents=[
                        types.Part.from_bytes(
                            data=image_data,
                            mime_type='image/jpeg',
                        ),
                        prompt
                    ]
                )
            except Exception as e:
                error_str = str(e)
                if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Gemini rate limit hit, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                    else:
                        logger.error(f"Gemini max retries reached after {max_retries} attempts")
                        raise
                else:
                    raise
        return None

    def _generate_text_with_retry(self, prompt, max_retries=3, base_delay=2):
        for attempt in range(max_retries):
            try:
                return self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                )
            except Exception as e:
                error_str = str(e)
                if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Gemini rate limit hit, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                    else:
                        raise
                else:
                    raise
        return None

    def _parse_details_json(self, result_text):
        """Strip markdown fences and parse the model's JSON payload."""
        cleaned = result_text.strip()
        if cleaned.startswith('```json'):
            cleaned = cleaned[7:]
        elif cleaned.startswith('```'):
            cleaned = cleaned[3:]
        if cleaned.endswith('```'):
            cleaned = cleaned[:-3]
        return json.loads(cleaned.strip())

    def generate_from_brief(self, brief: str, price: float = None) -> dict:
        """Generate product details from the vendor's own description.

        Args:
            brief: What the vendor wrote about the product.
            price: Optional product price in rupees.

        Returns:
            dict with success status and data/error.
        """
        price_context = f"The vendor set the price at Rs. {price}." if price else ""
        prompt = f"""A vendor in Nepal is listing a product in their online shop. They described it in their own words (English, Nepali, or a mix):

VENDOR'S DESCRIPTION
{brief}

{price_context}

{PRODUCT_JSON_SPEC}

Ground everything in the vendor's description: keep every fact they stated (colors, materials, sizes, features) and expand naturally around them, but do not contradict them or invent specific claims like materials or measurements they never mentioned. Where the description is silent, stay general rather than specific.
All field values must be plain text — no markdown, no asterisks, no bold markers.
Return ONLY valid JSON, no markdown formatting."""
        try:
            response = self._generate_text_with_retry(prompt)
            result = self._parse_details_json(response.text)
            logger.info(f"Generated product details from brief with {len(result.get('tags', []))} tags")
            return {'success': True, 'data': result}
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini brief response as JSON: {e}")
            return {'success': False, 'error': 'The AI returned an unreadable answer. Try again.'}
        except Exception as e:
            logger.error(f"Error generating from brief: {e}")
            return {'success': False, 'error': str(e)}

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
            optimized_image_data = ImageOptimizer.optimize_for_ai(image_data, output_format='JPEG')

            image = Image.open(io.BytesIO(optimized_image_data))
            
            # Craft detailed prompt for maximum tag generation
            price_context = f"The product is priced at ${price}." if price else ""
            
            prompt = f"""
Analyze this product image in extreme detail and provide comprehensive e-commerce information.

{price_context}

{PRODUCT_JSON_SPEC}

Be extremely thorough with tags - include every relevant descriptor you can identify from the image.
Return ONLY valid JSON, no markdown formatting.
"""
            
            response = self._generate_with_retry(optimized_image_data, prompt)
            
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
            logger.info("Falling back to OpenAI GPT-4o-mini...")
            try:
                result = analyze_with_openai(optimized_image_data, prompt)
                return {
                    'success': True,
                    'data': result,
                    'ai_provider': 'openai'
                }
            except Exception as openai_error:
                logger.error(f"OpenAI fallback also failed: {openai_error}")
                return {
                    'success': False,
                    'error': f'Both Gemini and OpenAI failed. Gemini: {str(e)}, OpenAI: {str(openai_error)}'
                }
        except Exception as e:
            logger.error(f"Error in Gemini analysis: {e}")
            logger.info("Falling back to OpenAI GPT-4o-mini...")
            try:
                result = analyze_with_openai(optimized_image_data, prompt)
                return {
                    'success': True,
                    'data': result,
                    'ai_provider': 'openai'
                }
            except Exception as openai_error:
                logger.error(f"OpenAI fallback also failed: {openai_error}")
                return {
                    'success': False,
                    'error': f'Both Gemini and OpenAI failed. Gemini: {str(e)}, OpenAI: {str(openai_error)}'
                }


class GeminiLogoAnalyzer:
    """
    Service to analyze company logos using Google Gemini AI
    and recommend matching shop themes based on colors and style.
    """
    
    def __init__(self):
        api_key = settings.GOOGLE_AI_API_KEY
        if not api_key:
            raise ValueError("GOOGLE_AI_API_KEY not configured in settings")

        self.client = genai.Client(api_key=api_key)
        self.model = getattr(settings, 'GEMINI_ASSISTANT_MODEL', 'gemini-2.5-flash')

    def _generate_with_retry(self, image_data: bytes, prompt: str, max_retries=3, base_delay=2):
        for attempt in range(max_retries):
            try:
                return self.client.models.generate_content(
                    model=self.model,
                    contents=[
                        types.Part.from_bytes(
                            data=image_data,
                            mime_type='image/png',
                        ),
                        prompt
                    ]
                )
            except Exception as e:
                error_str = str(e)
                if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Gemini rate limit hit, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                    else:
                        logger.error(f"Gemini max retries reached after {max_retries} attempts")
                        raise
                else:
                    raise
        return None

    def analyze_logo(self, image_data: bytes) -> dict:
        """
        Analyze a logo image and recommend a matching theme.

        Args:
            image_data: Logo image file bytes

        Returns:
            dict with success status and theme recommendation
        """
        try:
            optimized_image_data = ImageOptimizer.optimize_for_ai(image_data, output_format='PNG')

            prompt = """
Analyze this company/brand logo image and extract its visual characteristics to generate a complete website color theme.

Return a JSON response with the following structure:

{
    "dominant_colors": [
        {"hex": "#hexcode", "name": "color name", "percentage": 40}
    ],
    "color_mood": "warm/cool/neutral/vibrant",
    "brand_style": "one of: modern, minimalist, bold, elegant, playful, professional, luxury, casual",
    "recommended_theme": "one of: neon-vibe, minimal, warm-cozy",
    "recommendation_reason": "Brief explanation why these colors match the logo",
    "custom_palette": {
        "primary": "#hexcode - main brand color from logo",
        "accent": "#hexcode - complementary highlight color",
        "background": "#hexcode - light page background (usually light shade)",
        "surface": "#hexcode - card/panel background (slightly different from background)",
        "text": "#hexcode - main text color (dark, readable)",
        "textSecondary": "#hexcode - secondary/muted text color",
        "border": "#hexcode - border color for cards and inputs",
        "cardBg": "#hexcode - background for cards (usually white or very light)",
        "buttonBg": "#hexcode - button background (usually same as primary)",
        "buttonText": "#hexcode - button text color (usually white)",
        "gradient": "linear-gradient(135deg, #primary 0%, #accent 100%)",
        "textGradient": "linear-gradient(135deg, #color1, #color2)"
    },
    "brand_keywords": ["5-7 keywords describing brand personality"]
}

Color generation rules:
- Extract the PRIMARY color directly from the logo's dominant color
- Generate ACCENT as a complementary or analogous color to primary
- BACKGROUND should be a very light tint (95%+ white) based on the primary color family
- SURFACE should be slightly different from background (off-white or light gray)
- TEXT should be dark (near black) for readability
- TEXT_SECONDARY should be a medium gray
- BORDER should be a light gray or tinted gray
- BUTTON_BG usually matches PRIMARY
- BUTTON_TEXT should contrast with buttonBg (usually white)
- GRADIENT should blend primary to accent
- TEXT_GRADIENT should be vibrant and visible

Theme matching rules:
- If logo has purple, violet, pink, or bold neon colors → recommend "neon-vibe"
- If logo is black, white, gray, or very minimal/clean → recommend "minimal"
- If logo has orange, amber, yellow, brown, or warm earth tones → recommend "warm-cozy"

Return ONLY valid JSON, no markdown formatting.
"""
            
            response = self._generate_with_retry(optimized_image_data, prompt)
            
            result_text = response.text.strip()
            
            # Clean up response (remove markdown if present)
            if result_text.startswith('```json'):
                result_text = result_text[7:]
            elif result_text.startswith('```'):
                result_text = result_text[3:]
            
            if result_text.endswith('```'):
                result_text = result_text[:-3]
            
            result = json.loads(result_text.strip())

            valid_themes = ['neon-vibe', 'minimal', 'warm-cozy']
            if result.get('recommended_theme') not in valid_themes:
                result['recommended_theme'] = 'neon-vibe'

            logger.info(f"Logo analysis complete. Recommended theme: {result.get('recommended_theme')}")
            logger.info(f"Custom palette generated: {result.get('custom_palette')}")

            return {
                'success': True,
                'data': result
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini logo response as JSON: {e}")
            logger.info("Falling back to OpenAI GPT-4o-mini for logo analysis...")
            try:
                result = analyze_with_openai(optimized_image_data, prompt, is_logo=True)

                valid_themes = ['neon-vibe', 'minimal', 'warm-cozy']
                if result.get('recommended_theme') not in valid_themes:
                    result['recommended_theme'] = 'neon-vibe'

                return {
                    'success': True,
                    'data': result,
                    'ai_provider': 'openai'
                }
            except Exception as openai_error:
                logger.error(f"OpenAI fallback also failed: {openai_error}")
                return {
                    'success': False,
                    'error': f'Both Gemini and OpenAI failed. Gemini: {str(e)}, OpenAI: {str(openai_error)}'
                }
        except Exception as e:
            logger.error(f"Error in Gemini logo analysis: {e}")
            logger.info("Falling back to OpenAI GPT-4o-mini for logo analysis...")
            try:
                result = analyze_with_openai(optimized_image_data, prompt, is_logo=True)

                valid_themes = ['neon-vibe', 'minimal', 'warm-cozy']
                if result.get('recommended_theme') not in valid_themes:
                    result['recommended_theme'] = 'neon-vibe'

                return {
                    'success': True,
                    'data': result,
                    'ai_provider': 'openai'
                }
            except Exception as openai_error:
                logger.error(f"OpenAI fallback also failed: {openai_error}")
                return {
                    'success': False,
                    'error': f'Both Gemini and OpenAI failed. Gemini: {str(e)}, OpenAI: {str(openai_error)}'
                }

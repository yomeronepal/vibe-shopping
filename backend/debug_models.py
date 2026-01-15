import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vibe_shopping.settings.base')
django.setup()

from django.conf import settings
from google import genai

api_key = settings.GOOGLE_AI_API_KEY
print(f"API Key present: {bool(api_key)}")

try:
    client = genai.Client(api_key=api_key)
    print("--- Available Models ---")
    for m in client.models.list():
        # Check for generation capability
        actions = getattr(m, 'supported_actions', [])
        # We look for 'generateContent'
        if 'generateContent' in actions:
            print(f"{m.name}")
except Exception as e:
    print(f"Error: {e}")

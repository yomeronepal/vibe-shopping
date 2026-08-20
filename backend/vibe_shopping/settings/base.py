"""
Django base settings for vibe_shopping project.
"""
import os
from pathlib import Path
from decouple import config

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production-123456789')

# Application definition
INSTALLED_APPS = [
    'daphne', # Must be at the top
    'channels',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework.authtoken', # Added for Token Auth
    'django_filters', # Added by user instruction
    'django_celery_beat',
    'corsheaders',
    
    # Local apps
    'vendor',         # Added by user instruction
    'core.apps.CoreConfig',
    'socials.apps.SocialsConfig',
    'inbox.apps.InboxConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # CORS should be before CommonMiddleware
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.TenantMiddleware', # Custom Tenant Middleware
]

ROOT_URLCONF = 'vibe_shopping.urls'

# Allow subdomains
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='.localhost,127.0.0.1,[::1]', cast=lambda v: [s.strip() for s in v.split(',')])
ROOT_URLCONF = 'vibe_shopping.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'vibe_shopping.wsgi.application'
ASGI_APPLICATION = 'vibe_shopping.asgi.application'

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(config('REDIS_HOST', default='redis'), 6379)],
        },
    },
}

# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='vibe_shopping_db'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='postgres'),
        'HOST': config('DB_HOST', default='db'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'


# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
# https://docs.djangoproject.com/en/5.0/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Celery Configuration
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://redis:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://redis:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Redis Cache Configuration
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': config('REDIS_URL', default='redis://redis:6379/1'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
        'KEY_PREFIX': 'vibe_shopping',
        'TIMEOUT': 300,
    }
}

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': config('THROTTLE_USER_RATE', default='2000/hour'),
        'anon': config('THROTTLE_ANON_RATE', default='200/hour'),
        'ai_analysis': '10/minute',
        'logo_analysis': '5/minute',
    },
}

# CORS Configuration (adjust for your frontend)
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://localhost:5173',
    cast=lambda v: [s.strip() for s in v.split(',')]
)
CORS_ALLOW_CREDENTIALS = True

# Google Gemini AI Configuration
GOOGLE_AI_API_KEY = config('GOOGLE_AI_API_KEY', default='')
GEMINI_ASSISTANT_MODEL = config('GEMINI_ASSISTANT_MODEL', default='gemini-2.5-flash')
ANTHROPIC_API_KEY = config('ANTHROPIC_API_KEY', default='')
CLAUDE_FALLBACK_MODEL = config('CLAUDE_FALLBACK_MODEL', default='claude-haiku-4-5-20251001')

# OpenAI Configuration (Fallback)
OPENAI_API_KEY = config('OPENAI_API_KEY', default='')

# Multi-Tenancy Configuration
TENANT_BASE_DOMAIN = config('TENANT_BASE_DOMAIN', default='vibe-shopping.com')

FERNET_KEY = config('FERNET_KEY', default='')

META_APP_ID = config('META_APP_ID', default='')
META_APP_SECRET = config('META_APP_SECRET', default='')
META_WEBHOOK_VERIFY_TOKEN = config('META_WEBHOOK_VERIFY_TOKEN', default='')
PUBLIC_MEDIA_BASE_URL = config('PUBLIC_MEDIA_BASE_URL', default='')
PUBLIC_APP_BASE_URL = config('PUBLIC_APP_BASE_URL', default='')
META_OAUTH_REDIRECT_URI = config(
    'META_OAUTH_REDIRECT_URI',
    default='http://localhost:5173/vendor/settings/meta-callback',
)

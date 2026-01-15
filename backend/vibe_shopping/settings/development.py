"""
Development settings for vibe_shopping project.
"""
from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

# Django Debug Toolbar (optional, uncomment if needed)
# INSTALLED_APPS += ['debug_toolbar']
# MIDDLEWARE = ['debug_toolbar.middleware.DebugToolbarMiddleware'] + MIDDLEWARE
# INTERNAL_IPS = ['127.0.0.1', 'localhost']

# Email backend for development (console backend)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Disable HTTPS redirect in development
SECURE_SSL_REDIRECT = False

# Additional development-specific settings
CORS_ALLOW_ALL_ORIGINS = True  # Only for development!

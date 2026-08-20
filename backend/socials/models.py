from django.db import models

from core.models import Tenant, TimeStampedModel
from socials.crypto import decrypt_token, encrypt_token

CONNECTION_STATUSES = [
    ('connected', 'Connected'),
    ('expired', 'Expired'),
    ('revoked', 'Revoked'),
]

PAGE_STATUSES = [
    ('connected', 'Connected'),
    ('disconnected', 'Disconnected'),
    ('token_expired', 'Token Expired'),
]


class EncryptedTokenMixin(models.Model):
    """Adds an encrypted token column with set/get helpers."""

    access_token_encrypted = models.TextField(blank=True, default='')

    class Meta:
        abstract = True

    def set_access_token(self, raw):
        """Encrypt and store a raw token string."""
        self.access_token_encrypted = encrypt_token(raw)

    def get_access_token(self):
        """Decrypt and return the stored token string."""
        return decrypt_token(self.access_token_encrypted)


class MetaConnection(TimeStampedModel, EncryptedTokenMixin):
    """The Facebook user identity that authorized this tenant."""

    tenant = models.OneToOneField(
        Tenant, on_delete=models.CASCADE, related_name='meta_connection'
    )
    fb_user_id = models.CharField(max_length=64)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=CONNECTION_STATUSES, default='connected'
    )

    def __str__(self):
        return f"{self.tenant.name} meta connection ({self.status})"


class ConnectedPage(TimeStampedModel, EncryptedTokenMixin):
    """A Facebook Page connected to a tenant, with optional linked IG account."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='connected_pages'
    )
    connection = models.ForeignKey(
        MetaConnection, on_delete=models.CASCADE, related_name='pages'
    )
    page_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    instagram_account_id = models.CharField(max_length=64, blank=True, default='')
    instagram_username = models.CharField(max_length=255, blank=True, default='')
    CONNECTION_TYPES = [
        ('facebook_page', 'Facebook Page'),
        ('instagram_direct', 'Instagram (direct login)'),
    ]
    connection_type = models.CharField(
        max_length=20, choices=CONNECTION_TYPES, default='facebook_page'
    )
    status = models.CharField(
        max_length=20, choices=PAGE_STATUSES, default='connected'
    )

    def __str__(self):
        return f"{self.name} ({self.status})"


class WebhookEvent(TimeStampedModel):
    """Raw inbound Meta webhook event, consumed by later cycles."""

    object_type = models.CharField(max_length=32)
    payload = models.JSONField(default=dict)
    signature_valid = models.BooleanField(default=False)
    processed = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f"{self.object_type} event at {self.received_at}"

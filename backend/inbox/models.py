from django.db import models

from core.models import Tenant, TimeStampedModel
from socials.models import ConnectedPage

PLATFORM_CHOICES = [
    ('facebook', 'Facebook'),
    ('instagram', 'Instagram'),
]

CONVERSATION_STATUSES = [
    ('new', 'New'),
    ('open', 'Open'),
    ('waiting_business', 'Waiting for business'),
    ('waiting_customer', 'Waiting for customer'),
    ('resolved', 'Resolved'),
]

MESSAGE_DIRECTIONS = [
    ('in', 'Inbound'),
    ('out', 'Outbound'),
]


class Customer(TimeStampedModel):
    """A social platform identity that has messaged a tenant."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='inbox_customers')
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    platform_user_id = models.CharField(max_length=64)
    name = models.CharField(max_length=255, blank=True, default='')
    profile_pic_url = models.URLField(max_length=500, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'platform', 'platform_user_id'],
                name='unique_customer_identity',
            )
        ]

    def __str__(self):
        return self.name or self.platform_user_id


class Conversation(TimeStampedModel):
    """A DM thread between a connected page and one customer."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='conversations')
    page = models.ForeignKey(ConnectedPage, on_delete=models.CASCADE, related_name='conversations')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='conversations')
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    status = models.CharField(max_length=20, choices=CONVERSATION_STATUSES, default='new')
    unread_count = models.IntegerField(default=0)
    ai_paused = models.BooleanField(default=False)
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_message_preview = models.CharField(max_length=140, blank=True, default='')

    class Meta:
        ordering = ['-last_message_at']
        constraints = [
            models.UniqueConstraint(fields=['page', 'customer'], name='unique_page_customer_thread')
        ]

    def __str__(self):
        return f'{self.customer} via {self.platform} ({self.status})'


class Message(TimeStampedModel):
    """One message inside a conversation."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    direction = models.CharField(max_length=3, choices=MESSAGE_DIRECTIONS)
    text = models.TextField(blank=True, default='')
    attachments = models.JSONField(default=list, blank=True)
    platform_message_id = models.CharField(max_length=255, unique=True)
    sent_by_ai = models.BooleanField(default=False)
    sent_at = models.DateTimeField()

    class Meta:
        ordering = ['sent_at']

    def __str__(self):
        return f'{self.direction} {self.platform_message_id}'

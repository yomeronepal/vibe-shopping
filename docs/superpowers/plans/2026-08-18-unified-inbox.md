# Unified Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facebook Messenger and Instagram DMs become live conversations in the vendor dashboard, with replies sent back through Meta's Send API.

**Architecture:** New `inbox` Django app (Customer/Conversation/Message). The existing `socials.tasks.process_webhook_event` Celery task parses stored webhook payloads into those models idempotently and pushes real-time events to tenant-scoped Channels groups (`inbox_<tenant_id>`), consumed by an authenticated WebSocket. REST endpoints back a two-pane React InboxPage; sending replies goes through a new `MetaGraphClient.send_message`.

**Tech Stack:** Django 5 + DRF (token auth), Celery, Channels + channels_redis (Daphne already serving ASGI), React 19 + TS + Redux Toolkit.

**Spec:** `docs/superpowers/specs/2026-08-18-unified-inbox-design.md`

## Global Constraints

- No code comments: never write lines starting with `#`, `//`, or `<!--` in any file. Python docstrings (`"""`) are allowed. Auto-generated Django migrations are exempt.
- All tenant-scoped endpoints resolve the tenant from `request.user.vendor_profile.tenant`; cross-tenant conversation ids return 404.
- Backend commands run in Docker from `backend/`: `docker compose exec -T web python manage.py <cmd>`.
- Backend tests: Django test runner, files under `backend/inbox/test/`.
- Channels tests override the channel layer: `CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}`.
- Frontend has no test runner; verify with `npx tsc -b --force` — zero errors in files this plan creates/modifies (12 pre-existing legacy files fail on the base branch; ignore those).
- Statuses exactly: `new`, `open`, `waiting_business`, `waiting_customer`, `resolved`. Inbound messages set `waiting_business` from every prior status; outbound set `waiting_customer`.
- `Message.platform_message_id` is the dedup key (unique); Meta redelivers webhooks.
- Tokens and raw Graph errors never reach API responses; Graph failures log server-side and return generic messages, except the closed 24-hour window which returns 400 `{'error': 'The 24-hour reply window for this conversation has closed.'}` (Graph error code 10).
- Work on branch `feature/unified-inbox`.

---

### Task 1: `inbox` app scaffold, models, admin

**Files:**
- Create: `backend/inbox/__init__.py`, `backend/inbox/apps.py`, `backend/inbox/migrations/__init__.py`, `backend/inbox/models.py`, `backend/inbox/admin.py`, `backend/inbox/test/__init__.py`
- Modify: `backend/vibe_shopping/settings/base.py` (INSTALLED_APPS)
- Test: `backend/inbox/test/test_models.py`

**Interfaces:**
- Consumes: `core.models.TimeStampedModel`, `core.models.Tenant`, `socials.models.ConnectedPage`
- Produces:
  - `inbox.models.CONVERSATION_STATUSES` (list of choice pairs for `new/open/waiting_business/waiting_customer/resolved`)
  - `Customer(tenant FK, platform: 'facebook'|'instagram', platform_user_id: str, name: str blank, profile_pic_url: str blank)` unique (tenant, platform, platform_user_id)
  - `Conversation(tenant FK, page FK ConnectedPage, customer FK, platform, status default 'new', unread_count int default 0, last_message_at datetime null, last_message_preview str blank)` unique (page, customer), ordering `-last_message_at`
  - `Message(conversation FK related_name='messages', direction 'in'|'out', text blank, attachments JSON list default list, platform_message_id unique, sent_at datetime)` ordering `sent_at`

- [ ] **Step 1: Create the app scaffold**

`backend/inbox/__init__.py`, `backend/inbox/migrations/__init__.py`, `backend/inbox/test/__init__.py`: empty files.

`backend/inbox/apps.py`:
```python
from django.apps import AppConfig


class InboxConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inbox'
```

In `backend/vibe_shopping/settings/base.py` INSTALLED_APPS, after `'socials.apps.SocialsConfig',` add:
```python
    'inbox.apps.InboxConfig',
```

- [ ] **Step 2: Write the failing model tests**

`backend/inbox/test/test_models.py`:
```python
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from core.models import Tenant
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection


def make_page(tenant):
    connection = MetaConnection.objects.create(tenant=tenant, fb_user_id='fb1')
    return ConnectedPage.objects.create(
        tenant=tenant, connection=connection, page_id='p1', name='Store'
    )


class InboxModelTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.page = make_page(self.tenant)
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita'
        )

    def test_customer_unique_per_tenant_platform_and_id(self):
        with self.assertRaises(IntegrityError):
            Customer.objects.create(
                tenant=self.tenant, platform='facebook', platform_user_id='psid1'
            )

    def test_conversation_defaults_and_uniqueness(self):
        convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer, platform='facebook'
        )
        self.assertEqual(convo.status, 'new')
        self.assertEqual(convo.unread_count, 0)
        with self.assertRaises(IntegrityError):
            Conversation.objects.create(
                tenant=self.tenant, page=self.page, customer=self.customer, platform='facebook'
            )

    def test_message_dedup_key_unique(self):
        convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer, platform='facebook'
        )
        Message.objects.create(
            conversation=convo, direction='in', text='hi',
            platform_message_id='mid1', sent_at=timezone.now(),
        )
        with self.assertRaises(IntegrityError):
            Message.objects.create(
                conversation=convo, direction='in', text='hi again',
                platform_message_id='mid1', sent_at=timezone.now(),
            )
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_models -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'inbox.models'`

- [ ] **Step 4: Implement the models and admin**

`backend/inbox/models.py`:
```python
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
    sent_at = models.DateTimeField()

    class Meta:
        ordering = ['sent_at']

    def __str__(self):
        return f'{self.direction} {self.platform_message_id}'
```

`backend/inbox/admin.py`:
```python
from django.contrib import admin

from inbox.models import Conversation, Customer, Message


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'platform', 'platform_user_id', 'tenant']


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ['customer', 'platform', 'status', 'unread_count', 'last_message_at', 'tenant']
    list_filter = ['status', 'platform']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['conversation', 'direction', 'sent_at', 'platform_message_id']
```

- [ ] **Step 5: Generate and apply migrations**

Run:
```bash
cd backend && docker compose exec -T web python manage.py makemigrations inbox && docker compose exec -T web python manage.py migrate inbox
```
Expected: `0001_initial.py` created and applied.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_models -v 2`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/inbox backend/vibe_shopping/settings/base.py
git commit -m "feat: add inbox app with Customer, Conversation, Message models"
```

---

### Task 2: serializers and real-time push helper

**Files:**
- Create: `backend/inbox/serializers.py`, `backend/inbox/services/__init__.py`, `backend/inbox/services/push.py`
- Test: `backend/inbox/test/test_push.py`

**Interfaces:**
- Consumes: Task 1 models, Channels (`get_channel_layer`, `async_to_sync`)
- Produces:
  - `CustomerSerializer` → `{id, platform, platform_user_id, name, profile_pic_url}`
  - `ConversationSerializer` → `{id, platform, status, unread_count, last_message_at, last_message_preview, customer: {...}, page_id}` (`page_id` = the ConnectedPage's `page_id` string)
  - `MessageSerializer` → `{id, direction, text, attachments, platform_message_id, sent_at}`
  - `push.push_inbox_event(tenant_id: int, event_type: str, payload: dict) -> None` where `event_type` is `'inbox.message'` or `'inbox.conversation_update'`; sends `{'type': event_type, **payload}` to group `inbox_<tenant_id>`

- [ ] **Step 1: Write the failing tests**

`backend/inbox/test/test_push.py`:
```python
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.test import TestCase, override_settings
from django.utils import timezone

from core.models import Tenant
from inbox.models import Conversation, Customer, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from inbox.test.test_models import make_page

IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


class SerializerTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.page = make_page(self.tenant)
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita'
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', last_message_preview='hello',
        )

    def test_conversation_serializer_shape(self):
        data = ConversationSerializer(self.convo).data
        self.assertEqual(data['customer']['name'], 'Sita')
        self.assertEqual(data['page_id'], 'p1')
        self.assertEqual(data['status'], 'new')
        self.assertNotIn('tenant', data)

    def test_message_serializer_shape(self):
        message = Message.objects.create(
            conversation=self.convo, direction='in', text='hi',
            platform_message_id='m1', sent_at=timezone.now(),
        )
        data = MessageSerializer(message).data
        self.assertEqual(data['direction'], 'in')
        self.assertEqual(data['text'], 'hi')
        self.assertEqual(data['attachments'], [])


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYER)
class PushTests(TestCase):
    def test_push_sends_to_tenant_group(self):
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_add)('inbox_7', 'test-channel')
        push_inbox_event(7, 'inbox.message', {'message': {'text': 'hi'}})
        event = async_to_sync(channel_layer.receive)('test-channel')
        self.assertEqual(event['type'], 'inbox.message')
        self.assertEqual(event['message']['text'], 'hi')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_push -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'inbox.serializers'`

- [ ] **Step 3: Implement**

`backend/inbox/serializers.py`:
```python
from rest_framework import serializers

from inbox.models import Conversation, Customer, Message


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'platform', 'platform_user_id', 'name', 'profile_pic_url']


class ConversationSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    page_id = serializers.CharField(source='page.page_id', read_only=True)

    class Meta:
        model = Conversation
        fields = [
            'id', 'platform', 'status', 'unread_count',
            'last_message_at', 'last_message_preview', 'customer', 'page_id',
        ]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'direction', 'text', 'attachments', 'platform_message_id', 'sent_at']
```

`backend/inbox/services/__init__.py`: empty file.

`backend/inbox/services/push.py`:
```python
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def push_inbox_event(tenant_id, event_type, payload):
    """Send an inbox event to the tenant's Channels group."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'inbox_{tenant_id}', {'type': event_type, **payload}
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_push -v 2`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/inbox
git commit -m "feat: add inbox serializers and channels push helper"
```

---

### Task 3: MetaGraphClient.send_message

**Files:**
- Modify: `backend/socials/services/meta_graph.py` (add one method to `MetaGraphClient`)
- Test: `backend/socials/test/test_meta_graph.py` (append to the existing `GranularScopeFallbackTests`-style pattern with a new class)

**Interfaces:**
- Consumes: existing `MetaGraphClient.post(path, params, files=None)` and `MetaGraphError`
- Produces: `send_message(page_id: str, page_token: str, recipient_id: str, text: str) -> str` (the platform `message_id`, possibly empty). Raises `MetaGraphError` on Graph errors; the closed 24-hour window arrives as `MetaGraphError` with `.code == 10`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/socials/test/test_meta_graph.py`:
```python


@override_settings(META_APP_ID='app123', META_APP_SECRET='secret123')
class SendMessageTests(TestCase):
    @patch('socials.services.meta_graph.requests.post')
    def test_send_message_returns_message_id(self, mock_post):
        mock_post.return_value = graph_response(
            {'recipient_id': 'psid1', 'message_id': 'mid-42'}
        )
        result = MetaGraphClient().send_message('p1', 'pt1', 'psid1', 'hello there')
        self.assertEqual(result, 'mid-42')
        url = mock_post.call_args.args[0]
        self.assertIn('/p1/messages', url)
        params = mock_post.call_args.kwargs['params']
        self.assertEqual(params['messaging_type'], 'RESPONSE')
        self.assertIn('psid1', params['recipient'])
        self.assertIn('hello there', params['message'])

    @patch('socials.services.meta_graph.requests.post')
    def test_send_message_window_error_carries_code(self, mock_post):
        mock_post.return_value = graph_response(
            {'error': {'message': 'This message is sent outside of allowed window.', 'code': 10}},
            status_code=400,
        )
        with self.assertRaises(MetaGraphError) as ctx:
            MetaGraphClient().send_message('p1', 'pt1', 'psid1', 'late reply')
        self.assertEqual(ctx.exception.code, 10)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_meta_graph.SendMessageTests -v 2`
Expected: FAIL with `AttributeError: ... has no attribute 'send_message'`

- [ ] **Step 3: Implement**

Add to `MetaGraphClient` in `backend/socials/services/meta_graph.py` (add `import json` at the top with the other imports):
```python
    def send_message(self, page_id, page_token, recipient_id, text):
        """Send a DM reply via the Page; returns the platform message id."""
        payload = self.post(f'/{page_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'id': recipient_id}),
            'message': json.dumps({'text': text}),
            'messaging_type': 'RESPONSE',
        })
        return payload.get('message_id', '')
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_meta_graph -v 1`
Expected: all PASS (existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add backend/socials
git commit -m "feat: add send_message to MetaGraphClient"
```

---

### Task 4: webhook ingestion service and Celery wiring

**Files:**
- Create: `backend/inbox/services/ingest.py`
- Modify: `backend/socials/tasks.py`
- Test: `backend/inbox/test/test_ingest.py`

**Interfaces:**
- Consumes: Task 1 models, Task 2 serializers + `push_inbox_event`, `socials.models.ConnectedPage`, `socials.models.WebhookEvent`, `MetaGraphClient.get` (profile fetch), `MetaGraphError`
- Produces: `inbox.services.ingest.ingest_webhook_event(event: WebhookEvent) -> int` (count of messages created). Marks nothing itself — the Celery task sets `processed`. `socials.tasks.process_webhook_event` now calls it and sets `event.processed = True`.

- [ ] **Step 1: Write the failing ingestion tests**

`backend/inbox/test/test_ingest.py`:
```python
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from core.models import Tenant
from inbox.models import Conversation, Customer, Message
from inbox.services.ingest import ingest_webhook_event
from socials.models import ConnectedPage, MetaConnection, WebhookEvent

TEST_KEY = Fernet.generate_key().decode()


def messaging_payload(page_entry_id, sender, recipient, mid, text, is_echo=False, attachments=None, object_type='page'):
    message = {'mid': mid, 'text': text}
    if is_echo:
        message['is_echo'] = True
    if attachments is not None:
        message['attachments'] = attachments
    return {
        'object': object_type,
        'entry': [{
            'id': page_entry_id,
            'time': 1755530000000,
            'messaging': [{
                'sender': {'id': sender},
                'recipient': {'id': recipient},
                'timestamp': 1755530000000,
                'message': message,
            }],
        }],
    }


@override_settings(FERNET_KEY=TEST_KEY)
@patch('inbox.services.ingest.push_inbox_event')
@patch('inbox.services.ingest.fetch_customer_profile', return_value={'name': 'Sita', 'profile_pic_url': ''})
class IngestTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1', name='Store',
            instagram_account_id='ig1', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()

    def ingest(self, payload):
        event = WebhookEvent.objects.create(
            object_type=payload['object'], payload=payload, signature_valid=True
        )
        return ingest_webhook_event(event)

    def test_messenger_message_creates_all_rows(self, mock_profile, mock_push):
        created = self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm1', 'hello'))
        self.assertEqual(created, 1)
        customer = Customer.objects.get()
        self.assertEqual(customer.platform, 'facebook')
        self.assertEqual(customer.name, 'Sita')
        convo = Conversation.objects.get()
        self.assertEqual(convo.status, 'waiting_business')
        self.assertEqual(convo.unread_count, 1)
        self.assertEqual(convo.last_message_preview, 'hello')
        message = Message.objects.get()
        self.assertEqual(message.direction, 'in')
        self.assertTrue(mock_push.called)

    def test_instagram_message_maps_by_ig_id(self, mock_profile, mock_push):
        created = self.ingest(
            messaging_payload('ig1', 'igsid9', 'ig1', 'm2', 'namaste', object_type='instagram')
        )
        self.assertEqual(created, 1)
        convo = Conversation.objects.get()
        self.assertEqual(convo.platform, 'instagram')
        self.assertEqual(convo.page, self.page)

    def test_echo_stored_as_outbound(self, mock_profile, mock_push):
        self.ingest(messaging_payload('p1', 'p1', 'psid1', 'm3', 'we replied', is_echo=True))
        message = Message.objects.get()
        self.assertEqual(message.direction, 'out')
        convo = Conversation.objects.get()
        self.assertEqual(convo.status, 'waiting_customer')
        self.assertEqual(convo.unread_count, 0)

    def test_redelivered_event_is_idempotent(self, mock_profile, mock_push):
        payload = messaging_payload('p1', 'psid1', 'p1', 'm4', 'hi')
        self.ingest(payload)
        created_again = self.ingest(payload)
        self.assertEqual(created_again, 0)
        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Conversation.objects.get().unread_count, 1)

    def test_attachment_message_stores_attachments(self, mock_profile, mock_push):
        attachments = [{'type': 'image', 'payload': {'url': 'https://cdn/img.jpg'}}]
        self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm5', '', attachments=attachments))
        message = Message.objects.get()
        self.assertEqual(message.attachments, [{'type': 'image', 'url': 'https://cdn/img.jpg'}])
        self.assertEqual(Conversation.objects.get().last_message_preview, '[attachment]')

    def test_unknown_page_is_skipped(self, mock_profile, mock_push):
        created = self.ingest(messaging_payload('other-page', 'psid1', 'other-page', 'm6', 'hi'))
        self.assertEqual(created, 0)
        self.assertEqual(Conversation.objects.count(), 0)

    def test_resolved_conversation_reopens_on_inbound(self, mock_profile, mock_push):
        self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm7', 'first'))
        Conversation.objects.update(status='resolved')
        self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm8', 'again'))
        self.assertEqual(Conversation.objects.get().status, 'waiting_business')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_ingest -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'inbox.services.ingest'`

- [ ] **Step 3: Implement the ingestion service**

`backend/inbox/services/ingest.py`:
```python
import logging
from datetime import datetime, timezone as dt_timezone

from inbox.models import Conversation, Customer, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.models import ConnectedPage
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

PROFILE_FIELDS = 'name,profile_pic'


def fetch_customer_profile(page, user_id):
    """Best-effort Graph profile lookup; blank fields on failure."""
    client = MetaGraphClient()
    try:
        detail = client.get(f'/{user_id}', {
            'access_token': page.get_access_token(),
            'fields': PROFILE_FIELDS,
        })
        return {
            'name': detail.get('name') or detail.get('username', ''),
            'profile_pic_url': detail.get('profile_pic', ''),
        }
    except MetaGraphError as exc:
        logger.info('Customer profile fetch failed for %s: %s', user_id, exc)
        return {'name': '', 'profile_pic_url': ''}


def resolve_page(object_type, entry_id):
    """Map a webhook entry id to a connected page, or None."""
    if object_type == 'instagram':
        return ConnectedPage.objects.filter(
            instagram_account_id=entry_id, status='connected'
        ).first()
    return ConnectedPage.objects.filter(page_id=entry_id, status='connected').first()


def normalize_attachments(message):
    """Flatten Meta attachment payloads to [{type, url}]."""
    normalized = []
    for attachment in message.get('attachments', []) or []:
        url = (attachment.get('payload') or {}).get('url', '')
        normalized.append({'type': attachment.get('type', 'file'), 'url': url})
    return normalized


def build_preview(text, attachments):
    """Return the conversation list preview for a message."""
    if text:
        return text[:120]
    if attachments:
        return '[attachment]'
    return ''


def apply_inbound(conversation):
    conversation.unread_count += 1
    conversation.status = 'waiting_business'


def apply_outbound(conversation):
    conversation.status = 'waiting_customer'


def store_message(page, platform, messaging_event):
    """Persist one messaging event; returns the Message or None."""
    message = messaging_event.get('message') or {}
    mid = message.get('mid')
    if not mid:
        return None
    page_identity = page.instagram_account_id if platform == 'instagram' else page.page_id
    is_echo = bool(message.get('is_echo'))
    sender_id = (messaging_event.get('sender') or {}).get('id', '')
    recipient_id = (messaging_event.get('recipient') or {}).get('id', '')
    direction = 'out' if is_echo or sender_id == page_identity else 'in'
    customer_id = recipient_id if direction == 'out' else sender_id
    if not customer_id:
        return None
    customer, created = Customer.objects.get_or_create(
        tenant=page.tenant, platform=platform, platform_user_id=customer_id
    )
    if created:
        profile = fetch_customer_profile(page, customer_id)
        customer.name = profile['name']
        customer.profile_pic_url = profile['profile_pic_url']
        customer.save()
    conversation, _ = Conversation.objects.get_or_create(
        page=page, customer=customer,
        defaults={'tenant': page.tenant, 'platform': platform},
    )
    attachments = normalize_attachments(message)
    sent_at = datetime.fromtimestamp(
        messaging_event.get('timestamp', 0) / 1000, tz=dt_timezone.utc
    )
    record, created = Message.objects.get_or_create(
        platform_message_id=mid,
        defaults={
            'conversation': conversation,
            'direction': direction,
            'text': message.get('text', '') or '',
            'attachments': attachments,
            'sent_at': sent_at,
        },
    )
    if not created:
        return None
    if direction == 'in':
        apply_inbound(conversation)
    else:
        apply_outbound(conversation)
    conversation.last_message_at = sent_at
    conversation.last_message_preview = build_preview(record.text, attachments)
    conversation.save()
    push_inbox_event(page.tenant_id, 'inbox.message', {
        'conversation': ConversationSerializer(conversation).data,
        'message': MessageSerializer(record).data,
    })
    return record


def ingest_webhook_event(event):
    """Parse a stored webhook event into inbox rows; returns messages created."""
    payload = event.payload or {}
    object_type = payload.get('object', '')
    if object_type not in ('page', 'instagram'):
        return 0
    platform = 'instagram' if object_type == 'instagram' else 'facebook'
    created_count = 0
    for entry in payload.get('entry', []) or []:
        page = resolve_page(object_type, str(entry.get('id', '')))
        if not page:
            continue
        for messaging_event in entry.get('messaging', []) or []:
            try:
                record = store_message(page, platform, messaging_event)
            except Exception:
                logger.exception('Failed to ingest messaging event %s', event.id)
                continue
            if record:
                created_count += 1
    return created_count
```

- [ ] **Step 4: Wire the Celery task**

Replace the body of `process_webhook_event` in `backend/socials/tasks.py`:
```python
import logging

from celery import shared_task

from socials.models import WebhookEvent

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_webhook_event(self, event_id):
    """Parse an inbound Meta event into inbox conversations and messages."""
    try:
        event = WebhookEvent.objects.get(id=event_id)
    except WebhookEvent.DoesNotExist as exc:
        raise self.retry(exc=exc)
    if event.processed:
        return event.id
    from inbox.services.ingest import ingest_webhook_event
    created = ingest_webhook_event(event)
    event.processed = True
    event.save()
    logger.info('Processed %s event %s: %s messages', event.object_type, event.id, created)
    return event.id
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_ingest socials.test.test_webhooks -v 1`
Expected: all PASS (the webhook tests still pass because they patch `socials.views.process_webhook_event`)

- [ ] **Step 6: Commit**

```bash
git add backend/inbox backend/socials
git commit -m "feat: ingest Meta messaging webhooks into inbox models"
```

---

### Task 5: inbox REST API

**Files:**
- Create: `backend/inbox/views.py`, `backend/inbox/urls.py`
- Modify: `backend/vibe_shopping/urls.py`
- Test: `backend/inbox/test/test_api.py`

**Interfaces:**
- Consumes: Tasks 1-3 (models, serializers, push helper, `MetaGraphClient.send_message`), `get_request_tenant` pattern (reimplemented locally)
- Produces:
  - `GET /api/inbox/conversations/` → list ordered `-last_message_at`; optional `?status=` and `?platform=` filters
  - `GET /api/inbox/conversations/{id}/messages/` → up to 50 messages ascending; optional `?before=<message_id>`
  - `POST /api/inbox/conversations/{id}/messages/` body `{text}` → 201 with serialized message; 400 empty text; 400 window-closed message on `MetaGraphError.code == 10`; 502 generic otherwise
  - `POST /api/inbox/conversations/{id}/read/` → 200, unread_count reset
  - `PATCH /api/inbox/conversations/{id}/` body `{status}` → 200 serialized conversation; 400 invalid status

- [ ] **Step 1: Write the failing API tests**

`backend/inbox/test/test_api.py`:
```python
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class InboxApiTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita'
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', status='waiting_business', unread_count=2,
            last_message_at=timezone.now(), last_message_preview='hello',
        )
        Message.objects.create(
            conversation=self.convo, direction='in', text='hello',
            platform_message_id='m1', sent_at=timezone.now(),
        )

    def test_list_conversations(self):
        response = self.client.get('/api/inbox/conversations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['customer']['name'], 'Sita')

    def test_list_filters_by_status(self):
        response = self.client.get('/api/inbox/conversations/?status=resolved')
        self.assertEqual(response.data, [])

    def test_thread_messages(self):
        response = self.client.get(f'/api/inbox/conversations/{self.convo.id}/messages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['text'], 'hello')

    @patch('inbox.views.MetaGraphClient')
    def test_send_reply(self, mock_client_cls):
        mock_client_cls.return_value.send_message.return_value = 'mid-out-1'
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'thanks!'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['direction'], 'out')
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.status, 'waiting_customer')
        self.assertEqual(self.convo.unread_count, 0)
        self.assertEqual(self.convo.last_message_preview, 'thanks!')
        mock_client_cls.return_value.send_message.assert_called_once_with(
            'p1', 'pt1', 'psid1', 'thanks!'
        )

    @patch('inbox.views.MetaGraphClient')
    def test_send_reply_window_closed(self, mock_client_cls):
        mock_client_cls.return_value.send_message.side_effect = MetaGraphError('window', code=10)
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'late'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['error'],
            'The 24-hour reply window for this conversation has closed.',
        )

    def test_send_reply_empty_text(self):
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/', {'text': ''}, format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_mark_read(self):
        response = self.client.post(f'/api/inbox/conversations/{self.convo.id}/read/')
        self.assertEqual(response.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.unread_count, 0)

    def test_update_status(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {'status': 'resolved'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.status, 'resolved')

    def test_update_status_invalid(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {'status': 'nonsense'}, format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_cross_tenant_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        loner = User.objects.create_user(username='loner', password='pass12345')
        VendorProfile.objects.create(user=loner, tenant=other, role='owner')
        token = Token.objects.create(user=loner)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        for method, url in [
            ('get', f'/api/inbox/conversations/{self.convo.id}/messages/'),
            ('post', f'/api/inbox/conversations/{self.convo.id}/read/'),
            ('patch', f'/api/inbox/conversations/{self.convo.id}/'),
        ]:
            response = getattr(self.client, method)(url, {}, format='json')
            self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_api -v 2`
Expected: FAIL, 404s on the inbox routes

- [ ] **Step 3: Implement views and routing**

`backend/inbox/views.py`:
```python
import logging
import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from inbox.models import CONVERSATION_STATUSES, Conversation, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

VALID_STATUSES = {value for value, _ in CONVERSATION_STATUSES}
WINDOW_CLOSED_ERROR = 'The 24-hour reply window for this conversation has closed.'
THREAD_PAGE_SIZE = 50


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


def get_tenant_conversation(request, conversation_id):
    """Return (tenant, conversation) with tenant scoping; Nones on miss."""
    tenant = get_request_tenant(request)
    if not tenant:
        return None, None
    conversation = Conversation.objects.filter(tenant=tenant, id=conversation_id).select_related(
        'customer', 'page'
    ).first()
    return tenant, conversation


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's conversations, newest activity first."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        queryset = Conversation.objects.filter(tenant=tenant).select_related('customer', 'page')
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        platform_filter = request.query_params.get('platform')
        if platform_filter:
            queryset = queryset.filter(platform=platform_filter)
        return Response(ConversationSerializer(queryset, many=True).data)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):
        """Update the conversation status."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status not in VALID_STATUSES:
            return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
        conversation.status = new_status
        conversation.save()
        data = ConversationSerializer(conversation).data
        push_inbox_event(tenant.id, 'inbox.conversation_update', {'conversation': data})
        return Response(data)


class ConversationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        """Reset the unread counter."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        conversation.unread_count = 0
        conversation.save()
        data = ConversationSerializer(conversation).data
        push_inbox_event(tenant.id, 'inbox.conversation_update', {'conversation': data})
        return Response(data)


class MessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        """Return up to 50 thread messages, oldest first."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        queryset = conversation.messages.all()
        before = request.query_params.get('before')
        if before:
            queryset = queryset.filter(id__lt=before)
        window = list(queryset.order_by('-sent_at')[:THREAD_PAGE_SIZE])
        window.reverse()
        return Response(MessageSerializer(window, many=True).data)

    def post(self, request, conversation_id):
        """Send a reply through Meta and store it."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'Message text is required'}, status=status.HTTP_400_BAD_REQUEST)
        client = MetaGraphClient()
        try:
            message_id = client.send_message(
                conversation.page.page_id,
                conversation.page.get_access_token(),
                conversation.customer.platform_user_id,
                text,
            )
        except MetaGraphError as exc:
            if exc.code == 10:
                return Response({'error': WINDOW_CLOSED_ERROR}, status=status.HTTP_400_BAD_REQUEST)
            logger.warning('Inbox send failed: %s', exc)
            return Response(
                {'error': 'Could not send the message. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        record = Message.objects.create(
            conversation=conversation,
            direction='out',
            text=text,
            platform_message_id=message_id or f'local-{uuid.uuid4().hex}',
            sent_at=timezone.now(),
        )
        conversation.status = 'waiting_customer'
        conversation.unread_count = 0
        conversation.last_message_at = record.sent_at
        conversation.last_message_preview = text[:120]
        conversation.save()
        push_inbox_event(tenant.id, 'inbox.message', {
            'conversation': ConversationSerializer(conversation).data,
            'message': MessageSerializer(record).data,
        })
        return Response(MessageSerializer(record).data, status=status.HTTP_201_CREATED)
```

`backend/inbox/urls.py`:
```python
from django.urls import path

from inbox.views import (
    ConversationDetailView,
    ConversationListView,
    ConversationReadView,
    MessageListView,
)

urlpatterns = [
    path('conversations/', ConversationListView.as_view(), name='inbox_conversations'),
    path('conversations/<int:conversation_id>/', ConversationDetailView.as_view(), name='inbox_conversation_detail'),
    path('conversations/<int:conversation_id>/read/', ConversationReadView.as_view(), name='inbox_conversation_read'),
    path('conversations/<int:conversation_id>/messages/', MessageListView.as_view(), name='inbox_messages'),
]
```

In `backend/vibe_shopping/urls.py` urlpatterns add:
```python
    path('api/inbox/', include('inbox.urls')),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_api -v 2`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/inbox backend/vibe_shopping/urls.py
git commit -m "feat: add inbox REST API"
```

---

### Task 6: WebSocket consumer and routing

**Files:**
- Create: `backend/inbox/consumers.py`, `backend/inbox/routing.py`
- Modify: `backend/vibe_shopping/asgi.py`
- Test: `backend/inbox/test/test_consumer.py`

**Interfaces:**
- Consumes: DRF `Token` model, `VendorProfile`, Channels groups from Task 2 (`inbox_<tenant_id>`, event types `inbox.message` / `inbox.conversation_update`)
- Produces: WebSocket endpoint `ws/inbox/?token=<drf token>`; socket receives JSON `{'type': 'message', 'conversation': {...}, 'message': {...}}` and `{'type': 'conversation_update', 'conversation': {...}}`

- [ ] **Step 1: Write the failing consumer tests**

`backend/inbox/test/test_consumer.py`:
```python
import json

from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token

from core.models import Tenant, VendorProfile
from inbox.routing import websocket_urlpatterns

IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYER)
class InboxConsumerTests(TransactionTestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        self.token = Token.objects.create(user=self.user)
        self.application = URLRouter(websocket_urlpatterns)

    async def test_rejects_bad_token(self):
        communicator = WebsocketCommunicator(self.application, 'ws/inbox/?token=bogus')
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_accepts_valid_token_and_relays_events(self):
        communicator = WebsocketCommunicator(
            self.application, f'ws/inbox/?token={self.token.key}'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        channel_layer = get_channel_layer()
        await channel_layer.group_send(f'inbox_{self.tenant.id}', {
            'type': 'inbox.message',
            'conversation': {'id': 1},
            'message': {'id': 2, 'text': 'hi'},
        })
        payload = json.loads(await communicator.receive_from())
        self.assertEqual(payload['type'], 'message')
        self.assertEqual(payload['message']['text'], 'hi')
        await channel_layer.group_send(f'inbox_{self.tenant.id}', {
            'type': 'inbox.conversation_update',
            'conversation': {'id': 1, 'status': 'resolved'},
        })
        payload = json.loads(await communicator.receive_from())
        self.assertEqual(payload['type'], 'conversation_update')
        await communicator.disconnect()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_consumer -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'inbox.routing'`

- [ ] **Step 3: Implement consumer and routing**

`backend/inbox/consumers.py`:
```python
import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer


class InboxConsumer(AsyncWebsocketConsumer):
    """Streams inbox events to the authenticated tenant's dashboard."""

    async def connect(self):
        token_key = self.get_token_key()
        tenant_id = await self.get_tenant_id(token_key)
        if not tenant_id:
            await self.close()
            return
        self.group_name = f'inbox_{tenant_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group_name = getattr(self, 'group_name', None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    def get_token_key(self):
        query = parse_qs(self.scope.get('query_string', b'').decode())
        values = query.get('token', [])
        return values[0] if values else ''

    @database_sync_to_async
    def get_tenant_id(self, token_key):
        from rest_framework.authtoken.models import Token
        if not token_key:
            return None
        token = Token.objects.select_related('user').filter(key=token_key).first()
        if not token:
            return None
        profile = getattr(token.user, 'vendor_profile', None)
        return profile.tenant_id if profile else None

    async def inbox_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message',
            'conversation': event['conversation'],
            'message': event['message'],
        }))

    async def inbox_conversation_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'conversation_update',
            'conversation': event['conversation'],
        }))
```

`backend/inbox/routing.py`:
```python
from django.urls import re_path

from inbox.consumers import InboxConsumer

websocket_urlpatterns = [
    re_path(r'ws/inbox/$', InboxConsumer.as_asgi()),
]
```

In `backend/vibe_shopping/asgi.py`, import `inbox.routing` next to `vendor.routing` and combine the url lists where the `URLRouter` is built: replace `vendor.routing.websocket_urlpatterns` with `vendor.routing.websocket_urlpatterns + inbox.routing.websocket_urlpatterns` (read the file first and keep its existing structure).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test inbox.test.test_consumer -v 2`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the whole backend suite and commit**

Run: `cd backend && docker compose exec -T web python manage.py test inbox socials core.test.test_business_profile -v 1`
Expected: all PASS

```bash
git add backend/inbox backend/vibe_shopping/asgi.py
git commit -m "feat: add inbox websocket consumer with token auth"
```

---

### Task 7: frontend inbox API module and Redux slice

**Files:**
- Create: `frontend/src/api/inbox.ts`, `frontend/src/features/inbox/inboxSlice.ts`
- Modify: `frontend/src/store/index.ts`

**Interfaces:**
- Consumes: `apiClient` from `@/api/client`
- Produces (Task 8 depends on these exact names):
  - Types: `InboxCustomer {id, platform, platform_user_id, name, profile_pic_url}`, `InboxConversation {id, platform: 'facebook'|'instagram', status, unread_count, last_message_at: string|null, last_message_preview, customer: InboxCustomer, page_id}`, `InboxMessage {id, direction: 'in'|'out', text, attachments: {type, url}[], platform_message_id, sent_at}`
  - API: `listConversations(status?)`, `listMessages(conversationId)`, `sendMessage(conversationId, text)`, `markRead(conversationId)`, `updateConversationStatus(conversationId, status)`
  - Slice `inbox`: state `{conversations, messages, activeConversationId, statusFilter, loading, error, sendError}`; thunks `fetchConversations`, `fetchMessages`, `sendReply`, `markConversationRead`, `setConversationStatus`; reducers `socketMessageReceived(payload)`, `socketConversationUpdated(payload)`, `setActiveConversation(id)`, `setStatusFilter(filter)`; registered as `inbox`

- [ ] **Step 1: Create the API module**

`frontend/src/api/inbox.ts`:
```typescript
import apiClient from './client';

export interface InboxCustomer {
    id: number;
    platform: string;
    platform_user_id: string;
    name: string;
    profile_pic_url: string;
}

export interface InboxConversation {
    id: number;
    platform: 'facebook' | 'instagram';
    status: string;
    unread_count: number;
    last_message_at: string | null;
    last_message_preview: string;
    customer: InboxCustomer;
    page_id: string;
}

export interface InboxAttachment {
    type: string;
    url: string;
}

export interface InboxMessage {
    id: number;
    direction: 'in' | 'out';
    text: string;
    attachments: InboxAttachment[];
    platform_message_id: string;
    sent_at: string;
}

export const listConversations = async (status?: string): Promise<InboxConversation[]> => {
    const params = status && status !== 'all' ? { status } : {};
    const response = await apiClient.get('/inbox/conversations/', { params });
    return response.data;
};

export const listMessages = async (conversationId: number): Promise<InboxMessage[]> => {
    const response = await apiClient.get(`/inbox/conversations/${conversationId}/messages/`);
    return response.data;
};

export const sendMessage = async (conversationId: number, text: string): Promise<InboxMessage> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/messages/`, { text });
    return response.data;
};

export const markRead = async (conversationId: number): Promise<InboxConversation> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/read/`);
    return response.data;
};

export const updateConversationStatus = async (
    conversationId: number,
    status: string,
): Promise<InboxConversation> => {
    const response = await apiClient.patch(`/inbox/conversations/${conversationId}/`, { status });
    return response.data;
};
```

- [ ] **Step 2: Create the slice**

`frontend/src/features/inbox/inboxSlice.ts`:
```typescript
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
    listConversations,
    listMessages,
    markRead,
    sendMessage,
    updateConversationStatus,
    type InboxConversation,
    type InboxMessage,
} from '@/api/inbox';

interface InboxState {
    conversations: InboxConversation[];
    messages: InboxMessage[];
    activeConversationId: number | null;
    statusFilter: string;
    loading: boolean;
    error: string | null;
    sendError: string | null;
}

const initialState: InboxState = {
    conversations: [],
    messages: [],
    activeConversationId: null,
    statusFilter: 'all',
    loading: false,
    error: null,
    sendError: null,
};

const upsertConversation = (state: InboxState, conversation: InboxConversation) => {
    state.conversations = [
        conversation,
        ...state.conversations.filter((c) => c.id !== conversation.id),
    ];
};

export const fetchConversations = createAsyncThunk(
    'inbox/fetchConversations',
    async (status: string) => listConversations(status),
);

export const fetchMessages = createAsyncThunk(
    'inbox/fetchMessages',
    async (conversationId: number) => listMessages(conversationId),
);

export const sendReply = createAsyncThunk(
    'inbox/sendReply',
    async (
        { conversationId, text }: { conversationId: number; text: string },
        { rejectWithValue },
    ) => {
        try {
            return await sendMessage(conversationId, text);
        } catch (error) {
            const detail = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            return rejectWithValue(detail ?? 'Could not send the message');
        }
    },
);

export const markConversationRead = createAsyncThunk(
    'inbox/markConversationRead',
    async (conversationId: number) => markRead(conversationId),
);

export const setConversationStatus = createAsyncThunk(
    'inbox/setConversationStatus',
    async ({ conversationId, status }: { conversationId: number; status: string }) =>
        updateConversationStatus(conversationId, status),
);

const inboxSlice = createSlice({
    name: 'inbox',
    initialState,
    reducers: {
        setActiveConversation(state, action: PayloadAction<number | null>) {
            state.activeConversationId = action.payload;
            state.messages = [];
            state.sendError = null;
        },
        setStatusFilter(state, action: PayloadAction<string>) {
            state.statusFilter = action.payload;
        },
        socketMessageReceived(
            state,
            action: PayloadAction<{ conversation: InboxConversation; message: InboxMessage }>,
        ) {
            upsertConversation(state, action.payload.conversation);
            const isActive = state.activeConversationId === action.payload.conversation.id;
            const alreadyStored = state.messages.some(
                (m) => m.platform_message_id === action.payload.message.platform_message_id,
            );
            if (isActive && !alreadyStored) {
                state.messages = [...state.messages, action.payload.message];
            }
        },
        socketConversationUpdated(
            state,
            action: PayloadAction<{ conversation: InboxConversation }>,
        ) {
            upsertConversation(state, action.payload.conversation);
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConversations.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchConversations.fulfilled, (state, action) => {
                state.conversations = action.payload;
                state.loading = false;
            })
            .addCase(fetchConversations.rejected, (state) => {
                state.loading = false;
                state.error = 'Could not load conversations';
            })
            .addCase(fetchMessages.fulfilled, (state, action) => {
                state.messages = action.payload;
            })
            .addCase(sendReply.pending, (state) => {
                state.sendError = null;
            })
            .addCase(sendReply.fulfilled, (state, action) => {
                const alreadyStored = state.messages.some(
                    (m) => m.platform_message_id === action.payload.platform_message_id,
                );
                if (!alreadyStored) {
                    state.messages = [...state.messages, action.payload];
                }
            })
            .addCase(sendReply.rejected, (state, action) => {
                state.sendError = (action.payload as string) ?? 'Could not send the message';
            })
            .addCase(markConversationRead.fulfilled, (state, action) => {
                upsertConversation(state, action.payload);
            })
            .addCase(setConversationStatus.fulfilled, (state, action) => {
                upsertConversation(state, action.payload);
            });
    },
});

export const {
    setActiveConversation,
    setStatusFilter,
    socketMessageReceived,
    socketConversationUpdated,
} = inboxSlice.actions;
export default inboxSlice.reducer;
```

- [ ] **Step 3: Register the reducer**

In `frontend/src/store/index.ts` add:
```typescript
import inboxReducer from '@/features/inbox/inboxSlice';
```
```typescript
        inbox: inboxReducer,
```

- [ ] **Step 4: Verify types**

Run: `cd frontend && npx tsc -b --force 2>&1 | grep -E "inbox"`
Expected: no output (zero errors in the new files)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/inbox.ts frontend/src/features/inbox frontend/src/store/index.ts
git commit -m "feat: add inbox API module and Redux slice"
```

---

### Task 8: WebSocket hook, InboxPage, and navigation

**Files:**
- Create: `frontend/src/features/inbox/useInboxSocket.ts`, `frontend/src/pages/InboxPage.tsx`
- Modify: `frontend/src/App.tsx` (route), `frontend/src/pages/VendorDashboardPage.tsx` (sidebar link)

**Interfaces:**
- Consumes: Task 7's slice actions/thunks and types; `useAppDispatch`/`useAppSelector` from `@/store/hooks`; the token in `localStorage.getItem('token')`; WS endpoint `ws/inbox/?token=`
- Produces: route `/vendor/inbox`; sidebar Inbox entry

- [ ] **Step 1: Create the socket hook**

`frontend/src/features/inbox/useInboxSocket.ts`:
```typescript
import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { socketConversationUpdated, socketMessageReceived } from './inboxSlice';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function useInboxSocket() {
    const dispatch = useAppDispatch();
    const retryRef = useRef(0);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let closed = false;
        let reconnectTimer: number | undefined;

        const connect = () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            socket = new WebSocket(`${WS_BASE}/ws/inbox/?token=${token}`);
            socket.onopen = () => {
                retryRef.current = 0;
            };
            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'message') {
                    dispatch(socketMessageReceived({ conversation: data.conversation, message: data.message }));
                } else if (data.type === 'conversation_update') {
                    dispatch(socketConversationUpdated({ conversation: data.conversation }));
                }
            };
            socket.onclose = () => {
                if (closed) return;
                retryRef.current += 1;
                const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
                reconnectTimer = window.setTimeout(connect, delay);
            };
        };

        connect();
        return () => {
            closed = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            socket?.close();
        };
    }, [dispatch]);
}
```

- [ ] **Step 2: Create the InboxPage**

`frontend/src/pages/InboxPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    fetchConversations,
    fetchMessages,
    markConversationRead,
    sendReply,
    setActiveConversation,
    setConversationStatus,
    setStatusFilter,
} from '@/features/inbox/inboxSlice';
import { useInboxSocket } from '@/features/inbox/useInboxSocket';
import type { InboxConversation, InboxMessage } from '@/api/inbox';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'waiting_business', label: 'Needs reply' },
    { key: 'waiting_customer', label: 'Waiting' },
    { key: 'resolved', label: 'Resolved' },
];

function PlatformBadge({ platform }: { platform: InboxConversation['platform'] }) {
    const label = platform === 'instagram' ? 'IG' : 'FB';
    const color = platform === 'instagram' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700';
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>{label}</span>;
}

function ConversationRow({
    conversation,
    active,
    onSelect,
}: {
    conversation: InboxConversation;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${active ? 'bg-indigo-50' : 'bg-white'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <PlatformBadge platform={conversation.platform} />
                    <span className="font-semibold text-gray-900 truncate">
                        {conversation.customer.name || conversation.customer.platform_user_id}
                    </span>
                </div>
                {conversation.unread_count > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
                        {conversation.unread_count}
                    </span>
                )}
            </div>
            <p className="mt-1 text-sm text-gray-500 truncate">{conversation.last_message_preview}</p>
        </button>
    );
}

function MessageBubble({ message }: { message: InboxMessage }) {
    const mine = message.direction === 'out';
    return (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'}`}
            >
                {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                {message.attachments.map((attachment) => (
                    <a
                        key={attachment.url}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`block underline ${mine ? 'text-indigo-100' : 'text-indigo-600'}`}
                    >
                        {attachment.type === 'image' ? (
                            <img src={attachment.url} alt="attachment" className="mt-1 max-h-48 rounded-lg" />
                        ) : (
                            attachment.type
                        )}
                    </a>
                ))}
            </div>
        </div>
    );
}

export default function InboxPage() {
    const dispatch = useAppDispatch();
    const { conversations, messages, activeConversationId, statusFilter, loading, sendError } =
        useAppSelector((state) => state.inbox);
    const [draft, setDraft] = useState('');
    useInboxSocket();

    useEffect(() => {
        dispatch(fetchConversations(statusFilter));
    }, [dispatch, statusFilter]);

    const active = conversations.find((c) => c.id === activeConversationId) ?? null;

    const openConversation = (conversation: InboxConversation) => {
        dispatch(setActiveConversation(conversation.id));
        dispatch(fetchMessages(conversation.id));
        if (conversation.unread_count > 0) {
            dispatch(markConversationRead(conversation.id));
        }
    };

    const handleSend = async () => {
        if (!active || !draft.trim()) return;
        const text = draft.trim();
        setDraft('');
        await dispatch(sendReply({ conversationId: active.id, text }));
    };

    const toggleResolve = () => {
        if (!active) return;
        const next = active.status === 'resolved' ? 'open' : 'resolved';
        dispatch(setConversationStatus({ conversationId: active.id, status: next }));
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-center gap-4">
                    <Link to="/vendor" className="text-sm text-indigo-600">
                        ← Dashboard
                    </Link>
                    <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
                </div>
                <div className="flex gap-2">
                    {FILTERS.map((filter) => (
                        <button
                            key={filter.key}
                            onClick={() => dispatch(setStatusFilter(filter.key))}
                            className={`px-3 py-1.5 rounded-full text-sm ${statusFilter === filter.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-1 min-h-0">
                <div className="w-96 border-r border-gray-200 bg-white overflow-y-auto">
                    {conversations.map((conversation) => (
                        <ConversationRow
                            key={conversation.id}
                            conversation={conversation}
                            active={conversation.id === activeConversationId}
                            onSelect={() => openConversation(conversation)}
                        />
                    ))}
                    {!loading && conversations.length === 0 && (
                        <p className="p-6 text-sm text-gray-500">No conversations yet.</p>
                    )}
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                    {active ? (
                        <>
                            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <PlatformBadge platform={active.platform} />
                                    <span className="font-semibold text-gray-900">
                                        {active.customer.name || active.customer.platform_user_id}
                                    </span>
                                    <span className="text-xs text-gray-400">{active.status}</span>
                                </div>
                                <button onClick={toggleResolve} className="text-sm text-indigo-600">
                                    {active.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                                {messages.map((message) => (
                                    <MessageBubble key={message.platform_message_id} message={message} />
                                ))}
                            </div>
                            <div className="px-6 py-4 bg-white border-t border-gray-200">
                                {sendError && <p className="mb-2 text-sm text-red-600">{sendError}</p>}
                                <div className="flex gap-3">
                                    <input
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        placeholder="Type a reply…"
                                        className="flex-1 rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <button
                                        onClick={handleSend}
                                        className="rounded-xl bg-indigo-600 px-5 py-2 text-white hover:bg-indigo-700"
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            Select a conversation
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Register the route and sidebar link**

In `frontend/src/App.tsx` add the import and route (next to the other `/vendor` routes):
```tsx
import InboxPage from './pages/InboxPage';
```
```tsx
<Route path="/vendor/inbox" element={<InboxPage />} />
```

In `frontend/src/pages/VendorDashboardPage.tsx`:
- Extend the type: `type DashboardSection = 'dashboard' | 'orders' | 'products' | 'analytics' | 'settings' | 'inbox';`
- Add to `navItems` after the dashboard entry: `{ id: 'inbox', label: 'Inbox', icon: 'chat' },`
- Add to the existing `linkTargets` map: `inbox: '/vendor/inbox',`

- [ ] **Step 4: Verify types**

Run before your changes: `cd frontend && npx tsc -b --force 2>&1 | grep -cE "^src.*error"` and note the count. Run it again after your changes: the count must not increase, and `npx tsc -b --force 2>&1 | grep -E "InboxPage|useInboxSocket"` must produce no output. `VendorDashboardPage.tsx` has one pre-existing error on the base branch (a Link/button union type at the nav render) — it may remain, but no new errors may appear in it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/inbox/useInboxSocket.ts frontend/src/pages/InboxPage.tsx frontend/src/App.tsx frontend/src/pages/VendorDashboardPage.tsx
git commit -m "feat: add inbox page with live websocket updates"
```

---

### Task 9: end-to-end verification

**Files:**
- No planned code changes; fixes discovered here become new commits.

- [ ] **Step 1: Restart backend services**

```bash
cd backend && docker compose restart web celery_worker
```

- [ ] **Step 2: Full backend suite**

Run: `cd backend && docker compose exec -T web python manage.py test inbox socials core.test.test_business_profile -v 1`
Expected: all PASS

- [ ] **Step 3: Simulated end-to-end (no tunnel needed)**

Inject a fake inbound event through the real pipeline and confirm it appears in the UI:
```bash
docker compose exec -T web python manage.py shell -c "
from socials.models import WebhookEvent
from socials.tasks import process_webhook_event
payload = {'object': 'page', 'entry': [{'id': '<real page_id>', 'time': 1, 'messaging': [{'sender': {'id': 'test-psid-1'}, 'recipient': {'id': '<real page_id>'}, 'timestamp': 1755530000000, 'message': {'mid': 'sim-1', 'text': 'Hello from simulation'}}]}]}
event = WebhookEvent.objects.create(object_type='page', payload=payload, signature_valid=True)
process_webhook_event(event.id)
"
```
Open `/vendor/inbox` logged in as the page's tenant: the conversation appears (live if the page was already open). Reply from the composer — expect a Graph error toast for the fake PSID (the send API rejects unknown recipients), which proves the error path; the conversation and thread rendering prove ingestion.

- [ ] **Step 4: Live verification (needs the user's tunnel)**

`ngrok http 8000`; add the ngrok host to `ALLOWED_HOSTS` in `backend/.env`; in the Meta app dashboard set the Webhooks callback to `<tunnel>/api/webhooks/meta/` with the existing verify token; subscribe `page → messages` and `instagram → messages`. DM the Page from a personal account → conversation appears live → reply from the dashboard → reply arrives in Messenger.

- [ ] **Step 5: Record results**

Fix any deviations as separate commits before declaring the cycle complete.

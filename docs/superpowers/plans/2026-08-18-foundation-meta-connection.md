# Foundation Cycle: Business Auth & Meta Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Businesses can connect a Facebook Page and its Instagram account via Meta OAuth, manage their business profile, and have inbound Meta webhook events validated and persisted.

**Architecture:** New `socials` Django app owns everything Meta-facing: three models (MetaConnection, ConnectedPage, WebhookEvent), a `MetaGraphClient` service that is the only module talking to graph.facebook.com, OAuth/connect endpoints, and a signature-validated webhook receiver that persists events and defers processing to Celery. A small business-profile endpoint lands in `core`. The React frontend gets a socials API module, Redux slice, and a Connected Accounts settings flow.

**Tech Stack:** Django 5 + DRF (token auth), Celery, PostgreSQL, `cryptography` (Fernet), React 19 + TypeScript + Redux Toolkit + axios.

**Spec:** `docs/superpowers/specs/2026-08-18-foundation-meta-connection-design.md`

## Global Constraints

- Business signup/login/logout already exist (`/api/vendor/signup/`, `/api/auth/login/`, `/api/auth/logout/`) — do not rebuild them.
- No code comments: never write lines starting with `#`, `//`, or `<!--` in any file. Python docstrings (`"""`) are allowed.
- Tokens are Fernet-encrypted at rest and must never appear in API responses, serializers, logs, or Django admin.
- All tenant-scoped endpoints resolve the tenant from `request.user.vendor_profile.tenant`; never accept a tenant id from the client.
- Backend commands run inside Docker from the `backend/` directory: `docker compose exec -T web python manage.py <cmd>`.
- Backend tests: Django test runner, test files under `socials/test/` (matching `core/test/` pattern).
- Frontend has no test runner; verify frontend tasks with `npm run build` (runs `tsc -b`).
- Graph API version: `v21.0`.
- New env vars go in `backend/.env` (gitignored, appended manually per task instructions), with `config()` defaults in `vibe_shopping/settings/base.py`.

---

### Task 1: `socials` app scaffold and token encryption

**Files:**
- Create: `backend/socials/__init__.py`, `backend/socials/apps.py`, `backend/socials/migrations/__init__.py`, `backend/socials/crypto.py`, `backend/socials/test/__init__.py`
- Test: `backend/socials/test/test_crypto.py`
- Modify: `backend/vibe_shopping/settings/base.py` (INSTALLED_APPS + FERNET_KEY), `backend/requirements.txt`

**Interfaces:**
- Consumes: `settings.FERNET_KEY` (str, urlsafe base64 Fernet key)
- Produces: `socials.crypto.encrypt_token(plaintext: str) -> str`, `socials.crypto.decrypt_token(ciphertext: str) -> str`

- [ ] **Step 1: Install cryptography and record the dependency**

Append to `backend/requirements.txt` under the Utilities section:

```
cryptography>=42.0.0
```

Run:
```bash
cd backend && docker compose exec -T web pip install 'cryptography>=42.0.0'
```
Expected: successful install (persists in the running container; the requirements line covers future rebuilds).

- [ ] **Step 2: Create the app scaffold**

`backend/socials/__init__.py`: empty file.
`backend/socials/migrations/__init__.py`: empty file.
`backend/socials/test/__init__.py`: empty file.

`backend/socials/apps.py`:
```python
from django.apps import AppConfig


class SocialsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'socials'
```

In `backend/vibe_shopping/settings/base.py`, add to INSTALLED_APPS after `'core.apps.CoreConfig',`:
```python
    'socials.apps.SocialsConfig',
```

At the end of `backend/vibe_shopping/settings/base.py`, add:
```python
FERNET_KEY = config('FERNET_KEY', default='')
```

Append to `backend/.env`:
```
FERNET_KEY=<output of: docker compose exec -T web python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
```

- [ ] **Step 3: Write the failing crypto test**

`backend/socials/test/test_crypto.py`:
```python
from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from socials.crypto import decrypt_token, encrypt_token

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class CryptoTests(TestCase):
    def test_round_trip(self):
        token = 'EAAG-fake-page-token-123'
        encrypted = encrypt_token(token)
        self.assertNotEqual(encrypted, token)
        self.assertEqual(decrypt_token(encrypted), token)

    def test_ciphertext_differs_from_plaintext_format(self):
        encrypted = encrypt_token('secret')
        self.assertNotIn('secret', encrypted)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_crypto -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'socials.crypto'`

- [ ] **Step 5: Implement crypto helpers**

`backend/socials/crypto.py`:
```python
from cryptography.fernet import Fernet
from django.conf import settings


def get_fernet():
    """Return a Fernet instance built from settings.FERNET_KEY."""
    return Fernet(settings.FERNET_KEY.encode())


def encrypt_token(plaintext):
    """Encrypt a token string, returning urlsafe ciphertext text."""
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext):
    """Decrypt ciphertext produced by encrypt_token."""
    return get_fernet().decrypt(ciphertext.encode()).decode()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_crypto -v 2`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/socials backend/requirements.txt backend/vibe_shopping/settings/base.py
git commit -m "feat: add socials app with Fernet token encryption"
```

---

### Task 2: socials models, migrations, and admin

**Files:**
- Create: `backend/socials/models.py`, `backend/socials/admin.py`, `backend/socials/migrations/0001_initial.py` (generated)
- Test: `backend/socials/test/test_models.py`

**Interfaces:**
- Consumes: `core.models.TimeStampedModel`, `core.models.Tenant`, `socials.crypto.encrypt_token/decrypt_token`
- Produces:
  - `MetaConnection(tenant: OneToOne[Tenant], fb_user_id: str, access_token_encrypted: text, token_expires_at: datetime|None, status: 'connected'|'expired'|'revoked')` with methods `set_access_token(raw: str)`, `get_access_token() -> str`
  - `ConnectedPage(tenant: FK[Tenant], connection: FK[MetaConnection], page_id: str unique, name: str, access_token_encrypted: text, instagram_account_id: str|'', instagram_username: str|'', status: 'connected'|'disconnected'|'token_expired')` with the same two token methods
  - `WebhookEvent(object_type: str, payload: JSON, signature_valid: bool, processed: bool, received_at: datetime)`

- [ ] **Step 1: Write the failing model tests**

`backend/socials/test/test_models.py`:
```python
from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from core.models import Tenant
from socials.models import ConnectedPage, MetaConnection, WebhookEvent

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class MetaConnectionTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')

    def test_token_stored_encrypted_and_retrievable(self):
        conn = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fb123', status='connected'
        )
        conn.set_access_token('EAAG-user-token')
        conn.save()
        conn.refresh_from_db()
        self.assertNotIn('EAAG-user-token', conn.access_token_encrypted)
        self.assertEqual(conn.get_access_token(), 'EAAG-user-token')

    def test_one_connection_per_tenant(self):
        MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        with self.assertRaises(Exception):
            MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb2')


@override_settings(FERNET_KEY=TEST_KEY)
class ConnectedPageTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.conn = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fb123'
        )

    def test_page_token_round_trip(self):
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.conn,
            page_id='page1', name='Acme Store'
        )
        page.set_access_token('EAAG-page-token')
        page.save()
        page.refresh_from_db()
        self.assertEqual(page.get_access_token(), 'EAAG-page-token')
        self.assertEqual(page.status, 'connected')


class WebhookEventTests(TestCase):
    def test_defaults(self):
        event = WebhookEvent.objects.create(
            object_type='page', payload={'entry': []}, signature_valid=True
        )
        self.assertFalse(event.processed)
        self.assertIsNotNone(event.received_at)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_models -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'socials.models'`

- [ ] **Step 3: Implement the models**

`backend/socials/models.py`:
```python
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
```

`backend/socials/admin.py`:
```python
from django.contrib import admin

from socials.models import ConnectedPage, MetaConnection, WebhookEvent


@admin.register(MetaConnection)
class MetaConnectionAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'fb_user_id', 'status', 'token_expires_at']
    exclude = ['access_token_encrypted']


@admin.register(ConnectedPage)
class ConnectedPageAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'page_id', 'instagram_username', 'status']
    exclude = ['access_token_encrypted']


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ['object_type', 'signature_valid', 'processed', 'received_at']
    readonly_fields = ['payload']
```

- [ ] **Step 4: Generate and apply migrations**

Run:
```bash
cd backend && docker compose exec -T web python manage.py makemigrations socials && docker compose exec -T web python manage.py migrate socials
```
Expected: `0001_initial.py` created with the three models, migration applies cleanly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_models -v 2`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/socials
git commit -m "feat: add MetaConnection, ConnectedPage, WebhookEvent models"
```

---

### Task 3: business profile endpoint

**Files:**
- Modify: `backend/core/serializers.py`, `backend/core/views.py`, `backend/core/urls.py`
- Test: `backend/core/test/test_business_profile.py`

**Interfaces:**
- Consumes: existing `Tenant`, `VendorProfile`, DRF token auth
- Produces: `GET|PATCH /api/business/` returning `{id, name, subdomain, metadata, is_active, created_at}`; PATCH accepts `name` and `metadata`

- [ ] **Step 1: Write the failing endpoint tests**

`backend/core/test/test_business_profile.py`:
```python
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile


class BusinessProfileTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_get_business_profile(self):
        response = self.client.get('/api/business/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Acme')
        self.assertEqual(response.data['subdomain'], 'acme')

    def test_patch_updates_name_and_metadata(self):
        response = self.client.patch(
            '/api/business/',
            {'name': 'Acme 2', 'metadata': {'phone': '9800000000'}},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, 'Acme 2')
        self.assertEqual(self.tenant.metadata['phone'], '9800000000')

    def test_patch_cannot_change_subdomain(self):
        self.client.patch('/api/business/', {'subdomain': 'hacked'}, format='json')
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.subdomain, 'acme')

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/business/')
        self.assertEqual(response.status_code, 401)

    def test_user_without_profile_gets_404(self):
        loner = User.objects.create_user(username='loner', password='pass12345')
        token = Token.objects.create(user=loner)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get('/api/business/')
        self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test core.test.test_business_profile -v 2`
Expected: FAIL, 404s on `/api/business/` for the authenticated tests

- [ ] **Step 3: Implement serializer, view, and route**

Add to `backend/core/serializers.py`:
```python
class BusinessProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'subdomain', 'metadata', 'is_active', 'created_at']
        read_only_fields = ['id', 'subdomain', 'is_active', 'created_at']
```

Add to `backend/core/views.py` (import `BusinessProfileSerializer` alongside the existing serializer imports, and `from rest_framework.views import APIView`):
```python
def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


class BusinessProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the authenticated user's business profile."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(BusinessProfileSerializer(tenant).data)

    def patch(self, request):
        """Update editable business profile fields."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = BusinessProfileSerializer(tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
```

Add to `backend/core/urls.py` urlpatterns (import `BusinessProfileView`):
```python
    path('business/', BusinessProfileView.as_view(), name='business_profile'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test core.test.test_business_profile -v 2`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/core
git commit -m "feat: add business profile endpoint"
```

---

### Task 4: MetaGraphClient service

**Files:**
- Create: `backend/socials/services/__init__.py`, `backend/socials/services/meta_graph.py`
- Test: `backend/socials/test/test_meta_graph.py`

**Interfaces:**
- Consumes: `settings.META_APP_ID`, `settings.META_APP_SECRET`, `requests`
- Produces: `socials.services.meta_graph.MetaGraphError(Exception)` with `.code: int|None`, and `MetaGraphClient` with methods:
  - `exchange_code(code: str, redirect_uri: str) -> str` (short-lived user token)
  - `get_long_lived_token(short_token: str) -> dict` (`{'access_token': str, 'expires_in': int|None}`)
  - `get_user_profile(user_token: str) -> dict` (`{'id': str, 'name': str}`)
  - `list_pages(user_token: str) -> list[dict]` (each `{'id', 'name', 'access_token'}`)
  - `subscribe_page(page_id: str, page_token: str) -> bool`
  - `unsubscribe_page(page_id: str, page_token: str) -> bool`
  - `get_instagram_account(page_id: str, page_token: str) -> dict|None` (`{'id': str, 'username': str}` or None)

- [ ] **Step 1: Add Meta settings**

At the end of `backend/vibe_shopping/settings/base.py`, add:
```python
META_APP_ID = config('META_APP_ID', default='')
META_APP_SECRET = config('META_APP_SECRET', default='')
META_WEBHOOK_VERIFY_TOKEN = config('META_WEBHOOK_VERIFY_TOKEN', default='')
META_OAUTH_REDIRECT_URI = config(
    'META_OAUTH_REDIRECT_URI',
    default='http://localhost:5173/vendor/settings/meta-callback',
)
```

Append real values to `backend/.env` from the Meta dev app dashboard:
```
META_APP_ID=<from Meta app dashboard>
META_APP_SECRET=<from Meta app dashboard>
META_WEBHOOK_VERIFY_TOKEN=<any random string you choose>
META_OAUTH_REDIRECT_URI=http://localhost:5173/vendor/settings/meta-callback
```

- [ ] **Step 2: Write the failing client tests**

`backend/socials/test/test_meta_graph.py`:
```python
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from socials.services.meta_graph import MetaGraphClient, MetaGraphError


def graph_response(payload, status_code=200):
    response = Mock()
    response.status_code = status_code
    response.json.return_value = payload
    return response


@override_settings(META_APP_ID='app123', META_APP_SECRET='secret123')
class MetaGraphClientTests(TestCase):
    def setUp(self):
        self.client_service = MetaGraphClient()

    @patch('socials.services.meta_graph.requests.get')
    def test_exchange_code_returns_token(self, mock_get):
        mock_get.return_value = graph_response({'access_token': 'short-token'})
        token = self.client_service.exchange_code('the-code', 'http://cb')
        self.assertEqual(token, 'short-token')
        params = mock_get.call_args.kwargs['params']
        self.assertEqual(params['code'], 'the-code')
        self.assertEqual(params['client_id'], 'app123')

    @patch('socials.services.meta_graph.requests.get')
    def test_graph_error_raises_with_code(self, mock_get):
        mock_get.return_value = graph_response(
            {'error': {'message': 'Invalid OAuth access token', 'code': 190}},
            status_code=400,
        )
        with self.assertRaises(MetaGraphError) as ctx:
            self.client_service.exchange_code('bad', 'http://cb')
        self.assertEqual(ctx.exception.code, 190)

    @patch('socials.services.meta_graph.requests.get')
    def test_get_long_lived_token(self, mock_get):
        mock_get.return_value = graph_response(
            {'access_token': 'long-token', 'expires_in': 5184000}
        )
        result = self.client_service.get_long_lived_token('short-token')
        self.assertEqual(result['access_token'], 'long-token')
        self.assertEqual(result['expires_in'], 5184000)

    @patch('socials.services.meta_graph.requests.get')
    def test_list_pages(self, mock_get):
        mock_get.return_value = graph_response(
            {'data': [{'id': 'p1', 'name': 'Store', 'access_token': 'pt1'}]}
        )
        pages = self.client_service.list_pages('user-token')
        self.assertEqual(pages, [{'id': 'p1', 'name': 'Store', 'access_token': 'pt1'}])

    @patch('socials.services.meta_graph.requests.post')
    def test_subscribe_page(self, mock_post):
        mock_post.return_value = graph_response({'success': True})
        self.assertTrue(self.client_service.subscribe_page('p1', 'pt1'))
        url = mock_post.call_args.args[0]
        self.assertIn('/p1/subscribed_apps', url)

    @patch('socials.services.meta_graph.requests.get')
    def test_get_instagram_account_present(self, mock_get):
        def side_effect(url, **kwargs):
            if 'instagram_business_account' in kwargs.get('params', {}).get('fields', ''):
                return graph_response(
                    {'instagram_business_account': {'id': 'ig1'}, 'id': 'p1'}
                )
            return graph_response({'id': 'ig1', 'username': 'acme_store'})

        mock_get.side_effect = side_effect
        account = self.client_service.get_instagram_account('p1', 'pt1')
        self.assertEqual(account, {'id': 'ig1', 'username': 'acme_store'})

    @patch('socials.services.meta_graph.requests.get')
    def test_get_instagram_account_absent(self, mock_get):
        mock_get.return_value = graph_response({'id': 'p1'})
        self.assertIsNone(self.client_service.get_instagram_account('p1', 'pt1'))
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_meta_graph -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'socials.services'`

- [ ] **Step 4: Implement the client**

`backend/socials/services/__init__.py`: empty file.

`backend/socials/services/meta_graph.py`:
```python
import requests
from django.conf import settings

GRAPH_BASE_URL = 'https://graph.facebook.com/v21.0'


class MetaGraphError(Exception):
    """Raised when the Graph API returns an error payload."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def parse_graph_response(response):
    """Return the JSON body or raise MetaGraphError on Graph errors."""
    payload = response.json()
    error = payload.get('error')
    if error or response.status_code >= 400:
        error = error or {}
        raise MetaGraphError(
            error.get('message', 'Unknown Graph API error'),
            code=error.get('code'),
        )
    return payload


class MetaGraphClient:
    """The only module that talks to graph.facebook.com."""

    def __init__(self, app_id=None, app_secret=None):
        self.app_id = app_id or settings.META_APP_ID
        self.app_secret = app_secret or settings.META_APP_SECRET

    def get(self, path, params):
        response = requests.get(f'{GRAPH_BASE_URL}{path}', params=params, timeout=15)
        return parse_graph_response(response)

    def exchange_code(self, code, redirect_uri):
        """Exchange an OAuth code for a short-lived user token."""
        payload = self.get('/oauth/access_token', {
            'client_id': self.app_id,
            'client_secret': self.app_secret,
            'redirect_uri': redirect_uri,
            'code': code,
        })
        return payload['access_token']

    def get_long_lived_token(self, short_token):
        """Upgrade a short-lived token; returns access_token and expires_in."""
        payload = self.get('/oauth/access_token', {
            'grant_type': 'fb_exchange_token',
            'client_id': self.app_id,
            'client_secret': self.app_secret,
            'fb_exchange_token': short_token,
        })
        return {
            'access_token': payload['access_token'],
            'expires_in': payload.get('expires_in'),
        }

    def get_user_profile(self, user_token):
        """Return the authorizing Facebook user's id and name."""
        return self.get('/me', {'access_token': user_token, 'fields': 'id,name'})

    def list_pages(self, user_token):
        """Return the user's Pages with their page access tokens."""
        payload = self.get('/me/accounts', {
            'access_token': user_token,
            'fields': 'id,name,access_token',
        })
        return payload.get('data', [])

    def subscribe_page(self, page_id, page_token):
        """Subscribe the app to the Page's webhook fields."""
        response = requests.post(
            f'{GRAPH_BASE_URL}/{page_id}/subscribed_apps',
            params={
                'access_token': page_token,
                'subscribed_fields': 'messages,messaging_postbacks,feed',
            },
            timeout=15,
        )
        return bool(parse_graph_response(response).get('success'))

    def unsubscribe_page(self, page_id, page_token):
        """Remove the app's webhook subscription from the Page."""
        response = requests.delete(
            f'{GRAPH_BASE_URL}/{page_id}/subscribed_apps',
            params={'access_token': page_token},
            timeout=15,
        )
        return bool(parse_graph_response(response).get('success'))

    def get_instagram_account(self, page_id, page_token):
        """Return the Page's linked IG professional account or None."""
        payload = self.get(f'/{page_id}', {
            'access_token': page_token,
            'fields': 'instagram_business_account',
        })
        account = payload.get('instagram_business_account')
        if not account:
            return None
        detail = self.get(f"/{account['id']}", {
            'access_token': page_token,
            'fields': 'id,username',
        })
        return {'id': detail['id'], 'username': detail.get('username', '')}
```

Note: `unsubscribe_page` uses `requests.delete`; the test suite covers subscribe, and unsubscribe is covered in Task 6's view tests via client mocking.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_meta_graph -v 2`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/socials backend/vibe_shopping/settings/base.py
git commit -m "feat: add MetaGraphClient service for Graph API calls"
```

---

### Task 5: OAuth connect-url and callback endpoints

**Files:**
- Create: `backend/socials/views.py`, `backend/socials/urls.py`
- Modify: `backend/vibe_shopping/urls.py`
- Test: `backend/socials/test/test_oauth_views.py`

**Interfaces:**
- Consumes: `MetaGraphClient`, `MetaConnection`, `core.views.get_request_tenant` pattern (reimplemented locally as `socials.views.get_request_tenant`), `django.core.signing`
- Produces:
  - `GET /api/socials/connect-url/` → `{'url': str}` (Facebook OAuth dialog URL with signed `state`)
  - `POST /api/socials/oauth/callback/` body `{'code': str, 'state': str}` → `{'pages': [{'id', 'name'}]}` and a saved `MetaConnection`
  - `socials.views.OAUTH_STATE_SALT = 'meta-oauth-state'`, state max age 600 seconds

- [ ] **Step 1: Write the failing OAuth view tests**

`backend/socials/test/test_oauth_views.py`:
```python
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.core import signing
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from socials.models import MetaConnection
from socials.views import OAUTH_STATE_SALT

TEST_KEY = Fernet.generate_key().decode()


@override_settings(
    FERNET_KEY=TEST_KEY,
    META_APP_ID='app123',
    META_APP_SECRET='secret123',
    META_OAUTH_REDIRECT_URI='http://localhost:5173/vendor/settings/meta-callback',
)
class OAuthViewTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_connect_url_contains_app_id_and_signed_state(self):
        response = self.client.get('/api/socials/connect-url/')
        self.assertEqual(response.status_code, 200)
        url = response.data['url']
        self.assertIn('client_id=app123', url)
        self.assertIn('facebook.com', url)
        self.assertIn('state=', url)

    def test_connect_url_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/socials/connect-url/')
        self.assertEqual(response.status_code, 401)

    @patch('socials.views.MetaGraphClient')
    def test_callback_saves_connection_and_returns_pages(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.exchange_code.return_value = 'short-token'
        mock_client.get_long_lived_token.return_value = {
            'access_token': 'long-token', 'expires_in': 5184000
        }
        mock_client.get_user_profile.return_value = {'id': 'fb123', 'name': 'Owner'}
        mock_client.list_pages.return_value = [
            {'id': 'p1', 'name': 'Acme Store', 'access_token': 'pt1'}
        ]
        state = signing.dumps({'tenant_id': self.tenant.id}, salt=OAUTH_STATE_SALT)
        response = self.client.post(
            '/api/socials/oauth/callback/',
            {'code': 'the-code', 'state': state},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['pages'], [{'id': 'p1', 'name': 'Acme Store'}])
        connection = MetaConnection.objects.get(tenant=self.tenant)
        self.assertEqual(connection.fb_user_id, 'fb123')
        self.assertEqual(connection.get_access_token(), 'long-token')
        self.assertEqual(connection.status, 'connected')

    def test_callback_rejects_bad_state(self):
        response = self.client.post(
            '/api/socials/oauth/callback/',
            {'code': 'the-code', 'state': 'tampered'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_callback_rejects_state_for_other_tenant(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        state = signing.dumps({'tenant_id': other.id}, salt=OAUTH_STATE_SALT)
        response = self.client.post(
            '/api/socials/oauth/callback/',
            {'code': 'the-code', 'state': state},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_oauth_views -v 2`
Expected: FAIL with `ModuleNotFoundError` or import error on `socials.views`

- [ ] **Step 3: Implement views and routing**

`backend/socials/views.py`:
```python
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from socials.models import MetaConnection
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

OAUTH_STATE_SALT = 'meta-oauth-state'
OAUTH_STATE_MAX_AGE = 600
OAUTH_SCOPES = ','.join([
    'pages_show_list',
    'pages_messaging',
    'pages_manage_metadata',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_messages',
    'instagram_manage_comments',
])


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


def build_connect_url(tenant):
    """Build the Facebook OAuth dialog URL with a signed state."""
    state = signing.dumps({'tenant_id': tenant.id}, salt=OAUTH_STATE_SALT)
    params = urlencode({
        'client_id': settings.META_APP_ID,
        'redirect_uri': settings.META_OAUTH_REDIRECT_URI,
        'scope': OAUTH_SCOPES,
        'response_type': 'code',
        'state': state,
    })
    return f'https://www.facebook.com/v21.0/dialog/oauth?{params}'


def validate_state(state, tenant):
    """Return True when the signed state belongs to this tenant."""
    try:
        data = signing.loads(state, salt=OAUTH_STATE_SALT, max_age=OAUTH_STATE_MAX_AGE)
    except signing.BadSignature:
        return False
    return data.get('tenant_id') == tenant.id


class ConnectUrlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the OAuth dialog URL for the user's tenant."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'url': build_connect_url(tenant)})


class OAuthCallbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Exchange the OAuth code, store the connection, return Pages."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        code = request.data.get('code')
        state = request.data.get('state')
        if not code or not state:
            return Response({'error': 'code and state are required'}, status=status.HTTP_400_BAD_REQUEST)
        if not validate_state(state, tenant):
            return Response({'error': 'Invalid or expired state'}, status=status.HTTP_400_BAD_REQUEST)
        client = MetaGraphClient()
        try:
            short_token = client.exchange_code(code, settings.META_OAUTH_REDIRECT_URI)
            long_lived = client.get_long_lived_token(short_token)
            profile = client.get_user_profile(long_lived['access_token'])
            pages = client.list_pages(long_lived['access_token'])
        except MetaGraphError as exc:
            return Response(
                {'error': 'Could not connect to Facebook. Please try again.', 'detail': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        expires_at = None
        if long_lived.get('expires_in'):
            expires_at = timezone.now() + timedelta(seconds=long_lived['expires_in'])
        connection, _ = MetaConnection.objects.update_or_create(
            tenant=tenant,
            defaults={
                'fb_user_id': profile['id'],
                'token_expires_at': expires_at,
                'status': 'connected',
            },
        )
        connection.set_access_token(long_lived['access_token'])
        connection.save()
        return Response({
            'pages': [{'id': p['id'], 'name': p['name']} for p in pages],
        })
```

`backend/socials/urls.py`:
```python
from django.urls import path

from socials.views import ConnectUrlView, OAuthCallbackView

urlpatterns = [
    path('connect-url/', ConnectUrlView.as_view(), name='socials_connect_url'),
    path('oauth/callback/', OAuthCallbackView.as_view(), name='socials_oauth_callback'),
]
```

In `backend/vibe_shopping/urls.py`, add to urlpatterns:
```python
    path('api/socials/', include('socials.urls')),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_oauth_views -v 2`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/socials backend/vibe_shopping/urls.py
git commit -m "feat: add Meta OAuth connect-url and callback endpoints"
```

---

### Task 6: Page connect, list, and disconnect endpoints

**Files:**
- Modify: `backend/socials/views.py`, `backend/socials/urls.py`
- Create: `backend/socials/serializers.py`
- Test: `backend/socials/test/test_page_views.py`

**Interfaces:**
- Consumes: `MetaConnection`, `ConnectedPage`, `MetaGraphClient.list_pages/subscribe_page/unsubscribe_page/get_instagram_account`
- Produces:
  - `GET /api/socials/pages/` → list of `{id, page_id, name, instagram_account_id, instagram_username, status}`
  - `POST /api/socials/pages/{page_id}/connect/` → the serialized page (201)
  - `POST /api/socials/pages/{page_id}/disconnect/` → 200, status becomes `disconnected`
  - `socials.serializers.ConnectedPageSerializer` (never exposes `access_token_encrypted`)

- [ ] **Step 1: Write the failing page view tests**

`backend/socials/test/test_page_views.py`:
```python
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY, META_APP_ID='app123', META_APP_SECRET='s')
class PageViewTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.connection = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fb123', status='connected'
        )
        self.connection.set_access_token('long-token')
        self.connection.save()

    @patch('socials.views.MetaGraphClient')
    def test_connect_page_stores_token_and_instagram(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.list_pages.return_value = [
            {'id': 'p1', 'name': 'Acme Store', 'access_token': 'pt1'}
        ]
        mock_client.subscribe_page.return_value = True
        mock_client.get_instagram_account.return_value = {
            'id': 'ig1', 'username': 'acme_store'
        }
        response = self.client.post('/api/socials/pages/p1/connect/')
        self.assertEqual(response.status_code, 201)
        page = ConnectedPage.objects.get(page_id='p1')
        self.assertEqual(page.get_access_token(), 'pt1')
        self.assertEqual(page.instagram_username, 'acme_store')
        self.assertEqual(page.status, 'connected')
        self.assertNotIn('access_token_encrypted', response.data)

    @patch('socials.views.MetaGraphClient')
    def test_connect_unknown_page_returns_404(self, mock_client_cls):
        mock_client_cls.return_value.list_pages.return_value = []
        response = self.client.post('/api/socials/pages/nope/connect/')
        self.assertEqual(response.status_code, 404)

    def test_connect_without_connection_returns_400(self):
        self.connection.delete()
        response = self.client.post('/api/socials/pages/p1/connect/')
        self.assertEqual(response.status_code, 400)

    def test_list_pages_scoped_to_tenant(self):
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.connection,
            page_id='p1', name='Acme Store'
        )
        other_tenant = Tenant.objects.create(name='Other', subdomain='other')
        other_conn = MetaConnection.objects.create(tenant=other_tenant, fb_user_id='x')
        ConnectedPage.objects.create(
            tenant=other_tenant, connection=other_conn, page_id='p2', name='Other'
        )
        response = self.client.get('/api/socials/pages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['page_id'], 'p1')

    @patch('socials.views.MetaGraphClient')
    def test_disconnect_page(self, mock_client_cls):
        mock_client_cls.return_value.unsubscribe_page.return_value = True
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.connection,
            page_id='p1', name='Acme Store'
        )
        page.set_access_token('pt1')
        page.save()
        response = self.client.post('/api/socials/pages/p1/disconnect/')
        self.assertEqual(response.status_code, 200)
        page.refresh_from_db()
        self.assertEqual(page.status, 'disconnected')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_page_views -v 2`
Expected: FAIL, 404s for the page routes

- [ ] **Step 3: Implement serializer and views**

`backend/socials/serializers.py`:
```python
from rest_framework import serializers

from socials.models import ConnectedPage


class ConnectedPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConnectedPage
        fields = [
            'id', 'page_id', 'name',
            'instagram_account_id', 'instagram_username',
            'status', 'created_at',
        ]
```

Add to `backend/socials/views.py` (import `ConnectedPage` from models and `ConnectedPageSerializer`):
```python
class PageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's connected Pages."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        pages = ConnectedPage.objects.filter(tenant=tenant)
        return Response(ConnectedPageSerializer(pages, many=True).data)


class PageConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, page_id):
        """Connect a Page: store its token, subscribe webhooks, link IG."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        connection = MetaConnection.objects.filter(tenant=tenant, status='connected').first()
        if not connection:
            return Response(
                {'error': 'Connect your Facebook account first'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        client = MetaGraphClient()
        try:
            pages = client.list_pages(connection.get_access_token())
            target = next((p for p in pages if p['id'] == page_id), None)
            if not target:
                return Response({'error': 'Page not found'}, status=status.HTTP_404_NOT_FOUND)
            client.subscribe_page(page_id, target['access_token'])
            instagram = client.get_instagram_account(page_id, target['access_token'])
        except MetaGraphError as exc:
            if exc.code == 190:
                connection.status = 'expired'
                connection.save()
                return Response(
                    {'error': 'Facebook session expired. Please reconnect.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {'error': 'Could not connect the Page. Please try again.', 'detail': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        page, _ = ConnectedPage.objects.update_or_create(
            page_id=page_id,
            defaults={
                'tenant': tenant,
                'connection': connection,
                'name': target['name'],
                'instagram_account_id': instagram['id'] if instagram else '',
                'instagram_username': instagram['username'] if instagram else '',
                'status': 'connected',
            },
        )
        page.set_access_token(target['access_token'])
        page.save()
        return Response(ConnectedPageSerializer(page).data, status=status.HTTP_201_CREATED)


class PageDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, page_id):
        """Unsubscribe webhooks and mark the Page disconnected."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        page = ConnectedPage.objects.filter(tenant=tenant, page_id=page_id).first()
        if not page:
            return Response({'error': 'Page not found'}, status=status.HTTP_404_NOT_FOUND)
        client = MetaGraphClient()
        try:
            client.unsubscribe_page(page_id, page.get_access_token())
        except MetaGraphError:
            pass
        page.status = 'disconnected'
        page.save()
        return Response(ConnectedPageSerializer(page).data)
```

Add to `backend/socials/urls.py` urlpatterns:
```python
    path('pages/', PageListView.as_view(), name='socials_pages'),
    path('pages/<str:page_id>/connect/', PageConnectView.as_view(), name='socials_page_connect'),
    path('pages/<str:page_id>/disconnect/', PageDisconnectView.as_view(), name='socials_page_disconnect'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_page_views -v 2`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the whole socials suite**

Run: `cd backend && docker compose exec -T web python manage.py test socials -v 2`
Expected: all socials tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/socials
git commit -m "feat: add Page connect, list, and disconnect endpoints"
```

---

### Task 7: webhook receiver and Celery dispatch

**Files:**
- Modify: `backend/socials/views.py`, `backend/vibe_shopping/urls.py`
- Create: `backend/socials/tasks.py`
- Test: `backend/socials/test/test_webhooks.py`

**Interfaces:**
- Consumes: `settings.META_APP_SECRET`, `settings.META_WEBHOOK_VERIFY_TOKEN`, `WebhookEvent`, Celery app
- Produces:
  - `GET /api/webhooks/meta/?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` → 200 with raw challenge, or 403
  - `POST /api/webhooks/meta/` with `X-Hub-Signature-256: sha256=<hmac>` → 200 `{'status': 'received'}`, persists `WebhookEvent`, enqueues `socials.tasks.process_webhook_event(event_id)`; bad signature → 403, nothing persisted
  - `socials.tasks.process_webhook_event(event_id: int) -> int` (bookkeeping hook for the inbox cycle)

- [ ] **Step 1: Write the failing webhook tests**

`backend/socials/test/test_webhooks.py`:
```python
import hashlib
import hmac
import json
from unittest.mock import patch

from django.test import override_settings
from rest_framework.test import APITestCase

from socials.models import WebhookEvent


def sign(body, secret):
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f'sha256={digest}'


@override_settings(
    META_APP_SECRET='secret123',
    META_WEBHOOK_VERIFY_TOKEN='verify-me',
)
class WebhookTests(APITestCase):
    def test_verify_handshake_success(self):
        response = self.client.get(
            '/api/webhooks/meta/',
            {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'verify-me',
                'hub.challenge': '12345',
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), '12345')

    def test_verify_handshake_bad_token(self):
        response = self.client.get(
            '/api/webhooks/meta/',
            {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'wrong',
                'hub.challenge': '12345',
            },
        )
        self.assertEqual(response.status_code, 403)

    @patch('socials.views.process_webhook_event')
    def test_valid_signature_persists_event_and_dispatches(self, mock_task):
        payload = {'object': 'page', 'entry': [{'id': 'p1', 'messaging': []}]}
        body = json.dumps(payload).encode()
        response = self.client.post(
            '/api/webhooks/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256=sign(body, 'secret123'),
        )
        self.assertEqual(response.status_code, 200)
        event = WebhookEvent.objects.get()
        self.assertEqual(event.object_type, 'page')
        self.assertTrue(event.signature_valid)
        self.assertFalse(event.processed)
        mock_task.delay.assert_called_once_with(event.id)

    def test_invalid_signature_rejected_and_not_persisted(self):
        body = json.dumps({'object': 'page', 'entry': []}).encode()
        response = self.client.post(
            '/api/webhooks/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256='sha256=deadbeef',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_missing_signature_rejected(self):
        body = json.dumps({'object': 'page', 'entry': []}).encode()
        response = self.client.post(
            '/api/webhooks/meta/', data=body, content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_webhooks -v 2`
Expected: FAIL, 404 on `/api/webhooks/meta/`

- [ ] **Step 3: Implement the Celery task**

`backend/socials/tasks.py`:
```python
import logging

from celery import shared_task

from socials.models import WebhookEvent

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_webhook_event(self, event_id):
    """Bookkeeping hook for inbound events; the inbox cycle extends this."""
    try:
        event = WebhookEvent.objects.get(id=event_id)
    except WebhookEvent.DoesNotExist as exc:
        raise self.retry(exc=exc)
    logger.info('Received %s webhook event %s', event.object_type, event.id)
    return event.id
```

- [ ] **Step 4: Implement the webhook view**

Add to `backend/socials/views.py` (imports: `import hashlib`, `import hmac`, `import json`, `import logging`, `from django.http import HttpResponse`, `from rest_framework.permissions import AllowAny`, `from socials.models import WebhookEvent`, `from socials.tasks import process_webhook_event`; module-level `logger = logging.getLogger(__name__)`):
```python
def signature_is_valid(raw_body, header_value):
    """Check the X-Hub-Signature-256 HMAC against the app secret."""
    if not header_value or not header_value.startswith('sha256='):
        return False
    expected = hmac.new(
        settings.META_APP_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header_value.split('=', 1)[1])


class MetaWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        """Answer Meta's webhook verification handshake."""
        mode = request.query_params.get('hub.mode')
        verify_token = request.query_params.get('hub.verify_token')
        challenge = request.query_params.get('hub.challenge', '')
        if mode == 'subscribe' and verify_token == settings.META_WEBHOOK_VERIFY_TOKEN:
            return HttpResponse(challenge, content_type='text/plain')
        return Response({'error': 'Verification failed'}, status=status.HTTP_403_FORBIDDEN)

    def post(self, request):
        """Validate signature, persist the event, dispatch to Celery."""
        header_value = request.headers.get('X-Hub-Signature-256', '')
        if not signature_is_valid(request.body, header_value):
            logger.warning('Rejected Meta webhook with invalid signature')
            return Response({'error': 'Invalid signature'}, status=status.HTTP_403_FORBIDDEN)
        payload = json.loads(request.body.decode() or '{}')
        event = WebhookEvent.objects.create(
            object_type=payload.get('object', 'unknown'),
            payload=payload,
            signature_valid=True,
        )
        process_webhook_event.delay(event.id)
        return Response({'status': 'received'})
```

In `backend/vibe_shopping/urls.py`, add (import `from socials.views import MetaWebhookView`):
```python
    path('api/webhooks/meta/', MetaWebhookView.as_view(), name='meta_webhook'),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_webhooks -v 2`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && docker compose exec -T web python manage.py test socials core.test.test_business_profile -v 1`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/socials backend/vibe_shopping/urls.py
git commit -m "feat: add Meta webhook receiver with signature validation"
```

---

### Task 8: frontend socials API module and Redux slice

**Files:**
- Create: `frontend/src/api/socials.ts`, `frontend/src/features/socials/socialsSlice.ts`
- Modify: `frontend/src/store/index.ts`

**Interfaces:**
- Consumes: `frontend/src/api/client.ts` default export `apiClient` (axios instance with Token auth interceptor)
- Produces:
  - Types `MetaPage {id, name}` and `ConnectedPage {id, page_id, name, instagram_account_id, instagram_username, status, created_at}`
  - API functions `getConnectUrl(): Promise<string>`, `completeOAuth(code, state): Promise<MetaPage[]>`, `listConnectedPages(): Promise<ConnectedPage[]>`, `connectPage(pageId): Promise<ConnectedPage>`, `disconnectPage(pageId): Promise<ConnectedPage>`
  - Redux slice `socials` with state `{pages: ConnectedPage[], availablePages: MetaPage[], loading: boolean, error: string | null}` and thunks `fetchConnectedPages`, `startConnect`, `finishOAuth`, `connectMetaPage`, `disconnectMetaPage`

- [ ] **Step 1: Create the API module**

`frontend/src/api/socials.ts`:
```typescript
import apiClient from './client';

export interface MetaPage {
    id: string;
    name: string;
}

export interface ConnectedPage {
    id: number;
    page_id: string;
    name: string;
    instagram_account_id: string;
    instagram_username: string;
    status: 'connected' | 'disconnected' | 'token_expired';
    created_at: string;
}

export const getConnectUrl = async (): Promise<string> => {
    const response = await apiClient.get('/socials/connect-url/');
    return response.data.url;
};

export const completeOAuth = async (code: string, state: string): Promise<MetaPage[]> => {
    const response = await apiClient.post('/socials/oauth/callback/', { code, state });
    return response.data.pages;
};

export const listConnectedPages = async (): Promise<ConnectedPage[]> => {
    const response = await apiClient.get('/socials/pages/');
    return response.data;
};

export const connectPage = async (pageId: string): Promise<ConnectedPage> => {
    const response = await apiClient.post(`/socials/pages/${pageId}/connect/`);
    return response.data;
};

export const disconnectPage = async (pageId: string): Promise<ConnectedPage> => {
    const response = await apiClient.post(`/socials/pages/${pageId}/disconnect/`);
    return response.data;
};
```

- [ ] **Step 2: Create the Redux slice**

`frontend/src/features/socials/socialsSlice.ts`:
```typescript
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
    completeOAuth,
    connectPage,
    disconnectPage,
    getConnectUrl,
    listConnectedPages,
    type ConnectedPage,
    type MetaPage,
} from '@/api/socials';

interface SocialsState {
    pages: ConnectedPage[];
    availablePages: MetaPage[];
    loading: boolean;
    error: string | null;
}

const initialState: SocialsState = {
    pages: [],
    availablePages: [],
    loading: false,
    error: null,
};

export const fetchConnectedPages = createAsyncThunk(
    'socials/fetchConnectedPages',
    async () => listConnectedPages(),
);

export const startConnect = createAsyncThunk(
    'socials/startConnect',
    async () => getConnectUrl(),
);

export const finishOAuth = createAsyncThunk(
    'socials/finishOAuth',
    async ({ code, state }: { code: string; state: string }) =>
        completeOAuth(code, state),
);

export const connectMetaPage = createAsyncThunk(
    'socials/connectMetaPage',
    async (pageId: string) => connectPage(pageId),
);

export const disconnectMetaPage = createAsyncThunk(
    'socials/disconnectMetaPage',
    async (pageId: string) => disconnectPage(pageId),
);

const socialsSlice = createSlice({
    name: 'socials',
    initialState,
    reducers: {
        clearAvailablePages(state) {
            state.availablePages = [];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConnectedPages.fulfilled, (state, action) => {
                state.pages = action.payload;
                state.loading = false;
            })
            .addCase(finishOAuth.fulfilled, (state, action) => {
                state.availablePages = action.payload;
                state.loading = false;
            })
            .addCase(connectMetaPage.fulfilled, (state, action) => {
                state.pages = state.pages
                    .filter((p) => p.page_id !== action.payload.page_id)
                    .concat(action.payload);
                state.availablePages = [];
                state.loading = false;
            })
            .addCase(disconnectMetaPage.fulfilled, (state, action) => {
                state.pages = state.pages.map((p) =>
                    p.page_id === action.payload.page_id ? action.payload : p,
                );
                state.loading = false;
            });
        builder
            .addMatcher(
                (action) => action.type.startsWith('socials/') && action.type.endsWith('/pending'),
                (state) => {
                    state.loading = true;
                    state.error = null;
                },
            )
            .addMatcher(
                (action) => action.type.startsWith('socials/') && action.type.endsWith('/rejected'),
                (state, action) => {
                    state.loading = false;
                    state.error = (action as { error?: { message?: string } }).error?.message ?? 'Something went wrong';
                },
            );
    },
});

export const { clearAvailablePages } = socialsSlice.actions;
export default socialsSlice.reducer;
```

- [ ] **Step 3: Register the reducer**

In `frontend/src/store/index.ts`, add the import and reducer entry:
```typescript
import socialsReducer from '@/features/socials/socialsSlice';
```
```typescript
        socials: socialsReducer,
```

- [ ] **Step 4: Verify with the TypeScript build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/socials.ts frontend/src/features/socials frontend/src/store/index.ts
git commit -m "feat: add socials API module and Redux slice"
```

---

### Task 9: Connected Accounts page and OAuth callback route

**Files:**
- Create: `frontend/src/pages/ConnectedAccountsPage.tsx`, `frontend/src/pages/MetaCallbackPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `socialsSlice` thunks, `useAppDispatch`/`useAppSelector` from `@/store/hooks`, `react-hot-toast`, existing route structure in `App.tsx`
- Produces: routes `/vendor/settings/accounts` (Connected Accounts) and `/vendor/settings/meta-callback` (OAuth landing)

- [ ] **Step 1: Create the Connected Accounts page**

`frontend/src/pages/ConnectedAccountsPage.tsx`:
```tsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    disconnectMetaPage,
    fetchConnectedPages,
    startConnect,
} from '@/features/socials/socialsSlice';
import type { ConnectedPage } from '@/api/socials';

function StatusBadge({ status }: { status: ConnectedPage['status'] }) {
    const styles: Record<ConnectedPage['status'], string> = {
        connected: 'bg-green-100 text-green-800',
        disconnected: 'bg-gray-100 text-gray-600',
        token_expired: 'bg-amber-100 text-amber-800',
    };
    const labels: Record<ConnectedPage['status'], string> = {
        connected: 'Connected',
        disconnected: 'Disconnected',
        token_expired: 'Reconnect needed',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}

function PageCard({ page }: { page: ConnectedPage }) {
    const dispatch = useAppDispatch();

    const handleDisconnect = async () => {
        try {
            await dispatch(disconnectMetaPage(page.page_id)).unwrap();
            toast.success(`${page.name} disconnected`);
        } catch {
            toast.error('Could not disconnect the Page');
        }
    };

    return (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div>
                <p className="font-semibold text-gray-900">{page.name}</p>
                {page.instagram_username && (
                    <p className="text-sm text-gray-500">Instagram: @{page.instagram_username}</p>
                )}
            </div>
            <div className="flex items-center gap-3">
                <StatusBadge status={page.status} />
                {page.status === 'connected' ? (
                    <button
                        onClick={handleDisconnect}
                        className="text-sm text-red-600 hover:text-red-700"
                    >
                        Disconnect
                    </button>
                ) : (
                    <Link to="/vendor/settings/accounts" className="text-sm text-indigo-600">
                        Reconnect below
                    </Link>
                )}
            </div>
        </div>
    );
}

export default function ConnectedAccountsPage() {
    const dispatch = useAppDispatch();
    const { pages, loading } = useAppSelector((state) => state.socials);

    useEffect(() => {
        dispatch(fetchConnectedPages());
    }, [dispatch]);

    const handleConnect = async () => {
        try {
            const url = await dispatch(startConnect()).unwrap();
            window.location.href = url;
        } catch {
            toast.error('Could not start the Facebook connection');
        }
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
            <p className="mt-1 text-gray-500">
                Connect your Facebook Page to manage messages, comments, and posts.
            </p>
            <div className="mt-6 space-y-3">
                {pages.map((page) => (
                    <PageCard key={page.id} page={page} />
                ))}
                {!loading && pages.length === 0 && (
                    <p className="text-sm text-gray-500">No Pages connected yet.</p>
                )}
            </div>
            <button
                onClick={handleConnect}
                className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
                Connect Facebook Page
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Create the OAuth callback page**

`frontend/src/pages/MetaCallbackPage.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { connectMetaPage, finishOAuth } from '@/features/socials/socialsSlice';

export default function MetaCallbackPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { availablePages, loading } = useAppSelector((state) => state.socials);
    const exchanged = useRef(false);

    useEffect(() => {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) {
            toast.error('Facebook connection was cancelled');
            navigate('/vendor/settings/accounts');
            return;
        }
        if (exchanged.current) return;
        exchanged.current = true;
        dispatch(finishOAuth({ code, state }))
            .unwrap()
            .catch(() => {
                toast.error('Could not complete the Facebook connection');
                navigate('/vendor/settings/accounts');
            });
    }, [dispatch, navigate, searchParams]);

    const handlePick = async (pageId: string, name: string) => {
        try {
            await dispatch(connectMetaPage(pageId)).unwrap();
            toast.success(`${name} connected`);
            navigate('/vendor/settings/accounts');
        } catch {
            toast.error('Could not connect the Page');
        }
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Choose a Page</h1>
            <p className="mt-1 text-gray-500">
                Pick the Facebook Page to connect to your business.
            </p>
            {loading && <p className="mt-6 text-sm text-gray-500">Talking to Facebook…</p>}
            <div className="mt-6 space-y-3">
                {availablePages.map((page) => (
                    <button
                        key={page.id}
                        onClick={() => handlePick(page.id, page.name)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-indigo-400"
                    >
                        <span className="font-semibold text-gray-900">{page.name}</span>
                        <span className="text-sm text-indigo-600">Connect</span>
                    </button>
                ))}
                {!loading && availablePages.length === 0 && (
                    <p className="text-sm text-gray-500">No Pages available on this account.</p>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Register the routes**

In `frontend/src/App.tsx`, add the imports:
```tsx
import ConnectedAccountsPage from './pages/ConnectedAccountsPage';
import MetaCallbackPage from './pages/MetaCallbackPage';
```

Add these routes next to the other `/vendor` routes (after the `/vendor/products/new` route):
```tsx
<Route path="/vendor/settings/accounts" element={<ConnectedAccountsPage />} />
<Route path="/vendor/settings/meta-callback" element={<MetaCallbackPage />} />
```

- [ ] **Step 4: Verify with the TypeScript build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ConnectedAccountsPage.tsx frontend/src/pages/MetaCallbackPage.tsx frontend/src/App.tsx
git commit -m "feat: add Connected Accounts and Meta OAuth callback pages"
```

---

### Task 10: end-to-end verification against the dev Meta app

**Files:**
- No code changes expected; fixes discovered here become new commits.

**Interfaces:**
- Consumes: everything above, the dev-mode Meta app, a tunnel (ngrok or similar)

- [ ] **Step 1: Confirm env and restart services**

Verify `backend/.env` contains real values for `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_OAUTH_REDIRECT_URI`, `FERNET_KEY`, then:
```bash
cd backend && docker compose restart web celery_worker
```

- [ ] **Step 2: Run the full backend test suite one more time**

Run: `cd backend && docker compose exec -T web python manage.py test socials core.test.test_business_profile -v 1`
Expected: all PASS

- [ ] **Step 3: Manual OAuth flow**

Start the frontend (`cd frontend && npm run dev`), log in as a vendor, open `/vendor/settings/accounts`, click Connect Facebook Page, authorize with the Meta dev app's test user, pick the test Page, and confirm the status card shows Connected with the IG username if linked. Confirm in Django admin that no token value is visible on the MetaConnection or ConnectedPage pages.

- [ ] **Step 4: Manual webhook flow**

Expose the backend with a tunnel, configure the Meta app's webhook callback URL to `<tunnel>/api/webhooks/meta/` with the verify token from `.env`, subscribe to `messages` and `feed`, send a DM to the test Page, and confirm a `WebhookEvent` row appears with `signature_valid=True`.

- [ ] **Step 5: Record results**

Note any deviations found during manual verification and fix them as separate commits before declaring the cycle complete.

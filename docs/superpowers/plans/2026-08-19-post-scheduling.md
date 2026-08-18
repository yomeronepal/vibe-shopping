# Post Scheduling & Content Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Businesses compose product or free-form image posts, save drafts, schedule them on a monthly calendar, and Celery Beat publishes them when due, with retry for failures.

**Architecture:** `core.SocialMediaPost` gains optional product, uploaded image, `scheduled_for`, and `draft`/`scheduled` statuses. Publishing logic moves from the view into `socials/services/publisher.py`, shared by the immediate-publish endpoint and two new Celery tasks (`publish_due_posts` minute-beat claimer + `publish_scheduled_post` per-record worker). The posts endpoint becomes a full REST resource. A new `/vendor/calendar` page renders the monthly grid and composer modal.

**Tech Stack:** Django 5 + DRF, Celery + django-celery-beat (DatabaseScheduler), React 19 + TS in the existing VendorShell.

**Spec:** `docs/superpowers/specs/2026-08-19-post-scheduling-design.md`

## Global Constraints

- No code comments: never write lines starting with `#`, `//`, or `<!--` in any file. Python docstrings (`"""`) allowed. Auto-generated migrations exempt.
- Work on branch `feature/post-scheduling`. Backend commands run in Docker from `backend/`: `docker compose exec -T web python manage.py <cmd>`.
- The existing immediate-publish behavior of `POST /api/socials/posts/` (body `{product_id, platforms, caption}`, response `{'results': [...]}`) must remain byte-for-byte unchanged; the product create page depends on it.
- One `SocialMediaPost` record per platform. Statuses: `draft`, `scheduled`, `pending`, `posted`, `failed`.
- Lifecycle guards: PATCH/DELETE only while `draft`/`scheduled` (400 `{'error': 'Only drafts and scheduled posts can be edited'}` / analogous delete message); retry only from `failed`.
- All endpoints tenant-scoped via `request.user.vendor_profile.tenant`; cross-tenant ids → 404.
- Tokens and raw Graph errors never reach API responses.
- Frontend gate: `npx tsc -b --force` produces zero errors anywhere (the build is fully clean since commit 0eb8111 — keep it that way); verify with `npm run build`.
- **Known defect to fix in Task 3:** `django_celery_beat` is missing from INSTALLED_APPS although the beat container uses its DatabaseScheduler — the container is presumed crash-looping. Task 3 installs it properly.

---

### Task 1: SocialMediaPost model extension

**Files:**
- Modify: `backend/core/models.py` (SocialMediaPost only)
- Create: generated migration `backend/core/migrations/00XX_*.py`
- Test: `backend/core/test/test_social_post_model.py`

**Interfaces:**
- Consumes: existing `SocialMediaPost` (fields: tenant, product FK required, platform, status pending/posted/failed, caption, post_url, platform_post_id, metadata, error_message)
- Produces: `product` nullable; `image = ImageField(upload_to='uploads/social_posts/', null=True, blank=True)`; `scheduled_for = DateTimeField(null=True, blank=True)`; STATUS_CHOICES additionally `('draft', 'Draft')` and `('scheduled', 'Scheduled')`. Later tasks rely on these exact names.

- [ ] **Step 1: Write the failing model tests**

`backend/core/test/test_social_post_model.py`:
```python
from django.test import TestCase
from django.utils import timezone

from core.models import Product, SocialMediaPost, Tenant


class SocialMediaPostModelTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')

    def test_free_form_post_without_product(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, platform='facebook', caption='Announcement',
            status='draft',
        )
        self.assertIsNone(post.product)
        self.assertEqual(post.status, 'draft')

    def test_scheduled_post_fields(self):
        when = timezone.now() + timezone.timedelta(hours=2)
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, platform='instagram', caption='Soon',
            status='scheduled', scheduled_for=when,
        )
        post.refresh_from_db()
        self.assertEqual(post.status, 'scheduled')
        self.assertEqual(post.scheduled_for, when)

    def test_product_post_still_works(self):
        product = Product.objects.create(tenant=self.tenant, name='Jacket', price=10)
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=product, platform='facebook', caption='Buy'
        )
        self.assertEqual(post.status, 'pending')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test core.test.test_social_post_model -v 2`
Expected: FAIL — creating without `product` raises IntegrityError; `scheduled_for`/`draft` unknown

- [ ] **Step 3: Modify the model**

In `backend/core/models.py`, class `SocialMediaPost`:
- STATUS_CHOICES: add `('draft', 'Draft'),` and `('scheduled', 'Scheduled'),` before the existing entries
- `product` field: add `null=True, blank=True`
- After the `caption` field add:
```python
    image = models.ImageField(upload_to='uploads/social_posts/', null=True, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 4: Generate and apply the migration**

Run:
```bash
cd backend && docker compose exec -T web python manage.py makemigrations core && docker compose exec -T web python manage.py migrate core
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test core.test.test_social_post_model -v 2`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/core
git commit -m "feat: extend SocialMediaPost for drafts, scheduling, and free-form images"
```

---

### Task 2: publisher service extraction

**Files:**
- Create: `backend/socials/services/publisher.py`
- Modify: `backend/socials/views.py` (PublishPostView becomes a thin caller; move helpers out), `backend/socials/test/test_publish_views.py` (patch targets move)
- Test: `backend/socials/test/test_publisher.py`

**Interfaces:**
- Consumes: `MetaGraphClient` (publish_page_photo, publish_instagram_photo), `ConnectedPage`, `SocialMediaPost`, `settings.PUBLIC_MEDIA_BASE_URL`
- Produces (later tasks depend on these exact names):
  - `publisher.TransientPublishError(Exception)`
  - `publisher.NETWORK_ERROR_MESSAGE = 'Could not reach Facebook'`
  - `publisher.resolve_image_source(image_field, product) -> FieldFile | None` (uploaded image first, then product processed_image, then product image)
  - `publisher.publish_post_record(record) -> SocialMediaPost` — publishes one record; on success sets `posted`+ids+url and saves; on permanent `MetaGraphError` sets `failed`+`error_message` and saves (never raises); on the client's network wrap raises `TransientPublishError` WITHOUT saving (caller/task retries)

- [ ] **Step 1: Write the failing publisher tests**

`backend/socials/test/test_publisher.py`:
```python
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from core.models import Product, SocialMediaPost, Tenant
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError
from socials.services.publisher import (
    TransientPublishError,
    publish_post_record,
    resolve_image_source,
)

TEST_KEY = Fernet.generate_key().decode()

PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0'
    b'\x00\x00\x00\x03\x00\x01_\x1d\x8b\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
)


@override_settings(FERNET_KEY=TEST_KEY, PUBLIC_MEDIA_BASE_URL='https://pub.example.com')
class PublisherTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', instagram_account_id='ig1', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.product = Product.objects.create(
            tenant=self.tenant, name='Jacket', price=10,
            image=SimpleUploadedFile('jacket.png', PNG_BYTES, 'image/png'),
        )

    def make_post(self, **kwargs):
        defaults = {
            'tenant': self.tenant, 'platform': 'facebook',
            'caption': 'Buy now', 'status': 'pending', 'product': self.product,
        }
        defaults.update(kwargs)
        return SocialMediaPost.objects.create(**defaults)

    @patch('socials.services.publisher.MetaGraphClient')
    def test_product_post_publishes(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_photo.return_value = {
            'post_id': 'p1_1', 'post_url': 'https://facebook.com/p1_1'
        }
        record = publish_post_record(self.make_post())
        self.assertEqual(record.status, 'posted')
        self.assertEqual(record.platform_post_id, 'p1_1')

    @patch('socials.services.publisher.MetaGraphClient')
    def test_uploaded_image_takes_precedence(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.publish_page_photo.return_value = {'post_id': 'x', 'post_url': ''}
        post = self.make_post(image=SimpleUploadedFile('promo.png', PNG_BYTES, 'image/png'))
        source = resolve_image_source(post.image, post.product)
        self.assertIn('promo', source.name)
        publish_post_record(post)
        self.assertTrue(mock_client.publish_page_photo.called)

    @patch('socials.services.publisher.MetaGraphClient')
    def test_permanent_error_marks_failed(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_photo.side_effect = MetaGraphError('nope', code=200)
        record = publish_post_record(self.make_post())
        self.assertEqual(record.status, 'failed')
        self.assertIn('nope', record.error_message)

    @patch('socials.services.publisher.MetaGraphClient')
    def test_network_error_raises_transient(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_photo.side_effect = MetaGraphError('Could not reach Facebook')
        post = self.make_post()
        with self.assertRaises(TransientPublishError):
            publish_post_record(post)
        post.refresh_from_db()
        self.assertEqual(post.status, 'pending')

    @patch('socials.services.publisher.MetaGraphClient')
    def test_missing_image_fails(self, mock_client_cls):
        record = publish_post_record(self.make_post(product=None))
        self.assertEqual(record.status, 'failed')
        self.assertIn('image', record.error_message.lower())

    @override_settings(PUBLIC_MEDIA_BASE_URL='')
    @patch('socials.services.publisher.MetaGraphClient')
    def test_instagram_needs_public_url(self, mock_client_cls):
        record = publish_post_record(self.make_post(platform='instagram'))
        self.assertEqual(record.status, 'failed')
        self.assertIn('PUBLIC_MEDIA_BASE_URL', record.error_message)
        mock_client_cls.return_value.publish_instagram_photo.assert_not_called()

    @patch('socials.services.publisher.MetaGraphClient')
    def test_no_connected_page_fails(self, mock_client_cls):
        self.page.delete()
        record = publish_post_record(self.make_post())
        self.assertEqual(record.status, 'failed')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_publisher -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'socials.services.publisher'`

- [ ] **Step 3: Create the publisher service**

`backend/socials/services/publisher.py`:
```python
import logging

from django.conf import settings

from socials.models import ConnectedPage
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

NETWORK_ERROR_MESSAGE = 'Could not reach Facebook'


class TransientPublishError(Exception):
    """A publish failure worth retrying (network-level)."""


def build_public_image_url(image_field):
    """Return a publicly reachable URL for the image or None."""
    base = settings.PUBLIC_MEDIA_BASE_URL.rstrip('/')
    if not base:
        return None
    return f'{base}{image_field.url}'


def resolve_image_source(image_field, product):
    """Return the best image field for a post or None."""
    if image_field:
        return image_field
    if product and product.processed_image:
        return product.processed_image
    if product and product.image:
        return product.image
    if product:
        first_gallery = product.images.first()
        return first_gallery.image if first_gallery else None
    return None


def publish_facebook(client, page, image_field, caption):
    """Post the image to the Page feed as a photo post."""
    with image_field.open('rb') as handle:
        return client.publish_page_photo(
            page.page_id, page.get_access_token(), handle, caption
        )


def publish_instagram(client, page, image_field, caption):
    """Post the image to the Page's linked IG professional account."""
    if not page.instagram_account_id:
        raise MetaGraphError('No Instagram account is linked to the connected Page')
    image_url = build_public_image_url(image_field)
    if not image_url:
        raise MetaGraphError(
            'Instagram needs a publicly reachable image URL. '
            'Set PUBLIC_MEDIA_BASE_URL (e.g. an ngrok URL) and restart the backend.'
        )
    return client.publish_instagram_photo(
        page.instagram_account_id, page.get_access_token(), image_url, caption
    )


PLATFORM_PUBLISHERS = {
    'facebook': publish_facebook,
    'instagram': publish_instagram,
}


def mark_failed(record, message):
    """Persist a failure outcome on the record."""
    record.status = 'failed'
    record.error_message = message
    record.save()
    logger.warning('Social publish %s failed: %s', record.id, message)
    return record


def publish_post_record(record):
    """Publish one post record; transient network errors raise for retry."""
    page = ConnectedPage.objects.filter(tenant=record.tenant, status='connected').first()
    if not page:
        return mark_failed(record, 'Connect a Facebook Page first')
    image_field = resolve_image_source(record.image, record.product)
    if not image_field:
        return mark_failed(record, 'Post has no image')
    client = MetaGraphClient()
    try:
        outcome = PLATFORM_PUBLISHERS[record.platform](client, page, image_field, record.caption)
    except MetaGraphError as exc:
        if str(exc) == NETWORK_ERROR_MESSAGE:
            raise TransientPublishError(str(exc))
        return mark_failed(record, str(exc))
    record.status = 'posted'
    record.platform_post_id = outcome.get('post_id', '')
    record.post_url = outcome.get('post_url') or None
    record.error_message = ''
    record.save()
    return record
```

- [ ] **Step 4: Refactor the view to a thin caller**

In `backend/socials/views.py`:
- Delete the moved helpers: `build_public_image_url`, `get_product_image`, `publish_to_facebook`, `publish_to_instagram`, `PLATFORM_PUBLISHERS`
- Add import: `from socials.services.publisher import TransientPublishError, publish_post_record, resolve_image_source, PLATFORM_PUBLISHERS`
- Replace `PublishPostView` with:
```python
class PublishPostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Publish a product to the selected connected platforms."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        platforms = request.data.get('platforms') or []
        if not platforms or any(p not in PLATFORM_PUBLISHERS for p in platforms):
            return Response(
                {'error': 'platforms must contain facebook and/or instagram'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        product = Product.objects.filter(
            tenant=tenant, id=request.data.get('product_id')
        ).first()
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        page = ConnectedPage.objects.filter(tenant=tenant, status='connected').first()
        if not page:
            return Response(
                {'error': 'Connect a Facebook Page first'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not resolve_image_source(None, product):
            return Response(
                {'error': 'Product has no image to post'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        caption = request.data.get('caption') or product.description or product.name
        results = [
            self.publish_one(platform, product, tenant, caption)
            for platform in platforms
        ]
        return Response({'results': results})

    def publish_one(self, platform, product, tenant, caption):
        """Create and publish one record, tolerating transient failures."""
        record = SocialMediaPost.objects.create(
            product=product, tenant=tenant, platform=platform, caption=caption
        )
        try:
            publish_post_record(record)
        except TransientPublishError:
            record.status = 'failed'
            record.error_message = 'Could not reach Facebook. Please try again.'
            record.save()
        return {
            'platform': platform,
            'status': record.status,
            'post_url': record.post_url,
            'error': record.error_message or None,
        }
```

- [ ] **Step 5: Update the existing publish-view tests' patch target**

In `backend/socials/test/test_publish_views.py`, replace every `@patch('socials.views.MetaGraphClient')` with `@patch('socials.services.publisher.MetaGraphClient')`. The assertions stay unchanged.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_publisher socials.test.test_publish_views -v 1`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/socials
git commit -m "feat: extract shared post publisher service"
```

---

### Task 3: scheduling engine (Celery beat)

**Files:**
- Modify: `backend/vibe_shopping/settings/base.py` (INSTALLED_APPS gains `'django_celery_beat',`), `backend/socials/tasks.py`
- Create: data migration `backend/socials/migrations/0002_publish_due_schedule.py`
- Test: `backend/socials/test/test_scheduling.py`

**Interfaces:**
- Consumes: Task 2's `publish_post_record` / `TransientPublishError`, `SocialMediaPost`
- Produces:
  - `socials.tasks.publish_due_posts() -> int` (count claimed) — claims `scheduled` rows with `scheduled_for <= now` via `select_for_update(skip_locked=True)`, flips them to `pending`, queues `publish_scheduled_post` per row
  - `socials.tasks.publish_scheduled_post(post_id) -> int` — `bind=True, max_retries=2, default_retry_delay=60`; skips records not in `pending`; retries on `TransientPublishError`, marking `failed` when retries are exhausted
  - PeriodicTask named `Publish due social posts` on a 60-second interval

- [ ] **Step 1: Install django_celery_beat properly**

In `backend/vibe_shopping/settings/base.py` INSTALLED_APPS, after `'django_filters',` add:
```python
    'django_celery_beat',
```
Run: `cd backend && docker compose exec -T web python manage.py migrate django_celery_beat`
Expected: its tables are created. Then check the beat container: `docker compose logs celery_beat --tail 5` — if it was crash-looping, `docker compose restart celery_beat` and confirm it reports the DatabaseScheduler starting.

- [ ] **Step 2: Write the failing scheduling tests**

`backend/socials/test/test_scheduling.py`:
```python
from unittest.mock import patch

from celery.exceptions import Retry
from django.test import TestCase
from django.utils import timezone

from core.models import SocialMediaPost, Tenant
from socials.services.publisher import TransientPublishError
from socials.tasks import publish_due_posts, publish_scheduled_post


class SchedulingTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')

    def make_post(self, **kwargs):
        defaults = {
            'tenant': self.tenant, 'platform': 'facebook',
            'caption': 'Hi', 'status': 'scheduled',
            'scheduled_for': timezone.now() - timezone.timedelta(minutes=1),
        }
        defaults.update(kwargs)
        return SocialMediaPost.objects.create(**defaults)

    @patch('socials.tasks.publish_scheduled_post')
    def test_claims_only_due_scheduled_posts(self, mock_task):
        due = self.make_post()
        future = self.make_post(scheduled_for=timezone.now() + timezone.timedelta(hours=1))
        draft = self.make_post(status='draft', scheduled_for=None)
        claimed = publish_due_posts()
        self.assertEqual(claimed, 1)
        due.refresh_from_db()
        future.refresh_from_db()
        draft.refresh_from_db()
        self.assertEqual(due.status, 'pending')
        self.assertEqual(future.status, 'scheduled')
        self.assertEqual(draft.status, 'draft')
        mock_task.delay.assert_called_once_with(due.id)

    @patch('socials.tasks.publish_post_record')
    def test_worker_publishes_pending_record(self, mock_publish):
        post = self.make_post(status='pending')
        publish_scheduled_post.push_request(retries=0)
        try:
            publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()
        mock_publish.assert_called_once()

    @patch('socials.tasks.publish_post_record')
    def test_worker_skips_non_pending(self, mock_publish):
        post = self.make_post(status='posted')
        publish_scheduled_post.push_request(retries=0)
        try:
            publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()
        mock_publish.assert_not_called()

    @patch('socials.tasks.publish_post_record', side_effect=TransientPublishError('down'))
    def test_transient_error_retries(self, mock_publish):
        post = self.make_post(status='pending')
        publish_scheduled_post.push_request(retries=0)
        try:
            with self.assertRaises(Retry):
                publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()

    @patch('socials.tasks.publish_post_record', side_effect=TransientPublishError('down'))
    def test_transient_error_exhaustion_marks_failed(self, mock_publish):
        post = self.make_post(status='pending')
        publish_scheduled_post.push_request(retries=2)
        try:
            publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()
        post.refresh_from_db()
        self.assertEqual(post.status, 'failed')
        self.assertIn('down', post.error_message)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_scheduling -v 2`
Expected: FAIL with ImportError on `publish_due_posts`

- [ ] **Step 4: Implement the tasks**

Append to `backend/socials/tasks.py` (add imports `from django.db import transaction`, `from django.utils import timezone`, `from core.models import SocialMediaPost`, `from socials.services.publisher import TransientPublishError, publish_post_record` at the top with the existing imports):
```python


@shared_task
def publish_due_posts():
    """Claim due scheduled posts and queue them for publishing."""
    now = timezone.now()
    with transaction.atomic():
        due_ids = list(
            SocialMediaPost.objects.select_for_update(skip_locked=True)
            .filter(status='scheduled', scheduled_for__lte=now)
            .values_list('id', flat=True)
        )
        SocialMediaPost.objects.filter(id__in=due_ids).update(status='pending')
    for post_id in due_ids:
        publish_scheduled_post.delay(post_id)
    return len(due_ids)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def publish_scheduled_post(self, post_id):
    """Publish one claimed post, retrying transient network failures."""
    record = SocialMediaPost.objects.filter(id=post_id).first()
    if not record or record.status != 'pending':
        return post_id
    try:
        publish_post_record(record)
    except TransientPublishError as exc:
        if self.request.retries >= self.max_retries:
            record.status = 'failed'
            record.error_message = str(exc)
            record.save()
            return post_id
        raise self.retry(exc=exc)
    return post_id
```

- [ ] **Step 5: Create the PeriodicTask data migration**

`backend/socials/migrations/0002_publish_due_schedule.py`:
```python
from django.db import migrations

TASK_NAME = 'Publish due social posts'


def create_schedule(apps, schema_editor):
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule, _ = IntervalSchedule.objects.get_or_create(every=1, period='minutes')
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={'task': 'socials.tasks.publish_due_posts', 'interval': schedule},
    )


def remove_schedule(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('socials', '0001_initial'),
        ('django_celery_beat', '__latest__'),
    ]

    operations = [
        migrations.RunPython(create_schedule, remove_schedule),
    ]
```
Run: `cd backend && docker compose exec -T web python manage.py migrate socials`

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_scheduling -v 2`
Expected: PASS (5 tests)

- [ ] **Step 7: Restart workers and commit**

```bash
cd backend && docker compose restart celery_worker celery_beat web
docker compose logs celery_beat --tail 5
git add backend/socials backend/vibe_shopping/settings/base.py
git commit -m "feat: publish scheduled posts via celery beat"
```
Expected: beat log shows the DatabaseScheduler running without errors.

---

### Task 4: posts REST API

**Files:**
- Modify: `backend/socials/views.py` (extend PublishPostView with GET + create modes; add PostDetailView, PostRetryView), `backend/socials/serializers.py`, `backend/socials/urls.py`
- Test: `backend/socials/test/test_post_api.py`

**Interfaces:**
- Consumes: Tasks 1-3 (model fields, publisher, `publish_scheduled_post`)
- Produces:
  - `SocialMediaPostSerializer` → `{id, platform, status, caption, image_url, product: {id,name}|null, scheduled_for, post_url, error_message, created_at}` (`image_url`: uploaded image → product processed image → product image → null, as media-relative URL)
  - `GET /api/socials/posts/?from=&to=&status=` — display date = `Coalesce(scheduled_for, created_at)`, range-inclusive, newest first
  - `POST /api/socials/posts/` — as spec: immediate (unchanged), `scheduled_for` → scheduled, `save_as='draft'` → draft; multipart `image` supported for all modes; validation: platforms valid, product-or-image present, future `scheduled_for`
  - `PATCH/DELETE /api/socials/posts/<int:post_id>/`, `POST /api/socials/posts/<int:post_id>/retry/` with the lifecycle guards from Global Constraints

- [ ] **Step 1: Write the failing API tests**

`backend/socials/test/test_post_api.py`:
```python
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection
from socials.test.test_publisher import PNG_BYTES

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class PostApiTests(APITestCase):
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
        self.product = Product.objects.create(
            tenant=self.tenant, name='Jacket', price=10,
            image=SimpleUploadedFile('jacket.png', PNG_BYTES, 'image/png'),
        )
        self.future = (timezone.now() + timezone.timedelta(days=1)).isoformat()

    def test_create_scheduled_two_platforms(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'Weekend drop',
            'platforms': ['facebook', 'instagram'],
            'product_id': self.product.id,
            'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(
            SocialMediaPost.objects.filter(status='scheduled').count(), 2
        )

    def test_create_draft_free_form_with_upload(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'Announcement',
            'platforms': ['facebook'],
            'save_as': 'draft',
            'image': SimpleUploadedFile('promo.png', PNG_BYTES, 'image/png'),
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        post = SocialMediaPost.objects.get()
        self.assertEqual(post.status, 'draft')
        self.assertIsNone(post.product)
        self.assertTrue(post.image)
        self.assertIsNotNone(response.data[0]['image_url'])

    def test_create_requires_product_or_image(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'x', 'platforms': ['facebook'], 'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_past_schedule(self):
        past = (timezone.now() - timezone.timedelta(hours=1)).isoformat()
        response = self.client.post('/api/socials/posts/', {
            'caption': 'x', 'platforms': ['facebook'],
            'product_id': self.product.id, 'scheduled_for': past,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    @patch('socials.views.publish_post_record')
    def test_immediate_publish_response_shape_unchanged(self, mock_publish):
        def fake_publish(record):
            record.status = 'posted'
            record.post_url = 'https://facebook.com/x'
            record.save()
            return record

        mock_publish.side_effect = fake_publish
        response = self.client.post('/api/socials/posts/', {
            'caption': 'now', 'platforms': ['facebook'], 'product_id': self.product.id,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['status'], 'posted')

    def test_list_filters_by_range_and_status(self):
        inside = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='in', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=1),
        )
        SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='out', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=40),
        )
        start = timezone.now().date().isoformat()
        end = (timezone.now() + timezone.timedelta(days=7)).date().isoformat()
        response = self.client.get(f'/api/socials/posts/?from={start}&to={end}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p['id'] for p in response.data], [inside.id])
        filtered = self.client.get(f'/api/socials/posts/?from={start}&to={end}&status=draft')
        self.assertEqual(filtered.data, [])

    def test_patch_draft_promotes_to_scheduled(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='draft', status='draft',
        )
        response = self.client.patch(f'/api/socials/posts/{post.id}/', {
            'caption': 'updated', 'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.status, 'scheduled')
        self.assertEqual(post.caption, 'updated')

    def test_patch_posted_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='done', status='posted',
        )
        response = self.client.patch(f'/api/socials/posts/{post.id}/', {'caption': 'x'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_delete_scheduled(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='bye', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=1),
        )
        response = self.client.delete(f'/api/socials/posts/{post.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SocialMediaPost.objects.filter(id=post.id).exists())

    def test_delete_posted_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='keep', status='posted',
        )
        response = self.client.delete(f'/api/socials/posts/{post.id}/')
        self.assertEqual(response.status_code, 400)

    @patch('socials.views.publish_scheduled_post')
    def test_retry_failed(self, mock_task):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='oops', status='failed', error_message='boom',
        )
        response = self.client.post(f'/api/socials/posts/{post.id}/retry/')
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.status, 'pending')
        mock_task.delay.assert_called_once_with(post.id)

    def test_retry_non_failed_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='fine', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=1),
        )
        response = self.client.post(f'/api/socials/posts/{post.id}/retry/')
        self.assertEqual(response.status_code, 400)

    def test_cross_tenant_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = SocialMediaPost.objects.create(
            tenant=other, platform='facebook', caption='x', status='draft',
        )
        for method, url, payload in [
            ('patch', f'/api/socials/posts/{foreign.id}/', {'caption': 'x'}),
            ('delete', f'/api/socials/posts/{foreign.id}/', None),
            ('post', f'/api/socials/posts/{foreign.id}/retry/', None),
        ]:
            response = getattr(self.client, method)(url, payload, format='json')
            self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && docker compose exec -T web python manage.py test socials.test.test_post_api -v 2`
Expected: FAIL (routes and serializer missing; create modes unsupported)

- [ ] **Step 3: Add the serializer**

Append to `backend/socials/serializers.py` (import `SocialMediaPost, Product` from `core.models`):
```python


class PostProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'name']


class SocialMediaPostSerializer(serializers.ModelSerializer):
    product = PostProductSerializer(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = SocialMediaPost
        fields = [
            'id', 'platform', 'status', 'caption', 'image_url', 'product',
            'scheduled_for', 'post_url', 'error_message', 'created_at',
        ]

    def get_image_url(self, obj):
        if obj.image:
            return obj.image.url
        if obj.product and obj.product.processed_image:
            return obj.product.processed_image.url
        if obj.product and obj.product.image:
            return obj.product.image.url
        return None
```

- [ ] **Step 4: Extend the views**

In `backend/socials/views.py` (add imports: `from datetime import date`, `from rest_framework import serializers as drf_serializers`, `from django.db.models.functions import Coalesce`, `from core.models import SocialMediaPost` already imported, `from socials.serializers import ConnectedPageSerializer, SocialMediaPostSerializer`, `from socials.tasks import process_webhook_event, publish_scheduled_post`):

Add module-level helpers:
```python
EDIT_GUARD_ERROR = 'Only drafts and scheduled posts can be edited'
POST_STATUSES = {'draft', 'scheduled', 'pending', 'posted', 'failed'}


def parse_platforms(data):
    """Return the platforms list from JSON or multipart payloads."""
    if hasattr(data, 'getlist'):
        values = data.getlist('platforms')
        if values:
            return values
    value = data.get('platforms')
    return value if isinstance(value, list) else ([value] if value else [])


def parse_schedule_datetime(raw):
    """Parse an ISO datetime; returns (datetime|None, error|None)."""
    if not raw:
        return None, None
    try:
        parsed = drf_serializers.DateTimeField().to_internal_value(raw)
    except drf_serializers.ValidationError:
        return None, 'Invalid scheduled_for datetime'
    if parsed <= timezone.now():
        return None, 'scheduled_for must be in the future'
    return parsed, None


def get_tenant_post(request, post_id):
    """Return (tenant, post) tenant-scoped; Nones on miss."""
    tenant = get_request_tenant(request)
    if not tenant:
        return None, None
    post = SocialMediaPost.objects.filter(tenant=tenant, id=post_id).first()
    return tenant, post
```

Extend `PublishPostView` with a `get` method and create-mode branching in `post`:
```python
    def get(self, request):
        """List posts for the calendar within a date range."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        queryset = SocialMediaPost.objects.filter(tenant=tenant).annotate(
            display_date=Coalesce('scheduled_for', 'created_at')
        )
        try:
            start = request.query_params.get('from')
            end = request.query_params.get('to')
            if start:
                queryset = queryset.filter(display_date__date__gte=date.fromisoformat(start))
            if end:
                queryset = queryset.filter(display_date__date__lte=date.fromisoformat(end))
        except ValueError:
            return Response({'error': 'Invalid date range'}, status=status.HTTP_400_BAD_REQUEST)
        status_filter = request.query_params.get('status')
        if status_filter:
            if status_filter not in POST_STATUSES:
                return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(status=status_filter)
        queryset = queryset.select_related('product').order_by('-display_date')
        return Response(SocialMediaPostSerializer(queryset, many=True).data)
```

In `post`, after the platforms validation, restructure:
```python
        product = None
        product_id = request.data.get('product_id')
        if product_id:
            product = Product.objects.filter(tenant=tenant, id=product_id).first()
            if not product:
                return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        image_file = request.FILES.get('image')
        caption = request.data.get('caption') or (product.description if product else '') or (product.name if product else '')
        save_as_draft = request.data.get('save_as') == 'draft'
        scheduled_for, schedule_error = parse_schedule_datetime(request.data.get('scheduled_for'))
        if schedule_error:
            return Response({'error': schedule_error}, status=status.HTTP_400_BAD_REQUEST)
        if not product and not image_file:
            return Response(
                {'error': 'Provide a product or an image'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if save_as_draft or scheduled_for:
            records = []
            for platform in platforms:
                if image_file:
                    image_file.seek(0)
                records.append(SocialMediaPost.objects.create(
                    tenant=tenant, product=product, platform=platform,
                    caption=caption, image=image_file,
                    status='draft' if save_as_draft else 'scheduled',
                    scheduled_for=scheduled_for,
                ))
            return Response(
                SocialMediaPostSerializer(records, many=True).data,
                status=status.HTTP_201_CREATED,
            )
```
then the existing immediate path continues (page check, image check via `resolve_image_source(image_file, product)`, publish loop — pass the image file into the created record so free-form immediate posts work: `SocialMediaPost.objects.create(product=product, tenant=tenant, platform=platform, caption=caption, image=image_file)` in `publish_one`, threading `image_file` through as a parameter and calling `image_file.seek(0)` before each create).

Note: the immediate path previously 404'd when `product_id` was missing entirely; preserve compatibility — when neither `scheduled_for` nor `save_as` is present AND no image is uploaded AND product_id is absent or unknown, the response must remain 404 `{'error': 'Product not found'}` (the existing test asserts it). Achieve this by keeping the 404 branch for the no-image case: when `product_id` is falsy and no image file was sent and the request is immediate, return 404 as before.

Add the two new views:
```python
class PostDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, post_id):
        """Edit a draft or scheduled post."""
        tenant, post = get_tenant_post(request, post_id)
        if not post:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        if post.status not in ('draft', 'scheduled'):
            return Response({'error': EDIT_GUARD_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        scheduled_for, schedule_error = parse_schedule_datetime(request.data.get('scheduled_for'))
        if schedule_error:
            return Response({'error': schedule_error}, status=status.HTTP_400_BAD_REQUEST)
        if 'caption' in request.data:
            post.caption = request.data.get('caption') or ''
        if request.FILES.get('image'):
            post.image = request.FILES['image']
        if scheduled_for:
            post.scheduled_for = scheduled_for
            post.status = 'scheduled'
        post.save()
        return Response(SocialMediaPostSerializer(post).data)

    def delete(self, request, post_id):
        """Delete a draft or scheduled post."""
        tenant, post = get_tenant_post(request, post_id)
        if not post:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        if post.status not in ('draft', 'scheduled'):
            return Response(
                {'error': 'Only drafts and scheduled posts can be deleted'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        """Re-queue a failed post."""
        tenant, post = get_tenant_post(request, post_id)
        if not post:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        if post.status != 'failed':
            return Response(
                {'error': 'Only failed posts can be retried'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        post.status = 'pending'
        post.error_message = ''
        post.save()
        publish_scheduled_post.delay(post.id)
        return Response(SocialMediaPostSerializer(post).data)
```

Add routes to `backend/socials/urls.py`:
```python
    path('posts/<int:post_id>/', PostDetailView.as_view(), name='socials_post_detail'),
    path('posts/<int:post_id>/retry/', PostRetryView.as_view(), name='socials_post_retry'),
```
(import the two views in the existing import block)

- [ ] **Step 5: Run the full socials suite**

Run: `cd backend && docker compose exec -T web python manage.py test socials -v 1`
Expected: all PASS (new + existing, including untouched publish-view tests)

- [ ] **Step 6: Commit**

```bash
git add backend/socials
git commit -m "feat: full posts API with drafts, scheduling, edit, delete, retry"
```

---

### Task 5: publishing calendar page

**Files:**
- Modify: `frontend/src/api/socials.ts`, `frontend/src/components/vendor/VendorShell.tsx` (nav item), `frontend/src/App.tsx` (route)
- Create: `frontend/src/pages/PublishingCalendarPage.tsx`

**Interfaces:**
- Consumes: `apiClient`, `vendorApi.getProducts()` (returns the vendor's products with `id`, `name`, `image`), `VendorShell`, `useShopTheme`, Task 4's endpoints
- Produces: route `/vendor/calendar`; VendorShell nav `{ to: '/vendor/calendar', label: 'Publishing', icon: 'calendar_month', exact: false }` inserted between Orders and Products

- [ ] **Step 1: Extend the API module**

Append to `frontend/src/api/socials.ts`:
```typescript

export interface PostProductRef {
    id: number;
    name: string;
}

export interface ScheduledPost {
    id: number;
    platform: 'facebook' | 'instagram';
    status: 'draft' | 'scheduled' | 'pending' | 'posted' | 'failed';
    caption: string;
    image_url: string | null;
    product: PostProductRef | null;
    scheduled_for: string | null;
    post_url: string | null;
    error_message: string;
    created_at: string;
}

export const listPosts = async (fromDate: string, toDate: string): Promise<ScheduledPost[]> => {
    const response = await apiClient.get('/socials/posts/', {
        params: { from: fromDate, to: toDate },
    });
    return response.data;
};

export const createPost = async (form: FormData): Promise<ScheduledPost[] | { results: PublishResult[] }> => {
    const response = await apiClient.post('/socials/posts/', form);
    return response.data;
};

export const updatePost = async (postId: number, form: FormData): Promise<ScheduledPost> => {
    const response = await apiClient.patch(`/socials/posts/${postId}/`, form);
    return response.data;
};

export const deletePost = async (postId: number): Promise<void> => {
    await apiClient.delete(`/socials/posts/${postId}/`);
};

export const retryPost = async (postId: number): Promise<ScheduledPost> => {
    const response = await apiClient.post(`/socials/posts/${postId}/retry/`);
    return response.data;
};
```

- [ ] **Step 2: Create the calendar page**

`frontend/src/pages/PublishingCalendarPage.tsx` — implement with this structure (complete file, ~340 lines; follow the existing page conventions: theme tokens for all colors, 4-space indent, single quotes, no comments):

- Constants: `const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');` for prefixing `image_url`; `STATUS_COLORS` map (draft → `{bg: themeConfig.border+'60', fg: textSecondary}` computed inline, scheduled → primary, posted → green `#15803d`/`#dcfce7`, failed → red `#b91c1c`/`#fee2e2`, pending → amber).
- State: `monthCursor` (Date of the 1st of the shown month), `posts: ScheduledPost[]`, `loadingPosts`, `modal` (`null | {mode: 'create', date: Date} | {mode: 'edit', post: ScheduledPost}`), composer fields (`caption`, `platforms {facebook, instagram}`, `imageTab: 'product' | 'upload'`, `productId: number | null`, `productSearch`, `uploadFile: File | null`, `scheduleDate`, `scheduleTime`, `saving`, `formError`), `products` (from `vendorApi.getProducts()` on mount), `connectedPage` (from `listConnectedPages()` on mount, first with status `connected` — gates platform toggles exactly like the product create page).
- Month math: helper `monthGrid(cursor: Date): Date[]` returning 42 cells (6 weeks) starting from the Sunday on/before the 1st; `toDateKey(d: Date)` → `YYYY-MM-DD` via local date parts. Fetch posts whenever `monthCursor` changes using the grid's first and last cell dates as the range; group into `Map<dateKey, ScheduledPost[]>` keyed by `scheduled_for ?? created_at` local date.
- Grid UI inside `VendorShell`: header row (page title "Publishing", month label, prev/today/next buttons, a "New post" button opening the composer for today), weekday header, 7-column grid of cells (`min-h` ~110px, themed borders; out-of-month cells dimmed; today ring in primary). Each cell: date number, up to 3 chips (platform badge FB/IG + caption first ~18 chars, colored by status; failed chips get a `error` material icon), "+N more" text when overflowing, whole cell clickable → create modal for that date; chip click (stopPropagation) → edit modal.
- Composer modal (fixed overlay, themed card): caption textarea with `280` counter; platform toggle pills (facebook enabled iff `connectedPage`, instagram iff `connectedPage?.instagram_account_id`); image tabs — Product: search input filtering `products` by name, scrollable thumbnail grid (select sets `productId`), Upload: file input + preview via `URL.createObjectURL`; date + time inputs (`type="date"`, `type="time"`); `formError` line; action row:
  - **Schedule** — requires date+time; builds `FormData` (`caption`, one `platforms` append per selected, `product_id` or `image`, `scheduled_for` = `new Date(\`${date}T${time}\`).toISOString()`), calls `createPost` or `updatePost` in edit mode, closes + refetches month, toasts "Post scheduled" / "Post updated"
  - **Save draft** — same FormData with `save_as=draft` (create mode; in edit mode of a draft just updates without promoting)
  - **Post now** — FormData without schedule fields → `createPost`, then per-result toasts like the product create page
  - Edit mode extras: **Delete** (confirm via `window.confirm`, `deletePost`, toast "Post deleted"); when the post is `failed`: show `error_message` in red and a **Retry** button (`retryPost`, toast "Retrying post"); when `posted`: fields read-only, show a link "View post" to `post_url`
- All fetch failures toast actionable messages ("Could not load posts. Refresh to retry.", etc.).

- [ ] **Step 3: Register nav + route**

In `frontend/src/components/vendor/VendorShell.tsx` NAV_ITEMS, insert between Orders and Products:
```typescript
    { to: '/vendor/calendar', label: 'Publishing', icon: 'calendar_month', exact: false },
```
In `frontend/src/App.tsx`: import `PublishingCalendarPage` and add
```tsx
<Route path="/vendor/calendar" element={<PublishingCalendarPage />} />
```
next to the other vendor routes.

- [ ] **Step 4: Verify types and build**

Run: `cd frontend && npx tsc -b --force 2>&1 | grep -cE "^src.*error"`
Expected: `0`
Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/socials.ts frontend/src/pages/PublishingCalendarPage.tsx frontend/src/components/vendor/VendorShell.tsx frontend/src/App.tsx
git commit -m "feat: add publishing calendar with composer, drafts, and scheduling"
```

---

### Task 6: end-to-end verification

**Files:**
- No planned changes; fixes discovered here become new commits.

- [ ] **Step 1: Restart everything and run all suites**

```bash
cd backend && docker compose restart web celery_worker celery_beat
docker compose exec -T web python manage.py test core.test.test_social_post_model socials inbox vendor.test.test_orders -v 1
docker compose logs celery_beat --tail 5
```
Expected: all tests PASS; beat log shows the DatabaseScheduler ticking without errors.

- [ ] **Step 2: Live beat pipeline check (simulated page)**

Via Django shell: create a `SocialMediaPost` for the smoke tenant (tenant 2, page `simpage2`, fake token) with `status='scheduled'`, `scheduled_for=timezone.now()`, a product image. Wait ~70 seconds, then confirm the record moved to `failed` (fake token → Graph error) with an `error_message`, WITHOUT any HTTP request being made — proving beat → claim → publish ran end to end.

- [ ] **Step 3: Browser run-through**

Headless-Chrome script (as previous cycles): log in as the smoke vendor, open `/vendor/calendar`, verify the failed post's chip renders red on today's cell, open it, verify the error text and press Retry (expect it to fail again with a toast/pipeline round-trip), create a draft with an uploaded image on a future day, verify the muted chip appears, edit its caption, then delete it. Screenshots at each step, desktop + one mobile width.

- [ ] **Step 4: Record results**

Fix any deviations as separate commits before declaring the cycle complete.

# Post Scheduling & Content Calendar Cycle

**Date:** 2026-08-19
**Status:** Approved design, pending implementation plan
**Cycle:** 3 of the AI Social Commerce Platform roadmap (Phase 2)
**Depends on:** cycles 1-2; branch `feature/post-scheduling` stacked on `feature/unified-inbox` (main + PR #4 content)

## Context

Immediate product publishing to Facebook/Instagram works (cycle 1). This cycle completes roadmap section 10: businesses compose posts (product-based or free-form image posts), save drafts, schedule them, see everything on a monthly calendar, and failed posts can be retried. The already-running Celery Beat container becomes the scheduling engine.

Decisions made with the project owner:

- **Post content**: caption + image, where the image is either a chosen product's image or a direct upload (free-form). `SocialMediaPost.product` becomes optional.
- **Calendar**: monthly grid first; weekly view later.
- **One record per platform** (unchanged rule): composing for FB + IG creates two `SocialMediaPost` rows sharing caption/image/time, each with its own lifecycle.
- **Extend `SocialMediaPost`**, no parallel model.

## Scope

### In scope

- Model extension: optional `product`, new `image` upload field, `scheduled_for`, statuses `draft` and `scheduled` added to the existing `pending/posted/failed`
- Shared publisher service `socials/services/publisher.py::publish_post_record(record)` used by both the immediate-publish view and the beat task
- Beat task `publish_due_posts` (every minute, PeriodicTask created via data migration), `select_for_update(skip_locked)` claiming
- Failed-post retry: automatic retry (2 attempts, backoff) for network-level errors only; manual retry endpoint for everything else
- REST: range/status list, create (immediate/scheduled/draft; product or uploaded image), edit and delete for draft/scheduled only, retry for failed
- Frontend: `/vendor/calendar` page in VendorShell (nav label "Publishing"), monthly grid with status-colored chips, composer modal (caption, platform toggles, product picker or image upload, date+time, Schedule / Save draft / Post now), edit/delete/retry flows

### Out of scope (later)

- Weekly calendar view, post preview rendering as it will appear on the platform, TikTok, AI caption generation in the composer, recurring posts, best-time suggestions, post analytics

## Architecture

### Model changes (`core.SocialMediaPost`)

| Change | Detail |
|---|---|
| `product` | `null=True, blank=True` (free-form posts) |
| `image` | `ImageField(upload_to='uploads/social_posts/', null=True, blank=True)` — used when no product, or overrides product image if both set |
| `scheduled_for` | `DateTimeField(null=True, blank=True)` — required for `scheduled`, optional otherwise |
| STATUS_CHOICES | add `('draft', 'Draft')`, `('scheduled', 'Scheduled')` — existing rows unaffected |

Validation invariant (enforced in the API layer): every post has a product or an uploaded image; `scheduled` posts have a future `scheduled_for` at creation time.

### Publisher service (`socials/services/publisher.py`)

`publish_post_record(record) -> record` — resolves the tenant's connected page, picks the image source (record.image first, else product processed_image/image), publishes via `MetaGraphClient.publish_page_photo` (facebook, direct file upload) or `publish_instagram_photo` (instagram, requires `PUBLIC_MEDIA_BASE_URL`-based public URL), and updates the record: `posted` + `platform_post_id` + `post_url`, or `failed` + `error_message`. Never raises for publish failures; raises only for infrastructure errors so callers/tasks can retry. The logic moves out of `socials/views.py::PublishPostView` (which becomes a thin caller) — behavior of the existing immediate-publish endpoint is unchanged.

### Scheduling engine

- Data migration creates an `IntervalSchedule` (60s) + `PeriodicTask` for `socials.tasks.publish_due_posts`
- `publish_due_posts`: inside `transaction.atomic()`, `SocialMediaPost.objects.select_for_update(skip_locked=True).filter(status='scheduled', scheduled_for__lte=now)` → set claimed rows to `pending`; after the transaction, publish each via a per-record task `publish_scheduled_post(post_id)` (queued), which calls `publish_post_record`
- The publisher raises a distinct `TransientPublishError` (defined in `publisher.py`) when the underlying failure is the client's network wrap ("Could not reach Facebook"); `publish_scheduled_post` declares `autoretry_for=(TransientPublishError,), max_retries=2, default_retry_delay=60`. Every other `MetaGraphError` marks the record `failed` immediately inside the publisher (no exception raised)
- Manual retry endpoint sets a `failed` record back to `pending` and queues `publish_scheduled_post`

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/socials/posts/?from=YYYY-MM-DD&to=YYYY-MM-DD&status=` | posts whose display date (COALESCE of `scheduled_for`, `created_at`) falls in the range; newest first |
| POST | `/api/socials/posts/` | multipart or JSON: `caption`, `platforms[]`, optional `product_id`, optional `image` file, optional `scheduled_for` (ISO), optional `save_as: 'draft'`. No `scheduled_for` and no draft → publish immediately (existing behavior, existing response shape `{results: [...]}`); with `scheduled_for` → creates `scheduled` records; `save_as='draft'` → `draft` records. Returns serialized records for non-immediate creates |
| PATCH | `/api/socials/posts/{id}/` | `caption`, `scheduled_for`, `image`; 400 `{'error': 'Only drafts and scheduled posts can be edited'}` unless status is `draft`/`scheduled`; setting `scheduled_for` on a draft promotes it to `scheduled` |
| DELETE | `/api/socials/posts/{id}/` | drafts and scheduled only; 400 otherwise |
| POST | `/api/socials/posts/{id}/retry/` | failed only; re-queues |

Serializer: `{id, platform, status, caption, image_url, product: {id, name} | null, scheduled_for, post_url, error_message, created_at}` where `image_url` resolves uploaded image → product processed image → product image → null. Tenant scoping identical to existing endpoints (cross-tenant → 404).

## Frontend

- `frontend/src/api/socials.ts`: `ScheduledPost` type + `listPosts(fromISO, toISO)`, `createPost(formData)`, `updatePost`, `deletePost`, `retryPost`
- `frontend/src/pages/PublishingCalendarPage.tsx` at `/vendor/calendar`, VendorShell nav item `{label: 'Publishing', icon: 'calendar_month'}`:
  - Month grid built with plain Date math (weeks × 7 cells), month navigation, today highlighted
  - Day cells list chips: platform badge + caption snippet, colored by status (draft = muted, scheduled = theme primary, posted = green, failed = red); overflow shows "+N more"
  - Composer modal (create from a day click, edit from a chip click): caption textarea with count, platform toggles gated by connected accounts, image source tabs (Products: searchable thumbnail list from `vendorApi` products; Upload: file input with preview), date+time inputs, buttons **Schedule** / **Save draft** / **Post now**; edit mode adds **Delete**; failed detail shows the error and **Retry**; posted detail is read-only with the live post link
  - Local component state (no Redux; matches OrdersPage pattern)
- Product create page's existing publish flow is untouched

## Testing

- Migration: existing SocialMediaPost rows keep working; new fields default sanely
- Publisher service: mocked client — product-image post, uploaded-image post, image precedence, missing-everything failure, IG public-URL failure path
- API: range filter, all three create modes, validation (no image+no product, past `scheduled_for`), lifecycle guards on PATCH/DELETE, retry only from failed, tenant scoping
- Beat: `publish_due_posts` claims due-only rows and queues them; `skip_locked` double-run safety; `publish_scheduled_post` success/permanent-failure/network-retry paths (mocked)
- Frontend: tsc clean; browser run — create scheduled post 1 minute out on the simulated page, watch beat flip it to failed (fake token) with visible error, exercise Retry, drafts, and the grid

## Success criteria

1. A post scheduled for a past-due time is published (or failed with reason) within ~60s by the beat pipeline without any request triggering it
2. Drafts, scheduled, posted, and failed posts all render on the correct calendar days with correct colors
3. Editing/deleting is possible exactly while draft/scheduled; retry exactly while failed
4. Free-form image posts and product posts both publish through the same pipeline
5. The existing immediate-publish flow from product creation is byte-for-byte unaffected; all suites green

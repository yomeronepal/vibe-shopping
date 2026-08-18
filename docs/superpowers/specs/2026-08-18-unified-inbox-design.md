# Unified Inbox Cycle — Facebook & Instagram DMs

**Date:** 2026-08-18
**Status:** Approved design, pending implementation plan
**Cycle:** 2 of the AI Social Commerce Platform roadmap (Phase 1 MVP)
**Depends on:** foundation cycle (`2026-08-18-foundation-meta-connection-design.md`), stacked on branch `feature/foundation-meta-connection` until PR #1 merges

## Context

The foundation cycle delivered Meta OAuth, Page/Instagram connection, and a webhook receiver that persists raw `WebhookEvent` rows and dispatches a Celery task that currently only logs. This cycle turns those events into a live inbox: Facebook Messenger and Instagram DMs become conversations the business reads and replies to from the dashboard, updated in real time over the already-running Channels/Daphne/Redis stack.

Decisions made with the project owner:

- **DMs only** this cycle: Messenger DMs and Instagram DMs. Post/media comments are the next iteration (different reply model).
- **Replies included**: send via Meta's Send API from the dashboard; the 24-hour messaging window error is surfaced clearly.
- **New `inbox` Django app**, per the agreed app-per-subsystem decomposition.
- **Deferred**: team assignment (no teams yet), AI replies and AI/human sender attribution (AI assistant cycle), comments, attachments sending (receiving attachments is stored/rendered; sending text only).

## Scope

### In scope

- `inbox` app with Customer, Conversation, Message models
- Webhook ingestion: `process_webhook_event` parses `page` and `instagram` messaging events into those models, idempotently
- Echo handling: messages the Page sent elsewhere appear as outbound
- Real-time push to open dashboards via a Channels consumer, tenant-scoped groups
- REST API: conversation list w/ filters, thread, send reply, mark read, change status
- Frontend: InboxPage (two-pane), inboxSlice, WebSocket hook with REST fallback, sidebar entry
- `MetaGraphClient.send_message()`

### Out of scope (later cycles)

- Comments ingestion/replies, conversation assignment, tags, notes, AI suggested/auto replies, sending attachments, search, message templates

## Architecture

### New Django app: `inbox`

**Customer**

| Field | Notes |
|---|---|
| tenant | FK Tenant |
| platform | facebook / instagram |
| platform_user_id | PSID (Messenger) or IGSID (Instagram) |
| name | best-effort from Graph profile fetch, blank fallback |
| profile_pic_url | best-effort, blank fallback |
| unique | (tenant, platform, platform_user_id) |

**Conversation**

| Field | Notes |
|---|---|
| tenant | FK Tenant |
| page | FK socials.ConnectedPage |
| customer | FK Customer |
| platform | facebook / instagram |
| status | new / open / waiting_business / waiting_customer / resolved |
| unread_count | int, incremented on inbound, reset by the read endpoint |
| last_message_at | drives list ordering |
| last_message_preview | first ~120 chars of the latest message |
| unique | (page, customer) |

**Message**

| Field | Notes |
|---|---|
| conversation | FK Conversation |
| direction | in / out |
| text | text body, blank if attachment-only |
| attachments | JSON list of {type, url} from Meta payloads |
| platform_message_id | unique; dedup key for webhook redelivery |
| sent_at | platform timestamp |

### Ingestion pipeline (Celery)

`socials.tasks.process_webhook_event` is extended (same task id/signature, existing dispatch untouched):

1. Load the `WebhookEvent`; if already `processed`, return (idempotent re-run)
2. For `object == 'page'`: iterate `entry[].messaging[]` (Messenger events). For `object == 'instagram'`: iterate the analogous messaging entries
3. Resolve `ConnectedPage` by the entry's page id (facebook) or `instagram_account_id` (instagram); unknown/disconnected page → skip entry
4. Determine direction: sender == page/IG id or `message.is_echo` → `out`; else `in`
5. Upsert Customer (Graph profile fetch on first sight, wrapped so failure leaves name blank)
6. Upsert Conversation; inbound bumps `unread_count` and sets status `waiting_business` from every prior status (a resolved conversation reopens this way); outbound sets `waiting_customer`
7. Create Message via `get_or_create(platform_message_id=...)` — redelivery-safe
8. Update `last_message_at` / `last_message_preview`
9. `group_send` to `inbox_<tenant_id>`: `{type, conversation, message}` payloads mirroring the REST serializers
10. Mark the event `processed`

Malformed entries are logged and skipped; the task never raises for content problems (retries stay reserved for infrastructure errors).

### Sending replies

`MetaGraphClient.send_message(page_id, page_token, recipient_id, text)` → `POST /{page_id}/messages` with `recipient={'id': ...}`, `message={'text': ...}`, `messaging_type=RESPONSE`. Works for both Messenger and Instagram recipients with the Page token. Returns the platform message id. Graph error subcode for the closed 24-hour window maps to a specific client message: "The 24-hour reply window for this conversation has closed." Other errors follow the foundation pattern (generic message + server-side warning log).

The send endpoint stores the outbound `Message` (using the returned platform message id, which also prevents the echo webhook from duplicating it), sets status `waiting_customer`, updates preview/timestamps, and pushes the same real-time event.

### Real-time channel

`inbox/consumers.py`: `InboxConsumer(AsyncWebsocketConsumer)` at `ws/inbox/?token=<drf-token>`. On connect: authenticate the DRF token (database lookup via `database_sync_to_async`), resolve the tenant, join group `inbox_<tenant_id>`, else close. Handlers relay `inbox.message` and `inbox.conversation_update` group events to the socket as JSON. Registered alongside the existing `vendor.routing` websocket urls in `asgi.py`.

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | /api/inbox/conversations/ | list, `-last_message_at`; query params `status`, `platform` |
| GET | /api/inbox/conversations/{id}/messages/ | thread, oldest first, `?before=<id>` pagination, page size 50 |
| POST | /api/inbox/conversations/{id}/messages/ | body `{text}`; sends + stores; 400 on empty text; 400 with `{'error': 'The 24-hour reply window for this conversation has closed.'}` on the closed-window Graph error |
| POST | /api/inbox/conversations/{id}/read/ | reset unread_count |
| PATCH | /api/inbox/conversations/{id}/ | body `{status}`, validated against the status set |
| WS | ws/inbox/ | tenant group stream |

All endpoints resolve the tenant from `request.user.vendor_profile.tenant`; conversation lookups are tenant-filtered (cross-tenant ids → 404).

## Frontend

- `frontend/src/api/inbox.ts`: typed API functions mirroring the endpoints
- `frontend/src/features/inbox/inboxSlice.ts`: conversations, activeConversationId, messages, statusFilter; thunks for the five endpoints; reducers applying WebSocket events
- `frontend/src/features/inbox/useInboxSocket.ts`: connects with the stored token, dispatches socket events, reconnects with backoff, refetches on reconnect
- `frontend/src/pages/InboxPage.tsx` at `/vendor/inbox`: conversation list pane (status filter tabs: All / Open / Waiting / Resolved; rows with platform badge, name, preview, unread count, relative time) and thread pane (bubbles by direction, attachments rendered as images/links, composer with send-on-Enter, resolve/reopen button, inline 24-hour-window error)
- Dashboard sidebar gains an Inbox link (same Link pattern as Products/Settings)

## Configuration & manual verification

- Tunnel: `ngrok http 8000`; add the ngrok host to `ALLOWED_HOSTS`; set the Meta app Webhooks product callback to `<tunnel>/api/webhooks/meta/` with the existing verify token; subscribe to `page → messages` and `instagram → messages` in the dashboard (Page-level subscription already made by the connect flow)
- Same tunnel enables `PUBLIC_MEDIA_BASE_URL` for Instagram publishing
- End-to-end: DM the Page from a personal account → conversation appears live → reply from the dashboard → reply arrives in Messenger/Instagram

## Testing

- Parser: fixture payloads for Messenger message, Instagram message, echo, attachment message, redelivered duplicate, unknown page — asserting model states and processed flags
- Send: mocked `MetaGraphClient`; success stores message and flips status; closed-window error surfaces the specific message; empty text 400
- API: tenant scoping (foreign conversation → 404), filters, read reset, status validation
- Consumer: token auth accept/reject, group event relay (Channels' `WebsocketCommunicator`)
- Frontend: tsc cleanliness on new files; browser run-through with a simulated inbound event

## Success criteria

1. A webhook messaging event (fixture or live) produces Customer, Conversation, and Message rows exactly once, even when redelivered
2. An open dashboard shows a new inbound DM without refresh
3. A reply sent from the dashboard arrives in the customer's Messenger/Instagram and appears in the thread as outbound
4. Unread counts, previews, ordering, and statuses behave per the model rules
5. No cross-tenant conversation access; all tests green

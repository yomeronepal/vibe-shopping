# Foundation Cycle — Business Auth & Meta Connection

**Date:** 2026-08-18
**Status:** Approved design, pending implementation plan
**Cycle:** 1 of the AI Social Commerce Platform roadmap (Phase 1 MVP)

## Context

The vibe-shopping repo is pivoting from a vendor-storefront app to an AI social commerce SaaS, per `AI Social Commerce Platform — Feature List.md`. Businesses connect Facebook Pages and Instagram professional accounts, an AI assistant handles customer conversations, extracts orders, and automates social operations.

This first cycle delivers the foundation everything else depends on: business authentication, business profile, Meta OAuth, Page/Instagram connection management, and reliable webhook receipt.

Decisions already made with the project owner:

- **Pivot, not extend:** repurpose this repo. Storefront-specific features (public store, cart, wardrobe, escrow wallet) are parked, not extended. Useful foundations (products, AI services, publishing, orders, Docker/Celery infra) are kept.
- **Meta status:** a Meta developer app exists in development mode with a test Page. Design targets dev mode now, app review later.
- **Lean auth:** email/password only, one user per business. Google auth, team members, roles, and billing are later cycles.
- **Structure:** evolve in place (Approach A). Keep `Tenant` as the business and existing DRF token auth. Add a new `socials` Django app for the Meta side. Later cycles add `inbox`, `assistant`, `crm` apps.

## Scope

### In scope

- Business signup (creates User + Tenant + owner VendorProfile), reusing existing token auth for login/logout
- Business profile view/edit endpoints
- Meta OAuth connect flow (Facebook login dialog, code exchange, long-lived token)
- Facebook Page connection: list, connect, disconnect, reconnect, status
- Instagram professional account detection via the connected Page
- Webhook receiver: Meta verify handshake, signature validation, event persistence, Celery dispatch
- Frontend: business signup/login wording, Connected Accounts settings page

### Out of scope (later cycles)

- Unified inbox UI and conversation models
- AI replies, order extraction, knowledge base
- Google auth, team management, roles, subscriptions/billing
- Post publishing and scheduling (existing stubs remain untouched)

## Architecture

### New Django app: `socials`

Owns everything Meta-facing. Three models:

**MetaConnection** — one per tenant.

| Field | Notes |
|---|---|
| tenant | FK Tenant, unique |
| fb_user_id | Facebook user who authorized |
| access_token | long-lived user token, Fernet-encrypted at rest |
| token_expires_at | nullable datetime |
| status | connected / expired / revoked |

**ConnectedPage** — a Facebook Page linked to a tenant.

| Field | Notes |
|---|---|
| tenant | FK Tenant |
| connection | FK MetaConnection |
| page_id | unique |
| name | Page display name |
| access_token | page access token, Fernet-encrypted |
| instagram_account_id | linked IG professional account, nullable |
| instagram_username | nullable |
| status | connected / disconnected / token_expired |

**WebhookEvent** — raw inbound Meta events.

| Field | Notes |
|---|---|
| object_type | page / instagram |
| payload | full JSON body |
| signature_valid | boolean |
| processed | boolean, consumed by later cycles |
| received_at | timestamp |

### Token encryption

Field-level encryption using `cryptography` Fernet. Key supplied via `FERNET_KEY` env var. Implemented as a small `EncryptedTextField` or encrypt/decrypt helpers in `socials/utils.py`. Tokens never appear in API responses, serializers, logs, or admin.

### Graph API isolation

All Graph API calls go through a single service class `socials/services/meta_graph.py` (`MetaGraphClient`): code exchange, long-lived token exchange, `/me/accounts`, page webhook subscription, IG account lookup. This is the only module that talks to `graph.facebook.com`, and the seam that tests mock.

## Flows

### Signup

1. `POST /api/auth/signup/` with email, password, business name
2. Backend creates User, Tenant, VendorProfile (role owner) in one transaction
3. Returns auth token (same shape as existing login)

### Meta connect

1. Dashboard requests `GET /api/socials/connect-url/`; backend builds the Facebook OAuth dialog URL with scopes `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, plus a signed `state` parameter bound to the tenant
2. User authorizes on facebook.com; Facebook redirects to the frontend callback route with `code`
3. Frontend posts code to `POST /api/socials/oauth/callback/`; backend validates `state`, exchanges code for a short-lived token, upgrades to long-lived, stores/updates `MetaConnection`, fetches `/me/accounts`, returns the Page list
4. User picks a Page; `POST /api/socials/pages/{page_id}/connect/` stores the page token, subscribes the Page to webhook fields (`messages`, `messaging_postbacks`, `feed`), looks up `instagram_business_account`, creates `ConnectedPage`
5. Disconnect unsubscribes webhook fields and marks the page disconnected; reconnect re-runs step 4

### Webhook receipt

1. `GET /api/webhooks/meta/` answers Meta's `hub.challenge` verify handshake using `META_WEBHOOK_VERIFY_TOKEN`
2. `POST /api/webhooks/meta/` computes HMAC-SHA256 of the raw body with the app secret and compares to `X-Hub-Signature-256`; mismatch returns 403 and the payload is discarded (logged without body)
3. Valid events are persisted as `WebhookEvent` rows and a Celery task is enqueued; the endpoint returns 200 immediately — Meta penalizes slow responders
4. This cycle's Celery task only marks bookkeeping; the inbox cycle will consume unprocessed events

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth/signup/ | none | create business + user, return token |
| GET, PATCH | /api/business/ | token | business profile: name, subdomain, metadata (description, contact phone, address stored as metadata keys) |
| GET | /api/socials/connect-url/ | token | OAuth dialog URL |
| POST | /api/socials/oauth/callback/ | token | exchange code, return Pages |
| GET | /api/socials/pages/ | token | connected Pages with status |
| POST | /api/socials/pages/{page_id}/connect/ | token | connect Page, subscribe webhooks |
| POST | /api/socials/pages/{page_id}/disconnect/ | token | disconnect Page |
| GET, POST | /api/webhooks/meta/ | signature | Meta verify + event receiver |

All tenant-scoped endpoints resolve the tenant from the authenticated user's VendorProfile; no tenant id is accepted from the client.

## Frontend

- Adapt `VendorSignupPage` / `VendorLoginPage` copy and payloads for business signup
- New Connected Accounts page under vendor settings: connect button, OAuth callback route, Page picker modal, status cards (Page name, IG username if linked, status badge), disconnect/reconnect actions
- Redux slice `socialsSlice` for connection state; follows existing feature/slice patterns

## Error handling

- Graph API failures during connect surface as actionable UI messages, never raw Graph errors
- Graph error code 190 (invalid/expired token) flips the relevant status to expired; UI prompts reconnection
- Webhook signature failure: 403, metadata logged, body discarded
- Webhook processing never blocks the 200 response; Celery task retries with backoff
- OAuth `state` mismatch: 400, connection aborted

## Configuration

New env vars: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_OAUTH_REDIRECT_URI`, `FERNET_KEY`. Local webhook testing requires a tunnel (ngrok or similar) pointed at the webhook endpoint. `.env` must remain gitignored; the existing exposed Gemini key should be rotated.

## Testing

- TDD throughout; Django test runner
- `MetaGraphClient` mocked in all tests; no live Meta calls in the suite
- Coverage: signup transaction, tenant scoping, connect-url state signing, callback exchange, page connect/disconnect, webhook verify handshake, valid/invalid signature, event persistence, token encryption round-trip, tokens absent from serialized output
- Manual end-to-end: dev-mode Meta app, test Page, tunnel for webhooks

## Success criteria

1. A new business can sign up, log in, and edit its profile
2. The business can connect the dev-mode test Page and see its linked Instagram account with connected status
3. Sending a DM to the test Page produces a persisted, signature-valid `WebhookEvent`
4. Disconnect and reconnect both work and statuses reflect reality
5. No token is retrievable through any API response or admin page

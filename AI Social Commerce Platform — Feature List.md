# AI Social Commerce Platform

An AI-powered social commerce platform that helps businesses manage **Facebook and Instagram conversations, products, orders, content, customers, and sales** from a single dashboard.

The platform acts as an **AI sales assistant** that can communicate with customers, recommend products, capture orders, and automate social-media operations.

---

> **Build status (2026-08-19, PRs #1–#10):** The platform is live end-to-end against real Meta APIs. **Foundation & integration** (#1–#3): business auth/profile, Meta OAuth with encrypted tokens, Facebook Page + Instagram connection with New Pages Experience support, signature-validated webhooks. **Unified inbox** (#4): FB/IG DMs with real-time WebSocket updates and replies via the Send API. **Publishing** (#5): monthly content calendar with scheduled/draft/immediate posts, Facebook & Instagram feed posts and stories via Celery Beat, failed-post retry. **Engagement analytics** (#5–#6): per-product Facebook/Instagram likes/comments/shares with 5-minute automatic refresh. **Product lifecycle & dashboard** (#7): reworked create page, draft→publish→archive→restore→delete with order-history-safe deletion, product editing that syncs captions to published Facebook posts, live-data vendor dashboard. **Vendor orders & invoices** (#8–#9): manual/POS order creation with stock deduction, printable invoices, invoice delivery straight into the customer's Messenger thread, fully editable store profile. **AI assistant** (#10): Copilot reply drafts in the inbox (manual + auto-draft on new messages) grounded strictly in the product catalog and a vendor-managed knowledge base, plus AI order capture that extracts items/quantities/customer from the chat into a prefilled, human-approved order. 200+ backend tests green; every cycle verified in a real browser, AI verified against live Gemini. **AI sales agent** (#12–#14): opt-in auto-reply bot that answers customers by itself (grounded, debounced, per-conversation pause, AI-labeled messages, unread preserved for vendor review); automatic order creation from chat using a vendor-defined info template (name/phone/address + custom fields) with atomic stock handling and in-chat confirmation — proven with a real order placed entirely through Messenger on the live Page; Facebook & Instagram comments ingested into the inbox and answered via private DM (comment-to-chat), with the commented post mapped back to the catalog product so "pp" gets that product's price.

## 🚀 Core Features

### 1. Authentication & Business Management

- [x] Business signup and login
- [x] Email/password authentication
- [ ] Google authentication
- [x] Business profile
- [x] Business settings
- [ ] Team member management
- [ ] Role-based permissions
- [ ] Subscription and billing management

---

## 🔗 2. Social Account Integration

### Facebook

- [x] Connect Facebook account
- [x] Connect Facebook Pages
- [x] Facebook OAuth
- [x] Page access token management
- [x] Page connection status
- [x] Disconnect/reconnect Page
- [x] Facebook Page messaging
- [x] Facebook comments (ingested to inbox, answered via private DM)
- [x] Facebook post publishing
- [x] Facebook webhooks (receiver with signature validation; live delivery needs a public URL/tunnel)
- [x] New Pages Experience support (granular-scope Page and Instagram resolution)

### Instagram

- [x] Connect Instagram Professional account
- [x] Instagram OAuth
- [x] Account connection status
- [x] Disconnect/reconnect account
- [x] Instagram DMs
- [x] Instagram comments (ingested to inbox, answered via private DM)
- [x] Instagram post publishing (requires PUBLIC_MEDIA_BASE_URL for image hosting)
- [x] Instagram webhooks (DM ingestion live; live delivery needs a public URL/tunnel)

---

# 💬 3. Unified Social Inbox

Manage customer conversations from one dashboard.

- [x] Instagram DMs
- [x] Facebook messages
- [x] Instagram comments
- [x] Facebook comments
- [x] Conversation list
- [x] Unread message count
- [x] Search conversations (by customer name, message text, or tag)
- [x] Conversation history
- [x] Customer profile
- [x] Conversation tags (add/remove in the thread, shown in the list, searchable)
- [ ] Internal notes
- [ ] Assign conversation to team member
- [x] Mark conversation as resolved
- [x] Real-time inbox updates over WebSocket
- [x] Reply to DMs from the dashboard (24-hour window enforced)
- [x] Conversation status
- [x] Message attachments (receiving and display; sending later)
- [x] Human takeover (pause the bot per conversation)
- [x] AI takeover (opt-in auto-reply bot)

### Conversation statuses

- [x] New
- [x] Open
- [x] Waiting for customer
- [x] Waiting for business
- [x] Resolved

---

# 🤖 4. AI Customer Assistant

AI automatically handles repetitive customer conversations.

### Customer Questions

- [x] Product questions
- [x] Price questions
- [x] Availability questions
- [x] Size questions (per-size stock from the catalog)
- [x] Color questions (color variants with per-size stock)
- [x] Delivery questions (from knowledge base)
- [x] Payment questions (from knowledge base)
- [x] Return/exchange questions (from knowledge base)
- [x] Business FAQ questions (from knowledge base)

### AI Capabilities

- [x] Automatic replies (opt-in bot with debounce and safety rails)
- [x] AI suggested replies (manual button + auto-draft on new messages)
- [x] Context-aware responses (conversation history + store profile)
- [x] Customer intent detection (purchase intent for order capture)
- [x] Product recommendations (catalog-only suggestions when items are unavailable or asked)
- [x] FAQ answering
- [x] Customer sentiment detection (per conversation, upset customers flagged in the list)
- [x] Conversation summarization (Summary button in the thread)
- [x] Human handoff (bot pauses itself and promises a team member when the customer is upset or asks for a person)
- [x] Multi-language support
- [x] Nepali language support
- [x] English language support
- [x] Nepali-English mixed language support

---

# 🛍️ 5. Product Catalog

Businesses can maintain their products and inventory.

### Product Management

- [x] Create product
- [x] Update product
- [x] Delete product (blocked when order history exists; archive instead)
- [x] Archive and restore product
- [x] Save product as draft, publish later
- [x] Product name
- [x] Product description
- [x] Product images
- [x] Product price
- [x] SKU (auto-generated per store, shown on product pages, searchable)
- [x] Category
- [x] Product variants
- [x] Sizes
- [x] Colors
- [x] Stock quantity

### AI Integration

- [x] AI reads product catalog
- [x] AI answers product questions
- [x] AI checks product availability
- [x] AI recommends products (catalog-only)
- [x] AI prevents unsupported product claims (prices/stock only from catalog)

---

# 📦 6. AI Order Management

Convert social conversations into structured orders.

### Order Creation

- [x] Extract product from conversation
- [x] Extract quantity
- [x] Extract size
- [x] Extract color
- [x] Extract customer name
- [x] Extract phone number
- [x] Extract delivery address
- [x] Confirm order details (prefilled order form, human approves)
- [x] Create order automatically (when items + all template fields are collected)
- [x] Manual order creation (with stock deduction and totals)

### Order Status

- [x] Pending confirmation (pending payment / pending delivery)
- [x] Confirmed (completed)
- [x] Preparing
- [x] Shipped
- [x] Delivered
- [x] Cancelled
- [x] Returned

### Order Management

- [x] Order dashboard
- [x] Order status updates from the dashboard
- [x] Order search (id, customer, phone, product)
- [x] Order filtering (by status)
- [x] Order history
- [x] Customer order history (Orders button in the chat thread)
- [x] Order notifications (status changes DM the customer automatically for chat orders)
- [x] Invoice generation (printable / save as PDF)
- [x] Send invoice to the customer via Messenger

---

# 📦 7. Inventory Management

- [x] Product stock management
- [x] Variant stock management
- [x] Automatic stock deduction on orders
- [x] Low-stock alerts (Inventory alerts card on the dashboard)
- [x] Out-of-stock status
- [x] Stock history (every movement logged with reason, shown on the product page)
- [x] SKU management (auto-generated tenant-prefixed codes, POS lookup)
- [x] Inventory search
- [x] Inventory filtering (drafts / low stock / archived / out of stock)

---

# ✍️ 8. AI Content Generator

Generate social-media content automatically.

### Content Types

- [x] Instagram captions
- [x] Facebook posts
- [x] Product descriptions
- [x] Promotional messages
- [x] TikTok captions (generation; TikTok publishing not connected)
- [x] Hashtags (included per content type)
- [x] Ad copy
- [x] Customer announcements

### AI Options

- [x] Nepali content
- [x] English content
- [x] Nepali-English content
- [x] Professional tone
- [x] Casual tone
- [x] Promotional tone
- [x] Custom brand voice (store name, bio, and brand vibes shape every generation)

---

# 📸 9. AI Creative Assistant

- [x] Product image analysis
- [x] Background removal
- [x] Product description from image
- [ ] Social-media creative generation
- [ ] Promotional banner generation
- [ ] Multiple caption generation
- [x] Image optimization
- [ ] Social-media image resizing

---

# 📅 10. Social Media Publishing

### Post Management

- [x] Create post
- [x] Save draft
- [x] Preview post (live platform-style preview in the composer)
- [x] Publish immediately
- [x] Schedule post
- [x] Edit scheduled post
- [x] Delete scheduled post (drafts, scheduled, and failed; themed confirmation)
- [x] Post publishing status
- [x] Publish product to selected platforms from product creation
- [x] Per-platform post result log (SocialMediaPost)
- [x] Failed-post retry
- [x] Facebook & Instagram stories
- [x] Edit captions of published Facebook posts when a product changes

### Publishing Channels

- [x] Facebook
- [x] Instagram

### Content Calendar

- [x] Monthly calendar
- [x] Weekly calendar (month/week toggle)
- [x] Scheduled posts
- [x] Published posts
- [x] Draft posts

---

# 👤 11. Customer CRM

Automatically maintain customer profiles.

### Customer Information

- [x] Customer name
- [x] Social account
- [x] Phone number (auto-filled from chat orders, editable)
- [x] Email (auto-filled from chat orders, editable)
- [x] Location (auto-filled from the delivery address, editable)
- [x] Tags
- [x] Notes
- [x] Customer status (prospect / customer / repeat, computed from orders)

### Customer History

- [x] Conversation history
- [x] Order history
- [x] Total spending
- [x] Last purchase
- [x] Product interests (from their order history)
- [x] Customer activity (last active timestamp)

---

# 🔁 12. Automated Customer Follow-ups

- [x] Abandoned-order follow-up (hourly sweep nudges unfinished chat orders once)
- [x] Order confirmation (chat orders confirmed in-thread with the order number)
- [x] Shipping notification (automatic DM on status change)
- [x] Delivery notification (automatic DM on status change)
- [x] Review request (delivered notification asks for feedback)
- [x] Repeat-purchase reminder (campaign to the buyers audience)
- [x] New-product notification (customer campaigns)
- [x] Promotional campaigns (audience-targeted DMs, window-aware)
- [x] Custom follow-up rules (configurable delay and message)

---

# 🧠 13. Business Knowledge Base

Businesses can provide information that AI should use when responding.

### Knowledge Sources

- [x] FAQs
- [x] Product information (live catalog)
- [x] Return policy
- [x] Delivery policy
- [x] Payment instructions
- [x] Business information (store profile)
- [x] Custom instructions (free-text knowledge box)
- [x] Documents (.txt/.md/.csv/.pdf uploads feed the AI, up to 3)
- [x] Website content (fetch a page into the AI knowledge)

### AI Controls

- [x] Business-specific AI context
- [x] Custom system instructions (knowledge box + voice settings shape the system prompt)
- [x] Brand tone (assistant tone setting: friendly / professional / casual)
- [x] Allowed languages (assistant language setting: match customer / English / Nepali / mixed)
- [x] Restricted topics (AI politely declines and steers back to the shop)
- [x] Human approval rules (Copilot: every reply and order is human-approved)

---

# 🧑‍💼 14. AI + Human Collaboration

Businesses should always be able to control the AI.

### AI Modes

- [x] Full AI automation (auto-reply bot)
- [x] AI Copilot
- [x] Human-only mode (assistant toggle off)

### Controls

- [x] AI suggested response
- [x] Approve AI response
- [x] Edit AI response
- [x] Send manually
- [x] Pause AI (settings toggle)
- [x] Resume AI (settings toggle)
- [x] Human takeover (replying manually pauses the bot for that chat automatically)
- [x] Escalate conversation (automatic on negative sentiment / human request)

---

# 🛡️ 15. AI Safety & Business Rules

- [x] Prevent AI hallucinated product information
- [x] Product availability validation
- [x] Price validation (extracted orders validated against the catalog)
- [ ] Discount limits
- [ ] Maximum order value for automatic confirmation
- [ ] Human approval for refunds
- [ ] Human approval for high-value orders
- [x] Restricted topics
- [x] Brand-specific instructions (brand voice from the store profile)
- [ ] AI response logs
- [ ] AI error monitoring

---

# 📊 16. Analytics & Reporting

### Sales Analytics

- [x] Total orders (dashboard)
- [x] Total revenue (dashboard)
- [ ] Average order value
- [ ] Conversion rate
- [ ] Best-selling products
- [ ] Repeat customers
- [ ] Cancelled orders
- [ ] Returned orders

### Social Analytics

- [ ] Messages received
- [ ] Response time
- [ ] Comments
- [x] Engagement (per-product likes/comments/shares, auto-refreshed)
- [ ] Followers
- [x] Post performance (per-post engagement on the product analytics page)
- [ ] Best-performing posts
- [ ] Best-performing products

### AI Analytics

- [ ] AI conversations
- [ ] AI resolution rate
- [ ] Human handoff rate
- [x] AI-generated orders (Chat bot badge + collected fields on the Orders page)
- [ ] AI conversion rate
- [ ] AI usage
- [ ] AI cost tracking

---

# 🔔 17. Notifications

- [ ] New order notification
- [ ] New message notification
- [ ] Human assistance required
- [x] Low-stock notification (dashboard inventory alerts)
- [ ] Failed post notification
- [ ] Payment notification
- [ ] Delivery notification
- [ ] Email notifications
- [ ] Dashboard notifications
- [ ] Push notifications

---

# 💳 18. Payment Integration

### Future Integrations

- [ ] eSewa
- [ ] Khalti
- [ ] Bank transfer
- [ ] QR payments
- [ ] Cash on delivery

### Payment Features

- [ ] Payment request
- [ ] Payment verification
- [ ] Payment status
- [ ] Payment history
- [ ] Refund management
- [ ] Payment reconciliation

---

# 🚚 19. Delivery Integration

### Delivery Providers

- [ ] Pathao
- [ ] Local courier
- [ ] Merchant delivery
- [ ] Multiple delivery providers

### Delivery Features

- [ ] Delivery address
- [ ] Delivery fee
- [ ] Delivery assignment
- [ ] Shipment creation
- [ ] Tracking
- [ ] Delivery status
- [ ] COD collection
- [ ] Delivery settlement

---

# 👥 20. Team Management

- [ ] Invite team members
- [ ] Team roles
- [ ] Admin
- [ ] Manager
- [ ] Agent
- [ ] Conversation assignment
- [ ] Order assignment
- [ ] Team activity
- [ ] Audit logs

---

# 💰 21. SaaS Subscription

### Starter

- [ ] 1 social account
- [ ] Limited AI conversations
- [ ] Basic inbox
- [ ] Basic AI replies

### Business

- [ ] Facebook + Instagram
- [ ] Higher AI limits
- [ ] AI order creation
- [x] Product catalog
- [ ] CRM
- [ ] Analytics
- [ ] Content generation

### Pro

- [ ] Multiple social accounts
- [ ] Multiple team members
- [ ] Advanced automation
- [ ] AI campaigns
- [ ] Advanced analytics
- [ ] Higher AI limits
- [ ] Priority support

---

# 🔐 22. Security

- [x] Token authentication (DRF token auth)
- [x] OAuth security
- [x] Encrypted access tokens
- [ ] Secure secret management
- [ ] Role-based authorization
- [x] Business data isolation
- [x] API rate limiting
- [x] Webhook signature validation
- [ ] Audit logs
- [ ] Data backup
- [ ] Data deletion
- [ ] Account deletion

---

# 🏗️ Recommended Development Roadmap

## Phase 1 — MVP

- [x] Authentication
- [x] Business profile
- [x] Meta OAuth
- [x] Facebook Page connection
- [x] Instagram connection
- [x] Webhooks (receiver built; live delivery needs a public URL)
- [x] Unified inbox
- [x] Product catalog
- [x] AI customer replies (Copilot)
- [x] AI order extraction
- [x] Basic order management

## Phase 2 — Social Commerce

- [x] Facebook post publishing
- [x] Instagram post publishing (requires PUBLIC_MEDIA_BASE_URL for image hosting)
- [x] AI content generation
- [x] Post scheduling
- [x] Customer CRM
- [x] Inventory management (stock editing, deduction, filters)
- [ ] Analytics

## Phase 3 — Automation

- [x] Automated follow-ups
- [ ] AI campaigns
- [ ] Product recommendations
- [x] AI sales agent (chat → info gathering → order)
- [x] Business knowledge base
- [ ] Advanced AI controls

## Phase 4 — Commerce Infrastructure

- [ ] eSewa
- [ ] Khalti
- [ ] QR payments
- [ ] COD
- [ ] Delivery integrations
- [ ] Automated payment reconciliation

## Phase 5 — AI Business Employee

- [ ] Autonomous sales campaigns
- [ ] AI marketing manager
- [ ] AI customer support agent
- [ ] AI sales agent
- [ ] AI inventory assistant
- [ ] AI business analyst
- [ ] AI-generated business recommendations

---

# 🎯 Long-Term Vision

The end goal is not simply an AI chatbot.

The product should become an **AI employee for small businesses**.

A business owner should eventually be able to say:

> **"I have 20 new products. Promote them this week, answer customers, recommend the right products, capture orders, follow up with interested customers, and show me the results."**

The platform handles:

**Content → Publishing → Conversations → Recommendations → Orders → Payments → Delivery → Follow-ups → Analytics**

That is the product direction with the strongest potential for turning this from a small AI tool into a real SaaS business.
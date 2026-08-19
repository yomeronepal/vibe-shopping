# AI Social Commerce Platform

An AI-powered social commerce platform that helps businesses manage **Facebook and Instagram conversations, products, orders, content, customers, and sales** from a single dashboard.

The platform acts as an **AI sales assistant** that can communicate with customers, recommend products, capture orders, and automate social-media operations.

---

> **Build status (2026-08-19):** Two cycles complete. **Foundation + publishing** (PR #1): business auth/profile, Meta OAuth with encrypted tokens, Facebook Page + Instagram connection, signature-validated webhook receiver, product publishing to Facebook/Instagram with per-platform result tracking. **Unified inbox + dashboard sweep** (PR #2, stacked): Messenger and Instagram DMs ingested into conversations (idempotent, echo-aware), real-time WebSocket inbox at /vendor/inbox with replies via Meta's Send API, conversation statuses/unread/read-state, a shared themed VendorShell across Inbox/Orders/Products/Settings with mobile navigation, and a new vendor Orders page with live status management (GET/PATCH /api/vendor/orders/). 120+ backend tests green; verified end-to-end in a real browser including live no-reload message arrival. Remaining to go live: ngrok tunnel + Meta webhook dashboard config (also unlocks Instagram publishing via PUBLIC_MEDIA_BASE_URL). **AI sales agent** (#12–#14): opt-in auto-reply bot that answers customers by itself (grounded, debounced, per-conversation pause, AI-labeled messages, unread preserved for vendor review); automatic order creation from chat using a vendor-defined info template (name/phone/address + custom fields) with atomic stock handling and in-chat confirmation — proven with a real order placed entirely through Messenger on the live Page; Facebook & Instagram comments ingested into the inbox and answered via private DM (comment-to-chat), with the commented post mapped back to the catalog product so "pp" gets that product's price.

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
- [ ] Search conversations
- [x] Conversation history
- [x] Customer profile
- [ ] Conversation tags
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

- [ ] Product questions
- [ ] Price questions
- [ ] Availability questions
- [ ] Size questions
- [ ] Color questions
- [ ] Delivery questions
- [ ] Payment questions
- [ ] Return/exchange questions
- [ ] Business FAQ questions

### AI Capabilities

- [x] Automatic replies (opt-in bot with debounce and safety rails)
- [ ] AI suggested replies
- [ ] Context-aware responses
- [ ] Customer intent detection
- [ ] Product recommendations
- [ ] FAQ answering
- [ ] Customer sentiment detection
- [ ] Conversation summarization
- [ ] Human handoff
- [ ] Multi-language support
- [ ] Nepali language support
- [ ] English language support
- [ ] Nepali-English mixed language support

---

# 🛍️ 5. Product Catalog

Businesses can maintain their products and inventory.

### Product Management

- [x] Create product
- [ ] Update product
- [ ] Delete product
- [x] Product name
- [x] Product description
- [x] Product images
- [x] Product price
- [ ] SKU
- [x] Category
- [x] Product variants
- [x] Sizes
- [x] Colors
- [x] Stock quantity

### AI Integration

- [ ] AI reads product catalog
- [ ] AI answers product questions
- [ ] AI checks product availability
- [ ] AI recommends products
- [ ] AI prevents unsupported product claims

---

# 📦 6. AI Order Management

Convert social conversations into structured orders.

### Order Creation

- [ ] Extract product from conversation
- [ ] Extract quantity
- [ ] Extract size
- [ ] Extract color
- [ ] Extract customer name
- [x] Extract phone number
- [x] Extract delivery address
- [ ] Confirm order details
- [x] Create order automatically (when items + all template fields are collected)
- [ ] Manual order creation

### Order Status

- [ ] Pending confirmation
- [ ] Confirmed
- [ ] Preparing
- [x] Shipped
- [x] Delivered
- [x] Cancelled
- [ ] Returned

### Order Management

- [x] Order dashboard
- [x] Order status updates from the dashboard
- [ ] Order search
- [ ] Order filtering
- [x] Order history
- [ ] Customer order history
- [ ] Order notifications

---

# 📦 7. Inventory Management

- [ ] Product stock management
- [ ] Variant stock management
- [ ] Automatic stock deduction
- [ ] Low-stock alerts
- [ ] Out-of-stock status
- [ ] Stock history
- [ ] SKU management
- [ ] Inventory search
- [ ] Inventory filtering

---

# ✍️ 8. AI Content Generator

Generate social-media content automatically.

### Content Types

- [ ] Instagram captions
- [ ] Facebook posts
- [x] Product descriptions
- [ ] Promotional messages
- [ ] TikTok captions
- [ ] Hashtags
- [ ] Ad copy
- [ ] Customer announcements

### AI Options

- [ ] Nepali content
- [ ] English content
- [ ] Nepali-English content
- [ ] Professional tone
- [ ] Casual tone
- [ ] Promotional tone
- [ ] Custom brand voice

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
- [ ] Save draft
- [ ] Preview post
- [x] Publish immediately
- [ ] Schedule post
- [ ] Edit scheduled post
- [ ] Delete scheduled post
- [x] Post publishing status
- [x] Publish product to selected platforms from product creation
- [x] Per-platform post result log (SocialMediaPost)
- [ ] Failed-post retry

### Publishing Channels

- [x] Facebook
- [x] Instagram

### Content Calendar

- [ ] Monthly calendar
- [ ] Weekly calendar
- [ ] Scheduled posts
- [ ] Published posts
- [ ] Draft posts

---

# 👤 11. Customer CRM

Automatically maintain customer profiles.

### Customer Information

- [ ] Customer name
- [ ] Social account
- [ ] Phone number
- [ ] Email
- [ ] Location
- [ ] Tags
- [ ] Notes
- [ ] Customer status

### Customer History

- [x] Conversation history
- [x] Order history
- [ ] Total spending
- [ ] Last purchase
- [ ] Product interests
- [ ] Customer activity

---

# 🔁 12. Automated Customer Follow-ups

- [ ] Abandoned-order follow-up
- [ ] Order confirmation
- [ ] Shipping notification
- [ ] Delivery notification
- [ ] Review request
- [ ] Repeat-purchase reminder
- [ ] New-product notification
- [ ] Promotional campaigns
- [ ] Custom follow-up rules

---

# 🧠 13. Business Knowledge Base

Businesses can provide information that AI should use when responding.

### Knowledge Sources

- [ ] FAQs
- [ ] Product information
- [ ] Return policy
- [ ] Delivery policy
- [ ] Payment instructions
- [ ] Business information
- [ ] Custom instructions
- [ ] Documents
- [ ] Website content

### AI Controls

- [ ] Business-specific AI context
- [ ] Custom system instructions
- [ ] Brand tone
- [ ] Allowed languages
- [ ] Restricted topics
- [ ] Human approval rules

---

# 🧑‍💼 14. AI + Human Collaboration

Businesses should always be able to control the AI.

### AI Modes

- [x] Full AI automation (auto-reply bot)
- [ ] AI Copilot
- [ ] Human-only mode

### Controls

- [ ] AI suggested response
- [ ] Approve AI response
- [ ] Edit AI response
- [ ] Send manually
- [ ] Pause AI
- [ ] Resume AI
- [ ] Human takeover
- [ ] Escalate conversation

---

# 🛡️ 15. AI Safety & Business Rules

- [ ] Prevent AI hallucinated product information
- [ ] Product availability validation
- [ ] Price validation
- [ ] Discount limits
- [ ] Maximum order value for automatic confirmation
- [ ] Human approval for refunds
- [ ] Human approval for high-value orders
- [ ] Restricted topics
- [ ] Brand-specific instructions
- [ ] AI response logs
- [ ] AI error monitoring

---

# 📊 16. Analytics & Reporting

### Sales Analytics

- [ ] Total orders
- [ ] Total revenue
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
- [ ] Engagement
- [ ] Followers
- [ ] Post performance
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
- [ ] Low-stock notification
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
- [ ] AI customer replies
- [ ] AI order extraction
- [x] Basic order management

## Phase 2 — Social Commerce

- [x] Facebook post publishing
- [x] Instagram post publishing (requires PUBLIC_MEDIA_BASE_URL for image hosting)
- [ ] AI content generation
- [ ] Post scheduling
- [ ] Customer CRM
- [ ] Inventory management
- [ ] Analytics

## Phase 3 — Automation

- [ ] Automated follow-ups
- [ ] AI campaigns
- [ ] Product recommendations
- [x] AI sales agent (chat → info gathering → order)
- [ ] Business knowledge base
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
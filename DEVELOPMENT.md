# Development Status

This document describes the current state of the MurcurJS project and what has been implemented.

## Project Overview

MurcurJS is an e-commerce marketplace built on Medusa.js with:
- OAuth2 authentication for external service integration
- Webhook-based order synchronization
- Async MQTT messaging pattern for API requests
- Go adapter service for field transformations

**Note:** The "platform" concept has been removed for simplicity. MercurJS (Medusa) represents the marketplace platforms (Shopee, Lazada, TikTok). External services integrate directly without needing to specify a platform.

## Architecture

```
  External Services                         MercurJS (Medusa)
  (Third-party Apps)                    ┌─────────────────────────┐
                                        │  Represents Platforms:  │
 ┌──────────────────┐                   │  Shopee, Lazada, TikTok │
 │  Mobile App      │                   └─────────────────────────┘
 │  ERP System      │                              │
 │  Inventory Sync  │                              │
 └────────┬─────────┘     ┌─────────────┐     ┌────▼────────┐
          │               │ Admin Panel │     │Vendor Panel │
          │               │   :5173     │     │   :7000     │
          │               └──────┬──────┘     └──────┬──────┘
          │                      │                   │
          │ MQTT                 └───────────────────┘
          │                               │ HTTP
          ▼                               ▼
   ┌─────────────┐                 ┌─────────────┐
   │ Mosquitto   │◄───────────────►│  MercurJS   │
   │(MQTT Broker)│                 │   :9000     │
   │ :1883/:9001 │                 └──────┬──────┘
   └──────┬──────┘                        │
          │                               │
          │ Subscribe                     │
          ▼                               │
   ┌─────────────┐                        │
   │   Adapter   │◄───────────────────────┘
   │   :3001     │        HTTP API
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │  PostgreSQL │
   │    :5432    │
   └─────────────┘
```

**Data Flow:**
- External services publish requests to MQTT → Adapter consumes and calls MercurJS API
- Adapter publishes responses to MQTT → External services receive via subscription
- MercurJS is the marketplace platform that manages Shopee/Lazada/TikTok seller data
- Adapter handles OAuth tokens, field mapping, and API proxying for external integrations

**Messaging Choice - MQTT vs Message Queues:**

| Feature | MQTT (Mosquitto) | RabbitMQ | Kafka |
|---------|------------------|----------|-------|
| Type | Pub/Sub Protocol | Message Queue (AMQP) | Event Streaming |
| Use Case | IoT, Real-time | Task queues, Routing | High-throughput logs |
| Persistence | Limited | Yes | Yes (log-based) |
| Browser Support | WebSocket | No native | No native |
| Complexity | Simple | Medium | High |

We use **MQTT (Mosquitto)** because:
- WebSocket support for browser clients (port 9001)
- Lightweight pub/sub for real-time responses
- Simple setup for development

For production with high reliability needs, consider RabbitMQ or Kafka.

## What Has Been Implemented

### 1. Docker Compose Setup (`docker-compose.yml`)

All services orchestrated with Docker Compose:
- **mercurjs**: Medusa backend on port 9000
- **admin-panel**: Admin UI on port 5173
- **vendor-panel**: Seller dashboard on port 7000
- **webui**: OAuth flow helper on port 3100
- **adapter**: Go service on port 3001
- **postgres**: Database on port 5432
- **mqtt**: Eclipse Mosquitto broker (MQTT: 1883, WebSocket: 9001)
- **pgadmin**: Database management on port 5050

### 2. OAuth2 Flow

Complete OAuth2 authorization code flow:

```
WebUI → MercurJS /oauth/authorize → User Login → Adapter /oauth/callback → Token Exchange → Redirect to Seller Page
```

**Key files:**
- `mercur/backend/src/api/oauth/` - OAuth endpoints (authorize, token)
- `mercur/backend/src/modules/oauth/` - OAuth module (client, token, code models)
- `adapter/internal/controllers/oauth.go` - Callback handler
- `adapter/internal/services/oauth.go` - Token exchange service
- `webui/index.html` - Connect form

### 3. Async MQTT Messaging Pattern

API requests flow through MQTT for async processing:

```
OMS publishes to MQTT → Returns request_id immediately
                                    ↓
Adapter (consumer) consume receives message → Calls MercurJS API → Adapter (publisher) Publishes response status to MQTT
```

**Topic Lifecycle (per request):**
1. WebUI makes HTTP request to Adapter
2. Adapter publishes to `requests/api_request`
3. Adapter returns `{ request_id, response_topic }` immediately
4. WebUI subscribes to specific `responses/{request_id}`
5. Consumer processes request, publishes to response topic
6. WebUI receives response, unsubscribes from topic
7. On timeout, WebUI also unsubscribes to clean up

**Key files:**
- `adapter/internal/controllers/api.go` - HTTP handlers that publish to MQTT
- `adapter/internal/services/consumer.go` - MQTT message consumer
- `adapter/internal/broker/` - MQTT publisher/consumer
- `webui/seller.html` - Subscribes/unsubscribes per request via WebSocket

### 4. Token Management with Refresh

The adapter stores OAuth tokens and automatically refreshes them:

**Key file:** `adapter/internal/api/mercurjs.go`
- Stores tokens per shop_id (obtained from OAuth token response)
- Checks token expiry before requests
- Refreshes tokens with client credentials
- Retries on 401 responses

### 5. Field Mapping

Field transformations for external services:

**Key files:**
- `adapter/internal/mapper/mapper.go` - Field mapping logic
- `adapter/internal/repository/field_mapping.go` - Database queries
- `scripts/init-db.sql` - Seed data with default mappings

Example mappings (external → MercurJS format):
- `id` → `shop_id` (seller)
- `name` → `shop_name` (seller)
- `id` → `item_id` (product)
- `title` → `item_name` (product)

All mappings now use `platform_id = 'default'` since platform concept was removed.

### 6. Webhook Support

Order webhook notifications:

**Key files:**
- `mercur/backend/src/modules/webhook/` - Webhook module
- `mercur/backend/src/subscribers/order-created-webhook.ts` - Order event subscriber
- `adapter/internal/controllers/webhook.go` - Webhook receiver

## External Service Integration

This section describes how external services (e.g., mobile apps, ERP systems, inventory sync tools) integrate with MercurJS through the adapter.

**Note:** MercurJS/Medusa represents the marketplace platforms (Shopee, Lazada, TikTok). External services are third-party applications that want to access marketplace data.

### Integration Methods

External services can communicate with the adapter via:
1. **Webhooks** - For receiving events from MercurJS (e.g., order created)
2. **MQTT** - For sending API requests to MercurJS

### 1. Webhook Integration (MercurJS → Adapter)

When events occur (e.g., order created), MercurJS sends webhooks to registered endpoints.

**Flow:**
```
1. External service registers webhook URL with MercurJS
2. MercurJS generates a unique secret for this registration
3. When event occurs, MercurJS sends POST to webhook URL
4. Adapter verifies signature and processes the event
```

**MercurJS sends to Adapter:**

```http
POST /hook HTTP/1.1
Content-Type: application/json
X-Webhook-Signature: a]1b2c3d4e5f6...  (HMAC-SHA256 hex)
X-Webhook-Event: order.created

{
  "event_type": "order.created",
  "timestamp": "2026-02-10T12:00:00.000Z",
  "data": {
    "order_id": "order_001",
    "store_id": "store_123",
    "items": [...]
  }
}
```

**Headers Explained:**

| Header | Description |
|--------|-------------|
| `X-Webhook-Event` | Event type: `order.created`, `order.updated`, etc. |
| `X-Webhook-Signature` | HMAC-SHA256 signature of request body using webhook secret |

**Signature Generation (MercurJS side):**
```typescript
import crypto from "crypto"

const payload = JSON.stringify(body)
const signature = crypto
  .createHmac("sha256", webhookSecret)
  .update(payload)
  .digest("hex")
```

**Signature Verification (Adapter side):**
```go
func verifySignature(body []byte, secret, signature string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(signature))
}
```

**Adapter Response:**
```json
{
  "success": true,
  "message": "Webhook received and published"
}
```

**Webhook Registration:**
Each shop registers a webhook with MercurJS and receives a unique secret:
```sql
-- webhook_subscription table
id | shop_id | url                          | secret          | event_types
---|---------|------------------------------|-----------------|------------------
1  | shop_1  | http://adapter:3001/hook     | abc123secret... | ["order.created"]
```

### 2. MQTT API Requests (External → MercurJS)

External services send requests via MQTT and receive responses asynchronously.

**Request Topic:** `requests/api_request`

**Request Message Format:**
```json
{
  "request_id": "uuid-v4",
  "api_key": "trusted-service-api-key",
  "shop_id": "sel_01ABC123",
  "action": "api_request",
  "params": {
    "path": "/sellers/sel_01ABC123/products",
    "method": "GET",
    "entity_type": "product",
    "entity_key": "products"
  }
}
```

**Response Topic:** `responses/{request_id}`

**Response Message Format (Success):**
```json
{
  "request_id": "uuid-v4",
  "success": true,
  "data": {
    "products": [...],
    "count": 10
  },
  "error": null
}
```

**Response Message Format (Error):**
```json
{
  "request_id": "uuid-v4",
  "success": false,
  "data": null,
  "error": {
    "code": "unauthorized",
    "message": "Invalid API key"
  }
}
```

### 3. API Key Authentication

External services must register in the `trusted_services` table:

```sql
INSERT INTO trusted_services (id, name, api_key, allowed_actions)
VALUES ('svc_001', 'Shopee Integration', 'your-api-key', '["api_request", "*"]');
```

**Allowed Actions:**
- `api_request` - Generic API proxy requests
- `*` - All actions (wildcard)

### 4. Field Mapping

The adapter transforms fields between MercurJS and external service formats.

**Configuration (in `field_mappings` table):**
```sql
INSERT INTO field_mappings (platform_id, entity_type, source_field, target_field)
VALUES
  ('default', 'product', 'id', 'item_id'),
  ('default', 'product', 'title', 'item_name');
```

**Before Mapping (MercurJS format):**
```json
{
  "id": "prod_123",
  "title": "My Product"
}
```

**After Mapping (External service format):**
```json
{
  "item_id": "prod_123",
  "item_name": "My Product"
}
```

### Integration Flow Diagram

```
External Service                     Adapter                         MercurJS
(Mobile App, ERP)                                              (Shopee/Lazada/TikTok)
       │                               │                                │
       │ 1. Publish to MQTT            │                                │
       │   requests/api_request        │                                │
       │──────────────────────────────>│                                │
       │                               │                                │
       │                               │ 2. Validate API key            │
       │                               │    (trusted_services table)    │
       │                               │                                │
       │                               │ 3. Get OAuth token by shop_id  │
       │                               │    (tokens table)              │
       │                               │                                │
       │                               │ 4. Call MercurJS API           │
       │                               │───────────────────────────────>│
       │                               │                                │
       │                               │ 5. Receive response            │
       │                               │<───────────────────────────────│
       │                               │                                │
       │                               │ 6. Apply field mapping         │
       │                               │                                │
       │ 7. Receive on MQTT            │                                │
       │   responses/{req_id}          │                                │
       │<──────────────────────────────│                                │
       │                               │                                │
```

## Database Schema

### MercurJS (PostgreSQL)
- Standard Medusa tables
- `oauth_client` - OAuth clients
- `oauth_token` - Access/refresh tokens
- `oauth_authorization_code` - Auth codes
- `webhook_subscription` - Registered webhooks

### Adapter (PostgreSQL)
- `tokens` - Stored OAuth tokens per shop_id (unique)
- `trusted_services` - API key authentication
- `field_mappings` - Field transformations (using 'default' as platform_id)

## How to Start

### 1. Start all services
```bash
docker compose up -d
```

### 2. Run seed data
```bash
docker compose exec mercurjs yarn seed
```

This creates:
- Admin: `admin@mercurjs.com` / `supersecret`
- Seller: `seller@mercurjs.com` / `secret`
- OAuth client for adapter
- Sample products

### 3. Access services

| Service | URL | Credentials |
|---------|-----|-------------|
| WebUI | http://localhost:3100 | - |
| Admin Panel | http://localhost:5173 | admin@mercurjs.com / supersecret |
| Vendor Panel | http://localhost:7000 | seller@mercurjs.com / secret |
| pgAdmin | http://localhost:5050 | admin@admin.com / admin |

### 4. Test OAuth Flow

1. Go to http://localhost:3100
2. Click "Connect Shop" (no need to fill shop_id - it's obtained from token response)
3. Login with seller credentials (seller@mercurjs.com / secret)
4. Approve authorization
5. You'll be redirected to the seller page with the shop_id from the token

**Note:** The shop_id is automatically obtained from the OAuth token response (`user_id` field), so you don't need to know it beforehand.

### 5. What's Working Now

- **OAuth2 Flow**: Complete authorization code flow with automatic shop_id (seller_id) from token response
- **Token Refresh**: Automatic refresh with client credentials
- **Async Products API via MQTT**: WebUI publishes directly to MQTT → Consumer → MercurJS → MQTT → WebUI
- **Topic Lifecycle**: Clean subscribe/unsubscribe per request
- **Field Mapping**: Default field transformations
- **Debug WebUI**: Two-panel layout with API responses (left) and webhook events (right)
- **Order Webhooks**: Real order.created events trigger webhooks to adapter → MQTT → WebUI

## Key Configuration

### Environment Variables

**MercurJS** (in docker-compose.yml):
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET`, `COOKIE_SECRET` - Auth secrets
- `*_CORS` - CORS origins for each API

**Adapter**:
- `MERCURJS_URL` - Backend URL
- `MERCURJS_CLIENT_ID`, `MERCURJS_CLIENT_SECRET` - OAuth credentials
- `BROKER_URL` - MQTT broker URL

## Issues Fixed During Development

1. **PostgreSQL SSL**: Added `?sslmode=disable` to DATABASE_URL
2. **bcrypt in Alpine Docker**: Replaced `bcrypt` with `bcryptjs`
3. **OAuth redirect_uri mismatch**: Fixed URI handling in webui
4. **Token refresh missing credentials**: Added client_id/client_secret to refresh request as form-encoded body (not query params)
5. **CORS errors**: Added all service origins to CORS config
6. **Products endpoint pricing error**: Removed `variants.calculated_price.calculated_amount` field that required currency_code context
7. **MQTT topic cleanup**: Changed from wildcard subscription to per-request subscribe/unsubscribe pattern
8. **Platform concept removed**: Simplified architecture by removing platform_id from tokens, MQTT topics, and field mappings - now uses 'default' platform_id and gets shop_id from OAuth token response

## File Structure

```
murcurjs/
├── adapter/                    # Go adapter service
│   ├── cmd/main.go            # Entry point
│   └── internal/
│       ├── api/mercurjs.go    # MercurJS API client with token refresh
│       ├── broker/            # MQTT publisher/consumer
│       ├── controllers/       # HTTP handlers
│       ├── services/          # Business logic
│       └── repository/        # Database queries
├── mercur/
│   └── backend/               # Medusa backend
│       └── src/
│           ├── api/           # API routes
│           │   ├── oauth/     # OAuth endpoints
│           │   ├── platform/  # Webhook endpoints
│           │   └── sellers/   # Seller endpoints
│           ├── modules/       # Medusa modules
│           │   ├── oauth/     # OAuth module
│           │   └── webhook/   # Webhook module
│           └── subscribers/   # Event subscribers
├── webui/                     # Debug/POC HTML/JS frontend
│   ├── index.html            # OAuth connect form (simple "Connect Shop" button)
│   └── seller.html           # Two-panel debug view (API responses + webhook events)
├── scripts/
│   └── init-db.sql           # Adapter database seed
├── docker-compose.yml        # All services
└── README.md                 # User documentation
```

## Next Steps / TODO

1. **Create Product from OMS**: Add `handleCreateProduct` handler in adapter to create products via MQTT
2. **Admin OAuth UI**: Manage OAuth clients in admin panel
3. **Webhook Retry**: Implement retry logic for failed webhooks
4. **Product Pricing**: Add currency_code support to products endpoint for price display
5. **Tests**: Add unit and integration tests
6. **Order Status Webhooks**: Add order.updated subscriber for status changes

## Useful Commands

```bash
# View logs
docker compose logs -f mercurjs
docker compose logs -f adapter

# Rebuild specific service
docker compose up -d --build adapter
docker compose up -d --build mercurjs

# Access database
docker compose exec postgres psql -U postgres -d mercurjs

# Run migrations
docker compose exec mercurjs yarn medusa db:migrate

# Stop all
docker compose down
```

## OMS Testing Workflow (MQTT + HTTP)

Use this workflow to test the same steps as the webui.

**Environment**
```bash
BASE_URL=http://localhost:9000
PUBLISHABLE_KEY=pk_fcf988d4ff36ddf1076d348a647682c3b01cff5a82b7603fa19daca23f958515
SHOP_ID=sel_01KGYWPMS6GXR9310KWWZFF7J8
LOCATION_ID=sloc_01KGYWPMTEQFAGHPA81PG13EYY
ORDER_ID=order_...
LINE_ITEM_ID=ordli_...
FULFILLMENT_ID=ful_...
```

### 1) Create Product (MQTT)
```bash
mosquitto_pub -h localhost -p 1883 -t "requests/create_product" -m '{
  "request_id": "req-001",
  "api_key": "test-key-789",
  "shop_id": "'"$SHOP_ID"'",
  "action": "create_product",
  "params": {
    "product": {
      "title": "Green high-tops",
      "status": "published",
      "options": [{ "title": "Default", "values": ["Default"] }],
      "variants": [{
        "title": "Default Variant",
        "options": { "Default": "Default" },
        "prices": [{ "amount": 99, "currency_code": "eur" }]
      }]
    }
  }
}'
```

**Subscribe to webhook events (orders/#)**  
Run in another terminal to watch order updates:
```bash
mosquitto_sub -h localhost -p 1883 -t "orders/#" -v
```

### 2) Fulfill Product (Vendor)
Get seller token:
```bash
curl -X POST "$BASE_URL/auth/seller/emailpass" \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -d '{"email":"<seller_email>","password":"<seller_password>"}'
```
Set token:
```bash
VENDOR_TOKEN=<token_from_login>
```
Create fulfillment:
```bash
curl -X POST "$BASE_URL/vendor/orders/$ORDER_ID/fulfillments" \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -d '{
    "location_id":"'"$LOCATION_ID"'",
    "requires_shipping":true,
    "items":[{"id":"'"$LINE_ITEM_ID"'","quantity":1}]
  }'
```

### 3) Shipping (Vendor)
```bash
curl -X POST "$BASE_URL/vendor/orders/$ORDER_ID/fulfillments/$FULFILLMENT_ID/shipments" \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -d '{
    "items":[{"id":"'"$LINE_ITEM_ID"'","quantity":1}],
    "labels":[]
  }'
```

### 4) Delivered (Vendor)
```bash
curl -X POST "$BASE_URL/vendor/orders/$ORDER_ID/fulfillments/$FULFILLMENT_ID/mark-as-delivered" \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $VENDOR_TOKEN"
```

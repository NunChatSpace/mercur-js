# MurcurJS

Multi-platform e-commerce marketplace with OAuth2 integration and webhook-based order synchronization.

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

## Quick Start

### 1. Start all services

```bash
docker compose up -d
```

### 2. Run database migrations and seed

```bash
docker compose exec mercurjs yarn seed
```

This creates:
- Admin user: `admin@mercurjs.com` / `supersecret`
- Seller user: `seller@mercurjs.com` / `secret`
- Sample products and categories
- Publishable API key (shown in output)

### 3. Access the services

| Service | URL | Purpose |
|---------|-----|---------|
| MercurJS API | http://localhost:9000 | Backend API |
| Admin Panel | http://localhost:5173 | Platform admin |
| Vendor Panel | http://localhost:7000 | Seller dashboard |
| WebUI | http://localhost:3100 | OAuth flow helper |
| Adapter | http://localhost:3001 | External platform integration |
| pgAdmin | http://localhost:5050 | Database management |

**pgAdmin credentials**: `admin@admin.com` / `admin`

To connect to PostgreSQL in pgAdmin:
- Host: `postgres`
- Port: `5432`
- Username: `postgres`
- Password: `postgres`

## OAuth2 Flow

The OAuth2 flow connects external platforms (e.g., Shopee, Lazada) to MercurJS via the Adapter.

### Flow Diagram

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐
│ WebUI  │     │MercurJS │     │ Adapter  │     │  WebUI  │
│(start) │     │         │     │          │     │(result) │
└───┬────┘     └────┬────┘     └────┬─────┘     └────┬────┘
    │               │               │                │
    │ 1. Connect    │               │                │
    │──────────────>│               │                │
    │               │               │                │
    │ 2. Redirect to /oauth/authorize               │
    │<──────────────│               │                │
    │               │               │                │
    │ 3. User logs in & approves    │                │
    │──────────────>│               │                │
    │               │               │                │
    │               │ 4. Redirect with code          │
    │               │──────────────>│                │
    │               │               │                │
    │               │ 5. Exchange code for token     │
    │               │<──────────────│                │
    │               │               │                │
    │               │ 6. Store token                 │
    │               │               │───────────────>│
    │               │               │  7. Success    │
    └───────────────┴───────────────┴────────────────┘
```

### Step-by-Step

1. **Access WebUI**: http://localhost:3100
2. **Fill in the form**:
   - Platform: Select platform (e.g., Shopee)
   - Shop ID: Enter seller ID (e.g., `sel_01KGYWPMS6GXR9310KWWZFF7J8`)
   - Client ID: Pre-filled with adapter's client ID
3. **Click "Connect Shop"** - redirects to MercurJS login
4. **Login with admin credentials** and approve the authorization
5. **Adapter receives callback** with authorization code
6. **Adapter exchanges code for tokens** and stores them
7. **Redirected to Seller Page** - displays connected shop's products

### Seller Products Flow (Async via MQTT)

When viewing seller products, the request is async through MQTT:

```
┌────────┐     ┌──────────┐     ┌────────┐     ┌──────────┐     ┌──────────┐
│ WebUI  │────>│ Adapter  │────>│  MQTT  │────>│ Consumer │────>│ MercurJS │
│        │     │ /api/*   │     │ publish│     │          │     │          │
└────────┘     └──────────┘     └────────┘     └──────────┘     └──────────┘
    │               │                                                │
    │  { request_id,│                                                │
    │    status: ok }                                                │
    │<──────────────┘                                                │
    │                                                                │
    │  Subscribe to responses/{platform}/#  (WebSocket)              │
    │<───────────────────────────────────────────────────────────────┘
    │                           Response via MQTT
```

**Flow:**
1. WebUI connects to MQTT broker via WebSocket (port 9001)
2. WebUI subscribes to `responses/{platform}/#`
3. WebUI calls Adapter `GET /api/sellers/:id/products`
4. Adapter publishes to `requests/{platform}/api_request` and returns `{ request_id, status: "pending" }`
5. Consumer receives request, calls MercurJS API
6. Consumer publishes response to `responses/{platform}/{request_id}`
7. WebUI receives response via MQTT WebSocket subscription

### OAuth Client Management

#### List OAuth clients
```bash
curl http://localhost:9000/admin/oauth-clients \
  -H "Authorization: Bearer <admin_token>"
```

#### Create new OAuth client
```bash
curl -X POST http://localhost:9000/admin/oauth-clients \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App",
    "redirect_uris": ["http://localhost:3001/oauth/callback"],
    "grants": ["authorization_code", "refresh_token"],
    "scopes": ["read:orders"]
  }'
```

**Important**: Save the `client_secret` from the response - it's only shown once!

## Webhook Flow

When orders are created, MercurJS sends webhooks to registered endpoints.

### Register Webhook

```bash
curl -X POST http://localhost:9000/platform/shopee/webhook \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://adapter:3001/hook",
    "event_types": ["order.created"],
    "shop_id": "sel_01KGYWPMS6GXR9310KWWZFF7J8"
  }'
```

### Simulate Webhook Event

```bash
curl -X POST http://localhost:9000/platform/admin/simulate \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "webhook_event",
    "platform": "shopee",
    "shop_id": "sel_01KGYWPMS6GXR9310KWWZFF7J8",
    "event_type": "order.created",
    "data": {
      "order_id": "order_001",
      "items": [{"product_id": "prod_001", "quantity": 1}]
    }
  }'
```

## Environment Variables

### MercurJS Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | supersecret |
| `COOKIE_SECRET` | Cookie signing secret | supersecret |
| `STORE_CORS` | Allowed origins for store API | - |
| `ADMIN_CORS` | Allowed origins for admin API | - |
| `AUTH_CORS` | Allowed origins for auth API | - |
| `VENDOR_CORS` | Allowed origins for vendor API | - |

### Adapter

| Variable | Description | Default |
|----------|-------------|---------|
| `MERCURJS_URL` | MercurJS API URL | http://localhost:9000 |
| `MERCURJS_CLIENT_ID` | OAuth client ID | - |
| `MERCURJS_CLIENT_SECRET` | OAuth client secret | - |
| `MERCURJS_REDIRECT_URI` | OAuth redirect URI | http://localhost:3001/oauth/callback |
| `WEBUI_URL` | WebUI URL for redirects | http://localhost:3100 |
| `WEBHOOK_SECRET` | Secret for webhook signatures | - |
| `BROKER_URL` | MQTT broker URL | tcp://localhost:1883 |

## Development

### Local Development (without Docker)

```bash
# Start backend
cd mercur/backend
yarn dev

# Start admin panel
cd mercur/admin-panel
yarn dev

# Start vendor panel
cd mercur/vendor-panel
yarn dev
```

### Rebuild specific service

```bash
docker compose up -d --build mercurjs
docker compose up -d --build adapter
```

### View logs

```bash
docker compose logs -f mercurjs
docker compose logs -f adapter
```

## API Endpoints

### Admin API (`/admin/*`)

- `GET /admin/oauth-clients` - List OAuth clients
- `POST /admin/oauth-clients` - Create OAuth client
- `PUT /admin/oauth-clients/:id` - Update OAuth client
- `DELETE /admin/oauth-clients/:id` - Revoke OAuth client
- `GET /admin/sellers` - List sellers

### OAuth API (`/oauth/*`)

- `GET /oauth/authorize` - Authorization endpoint
- `POST /oauth/authorize` - Approve authorization
- `POST /oauth/token` - Token endpoint

### Platform API (`/platform/*`)

- `POST /platform/:platform/webhook` - Register webhook
- `POST /platform/admin/simulate` - Simulate webhook event

### Sellers API (`/sellers/*`)

- `GET /sellers/:id/products` - List seller products (TODO)

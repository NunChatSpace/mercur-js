# Adapter Consumer Flow (Message Broker → MercurJS API)

## Overview

External services (Shopee, Lazada, microservices) request data from MercurJS through the Adapter via Message Broker. The Adapter authenticates requests, uses stored OAuth tokens (from AC2) to call MercurJS API, and publishes responses back.

**Scope:** Adapter consumer + token storage + MercurJS API client + request/response via broker.

---

## Architecture

```
┌─────────────────┐                      ┌─────────────────┐
│ External        │   publish request    │  Message        │
│ Services        │─────────────────────>│  Broker         │
│ (Shopee/Lazada) │                      │                 │
└─────────────────┘                      └────────┬────────┘
                                                  │
                                         subscribe│requests/{platform}/+
                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Adapter (Consumer)                          │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Request      │───>│ Auth         │───>│ Token Store          │  │
│  │ Handler      │    │ Validator    │    │ (from AC2)           │  │
│  └──────────────┘    └──────────────┘    └──────────┬───────────┘  │
│                                                     │              │
│                                          get token  │              │
│                                                     ▼              │
│                                          ┌──────────────────────┐  │
│                                          │ MercurJS API Client  │  │
│                                          │ - GET /stores        │  │
│                                          │ - GET /stores/{id}   │  │
│                                          │ - GET /stores/{id}/  │  │
│                                          │       products       │  │
│                                          └──────────┬───────────┘  │
│                                                     │              │
│                                          response   │              │
│                                                     ▼              │
│                                          ┌──────────────────────┐  │
│                                          │ Response Publisher   │  │
│                                          └──────────┬───────────┘  │
└─────────────────────────────────────────────────────┼──────────────┘
                                                      │
                                             publish  │ responses/{platform}/{request_id}
                                                      ▼
                                           ┌─────────────────┐
                                           │  Message        │
                                           │  Broker         │
                                           └────────┬────────┘
                                                    │
                                           subscribe│
                                                    ▼
                                           ┌─────────────────┐
                                           │ External        │
                                           │ Services        │
                                           └─────────────────┘
```

---

## Flow (High-Level)

```
1. External Service ──publish request──> Message Broker
   Topic: requests/{platform}/{action}
   Message: { request_id, shop_id, api_key, params }

2. Adapter (Consumer)
   └─> Subscribe to: requests/+/+
        └─> Validate api_key (trusted service)
             └─> Get token from Adapter's DB (by platform + shop_id)
                  └─> Call MercurJS API with Bearer token
                       └─> Publish response to: responses/{platform}/{request_id}

3. External Service
   └─> Subscribe to: responses/{platform}/{request_id}
        └─> Receive response data
```

---

## Request/Response Topics

### Request Topics (External → Adapter)

```
requests/{platform}/{action}

Examples:
- requests/shopee/get_stores
- requests/lazada/get_store
- requests/shopee/get_products
```

### Response Topics (Adapter → External)

```
responses/{platform}/{request_id}

Examples:
- responses/shopee/req_abc123
- responses/lazada/req_xyz789
```

---

## Message Formats

### Request Message

```json
{
  "request_id": "req_abc123",
  "api_key": "trusted-service-api-key",
  "platform": "shopee",
  "shop_id": "shop_456",
  "action": "get_store",
  "params": {
    "store_id": "store_123"
  }
}
```

### Response Message

```json
{
  "request_id": "req_abc123",
  "success": true,
  "data": {
    "id": "store_123",
    "name": "My Store",
    "products": [...]
  },
  "error": null
}
```

### Error Response

```json
{
  "request_id": "req_abc123",
  "success": false,
  "data": null,
  "error": {
    "code": "unauthorized",
    "message": "Invalid API key"
  }
}
```

---

## Requirements

### Adapter (Consumer)

- Subscribe to `requests/+/+` topics.
- Validate `api_key` against trusted services list.
- Query OAuth token from Adapter's DB (stored via AC2).
- Handle token refresh if expired.
- Call MercurJS API with Bearer token.
- Publish response to `responses/{platform}/{request_id}`.

### Token Storage (AC2 Integration)

- Store tokens when user completes OAuth2 flow.
- Schema: platform_id, shop_id, access_token, refresh_token, expires_at.
- Auto-refresh expired tokens.

### Trusted Services

- Maintain list of trusted API keys.
- Each service has: api_key, name, allowed_actions.

---

## Tasks

### Phase 1: Token Storage (Adapter DB) ✅

- [x] Set up database (PostgreSQL).
- [x] Create `tokens` table.
- [x] Create token repository (CRUD operations).
- [x] Implement token refresh logic (model has `ShouldRefresh()`).

**Files created:**
- `internal/database/database.go`
- `internal/models/token.go`
- `internal/repository/token.go`

### Phase 2: Trusted Services ✅

- [x] Create `trusted_services` table.
- [x] Create service to validate API keys.
- [x] Seed script for test data (no admin endpoint needed).

**Files created:**
- `internal/models/trusted_service.go`
- `internal/repository/trusted_service.go`
- `scripts/seed.sql`

### Phase 2.5: Field Mapping (Database-based) ✅

- [x] Create `field_mappings` table:
  ```sql
  CREATE TABLE field_mappings (
    id UUID PRIMARY KEY,
    platform_id VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    source_field VARCHAR(255) NOT NULL,
    target_field VARCHAR(255) NOT NULL,
    transform VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(platform_id, entity_type, source_field)
  );
  ```
- [x] Create field mapping repository.
- [x] Create mapper service with transforms (uppercase, lowercase, cents_to_dollars, etc.).
- [x] Support dot notation for nested fields (`variants.0.price`).
- [x] Implement caching for mappings.

**Files created:**
- `internal/models/field_mapping.go`
- `internal/repository/field_mapping.go`
- `internal/mapper/mapper.go`

### Phase 3: MercurJS API Client ✅

- [x] Create HTTP client with Bearer token auth.
- [x] Implement endpoints:
  - `GET /admin/stores` - List all stores
  - `GET /admin/stores/{id}` - Get store by ID
  - `GET /admin/stores/{id}/products` - Get store products
- [x] Handle 401 (refresh token and retry).
- [x] Handle errors gracefully.

**Files created:**
- `internal/api/mercurjs.go`
- Updated `internal/config/config.go` (added MercurJSConfig)

### Phase 4: Broker Consumer ✅

- [x] Subscribe to `requests/+/+` topics.
- [x] Parse incoming request messages.
- [x] Validate API key.
- [x] Route to appropriate handler based on action.

**Files created:**
- `internal/broker/consumer.go` - Consumer with handler routing
- `internal/services/auth.go` - API key validation

### Phase 5: Request Handlers ✅

- [x] Implement `get_stores` handler.
- [x] Implement `get_store` handler.
- [x] Implement `get_products` handler.
- [x] Each handler: validate → get token → call API → map fields → publish response.

**Files created:**
- `internal/services/consumer.go` - Handler implementations

### Phase 6: Response Publisher ✅

- [x] Publish to `responses/{platform}/{request_id}`.
- [x] Include success/error status.
- [x] Response published via broker consumer.

**Files created:**
- `cmd/test-publisher/main.go` - Test script to simulate external services
- Updated `Makefile` - Added test commands

### Phase 7: AC2 Integration (OAuth Token Exchange) ✅

- [x] Create endpoint `GET /oauth/callback` for OAuth redirect.
- [x] Exchange authorization code for tokens via MercurJS `/oauth/token`.
- [x] Store tokens in Adapter's DB.
- [x] Return success to user.

**Files created:**
- `internal/services/oauth.go` - Token exchange logic
- `internal/controllers/oauth.go` - Callback endpoint
- Updated `internal/config/config.go` - Added ClientID, ClientSecret

---

## Adapter Project Structure Update

```
adapter/
├── cmd/
│   └── main.go
├── internal/
│   ├── config/
│   │   └── config.go         # Config with PostgreSQL
│   ├── database/
│   │   └── database.go       # PostgreSQL + auto-migrate ✅
│   ├── controllers/
│   │   ├── webhook.go        # Existing (Publisher)
│   │   └── oauth.go          # OAuth callback
│   ├── services/
│   │   ├── webhook.go        # Existing
│   │   ├── consumer.go       # Message consumer
│   │   └── auth.go           # API key validation
│   ├── broker/
│   │   ├── broker.go         # Existing (Publisher)
│   │   ├── topics.go         # Existing
│   │   └── consumer.go       # Subscribe logic
│   ├── repository/
│   │   ├── token.go          # Token CRUD ✅
│   │   ├── trusted_service.go # Trusted services ✅
│   │   └── field_mapping.go  # Field mappings ✅
│   ├── models/
│   │   ├── token.go          # Token entity ✅
│   │   ├── trusted_service.go # Service entity ✅
│   │   └── field_mapping.go  # Mapping entity ✅
│   ├── mapper/
│   │   └── mapper.go         # Field transformation ✅
│   ├── api/
│   │   └── mercurjs.go       # MercurJS API client
│   └── domains/
│       ├── webhook.go        # Existing
│       └── request.go        # Request/Response DTOs
├── scripts/
│   └── seed.sql              # Test data ✅
├── docker-compose.yml        # PostgreSQL + MQTT + Adapter ✅
└── ...
```

---

## Verification

- [ ] External service publishes request → receives response.
- [ ] Invalid API key → error response.
- [ ] Expired token → auto-refresh and retry.
- [ ] MercurJS API error → error response with details.
- [ ] Unknown action → error response.

---

## Testing

### 1. Start Services

**From root (`/murcurjs`):**
```bash
make up          # Start all (PostgreSQL, Redis, MQTT, MercurJS, Adapter)
make logs        # View all logs
make ps          # Show running services
```

**From adapter only (`/murcurjs/adapter`):**
```bash
make docker-up   # Start PostgreSQL, MQTT, Adapter only
```

### 2. Seed Test Data

```bash
make seed
```

### 3. Insert Test Token (without MercurJS)

```bash
PGPASSWORD=adapter psql -h localhost -U adapter -d adapter -c "
INSERT INTO tokens (platform_id, shop_id, access_token, refresh_token, token_type, expires_at)
VALUES ('shopee', 'shop_001', 'test_token', 'test_refresh', 'Bearer', NOW() + INTERVAL '1 hour')
ON CONFLICT (platform_id, shop_id) DO UPDATE SET access_token = EXCLUDED.access_token;
"
```

### 4. Test Consumer Flow

**Terminal 1 - Subscribe:**
```bash
mosquitto_sub -h localhost -p 1883 -t "responses/#" -v
```

**Terminal 2 - Publish (Generic API Request):**
```bash
# Get all sellers
mosquitto_pub -h localhost -p 1883 -t "requests/shopee/shop_001" -m '{
  "request_id": "req_001",
  "api_key": "shopee-key-123",
  "platform": "shopee",
  "shop_id": "shop_001",
  "action": "api_request",
  "params": {
    "path": "/sellers",
    "method": "GET",
    "entity_type": "seller",
    "entity_key": "sellers"
  }
}'

# Get single seller
mosquitto_pub -h localhost -p 1883 -t "requests/shopee/shop_001" -m '{
  "request_id": "req_002",
  "api_key": "shopee-key-123",
  "platform": "shopee",
  "shop_id": "shop_001",
  "action": "api_request",
  "params": {
    "path": "/sellers/seller_123",
    "method": "GET",
    "entity_type": "seller"
  }
}'

# Get seller products
mosquitto_pub -h localhost -p 1883 -t "requests/shopee/shop_001" -m '{
  "request_id": "req_003",
  "api_key": "shopee-key-123",
  "platform": "shopee",
  "shop_id": "shop_001",
  "action": "api_request",
  "params": {
    "path": "/sellers/seller_123/products",
    "method": "GET",
    "entity_type": "product",
    "entity_key": "products"
  }
}'
```

### 5. Test Publisher Flow (Webhook)

**Terminal 1 - Subscribe:**
```bash
mosquitto_sub -h localhost -p 1883 -t "orders/#" -v
```

**Terminal 2 - Send webhook:**
```bash
SECRET="125f16b3fd1c386ba2f8128230149c76c23e18490e01646b24fba27358246d91"
PAYLOAD='{"data":{"platform":"shopee","shop_id":"shop_001","order_id":"123"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST http://localhost:3001/hook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -H "X-Webhook-Event: order.created" \
  -d "$PAYLOAD"
```

### 6. Test OAuth Callback

```bash
curl "http://localhost:3001/oauth/callback?code=test_code&platform=shopee&shop_id=shop_001"
```

### 7. Test Error Cases

**Invalid API key:**
```bash
mosquitto_pub -h localhost -p 1883 -t "requests/shopee/shop_001" -m '{
  "request_id": "req_err_001",
  "api_key": "invalid-key",
  "platform": "shopee",
  "shop_id": "shop_001",
  "action": "api_request",
  "params": {
    "path": "/sellers",
    "method": "GET"
  }
}'
```

### 8. Clean Up

**From root:**
```bash
make down        # Stop services
make clean       # Stop and remove volumes
```

**From adapter:**
```bash
make docker-down
```

---

## Root Docker Compose

All services can be started from root with `docker-compose.yml`:

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL (shared) |
| mqtt | 1883 | MQTT Broker |
| mercurjs | 9000 | MercurJS Backend |
| adapter | 3001 | Adapter Service |
| webui | 3000 | OAuth Redirect UI |

**Commands:**
```bash
make up          # Start all
make up-build    # Start with rebuild
make down        # Stop all
make logs        # View logs
make seed        # Seed adapter DB
make seed-token  # Insert test token
make migrate     # Run MercurJS migrations
make health      # Health check all services
```

---

## Notes

- **Request timeout**: Set reasonable timeout for MercurJS API calls (30s).
- **Response TTL**: Messages in response topic expire after 60s.
- **Token refresh**: Refresh 5 minutes before expiry to avoid race conditions.
- **Idempotency**: Use request_id to prevent duplicate processing.
- **Rate limiting**: Consider rate limiting per API key.

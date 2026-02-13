# OMS Integration Tasks

This document describes 3 features to implement for OMS (Order Management System) integration.

## Implementation Status

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Create Product from OMS | **TODO** | Need to add `handleCreateProduct` handler |
| Task 2: Get Products via MQTT | **DONE** | WebUI publishes directly to MQTT |
| Task 3: Order Webhook Events | **DONE** | Subscriber triggers webhook on order.created |

## Overview

```
Current Architecture:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  WebUI ──HTTP──> Adapter ──MQTT──> Consumer ──HTTP──> MercurJS              │
│    ▲                                   │                                    │
│    └───────────────MQTT────────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Target Architecture:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  OMS ────MQTT────> Adapter Consumer ──HTTP──> MercurJS                      │
│                          │                        │                         │
│                          │                        │ (order events)          │
│                          ▼                        ▼                         │
│  WebUI <────MQTT──── Publisher <──────────── Webhooks                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Task 1: Create Product from OMS Message

**Goal:** Adapter consumes "create_product" messages from OMS and creates products in MercurJS.

### 1.1 Understand the Current Flow

Read these files to understand how messages are consumed:
- `adapter/internal/broker/consumer.go` - How MQTT messages are received
- `adapter/internal/services/consumer.go` - How handlers process messages
- `adapter/internal/api/mercurjs.go` - How API calls are made to MercurJS

### 1.2 Define the Message Format

OMS will publish to topic: `requests/create_product`

**Request Message:**
```json
{
  "request_id": "uuid-v4",
  "api_key": "trusted-service-api-key",
  "shop_id": "sel_01KGYWPMS6GXR9310KWWZFF7J8",
  "action": "create_product",
  "params": {
    "title": "New Product",
    "description": "Product description",
    "handle": "new-product",
    "variants": [
      {
        "title": "Default",
        "sku": "SKU-001",
        "prices": [
          {
            "amount": 1000,
            "currency_code": "usd"
          }
        ]
      }
    ]
  }
}
```

**Response Message (on topic `responses/{request_id}`):**
```json
{
  "request_id": "uuid-v4",
  "success": true,
  "data": {
    "product_id": "prod_xxx",
    "title": "New Product"
  },
  "error": null
}
```

### 1.3 Implementation Steps

#### Step 1: Add POST method to MercurJS API client

**File:** `adapter/internal/api/mercurjs.go`

Add a new method that can send POST requests with a body:

```go
// RequestWithBody makes a POST/PUT request with JSON body
func (c *MercurJSClient) RequestWithBody(method, path, shopID string, body interface{}) (map[string]interface{}, error) {
    // Similar to Request() but:
    // 1. Marshal body to JSON
    // 2. Set Content-Type: application/json
    // 3. Include body in request
}
```

#### Step 2: Register new handler in consumer service

**File:** `adapter/internal/services/consumer.go`

```go
func (s *ConsumerService) RegisterHandlers(consumer *broker.Consumer) {
    consumer.RegisterHandler("api_request", s.handleAPIRequest)
    consumer.RegisterHandler("create_product", s.handleCreateProduct)  // ADD THIS
}

func (s *ConsumerService) handleCreateProduct(req *broker.RequestMessage) *broker.ResponseMessage {
    // 1. Validate API key
    // 2. Validate action permission
    // 3. Extract product data from req.Params
    // 4. Call MercurJS API: POST /admin/products
    // 5. Return success/error response
}
```

#### Step 3: Find the correct MercurJS endpoint

Check MercurJS API for creating products. You may need to use:
- `POST /admin/products` - Admin API for creating products
- Or check if there's a seller-specific endpoint: `POST /sellers/{id}/products`

**How to find:**
```bash
# Search for product creation routes
grep -r "products" mercur/backend/src/api/ --include="*.ts" | grep -i "post\|create"
```

#### Step 4: Test the flow

1. Start all services: `docker compose up -d`
2. Use MQTT client to publish test message:
```bash
# Install mosquitto-clients if needed
mosquitto_pub -h localhost -p 1883 -t "requests/create_product" -m '{
  "request_id": "test-001",
  "api_key": "test-key-789",
  "shop_id": "sel_01KGYWPMS6GXR9310KWWZFF7J8",
  "action": "create_product",
  "params": {
    "title": "Test Product from OMS"
  }
}'
```
3. Subscribe to response:
```bash
mosquitto_sub -h localhost -p 1883 -t "responses/test-001"
```

---

## Task 2: Get Products via MQTT (No HTTP)

**Goal:** WebUI gets products directly via MQTT without calling Adapter's HTTP API.

### 2.1 Current Flow (Remove This)

```
WebUI ──HTTP GET──> Adapter /api/sellers/:id/products
                         │
                         ▼
                    Publish to MQTT
                         │
                         ▼
                    Return request_id
                         │
                         ▼
WebUI subscribes to response topic
```

### 2.2 New Flow (Implement This)

```
WebUI ──MQTT publish──> requests/api_request
                              │
                              ▼
                    Consumer receives message
                              │
                              ▼
                    Calls MercurJS API
                              │
                              ▼
WebUI <──MQTT subscribe── responses/{request_id}
```

### 2.3 Implementation Steps

#### Step 1: Update WebUI to publish directly to MQTT

**File:** `webui/seller.html`

Replace the HTTP fetch with MQTT publish:

```javascript
// BEFORE (HTTP call):
async function getProducts() {
    const response = await fetch(`${adapterUrl}/api/sellers/${shopId}/products`);
    const data = await response.json();
    // subscribe to response topic...
}

// AFTER (Direct MQTT):
function getProducts() {
    const requestId = generateUUID();
    const message = {
        request_id: requestId,
        api_key: "test-key-789",  // Or get from config
        shop_id: shopId,
        action: "api_request",
        params: {
            path: `/sellers/${shopId}/products`,
            method: "GET",
            entity_type: "product",
            entity_key: "products"
        }
    };

    // Subscribe to response first
    const responseTopic = `responses/${requestId}`;
    mqttClient.subscribe(responseTopic);

    // Then publish request
    mqttClient.publish('requests/api_request', JSON.stringify(message));
}
```

#### Step 2: Handle response in MQTT message handler

```javascript
mqttClient.on('message', (topic, payload) => {
    const message = JSON.parse(payload.toString());

    if (topic.startsWith('responses/')) {
        // Handle API response
        if (message.success) {
            displayProducts(message.data.products);
        } else {
            showError(message.error.message);
        }

        // Unsubscribe from response topic
        mqttClient.unsubscribe(topic);
    }

    if (topic.startsWith('orders/')) {
        // Handle webhook events (Task 3)
        displayWebhookEvent(message);
    }
});
```

#### Step 3: Remove HTTP endpoints from Adapter (Optional)

If HTTP endpoints are no longer needed, you can remove them from:
- `adapter/internal/controllers/api.go` - Remove `HandleGetSellerProducts`, `HandleGetSellers`
- `adapter/cmd/main.go` - Remove route registrations

**Note:** Keep the HTTP endpoints if other services still use them.

---

## Task 3: Order Webhook Events

**Goal:** When order is created or status changes, webhook events appear in WebUI.

### 3.1 Flow Diagram

```
Customer places order
        │
        ▼
MercurJS creates order
        │
        ▼
Subscriber catches "order.created" event
        │
        ▼
Webhook module sends to registered endpoints
        │
        ▼
Adapter receives webhook at POST /hook
        │
        ▼
Adapter publishes to MQTT topic "orders/order.created"
        │
        ▼
WebUI receives via MQTT subscription
```

### 3.2 Understanding Existing Code

Read these files:
- `mercur/backend/src/subscribers/order-created-webhook.ts` - Order event subscriber
- `mercur/backend/src/modules/webhook/` - Webhook module
- `adapter/internal/controllers/webhook.go` - Webhook receiver

### 3.3 Implementation Steps

#### Step 1: Check if order subscriber exists

**File:** `mercur/backend/src/subscribers/order-created-webhook.ts`

This subscriber should:
1. Listen for `order.created` event
2. Get webhook subscriptions for the seller
3. Send webhook to each registered URL

```typescript
// Example structure
import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

export default async function orderCreatedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  // 1. Get order details
  // 2. Find seller for this order
  // 3. Get webhook subscriptions for seller
  // 4. Send POST request to each webhook URL
}

export const config: SubscriberConfig = {
  event: "order.created",
}
```

#### Step 2: Add order status change subscriber

Create new file: `mercur/backend/src/subscribers/order-status-webhook.ts`

```typescript
import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

export default async function orderStatusHandler({
  event,
  container,
}: SubscriberArgs<{ id: string; status: string }>) {
  // Similar to order.created but for status changes
  // Event type: "order.updated" or "order.status_changed"
}

export const config: SubscriberConfig = {
  event: "order.updated",
}
```

#### Step 3: Verify Adapter webhook handler publishes to MQTT

**File:** `adapter/internal/controllers/webhook.go`

Check that when webhook is received, it publishes to MQTT:

```go
func (h *WebhookHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
    // 1. Verify signature
    // 2. Parse webhook body
    // 3. Get event type from X-Webhook-Event header
    // 4. Publish to MQTT topic: orders/{event_type}

    eventType := r.Header.Get("X-Webhook-Event")  // e.g., "order.created"
    topic := fmt.Sprintf("orders/%s", eventType)

    h.publisher.PublishRaw(topic, body)
}
```

#### Step 4: Update WebUI to subscribe to order events

**File:** `webui/seller.html`

```javascript
// Subscribe to all order events
mqttClient.subscribe('orders/#');

mqttClient.on('message', (topic, payload) => {
    if (topic.startsWith('orders/')) {
        const eventType = topic.replace('orders/', '');
        const data = JSON.parse(payload.toString());

        displayWebhookEvent({
            event: eventType,
            timestamp: new Date().toISOString(),
            data: data
        });
    }
});
```

#### Step 5: Register webhook subscription for testing

The adapter needs to be registered as a webhook receiver in MercurJS.

**Option A:** Seed data
Add to `mercur/backend/src/scripts/seed.ts`:
```typescript
// Create webhook subscription for adapter
await webhookService.createSubscription({
  seller_id: seller.id,
  url: "http://adapter:3001/hook",
  events: ["order.created", "order.updated"],
  secret: "webhook-secret-123"
});
```

**Option B:** API call
```bash
curl -X POST http://localhost:9000/platform/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "seller_id": "sel_01KGYWPMS6GXR9310KWWZFF7J8",
    "url": "http://adapter:3001/hook",
    "events": ["order.created", "order.updated"]
  }'
```

#### Step 6: Test the webhook flow

1. Create a test order via MercurJS API or storefront
2. Check adapter logs: `docker compose logs -f adapter`
3. Check WebUI right panel for webhook event

---

## Testing Checklist

### Task 1: Create Product
- [ ] Adapter builds without errors
- [ ] Consumer logs show "Registered handler for action: create_product"
- [ ] Publishing to `requests/create_product` creates product in MercurJS
- [ ] Response received on `responses/{request_id}`

### Task 2: Get Products via MQTT
- [ ] WebUI can get products without HTTP call
- [ ] Products display correctly in left panel
- [ ] Error handling works (show error if request fails)

### Task 3: Order Webhook
- [ ] Order subscriber exists and is loaded
- [ ] Webhook subscription created for adapter
- [ ] Creating order triggers webhook
- [ ] Adapter receives webhook and publishes to MQTT
- [ ] WebUI displays webhook event in right panel

---

## Files to Modify

| Task | File | Changes |
|------|------|---------|
| 1 | `adapter/internal/api/mercurjs.go` | Add `RequestWithBody` method |
| 1 | `adapter/internal/services/consumer.go` | Add `handleCreateProduct` handler |
| 2 | `webui/seller.html` | Replace HTTP with direct MQTT publish |
| 3 | `mercur/backend/src/subscribers/order-status-webhook.ts` | Create new file |
| 3 | `adapter/internal/controllers/webhook.go` | Ensure MQTT publish works |
| 3 | `mercur/backend/src/scripts/seed.ts` | Add webhook subscription |

---

## Useful Commands

```bash
# View adapter logs
docker compose logs -f adapter

# View MercurJS logs
docker compose logs -f mercurjs

# Test MQTT publish
mosquitto_pub -h localhost -p 1883 -t "requests/create_product" -m '{"test": true}'

# Test MQTT subscribe
mosquitto_sub -h localhost -p 1883 -t "responses/#" -v

# Rebuild services after changes
docker compose up -d --build adapter
docker compose up -d --build mercurjs

# Check database
docker compose exec postgres psql -U postgres -d medusa
```

---

## Questions to Ask

If you get stuck, ask:
1. "How do I find the MercurJS endpoint for creating products?"
2. "How do I test if webhooks are being sent?"
3. "What's the correct message format for MQTT?"

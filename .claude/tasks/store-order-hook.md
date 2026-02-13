# Per-Store Order Hook (Message Broker Publishing)

## Overview

When an order is created that contains items from multiple stores, split it by store and call the **Adapter** (Publisher) via HTTP hook. The Adapter then publishes messages to a **Message Broker** for downstream consumers.

**Scope:** Backend hook integration + Adapter publisher + Message Broker.

---

## Architecture

```
┌───────────┐   order.create   ┌───────────────────────────────────────┐
│ Storefront│─────────────────>│              MercurJS                 │
└───────────┘                  │                                       │
                               │  Order Created ──> Hook Service       │
                               │                    (split by store,   │
                               │                     sign, deliver)    │
                               └───────────────────────┬───────────────┘
                                                       │
                                                       │ HTTP Hook
                                                       │ (per store)
                                                       ▼
                               ┌───────────────────────────────────────┐
                               │              Adapter                  │
                               │                                       │
                               │  Hook Receiver ──> Broker Publisher   │
                               │  (verify sig)      (publish message)  │
                               └───────────────────────┬───────────────┘
                                                       │
                                                       │ Publish
                                                       ▼
                               ┌───────────────────────────────────────┐
                               │          Message Broker               │
                               │                                       │
                               │  Topic: orders/{platform}/{shop_id}   │
                               └───────────────────────┬───────────────┘
                                                       │
                                                       │ Subscribe
                                                       ▼
                               ┌───────────────────────────────────────┐
                               │       Downstream Consumers            │
                               └───────────────────────────────────────┘
```

---

## Related ACs / Sequences

- **AC2 Token Exchange**: Adapter exchanges auth code for tokens, stores in adapter DB.
- **AC6 Webhook Simulation**: Delivery with retries + signature headers (for hook calls).
- **AC7 Error Scenarios**: Simulated rate-limit/auth/server/timeouts.
- **AC8 Multi-Platform**: Adapter factory + platform-specific formatting.
- **AC9 Configuration**: Webhook retry config + error simulation config.

---

## Flow (High-Level)

```
=== AC6 Scope: Publisher Flow (Hook → Publish) ===

1. Storefront ──order.create──> MercurJS

2. MercurJS (Order Hook)
   └─> Group items by store
        └─> For each store:
             ├─> Resolve platform + shop config
             ├─> Generate HMAC-SHA256 signature
             ├─> Create delivery record (status: pending)
             └─> POST hook to Adapter

3. Adapter (Publisher Function)
   └─> Verify signature (X-Webhook-Signature)
        └─> Publish message to Message Broker topic
             (e.g., orders/{platform}/{shop_id})

4. Message Broker
   └─> Delivers message to downstream consumers
```

---

## Requirements

### MercurJS (Backend)

- Trigger on order creation (workflow or event subscriber).
- Split order by `store_id`.
- Build per-store hook payload.
- Call Adapter via HTTP with signature (AC6 delivery/retry behavior).
- Failures must not block core order creation.

### Adapter - Publisher Function (AC6 Scope)

- Receive and verify hook signatures from MercurJS.
- Publish message to Message Broker topics.
- No token needed.

### Message Broker

- Receive published messages from Adapter.
- Route messages to appropriate topics (e.g., `orders/{platform}/{shop_id}`).
- Deliver messages to downstream consumers.

---

## Tasks

### Phase 1: Webhook Registration (MercurJS) ✅

- [x] Create `webhook_registrations` table/model:
  ```
  - id
  - platform_id
  - shop_id
  - url (adapter endpoint)
  - event_types (e.g., ["order.created"])
  - secret (for HMAC signing)
  - is_active (boolean)
  - created_at, updated_at
  ```
- [x] Create POST `/mock-platform/{platform}/webhook` endpoint.
- [x] Validate Bearer token (from adapter).
- [x] Store registration in database.
- [x] Return 201 with registration record.

**Files created:**
- `src/modules/webhook/models/webhook-registration.ts`
- `src/modules/webhook/models/index.ts`
- `src/modules/webhook/types/index.ts`
- `src/modules/webhook/service.ts`
- `src/modules/webhook/index.ts`
- `src/modules/webhook/migrations/Migration20260205000001.ts`
- `src/api/mock-platform/[platform]/webhook/route.ts`
- Updated `medusa-config.ts`

### Phase 2: Webhook Delivery Records (MercurJS) ✅

- [x] Create `webhook_deliveries` table/model:
  ```
  - id
  - registration_id
  - event_type
  - payload (JSON)
  - status: "pending" | "retrying" | "delivered" | "failed"
  - attempt_count (default: 0)
  - max_attempts (default: 3)
  - next_retry_at (nullable timestamp)
  - last_error (nullable text)
  - created_at, updated_at
  ```
- [x] Implement delivery record creation on event trigger.

**Files created/updated:**
- `src/modules/webhook/models/webhook-delivery.ts` (new)
- `src/modules/webhook/models/webhook-registration.ts` (added hasMany relation)
- `src/modules/webhook/models/index.ts` (added export)
- `src/modules/webhook/types/index.ts` (added delivery types)
- `src/modules/webhook/service.ts` (added delivery methods)
- `src/modules/webhook/migrations/Migration20260205000001.ts` (added delivery table)

### Phase 3: Webhook Signature & Delivery (MercurJS) ✅

- [x] Implement HMAC-SHA256 signature generation:
  ```
  signature = HMAC-SHA256(JSON.stringify(payload), registration.secret)
  ```
- [x] Deliver webhook with headers:
  ```
  X-Webhook-Signature: {signature}
  X-Webhook-Event: order.created
  Content-Type: application/json
  ```
- [x] Payload structure:
  ```json
  {
    "event_type": "order.created",
    "timestamp": "2024-01-01T00:00:00Z",
    "data": { ... per-store order payload ... }
  }
  ```
- [x] Handle delivery response:
  - 2xx → `status = "delivered"`
  - 4xx/5xx/timeout → calculate backoff, `status = "retrying"`

**Files created:**
- `src/shared/webhook/signature.ts`
- `src/shared/webhook/delivery.ts`
- `src/shared/webhook/index.ts`
- Updated `src/modules/webhook/service.ts` (added executeDelivery, triggerWebhookEvent)

### Phase 4: Exponential Backoff Retry (MercurJS) ✅

- [x] Implement backoff formula: `delay = 1s × 2^attempt_count` (1s, 2s, 4s, 8s...)
- [x] Update delivery record:
  ```
  attempt_count++
  next_retry_at = now + delay
  status = "retrying"
  ```
- [x] Create scheduled retry job (runs every minute):
  - Find deliveries where `status = "retrying"` AND `next_retry_at <= now`
  - Attempt delivery for each
  - On success: `status = "delivered"`
  - On failure & `attempt_count < max_attempts`: update `next_retry_at`
  - On failure & `attempt_count >= max_attempts`: `status = "failed"`

**Files created:**
- `src/jobs/webhook-retry.ts`

### Phase 5: Simulate Endpoint (MercurJS) ✅

- [x] Create POST `/mock-platform/admin/simulate` endpoint:
  ```json
  {
    "type": "webhook_event",
    "platform": "shopee",
    "shop_id": "123",
    "event_type": "order.created",
    "data": { ... }
  }
  ```
- [x] Find matching registrations by platform + shop_id + event_type.
- [x] Create delivery records and trigger delivery.

**Files created:**
- `src/api/mock-platform/admin/simulate/route.ts`

### Phase 6: Order Hook Integration (MercurJS) ✅

- [x] Identify the order-created workflow/event.
- [x] Register subscriber/hook handler.
- [x] Group order items by store.
- [x] Build normalized per-store order payload (items, totals, customer, address).
- [x] Trigger webhook event for each store's order.

**Files created:**
- `src/subscribers/order-created-webhook.ts`

### Phase 7: Adapter Setup (`/adapter`) ✅

- [x] Initialize adapter project structure:
  ```
  adapter/
  ├── src/
  │   ├── publisher/        # Publisher function (hook → publish)
  │   ├── broker/           # Message Broker client
  │   └── config/           # Configuration
  ├── package.json
  └── tsconfig.json
  ```

**Files created:**
- `adapter/package.json`
- `adapter/tsconfig.json`
- `adapter/src/config/index.ts`
- `adapter/.env.example`

### Phase 8: Hook Receiver (Adapter) ✅

- [x] Create POST `/hook` endpoint (receives calls from MercurJS).
- [x] Verify signature:
  ```
  expected = HMAC-SHA256(rawBody, secret)
  received = req.headers["x-webhook-signature"]
  valid = timingSafeEqual(expected, received)
  ```
- [x] Parse event_type from `X-Webhook-Event` header.
- [x] Publish message to Message Broker.
- [x] Return 200 OK on success.

**Files created:**
- `adapter/src/publisher/hook-receiver.ts`
- `adapter/src/publisher/signature.ts`
- `adapter/src/publisher/index.ts`

### Phase 9: Broker Publisher (Adapter) ✅

- [x] Configure Message Broker client connection:
  ```typescript
  const brokerClient = broker.connect(BROKER_URL, {
    clientId: `adapter-${instanceId}`,
    username: BROKER_USERNAME,
    password: BROKER_PASSWORD,
  })
  ```
- [x] Define topic structure:
  ```
  orders/{platform}/{shop_id}/created
  orders/{platform}/{shop_id}/updated
  orders/{platform}/{shop_id}/cancelled
  ```
- [x] Implement message publishing:
  ```typescript
  async publishOrder(platform: string, shopId: string, orderData: any) {
    const topic = `orders/${platform}/${shopId}/created`
    const message = JSON.stringify({
      event_type: "order.created",
      timestamp: new Date().toISOString(),
      data: orderData
    })
    await brokerClient.publish(topic, message)
  }
  ```
- [x] Handle publish failures and implement retry logic.

**Files created:**
- `adapter/src/broker/client.ts`
- `adapter/src/broker/publisher.ts`
- `adapter/src/broker/topics.ts`
- `adapter/src/broker/index.ts`

### Phase 10: Publisher Flow Integration (Adapter) ✅

- [x] Implement complete publisher flow:
  ```typescript
  async handleHook(hookPayload: any) {
    // 1. Verify signature
    verifySignature(hookPayload)

    // 2. Publish message to Message Broker
    await brokerPublisher.publishOrder(
      hookPayload.platform,
      hookPayload.shop_id,
      hookPayload.data
    )
  }
  ```

**Files created:**
- `adapter/src/index.ts` (main entry point with Express server)

### Phase 11: Error Simulation (AC7) ⏭️

- [ ] Check platform error-simulation config before hook delivery.
- [ ] If simulation triggers, return platform-formatted error response.

**Note:** Deferred to AC7 implementation.

### Phase 12: Reliability & Logging ✅

- [x] Ensure failures are logged with order_id + store_id + platform.
- [x] Do not block order creation on hook/publish failure.
- [x] Add hook delivery and broker publish logs/metrics.

**Implemented in:**
- `src/subscribers/order-created-webhook.ts` (try/catch, doesn't block order)
- `src/modules/webhook/service.ts` (delivery logging)
- `adapter/src/broker/client.ts` (connection logging)
- `adapter/src/broker/publisher.ts` (publish logging)
- `adapter/src/publisher/hook-receiver.ts` (error logging)

---

## Verification

### MercurJS

- [ ] Register a hook endpoint and verify it's stored in DB.
- [ ] Trigger simulate endpoint and verify delivery records created.
- [ ] Verify hook delivered with correct signature headers.
- [ ] Simulate delivery failure and verify retry with exponential backoff.
- [ ] Verify `status = "failed"` after max attempts exceeded.
- [ ] Create multi-store order and verify one hook call per store.

### Adapter

- [ ] Verify hook signature validation works.
- [ ] Verify message published to correct Message Broker topic.
- [ ] Verify message payload format.

### Message Broker

- [ ] Verify messages arrive at expected topics.
- [ ] Verify downstream consumers receive messages.

---

## Files Summary (Created)

### Backend (`mercur/backend/`)

| File | Description |
|------|-------------|
| `src/modules/webhook/models/webhook-registration.ts` | Registration model |
| `src/modules/webhook/models/webhook-delivery.ts` | Delivery model |
| `src/modules/webhook/models/index.ts` | Model exports |
| `src/modules/webhook/types/index.ts` | TypeScript types |
| `src/modules/webhook/service.ts` | Webhook service |
| `src/modules/webhook/index.ts` | Module registration |
| `src/modules/webhook/migrations/Migration20260205000001.ts` | DB migration |
| `src/api/mock-platform/[platform]/webhook/route.ts` | Webhook registration API |
| `src/api/mock-platform/admin/simulate/route.ts` | Simulate endpoint |
| `src/shared/webhook/signature.ts` | HMAC signature |
| `src/shared/webhook/delivery.ts` | HTTP delivery |
| `src/shared/webhook/index.ts` | Shared exports |
| `src/jobs/webhook-retry.ts` | Retry job |
| `src/subscribers/order-created-webhook.ts` | Order event subscriber |
| `medusa-config.ts` | Added webhook module |

### Adapter (`adapter/`)

| File | Description |
|------|-------------|
| `package.json` | Dependencies |
| `tsconfig.json` | TypeScript config |
| `.env.example` | Environment template |
| `src/config/index.ts` | Configuration |
| `src/publisher/hook-receiver.ts` | Hook endpoint |
| `src/publisher/signature.ts` | Signature verification |
| `src/publisher/index.ts` | Publisher exports |
| `src/broker/client.ts` | MQTT client |
| `src/broker/publisher.ts` | Message publisher |
| `src/broker/topics.ts` | Topic helpers |
| `src/broker/index.ts` | Broker exports |
| `src/index.ts` | Main entry point |

---

## Notes

- **AC6 Scope**: Hook → Publish (no token, no API query).
- **Signature verification**: MercurJS signs hooks, Adapter verifies.
- **Retry job**: Use existing job scheduler in MercurJS if available, otherwise create a simple interval-based runner.
- **Message delivery**: Use at-least-once delivery semantics for order messages to ensure reliability.
- **Consumer function**: Out of AC6 scope (collects messages from external services).

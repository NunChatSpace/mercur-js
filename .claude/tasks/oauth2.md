# OAuth 2.0 Authorization Server Implementation

## Overview

Implement OAuth 2.0 Authorization Server in Medusa/Mercur to allow external services to authenticate users and access Medusa data.

**Scope:** AC1-4 (Authorization Flow, Token Exchange, Token Refresh, Auth Validation)

---

## OAuth Flow (with Frontend Consent)

```
External App                    Backend                      Admin/Vendor Panel
     │                            │                                │
     │ 1. Redirect user to        │                                │
     │    /oauth/authorize?...    │                                │
     │ ─────────────────────────► │                                │
     │                            │                                │
     │                            │ 2. Validate client_id          │
     │                            │    & redirect_uri              │
     │                            │                                │
     │                            │ 3. 302 Redirect to frontend    │
     │                            │    /oauth-consent?params...    │
     │                            │ ──────────────────────────────►│
     │                            │                                │
     │                            │                     4. If not logged in
     │                            │                        → /login → back
     │                            │                                │
     │                            │                     5. Show consent page
     │                            │                        "App wants access"
     │                            │                        [Approve] [Deny]
     │                            │                                │
     │                            │ 6. POST /oauth/authorize/approve
     │                            │ ◄───────────────────────────── │
     │                            │    { client_id, redirect_uri,  │
     │                            │      scope, state }            │
     │                            │                                │
     │                            │ 7. Generate auth code          │
     │                            │    Return redirect_url         │
     │                            │ ──────────────────────────────►│
     │                            │                                │
     │                            │                     8. window.location =
     │                            │                        redirect_url
     │ ◄──────────────────────────────────────────────────────────│
     │    /callback?code=xxx&state=yyy                             │
     │                            │                                │
     │ 9. POST /oauth/token       │                                │
     │    { code, client_secret } │                                │
     │ ─────────────────────────► │                                │
     │                            │                                │
     │ ◄───────────────────────── │                                │
     │    { access_token,         │                                │
     │      refresh_token }       │                                │
```

---

## Data Models Overview

### Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         oauth_client                            │
│  "Shopify Integration is registered and allowed to connect"     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   oauth_authorization_code                      │
│  "User just logged in, here's proof (valid 10 min, use once)"   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      oauth_access_token                         │
│  "App can make API calls for this user (valid 2 hours)"         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     oauth_refresh_token                         │
│  "App can get new access tokens without re-login (valid 14 days)│
└─────────────────────────────────────────────────────────────────┘
```

### Model Purposes

| Model | Purpose | Lifetime |
|-------|---------|----------|
| `oauth_client` | Registered external apps allowed to use OAuth | Permanent (until revoked) |
| `oauth_authorization_code` | Temporary proof that user logged in and approved | 10 minutes, single use |
| `oauth_access_token` | Allows API calls on behalf of user | 2 hours |
| `oauth_refresh_token` | Get new access tokens without re-login | 14 days, rotated on use |

---

## File Structure

```
mercur/
├── backend/src/
│   ├── modules/oauth/
│   │   ├── index.ts                         # Module definition & export
│   │   ├── service.ts                       # OAuthModuleService
│   │   ├── models/
│   │   │   ├── index.ts                     # Model exports
│   │   │   ├── oauth-client.ts              # Registered OAuth clients
│   │   │   ├── oauth-authorization-code.ts  # Auth codes (one-time use)
│   │   │   ├── oauth-access-token.ts        # Access tokens
│   │   │   └── oauth-refresh-token.ts       # Refresh tokens
│   │   └── types/index.ts                   # TypeScript interfaces
│   ├── api/
│   │   ├── oauth/
│   │   │   ├── authorize/
│   │   │   │   ├── route.ts                 # GET /oauth/authorize (validate & redirect)
│   │   │   │   └── approve/route.ts         # POST /oauth/authorize/approve (issue code)
│   │   │   └── token/route.ts               # POST /oauth/token
│   │   ├── admin/oauth-clients/
│   │   │   ├── route.ts                     # GET/POST /admin/oauth-clients
│   │   │   └── [id]/route.ts                # GET/PUT/DELETE /admin/oauth-clients/:id
│   │   └── middlewares.ts                   # OAuth middleware registration
│   └── shared/oauth/
│       └── oauth-authenticate.ts            # Bearer token validation middleware
│
├── admin-panel/src/routes/
│   └── oauth-consent/
│       ├── oauth-consent.tsx                # Consent page component
│       └── index.ts                         # Route export
│
└── vendor-panel/src/routes/
    └── oauth-consent/
        ├── oauth-consent.tsx                # Consent page component
        └── index.ts                         # Route export
```

---

## Tasks

### Phase 1: Module Foundation

- [ ] **1.1** Install dependencies
  ```bash
  cd mercur/backend
  yarn add bcrypt
  yarn add -D @types/bcrypt
  ```

- [ ] **1.2** Create data models (`src/modules/oauth/models/`)

  **oauth-client.ts**
  ```typescript
  import { model } from "@medusajs/framework/utils"

  export const OAuthClient = model.define("oauth_client", {
    id: model.id({ prefix: "oauthcli" }).primaryKey(),
    client_id: model.text().unique(),
    client_secret: model.text(),  // bcrypt hashed
    name: model.text(),
    redirect_uris: model.json().default([]),  // string[]
    grants: model.json().default(["authorization_code", "refresh_token"]),
    scopes: model.json().default([]),
    is_confidential: model.boolean().default(true),
    revoked: model.boolean().default(false),
  })
  ```

  **oauth-authorization-code.ts**
  ```typescript
  import { model } from "@medusajs/framework/utils"
  import { OAuthClient } from "./oauth-client"

  export const OAuthAuthorizationCode = model.define("oauth_authorization_code", {
    id: model.id({ prefix: "oauthcode" }).primaryKey(),
    code: model.text().unique(),
    client: model.belongsTo(() => OAuthClient, { mappedBy: "authorizationCodes" }),
    user_id: model.text(),
    user_type: model.text(),  // "admin" | "customer" | "seller"
    redirect_uri: model.text(),
    scope: model.text().nullable(),
    expires_at: model.dateTime(),
    revoked: model.boolean().default(false),
    code_challenge: model.text().nullable(),       // PKCE
    code_challenge_method: model.text().nullable(), // "S256" | "plain"
  })
  ```

  **oauth-access-token.ts**
  ```typescript
  import { model } from "@medusajs/framework/utils"
  import { OAuthClient } from "./oauth-client"

  export const OAuthAccessToken = model.define("oauth_access_token", {
    id: model.id({ prefix: "oauthaccess" }).primaryKey(),
    token: model.text().unique(),
    client: model.belongsTo(() => OAuthClient, { mappedBy: "accessTokens" }),
    user_id: model.text(),
    user_type: model.text(),
    scope: model.text().nullable(),
    expires_at: model.dateTime(),
    revoked: model.boolean().default(false),
  })
  ```

  **oauth-refresh-token.ts**
  ```typescript
  import { model } from "@medusajs/framework/utils"
  import { OAuthClient } from "./oauth-client"

  export const OAuthRefreshToken = model.define("oauth_refresh_token", {
    id: model.id({ prefix: "oauthrefresh" }).primaryKey(),
    token: model.text().unique(),
    client: model.belongsTo(() => OAuthClient, { mappedBy: "refreshTokens" }),
    user_id: model.text(),
    user_type: model.text(),
    scope: model.text().nullable(),
    expires_at: model.dateTime(),
    revoked: model.boolean().default(false),
  })
  ```

- [ ] **1.3** Create service (`src/modules/oauth/service.ts`)

  Key methods:
  - `generateToken(length)` - Secure random token with `crypto.randomBytes()`
  - `generateClientCredentials()` - Create client_id (UUID) + client_secret
  - `hashSecret(secret)` / `verifySecret(secret, hash)` - bcrypt operations
  - `createClient(data)` - Register new OAuth client
  - `validateClient(clientId, clientSecret?)` - Verify client credentials
  - `createAuthorizationCode(data)` - Generate auth code with expiry
  - `exchangeCodeForTokens(code, clientId, redirectUri)` - Code → tokens
  - `createTokenPair(clientId, userId, userType, scope)` - Issue access + refresh
  - `refreshTokens(refreshToken, clientId)` - Rotate refresh token
  - `validateAccessToken(accessToken)` - Verify and return token data

- [ ] **1.4** Export module (`src/modules/oauth/index.ts`)
  ```typescript
  import { Module } from "@medusajs/framework/utils"
  import OAuthModuleService from "./service"

  export const OAUTH_MODULE = "oauth"
  export default Module(OAUTH_MODULE, { service: OAuthModuleService })
  ```

- [ ] **1.5** Register in config (`medusa-config.ts`)
  ```typescript
  modules: [
    // existing modules...
    { resolve: "./src/modules/oauth" },
  ]
  ```

- [ ] **1.6** Generate & run migrations
  ```bash
  npx medusa db:generate oauth
  npx medusa db:migrate
  ```

---

### Phase 2: OAuth Endpoints

- [ ] **2.1** Authorization endpoint (`src/api/oauth/authorize/route.ts`)

  **GET /oauth/authorize** - Validate and redirect to frontend
  - Validate: client_id, redirect_uri, response_type=code
  - Redirect to frontend `/oauth-consent` with params:
    ```
    https://admin.example.com/oauth-consent?
      client_id=xxx&
      client_name=App+Name&
      redirect_uri=xxx&
      scope=xxx&
      state=xxx
    ```

  Query params:
  - `client_id` (required)
  - `redirect_uri` (required)
  - `response_type=code` (required)
  - `state` (recommended for CSRF)
  - `scope` (optional)

- [ ] **2.2** Approve endpoint (`src/api/oauth/authorize/approve/route.ts`)

  **POST /oauth/authorize/approve** - Issue authorization code
  - Requires authenticated user (session/bearer)
  - Validate client_id, redirect_uri
  - Generate authorization code
  - Return redirect URL with code

  Request body:
  ```json
  {
    "client_id": "xxx",
    "redirect_uri": "https://...",
    "scope": "read:orders",
    "state": "abc123"
  }
  ```

  Response:
  ```json
  {
    "redirect_url": "https://app.com/callback?code=xxx&state=abc123"
  }
  ```

- [ ] **2.3** Token endpoint (`src/api/oauth/token/route.ts`)

  **POST /oauth/token** - Exchange code or refresh token

  For `grant_type=authorization_code`:
  - Validate client_id + client_secret
  - Verify code, redirect_uri match
  - Revoke code (one-time use)
  - Return tokens

  For `grant_type=refresh_token`:
  - Validate client credentials
  - Revoke old refresh token (rotation)
  - Issue new token pair

  Response format:
  ```json
  {
    "access_token": "xxx",
    "refresh_token": "xxx",
    "token_type": "Bearer",
    "expires_in": 7200
  }
  ```

---

### Phase 2b: Frontend OAuth Consent Pages

- [ ] **2b.1** Admin panel consent page (`mercur/admin-panel/src/routes/oauth-consent/`)
  - Route: `/oauth-consent`
  - If not logged in → redirect to `/login?return=/oauth-consent?...`
  - Show: App name, requested scopes, Approve/Deny buttons
  - On approve → POST to `/oauth/authorize/approve`
  - On success → redirect to returned `redirect_url`

- [ ] **2b.2** Vendor panel consent page (`mercur/vendor-panel/src/routes/oauth-consent/`)
  - Same as admin panel but for sellers

- [ ] **2b.3** Consent UI components
  - App name and logo display
  - Scope permissions list
  - Approve/Deny buttons
  - Loading state during approval

---

### Phase 3: Auth Middleware (AC4)

- [ ] **3.1** Create middleware (`src/shared/oauth/oauth-authenticate.ts`)
  ```typescript
  export function oauthAuthenticate(options?: {
    allowUnauthenticated?: boolean
    requiredScopes?: string[]
  }) {
    return async (req, res, next) => {
      // Extract Bearer token from Authorization header
      // Validate via oauthService.validateAccessToken()
      // Set req.oauth = { user, client, scope }
      // Check required scopes if specified
    }
  }
  ```

- [ ] **3.2** Register middleware (`src/api/middlewares.ts`)
  ```typescript
  import { defineMiddlewares, authenticate } from "@medusajs/framework/http"
  import { oauthAuthenticate } from "../shared/oauth/oauth-authenticate"

  export default defineMiddlewares({
    routes: [
      // Admin routes for OAuth client management
      {
        matcher: "/admin/oauth-clients*",
        middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
      },
      // Protected routes using OAuth tokens
      {
        matcher: "/oauth/protected/*",
        middlewares: [oauthAuthenticate()],
      },
    ],
  })
  ```

---

### Phase 4: Admin Client Management

- [ ] **4.1** Client CRUD routes

  **GET /admin/oauth-clients** - List clients (sanitized, no secrets)
  **POST /admin/oauth-clients** - Create client (return secret ONCE)
  **GET /admin/oauth-clients/:id** - Get client details
  **PUT /admin/oauth-clients/:id** - Update client (name, redirect_uris, grants)
  **DELETE /admin/oauth-clients/:id** - Revoke client (soft delete)

---

## Configuration

Add to `.env`:
```env
OAUTH_ACCESS_TOKEN_LIFETIME=7200        # 2 hours (seconds)
OAUTH_REFRESH_TOKEN_LIFETIME=1209600    # 14 days (seconds)
OAUTH_AUTHORIZATION_CODE_LIFETIME=600   # 10 minutes (seconds)
```

---

## Security Measures

| Concern | Implementation |
|---------|----------------|
| Client secret storage | bcrypt hash (never stored plaintext) |
| Token entropy | `crypto.randomBytes(32)` = 256-bit tokens |
| Auth code lifetime | 10 min max, single use, then revoked |
| Refresh token rotation | Old token revoked when new one issued |
| Redirect URI validation | Exact match against pre-registered URIs |
| CSRF protection | State parameter required, validated on callback |
| XSS protection | HTML escaping in login template |

---

## Error Responses (RFC 6749)

| Error | Status | Description |
|-------|--------|-------------|
| `invalid_request` | 400 | Missing required parameter |
| `invalid_client` | 401 | Client authentication failed |
| `invalid_grant` | 400 | Invalid/expired code or token |
| `unauthorized_client` | 401 | Client not authorized for grant type |
| `unsupported_grant_type` | 400 | Grant type not supported |
| `invalid_scope` | 400 | Invalid scope requested |
| `insufficient_scope` | 403 | Token lacks required scope |

---

## Verification

**Test OAuth Flow:**
```bash
# 1. Create OAuth client (as admin)
curl -X POST http://localhost:9000/admin/oauth-clients \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InVzZXJfMDFLR0QwNFZaUFlNUlY4TTgxRFBSWlA1VksiLCJhY3Rvcl90eXBlIjoidXNlciIsImF1dGhfaWRlbnRpdHlfaWQiOiJhdXRoaWRfMDFLR0QwNFcyOUdUMERDV1FUR0FFU0c5QlMiLCJhcHBfbWV0YWRhdGEiOnsidXNlcl9pZCI6InVzZXJfMDFLR0QwNFZaUFlNUlY4TTgxRFBSWlA1VksifSwidXNlcl9tZXRhZGF0YSI6e30sImlhdCI6MTc3MDE4MzY1OSwiZXhwIjoxNzcwMjcwMDU5fQ.ZwWu8A04QeP0OIlY9rkwrAT0bhrAaOM0ocy6gjkHF0Q" \
  -H "Content-Type: application/json" \
  -d '{"name":"OMS","redirect_uris":["http://localhost:3000/callback"]}'

# "Test App 2" id client_e271a43965fdaa1c95ad9468ba87716d secret d1c0f2dfc1fdaba2a2c7985ae8d2ef5d5ae896d607aaa12c848cdb604baf7f28

# Save client_id and client_secret from response!

# 2. Visit authorization URL in browser
# http://localhost:9000/oauth/authorize?client_id=client_e271a43965fdaa1c95ad9468ba87716d&redirect_uri=http://localhost:3000/callback&response_type=code&state=random123

# 3. After login, you'll be redirected to:
# http://localhost:3000/callback?code=YYY&state=random123

# 4. Exchange code for tokens
curl -X POST http://localhost:9000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "9adbd3e0be32d9c2a2f9ed7955689b8a898b174bda996397c39f1d9c03d7bdf1",
    "client_id": "client_778dfa0ff6135e966eb092b99d68d425",
    "client_secret": "b61325d94cf13c41378a4c454ff2beb03668a93797ba6e6f33baa558454295a6",
    "redirect_uri": "http://localhost:3000/callback"
  }'

# 5. Refresh tokens
curl -X POST http://localhost:9000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "REFRESH_TOKEN",
    "client_id": "XXX",
    "client_secret": "ZZZ"
  }'

# 6. Access protected resource
curl http://localhost:9000/oauth/protected/test \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

## Files Summary

### Backend (`mercur/backend/`)

| Action | File |
|--------|------|
| Create | `src/modules/oauth/models/oauth-client.ts` |
| Create | `src/modules/oauth/models/oauth-authorization-code.ts` |
| Create | `src/modules/oauth/models/oauth-access-token.ts` |
| Create | `src/modules/oauth/models/oauth-refresh-token.ts` |
| Create | `src/modules/oauth/models/index.ts` |
| Create | `src/modules/oauth/service.ts` |
| Create | `src/modules/oauth/index.ts` |
| Create | `src/modules/oauth/types/index.ts` |
| Create | `src/api/oauth/authorize/route.ts` |
| Create | `src/api/oauth/authorize/approve/route.ts` |
| Create | `src/api/oauth/token/route.ts` |
| Create | `src/api/admin/oauth-clients/route.ts` |
| Create | `src/api/admin/oauth-clients/[id]/route.ts` |
| Create | `src/shared/oauth/oauth-authenticate.ts` |
| Modify | `src/api/middlewares.ts` |
| Modify | `medusa-config.ts` |

### Admin Panel (`mercur/admin-panel/`)

| Action | File |
|--------|------|
| Create | `src/routes/oauth-consent/oauth-consent.tsx` |
| Create | `src/routes/oauth-consent/index.ts` |
| Modify | `src/providers/router-provider/route-map.tsx` (add route) |

### Vendor Panel (`mercur/vendor-panel/`)

| Action | File |
|--------|------|
| Create | `src/routes/oauth-consent/oauth-consent.tsx` |
| Create | `src/routes/oauth-consent/index.ts` |
| Modify | `src/providers/router-provider/route-map.tsx` (add route) |

---

## References

- [RFC 6749 - OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 6750 - Bearer Token](https://datatracker.ietf.org/doc/html/rfc6750)
- [Medusa Modules Guide](https://docs.medusajs.com/learn/fundamentals/modules)
- [Medusa API Routes Guide](https://docs.medusajs.com/learn/fundamentals/api-routes)
- Sequence diagrams: `seqs/ac1-ac4`

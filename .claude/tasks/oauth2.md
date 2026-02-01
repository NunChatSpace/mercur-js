# OAuth 2.0 Authorization Server Implementation

## Overview

Implement OAuth 2.0 Authorization Server in Medusa to allow external services to authenticate users and access Medusa data.

**Library:** [@node-oauth/oauth2-server](https://github.com/node-oauth/node-oauth2-server)

## Requirements (from sequence diagrams)

- AC1: OAuth Authorization Flow (authorization_code grant)
- AC2: Token Exchange (code → tokens)
- AC3: Token Refresh (refresh_token grant with rotation)
- AC4: Auth Validation (middleware for protected routes)

---

## Tasks

### Phase 1: Setup & Database

- [ ] **1.1** Install dependencies
  ```bash
  yarn add @node-oauth/oauth2-server @node-oauth/express-oauth-server
  ```

- [ ] **1.2** Create OAuth Module (`src/modules/oauth/`)
  - `models/oauth-client.ts` - Registered clients
  - `models/oauth-authorization-code.ts` - Auth codes (one-time use)
  - `models/oauth-access-token.ts` - Access tokens
  - `models/oauth-refresh-token.ts` - Refresh tokens

- [ ] **1.3** Database schema
  ```sql
  -- oauth_client
  id, client_id, client_secret, redirect_uris[], grants[], name, created_at

  -- oauth_authorization_code
  id, code, client_id, user_id, redirect_uri, scope, expires_at, revoked, created_at

  -- oauth_access_token
  id, token, client_id, user_id, scope, expires_at, revoked, created_at

  -- oauth_refresh_token
  id, token, client_id, user_id, scope, expires_at, revoked, created_at
  ```

- [ ] **1.4** Run migrations
  ```bash
  npx medusa db:generate oauth
  npx medusa db:migrate
  ```

---

### Phase 2: OAuth Model Implementation

- [ ] **2.1** Create OAuth model adapter (`src/modules/oauth/oauth-model.ts`)

  Required methods for @node-oauth/oauth2-server:
  ```typescript
  interface OAuthModel {
    // Client
    getClient(clientId: string, clientSecret: string): Promise<Client>

    // Authorization Code
    saveAuthorizationCode(code, client, user): Promise<AuthorizationCode>
    getAuthorizationCode(code: string): Promise<AuthorizationCode>
    revokeAuthorizationCode(code: AuthorizationCode): Promise<boolean>

    // Access Token
    saveToken(token, client, user): Promise<Token>
    getAccessToken(accessToken: string): Promise<Token>
    revokeToken(token: Token): Promise<boolean>

    // Refresh Token
    getRefreshToken(refreshToken: string): Promise<RefreshToken>

    // User (for password grant - optional)
    getUser?(username: string, password: string): Promise<User>
  }
  ```

---

### Phase 3: API Routes

- [ ] **3.1** Authorization endpoint (`src/api/oauth/authorize/route.ts`)
  ```
  GET  /oauth/authorize - Show login page
  POST /oauth/authorize - Handle login, issue code, redirect
  ```

  Query params:
  - `client_id` (required)
  - `redirect_uri` (required)
  - `response_type=code` (required)
  - `state` (recommended for CSRF)
  - `scope` (optional)

- [ ] **3.2** Token endpoint (`src/api/oauth/token/route.ts`)
  ```
  POST /oauth/token - Exchange code/refresh_token for tokens
  ```

  Body params:
  - `grant_type` = `authorization_code` | `refresh_token`
  - `code` (for authorization_code)
  - `refresh_token` (for refresh_token)
  - `client_id`
  - `client_secret`
  - `redirect_uri` (for authorization_code)

- [ ] **3.3** Token response format
  ```json
  {
    "access_token": "xxx",
    "refresh_token": "xxx",
    "token_type": "Bearer",
    "expires_in": 7200
  }
  ```

---

### Phase 4: Middleware & Validation

- [ ] **4.1** OAuth token validation middleware (`src/api/middlewares/oauth-authenticate.ts`)
  ```typescript
  // Validates Bearer token on protected routes
  // Sets req.oauth = { user, client, scope }
  ```

- [ ] **4.2** Apply to protected routes
  ```typescript
  // In middlewares.ts
  {
    matcher: "/oauth/protected/*",
    middlewares: [oauthAuthenticate]
  }
  ```

---

### Phase 5: Admin Routes (Client Management)

- [ ] **5.1** Client CRUD (`src/api/admin/oauth-clients/route.ts`)
  ```
  GET    /admin/oauth-clients      - List clients
  POST   /admin/oauth-clients      - Create client
  GET    /admin/oauth-clients/:id  - Get client
  PUT    /admin/oauth-clients/:id  - Update client
  DELETE /admin/oauth-clients/:id  - Delete client
  ```

- [ ] **5.2** Generate client credentials
  ```typescript
  // client_id: random UUID
  // client_secret: secure random string (shown once)
  ```

---

### Phase 6: Login UI

- [ ] **6.1** Create login page template (`src/api/oauth/authorize/login.html`)
  - Show app name requesting access
  - Email/password form
  - Scope permissions display
  - Approve/Deny buttons

- [ ] **6.2** Error pages
  - Invalid client
  - Invalid redirect_uri
  - Access denied

---

## Configuration

Add to `.env`:
```env
# OAuth Settings
OAUTH_ACCESS_TOKEN_LIFETIME=7200      # 2 hours
OAUTH_REFRESH_TOKEN_LIFETIME=1209600  # 14 days
OAUTH_AUTHORIZATION_CODE_LIFETIME=600 # 10 minutes
```

---

## Error Responses (RFC 6749)

| Error | Status | Description |
|-------|--------|-------------|
| invalid_request | 400 | Missing required parameter |
| invalid_client | 401 | Client authentication failed |
| invalid_grant | 400 | Invalid code/token |
| unauthorized_client | 401 | Client not authorized for grant |
| unsupported_grant_type | 400 | Grant type not supported |
| invalid_scope | 400 | Invalid scope requested |

---

## Security Considerations

- [ ] HTTPS only in production
- [ ] PKCE support (optional, for public clients)
- [ ] Rate limiting on token endpoint
- [ ] Secure storage of client_secret (hashed)
- [ ] Token rotation for refresh tokens
- [ ] Short-lived authorization codes (10 min)
- [ ] State parameter validation (CSRF protection)

---

## Testing

- [ ] Unit tests for OAuth model
- [ ] Integration tests for OAuth flow
- [ ] Test script (`oauth-test.sh`)
  ```bash
  # 1. Create client
  # 2. Get authorization code
  # 3. Exchange for tokens
  # 4. Access protected resource
  # 5. Refresh tokens
  ```

---

## File Structure

```
src/
├── modules/
│   └── oauth/
│       ├── index.ts
│       ├── models/
│       │   ├── oauth-client.ts
│       │   ├── oauth-authorization-code.ts
│       │   ├── oauth-access-token.ts
│       │   └── oauth-refresh-token.ts
│       ├── services/
│       │   └── oauth.ts
│       └── oauth-model.ts          # @node-oauth adapter
├── api/
│   ├── oauth/
│   │   ├── authorize/
│   │   │   ├── route.ts            # GET/POST /oauth/authorize
│   │   │   └── login.html
│   │   └── token/
│   │       └── route.ts            # POST /oauth/token
│   ├── admin/
│   │   └── oauth-clients/
│   │       ├── route.ts            # CRUD
│   │       └── [id]/
│   │           └── route.ts
│   └── middlewares/
│       └── oauth-authenticate.ts
```

---

## References

- [RFC 6749 - OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 6750 - Bearer Token](https://datatracker.ietf.org/doc/html/rfc6750)
- [@node-oauth/oauth2-server docs](https://node-oauth.github.io/node-oauth2-server/)
- Sequence diagrams: `seqs/ac1-ac4`

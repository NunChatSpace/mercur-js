# AC1: OAuth Authorization Flow

External service needs Medusa data, redirects user to Medusa for authorization.

## Prerequisites
- External Service registered with Medusa (has client_id, client_secret)
- redirect_uri pre-registered
- External Service has Medusa OAuth URLs in env config

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant External as External Service
    participant Medusa as Medusa OAuth

    Note over User,Medusa: Step 1 - Initiate OAuth

    User->>External: Access app
    External->>User: 302 Redirect to Medusa
    Note right of User: /oauth/authorize?<br/>client_id=xxx<br/>&redirect_uri=xxx<br/>&state=xyz

    Note over User,Medusa: Step 2 - User Login

    User->>Medusa: GET /oauth/authorize
    Medusa->>Medusa: Validate client_id & redirect_uri
    Medusa->>User: Login Page
    User->>Medusa: POST credentials
    Medusa->>Medusa: Authenticate user

    Note over User,Medusa: Step 3 - Issue Code

    Medusa->>Medusa: Generate auth code
    Medusa->>User: 302 Redirect to External
    Note right of User: /callback?code=xxx&state=xyz

    User->>External: GET /callback?code=xxx&state=xyz
    External->>External: Validate state

    Note over User,Medusa: → Continue to AC2: Token Exchange
```

## Error Cases

| Step | Error | Response |
|------|-------|----------|
| Step 2 | Invalid client_id | 400 Invalid client |
| Step 2 | Invalid redirect_uri | 400 Invalid redirect_uri |
| Step 2 | Invalid credentials | Show login error |
| Step 3 | State mismatch | 400 Invalid state (CSRF protection) |

# AC3: Token Refresh

External service uses refresh_token to obtain new tokens. Implements rotating refresh tokens.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant External as External Service
    participant Medusa as Medusa OAuth

    Note over External,Medusa: Refresh Tokens

    External->>Medusa: POST /oauth/token
    Note right of External: grant_type=refresh_token<br/>refresh_token=xxx<br/>client_id=xxx<br/>client_secret=xxx

    Medusa->>Medusa: Validate client credentials
    Medusa->>Medusa: Validate refresh token
    Medusa->>Medusa: Revoke old token (rotation)
    Medusa->>Medusa: Generate new token pair

    Medusa->>External: 200 New Tokens
    Note right of External: {<br/>  access_token: "new_xxx",<br/>  refresh_token: "new_xxx",<br/>  token_type: "Bearer",<br/>  expires_in: 7200<br/>}

    External->>External: Replace stored tokens
```

## Token Rotation

Old refresh_token is invalidated after use. If attacker tries to reuse:

```mermaid
sequenceDiagram
    participant Attacker
    participant Medusa as Medusa OAuth

    Attacker->>Medusa: POST /oauth/token (old refresh_token)
    Medusa->>Medusa: Token already revoked
    Medusa->>Attacker: 400 invalid_grant
```

## Error Cases

| Error | Response |
|-------|----------|
| Invalid client credentials | 401 invalid_client |
| Refresh token not found | 400 invalid_grant |
| Refresh token expired | 400 invalid_grant |
| Refresh token revoked | 400 invalid_grant |

# AC2: Token Exchange

External service exchanges authorization code for access_token and refresh_token.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant External as External Service
    participant Medusa as Medusa OAuth

    Note over External,Medusa: Exchange Code for Tokens

    External->>Medusa: POST /oauth/token
    Note right of External: grant_type=authorization_code<br/>code=xxx<br/>client_id=xxx<br/>client_secret=xxx<br/>redirect_uri=xxx

    Medusa->>Medusa: Validate client credentials
    Medusa->>Medusa: Validate auth code
    Medusa->>Medusa: Revoke auth code (one-time use)
    Medusa->>Medusa: Generate tokens

    Medusa->>External: 200 Token Response
    Note right of External: {<br/>  access_token: "xxx",<br/>  refresh_token: "xxx",<br/>  token_type: "Bearer",<br/>  expires_in: 7200<br/>}

    External->>External: Store tokens securely
```

## Error Cases

| Error | Response |
|-------|----------|
| Invalid client_id/secret | 401 invalid_client |
| Code not found | 400 invalid_grant |
| Code expired | 400 invalid_grant |
| Code already used | 400 invalid_grant |
| redirect_uri mismatch | 400 invalid_grant |

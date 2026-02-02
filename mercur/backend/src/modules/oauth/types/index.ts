export type OAuthClientDTO = {
  id: string
  client_id: string
  client_secret: string
  name: string
  redirect_uris: string[]
  grants: string[]
  scopes: string[]
  revoked: boolean
  created_at: Date
  updated_at: Date
}

export type OAuthAuthorizationCodeDTO = {
  id: string
  code: string
  client_id: string
  user_id: string
  user_type: string
  redirect_uri: string
  scope: string | null
  state: string | null
  expires_at: Date
  revoked: boolean
  created_at: Date
  updated_at: Date
}

export type OAuthAccessTokenDTO = {
  id: string
  token: string
  client_id: string
  user_id: string
  user_type: string
  scope: string | null
  expires_at: Date
  revoked: boolean
  created_at: Date
  updated_at: Date
}

export type OAuthRefreshTokenDTO = {
  id: string
  token: string
  client_id: string
  user_id: string
  user_type: string
  scope: string | null
  expires_at: Date
  revoked: boolean
  created_at: Date
  updated_at: Date
}

export type CreateOAuthClientInput = {
  name: string
  redirect_uris: string[]
  grants?: string[]
  scopes?: string[]
}

export type CreateAuthorizationCodeInput = {
  client_id: string
  user_id: string
  user_type: string
  redirect_uri: string
  scope?: string
  state?: string
}

export type ExchangeCodeInput = {
  code: string
  client_id: string
  client_secret: string
  redirect_uri: string
}

export type RefreshTokenInput = {
  refresh_token: string
  client_id: string
  client_secret: string
  scope?: string
}

export type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type: "Bearer"
  expires_in: number
  scope?: string
}

export type ValidatedToken = {
  user_id: string
  user_type: string
  client_id: string
  scope: string | null
}

export enum OAuthGrant {
  AUTHORIZATION_CODE = "authorization_code",
  REFRESH_TOKEN = "refresh_token",
}

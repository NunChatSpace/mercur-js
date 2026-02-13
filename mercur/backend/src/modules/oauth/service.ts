import { MedusaService } from "@medusajs/framework/utils"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import {
  OAuthClient,
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthRefreshToken,
} from "./models"
import {
  CreateOAuthClientInput,
  CreateAuthorizationCodeInput,
  ExchangeCodeInput,
  RefreshTokenInput,
  TokenResponse,
  ValidatedToken,
  OAuthGrant,
} from "./types"

const ACCESS_TOKEN_LIFETIME = parseInt(
  process.env.OAUTH_ACCESS_TOKEN_LIFETIME || "7200",
  10
) // 2 hours
const REFRESH_TOKEN_LIFETIME = parseInt(
  process.env.OAUTH_REFRESH_TOKEN_LIFETIME || "1209600",
  10
) // 14 days
const AUTHORIZATION_CODE_LIFETIME = parseInt(
  process.env.OAUTH_AUTHORIZATION_CODE_LIFETIME || "600",
  10
) // 10 minutes
const BCRYPT_ROUNDS = 10

class OAuthModuleService extends MedusaService({
  OAuthClient,
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthRefreshToken,
}) {
  /**
   * Generate a cryptographically secure random token
   */
  private generateToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString("hex")
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `client_${this.generateToken(16)}`
  }

  /**
   * Create a new OAuth client
   * Returns the plain text secret (only available at creation time)
   */
  async createClient(
    input: CreateOAuthClientInput
  ): Promise<{ client: any; plainSecret: string }> {
    const clientIdValue = this.generateClientId()
    const plainSecret = this.generateToken(32)
    const hashedSecret = await bcrypt.hash(plainSecret, BCRYPT_ROUNDS)

    const client = await this.createOAuthClients({
      client_id: clientIdValue,
      client_secret: hashedSecret,
      name: input.name,
      redirect_uris: input.redirect_uris,
      grants: input.grants || [
        OAuthGrant.AUTHORIZATION_CODE,
        OAuthGrant.REFRESH_TOKEN,
      ],
      scopes: input.scopes || [],
      revoked: false,
    } as any)

    return { client, plainSecret }
  }

  /**
   * Validate client credentials
   */
  async validateClient(
    clientIdValue: string,
    clientSecret: string
  ): Promise<any | null> {
    const clients = await this.listOAuthClients({
      client_id: clientIdValue,
      revoked: false,
    } as any)

    if (!clients.length) {
      return null
    }

    const client = clients[0]
    const isValidSecret = await bcrypt.compare(clientSecret, client.client_secret)

    if (!isValidSecret) {
      return null
    }

    return client
  }

  /**
   * Validate client by ID only (for authorization flow)
   */
  async validateClientById(clientIdValue: string): Promise<any | null> {
    const clients = await this.listOAuthClients({
      client_id: clientIdValue,
      revoked: false,
    } as any)

    return clients.length ? clients[0] : null
  }

  /**
   * Validate redirect URI against client's registered URIs
   */
  validateRedirectUri(client: any, redirectUri: string): boolean {
    const uris = client.redirect_uris as string[]
    return uris.includes(redirectUri)
  }

  /**
   * Create an authorization code
   */
  async createAuthorizationCode(
    input: CreateAuthorizationCodeInput
  ): Promise<string> {
    const client = await this.validateClientById(input.client_id)
    if (!client) {
      throw new Error("Invalid client")
    }

    if (!this.validateRedirectUri(client, input.redirect_uri)) {
      throw new Error("Invalid redirect URI")
    }

    const code = this.generateToken(32)
    const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME * 1000)

    await this.createOAuthAuthorizationCodes({
      code,
      client_id: client.id, // belongsTo relation uses property_id
      user_id: input.user_id,
      user_type: input.user_type,
      redirect_uri: input.redirect_uri,
      scope: input.scope || null,
      state: input.state || null,
      expires_at: expiresAt,
      revoked: false,
    } as any)

    return code
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(input: ExchangeCodeInput): Promise<TokenResponse> {
    // Validate client credentials
    const client = await this.validateClient(input.client_id, input.client_secret)
    if (!client) {
      throw new Error("Invalid client credentials")
    }

    // Check if client supports authorization_code grant
    const grants = client.grants as string[]
    if (!grants.includes(OAuthGrant.AUTHORIZATION_CODE)) {
      throw new Error("Client does not support authorization_code grant")
    }

    // Find and validate authorization code
    const codes = await this.listOAuthAuthorizationCodes(
      {
        code: input.code,
        revoked: false,
      } as any,
      { relations: ["client"] }
    )

    if (!codes.length) {
      throw new Error("Invalid authorization code")
    }

    const authCode = codes[0] as any

    // Verify code belongs to this client
    if (authCode.client.id !== client.id) {
      throw new Error("Authorization code does not belong to this client")
    }

    // Verify redirect URI matches
    if (authCode.redirect_uri !== input.redirect_uri) {
      throw new Error("Redirect URI mismatch")
    }

    // Check expiration
    if (new Date(authCode.expires_at) < new Date()) {
      // Revoke expired code
      await this.updateOAuthAuthorizationCodes({ id: authCode.id }, { revoked: true })
      throw new Error("Authorization code has expired")
    }

    // Revoke the authorization code (single use)
    await this.updateOAuthAuthorizationCodes({ id: authCode.id }, { revoked: true })

    // Generate tokens
    const accessToken = this.generateToken(32)
    const refreshToken = this.generateToken(32)
    const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_LIFETIME * 1000)
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_LIFETIME * 1000
    )

    // Create access token
    await this.createOAuthAccessTokens({
      token: accessToken,
      client_id: client.id, // belongsTo relation uses property_id
      user_id: authCode.user_id,
      user_type: authCode.user_type,
      scope: authCode.scope,
      expires_at: accessTokenExpiresAt,
      revoked: false,
    } as any)

    // Create refresh token
    await this.createOAuthRefreshTokens({
      token: refreshToken,
      client_id: client.id, // belongsTo relation uses property_id
      user_id: authCode.user_id,
      user_type: authCode.user_type,
      scope: authCode.scope,
      expires_at: refreshTokenExpiresAt,
      revoked: false,
    } as any)

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_LIFETIME,
      scope: authCode.scope || undefined,
      // Include user info so adapter knows which shop this token belongs to
      user_id: authCode.user_id,
      user_type: authCode.user_type,
    }
  }

  /**
   * Refresh tokens using a refresh token
   */
  async refreshTokens(input: RefreshTokenInput): Promise<TokenResponse> {
    // Validate client credentials
    const client = await this.validateClient(input.client_id, input.client_secret)
    if (!client) {
      throw new Error("Invalid client credentials")
    }

    // Check if client supports refresh_token grant
    const grants = client.grants as string[]
    if (!grants.includes(OAuthGrant.REFRESH_TOKEN)) {
      throw new Error("Client does not support refresh_token grant")
    }

    // Find and validate refresh token
    const tokens = await this.listOAuthRefreshTokens(
      {
        token: input.refresh_token,
        revoked: false,
      } as any,
      { relations: ["client"] }
    )

    if (!tokens.length) {
      throw new Error("Invalid refresh token")
    }

    const refreshTokenRecord = tokens[0] as any

    // Verify token belongs to this client
    if (refreshTokenRecord.client.id !== client.id) {
      throw new Error("Refresh token does not belong to this client")
    }

    // Check expiration
    if (new Date(refreshTokenRecord.expires_at) < new Date()) {
      await this.updateOAuthRefreshTokens(
        { id: refreshTokenRecord.id },
        { revoked: true }
      )
      throw new Error("Refresh token has expired")
    }

    // Revoke old refresh token (rotation)
    await this.updateOAuthRefreshTokens(
      { id: refreshTokenRecord.id },
      { revoked: true }
    )

    // Generate new tokens
    const newAccessToken = this.generateToken(32)
    const newRefreshToken = this.generateToken(32)
    const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_LIFETIME * 1000)
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_LIFETIME * 1000
    )

    // Use requested scope if provided and valid, otherwise use original scope
    const scope = input.scope || refreshTokenRecord.scope

    // Create new access token
    await this.createOAuthAccessTokens({
      token: newAccessToken,
      client_id: client.id, // belongsTo relation uses property_id
      user_id: refreshTokenRecord.user_id,
      user_type: refreshTokenRecord.user_type,
      scope,
      expires_at: accessTokenExpiresAt,
      revoked: false,
    } as any)

    // Create new refresh token
    await this.createOAuthRefreshTokens({
      token: newRefreshToken,
      client_id: client.id, // belongsTo relation uses property_id
      user_id: refreshTokenRecord.user_id,
      user_type: refreshTokenRecord.user_type,
      scope,
      expires_at: refreshTokenExpiresAt,
      revoked: false,
    } as any)

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_LIFETIME,
      scope: scope || undefined,
    }
  }

  /**
   * Validate an access token
   */
  async validateAccessToken(token: string): Promise<ValidatedToken | null> {
    const tokens = await this.listOAuthAccessTokens(
      {
        token,
        revoked: false,
      } as any,
      { relations: ["client"] }
    )

    if (!tokens.length) {
      return null
    }

    const accessToken = tokens[0] as any

    // Check expiration
    if (new Date(accessToken.expires_at) < new Date()) {
      return null
    }

    // Check if client is still valid
    if (accessToken.client.revoked) {
      return null
    }

    return {
      user_id: accessToken.user_id,
      user_type: accessToken.user_type,
      client_id: accessToken.client.client_id,
      scope: accessToken.scope,
    }
  }

  /**
   * Revoke all tokens for a client
   */
  async revokeClientTokens(clientIdValue: string): Promise<void> {
    const clients = await this.listOAuthClients({ client_id: clientIdValue } as any)
    if (!clients.length) {
      return
    }

    const client = clients[0] as any

    // Revoke all authorization codes
    const codes = await this.listOAuthAuthorizationCodes({ client_id: client.id } as any)
    for (const code of codes) {
      await this.updateOAuthAuthorizationCodes({ id: (code as any).id }, { revoked: true })
    }

    // Revoke all access tokens
    const accessTokens = await this.listOAuthAccessTokens({ client_id: client.id } as any)
    for (const token of accessTokens) {
      await this.updateOAuthAccessTokens({ id: (token as any).id }, { revoked: true })
    }

    // Revoke all refresh tokens
    const refreshTokens = await this.listOAuthRefreshTokens({ client_id: client.id } as any)
    for (const token of refreshTokens) {
      await this.updateOAuthRefreshTokens({ id: (token as any).id }, { revoked: true })
    }
  }

  /**
   * Revoke a specific access token
   */
  async revokeAccessToken(token: string): Promise<boolean> {
    const tokens = await this.listOAuthAccessTokens({ token } as any)
    if (!tokens.length) {
      return false
    }

    await this.updateOAuthAccessTokens({ id: (tokens[0] as any).id }, { revoked: true })
    return true
  }
}

export default OAuthModuleService

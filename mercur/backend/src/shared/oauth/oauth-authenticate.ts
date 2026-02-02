import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import OAuthModuleService from "../../modules/oauth/service"
import { OAUTH_MODULE } from "../../modules/oauth"
import { ValidatedToken } from "../../modules/oauth/types"

// Extend the MedusaRequest type to include OAuth context
declare module "@medusajs/framework/http" {
  interface MedusaRequest {
    oauth?: ValidatedToken
  }
}

export type OAuthAuthenticateOptions = {
  /**
   * Required scopes for the request
   * If provided, the access token must have all specified scopes
   */
  scopes?: string[]
  /**
   * If true, authentication is optional
   * Request will proceed even without valid token, but req.oauth won't be set
   */
  allowUnauthenticated?: boolean
}

/**
 * Middleware factory for OAuth Bearer token authentication
 *
 * @example
 * // Require OAuth authentication
 * oauthAuthenticate()
 *
 * @example
 * // Require OAuth authentication with specific scopes
 * oauthAuthenticate({ scopes: ["read:products", "write:products"] })
 *
 * @example
 * // Optional OAuth authentication
 * oauthAuthenticate({ allowUnauthenticated: true })
 */
export function oauthAuthenticate(options: OAuthAuthenticateOptions = {}) {
  const { scopes = [], allowUnauthenticated = false } = options

  return async function oauthAuthenticateMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const authHeader = req.headers.authorization

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (allowUnauthenticated) {
        return next()
      }
      return res.status(401).json({
        error: "unauthorized",
        error_description: "Missing or invalid Authorization header",
      })
    }

    const token = authHeader.substring(7) // Remove "Bearer " prefix

    if (!token) {
      if (allowUnauthenticated) {
        return next()
      }
      return res.status(401).json({
        error: "unauthorized",
        error_description: "Missing access token",
      })
    }

    try {
      const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)
      const validatedToken = await oauthService.validateAccessToken(token)

      if (!validatedToken) {
        if (allowUnauthenticated) {
          return next()
        }
        return res.status(401).json({
          error: "invalid_token",
          error_description: "Access token is invalid or expired",
        })
      }

      // Check required scopes if specified
      if (scopes.length > 0) {
        const tokenScopes = validatedToken.scope
          ? validatedToken.scope.split(" ")
          : []
        const hasAllScopes = scopes.every((s) => tokenScopes.includes(s))

        if (!hasAllScopes) {
          return res.status(403).json({
            error: "insufficient_scope",
            error_description: `Required scopes: ${scopes.join(", ")}`,
          })
        }
      }

      // Set OAuth context on request
      req.oauth = validatedToken

      return next()
    } catch (error: any) {
      console.error("OAuth authentication error:", error)

      if (allowUnauthenticated) {
        return next()
      }

      return res.status(401).json({
        error: "invalid_token",
        error_description: "Failed to validate access token",
      })
    }
  }
}

export default oauthAuthenticate

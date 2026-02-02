import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import OAuthModuleService from "../../../modules/oauth/service"
import { OAUTH_MODULE } from "../../../modules/oauth"
import { OAuthGrant } from "../../../modules/oauth/types"

type TokenRequestBody = {
  grant_type: string
  // For authorization_code grant
  code?: string
  redirect_uri?: string
  // For refresh_token grant
  refresh_token?: string
  // Common
  client_id: string
  client_secret: string
  scope?: string
}

/**
 * POST /oauth/token
 * Handles token exchange for authorization_code and refresh_token grants
 */
export async function POST(
  req: MedusaRequest<TokenRequestBody>,
  res: MedusaResponse
) {
  const {
    grant_type,
    code,
    redirect_uri,
    refresh_token,
    client_id,
    client_secret,
    scope,
  } = req.body

  // Validate required parameters
  if (!grant_type || !client_id || !client_secret) {
    return res.status(400).json({
      error: "invalid_request",
      error_description:
        "Missing required parameters: grant_type, client_id, client_secret",
    })
  }

  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)

  try {
    switch (grant_type) {
      case OAuthGrant.AUTHORIZATION_CODE: {
        // Validate authorization_code specific parameters
        if (!code || !redirect_uri) {
          return res.status(400).json({
            error: "invalid_request",
            error_description:
              "Missing required parameters for authorization_code grant: code, redirect_uri",
          })
        }

        const tokens = await oauthService.exchangeCodeForTokens({
          code,
          client_id,
          client_secret,
          redirect_uri,
        })

        return res.json(tokens)
      }

      case OAuthGrant.REFRESH_TOKEN: {
        // Validate refresh_token specific parameters
        if (!refresh_token) {
          return res.status(400).json({
            error: "invalid_request",
            error_description:
              "Missing required parameter for refresh_token grant: refresh_token",
          })
        }

        const tokens = await oauthService.refreshTokens({
          refresh_token,
          client_id,
          client_secret,
          scope,
        })

        return res.json(tokens)
      }

      default:
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: `Grant type '${grant_type}' is not supported. Supported types: authorization_code, refresh_token`,
        })
    }
  } catch (error: any) {
    console.error("OAuth token error:", error)

    // Map common errors to OAuth error responses
    const errorMessage = error.message || "Token exchange failed"

    if (
      errorMessage.includes("Invalid client") ||
      errorMessage.includes("Invalid client credentials")
    ) {
      return res.status(401).json({
        error: "invalid_client",
        error_description: "Client authentication failed",
      })
    }

    if (
      errorMessage.includes("Invalid authorization code") ||
      errorMessage.includes("Authorization code has expired") ||
      errorMessage.includes("Authorization code does not belong")
    ) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: errorMessage,
      })
    }

    if (
      errorMessage.includes("Invalid refresh token") ||
      errorMessage.includes("Refresh token has expired") ||
      errorMessage.includes("Refresh token does not belong")
    ) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: errorMessage,
      })
    }

    if (errorMessage.includes("Redirect URI mismatch")) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "redirect_uri does not match the original request",
      })
    }

    if (errorMessage.includes("does not support")) {
      return res.status(400).json({
        error: "unauthorized_client",
        error_description: errorMessage,
      })
    }

    return res.status(400).json({
      error: "invalid_request",
      error_description: errorMessage,
    })
  }
}

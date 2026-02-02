import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AuthenticationInput } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { generateLoginPage } from "../../../shared/oauth/login-template"
import OAuthModuleService from "../../../modules/oauth/service"
import { OAUTH_MODULE } from "../../../modules/oauth"

type AuthorizeQuery = {
  client_id?: string
  redirect_uri?: string
  response_type?: string
  scope?: string
  state?: string
}

type AuthorizeBody = {
  client_id: string
  redirect_uri: string
  response_type: string
  scope?: string
  state?: string
  email: string
  password: string
  user_type: "customer" | "user" | "seller"
}

/**
 * GET /oauth/authorize
 * Renders the login page for OAuth authorization
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.query as AuthorizeQuery
  const client_id = query.client_id as string | undefined
  const redirect_uri = query.redirect_uri as string | undefined
  const response_type = query.response_type as string | undefined
  const scope = query.scope as string | undefined
  const state = query.state as string | undefined

  // Validate required parameters
  if (!client_id || !redirect_uri || !response_type) {
    return res.status(400).json({
      error: "invalid_request",
      error_description:
        "Missing required parameters: client_id, redirect_uri, response_type",
    })
  }

  if (response_type !== "code") {
    return res.status(400).json({
      error: "unsupported_response_type",
      error_description: "Only response_type=code is supported",
    })
  }

  // Validate client
  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)
  const client = await oauthService.validateClientById(client_id)

  if (!client) {
    return res.status(400).json({
      error: "invalid_client",
      error_description: "Unknown client_id",
    })
  }

  // Validate redirect URI
  if (!oauthService.validateRedirectUri(client, redirect_uri)) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Invalid redirect_uri",
    })
  }

  // Render login page
  const html = generateLoginPage({
    clientId: client_id,
    redirectUri: redirect_uri,
    scope,
    state,
    clientName: client.name,
  })

  res.setHeader("Content-Type", "text/html")
  return res.send(html)
}

/**
 * POST /oauth/authorize
 * Handles the login form submission and redirects with authorization code
 */
export async function POST(
  req: MedusaRequest<AuthorizeBody>,
  res: MedusaResponse
) {
  const {
    client_id,
    redirect_uri,
    response_type,
    scope,
    state,
    email,
    password,
    user_type,
  } = req.body

  // Validate required parameters
  if (!client_id || !redirect_uri || !response_type || !email || !password) {
    return renderLoginWithError(res, req.body, "Missing required fields")
  }

  if (response_type !== "code") {
    return renderLoginWithError(
      res,
      req.body,
      "Only response_type=code is supported"
    )
  }

  // Validate user_type
  if (!["customer", "user", "seller"].includes(user_type)) {
    return renderLoginWithError(res, req.body, "Invalid user type")
  }

  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)
  const authModuleService = req.scope.resolve(Modules.AUTH)

  // Validate client
  const client = await oauthService.validateClientById(client_id)
  if (!client) {
    return renderLoginWithError(res, req.body, "Invalid client")
  }

  // Validate redirect URI
  if (!oauthService.validateRedirectUri(client, redirect_uri)) {
    return renderLoginWithError(res, req.body, "Invalid redirect URI")
  }

  // Map user_type to auth scope
  const authScope = user_type === "seller" ? "seller" : user_type

  try {
    // Authenticate user using Medusa Auth Module
    const authResult = await authModuleService.authenticate("emailpass", {
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: {
        email,
        password,
      },
      authScope,
      protocol: req.protocol,
    } as AuthenticationInput)

    if (!authResult.success) {
      return renderLoginWithError(
        res,
        req.body,
        authResult.error || "Invalid email or password"
      )
    }

    // Get the user ID from the auth identity
    const authIdentity = authResult.authIdentity
    if (!authIdentity) {
      return renderLoginWithError(res, req.body, "Authentication failed")
    }

    // The actor_id is the actual user ID (customer_id, user_id, etc.)
    // Find the provider identity to get entity_id
    const providerIdentity = authIdentity.provider_identities?.find(
      (p: any) => p.provider === "emailpass"
    )
    const userId =
      (authIdentity.app_metadata as any)?.user_id ||
      providerIdentity?.entity_id ||
      authIdentity.id

    // Generate authorization code
    const code = await oauthService.createAuthorizationCode({
      client_id,
      user_id: userId,
      user_type,
      redirect_uri,
      scope,
      state,
    })

    // Build redirect URL with authorization code
    const redirectUrl = new URL(redirect_uri)
    redirectUrl.searchParams.set("code", code)
    if (state) {
      redirectUrl.searchParams.set("state", state)
    }

    return res.redirect(redirectUrl.toString())
  } catch (error: any) {
    console.error("OAuth authorization error:", error)
    return renderLoginWithError(
      res,
      req.body,
      error.message || "Authentication failed"
    )
  }
}

function renderLoginWithError(
  res: MedusaResponse,
  params: Partial<AuthorizeBody>,
  error: string
) {
  const html = generateLoginPage({
    clientId: params.client_id || "",
    redirectUri: params.redirect_uri || "",
    scope: params.scope,
    state: params.state,
    error,
  })

  res.setHeader("Content-Type", "text/html")
  return res.status(400).send(html)
}

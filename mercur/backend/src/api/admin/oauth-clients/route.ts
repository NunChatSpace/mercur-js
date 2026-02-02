import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import OAuthModuleService from "../../../modules/oauth/service"
import { OAUTH_MODULE } from "../../../modules/oauth"

// Validation schema for creating OAuth client
export const CreateOAuthClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  redirect_uris: z
    .array(z.string().url("Each redirect URI must be a valid URL"))
    .min(1, "At least one redirect URI is required"),
  grants: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .optional()
    .default(["authorization_code", "refresh_token"]),
  scopes: z.array(z.string()).optional().default([]),
})

type CreateOAuthClientBody = z.infer<typeof CreateOAuthClientSchema>

/**
 * GET /admin/oauth-clients
 * List all OAuth clients (without secrets)
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)

  const clients = await oauthService.listOAuthClients({
    revoked: false,
  })

  // Remove sensitive data (client_secret) from response
  const sanitizedClients = clients.map((client: any) => ({
    id: client.id,
    client_id: client.client_id,
    name: client.name,
    redirect_uris: client.redirect_uris,
    grants: client.grants,
    scopes: client.scopes,
    revoked: client.revoked,
    created_at: client.created_at,
    updated_at: client.updated_at,
  }))

  return res.json({
    oauth_clients: sanitizedClients,
    count: sanitizedClients.length,
  })
}

/**
 * POST /admin/oauth-clients
 * Create a new OAuth client
 * Returns the client_secret only once at creation time
 */
export async function POST(
  req: AuthenticatedMedusaRequest<CreateOAuthClientBody>,
  res: MedusaResponse
) {
  // Validate request body
  const parseResult = CreateOAuthClientSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      error: "validation_error",
      error_description: "Invalid request body",
      details: parseResult.error.errors,
    })
  }

  const { name, redirect_uris, grants, scopes } = parseResult.data
  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)

  try {
    const { client, plainSecret } = await oauthService.createClient({
      name,
      redirect_uris,
      grants,
      scopes,
    })

    // Return client info with plaintext secret (only time it's available)
    return res.status(201).json({
      oauth_client: {
        id: client.id,
        client_id: client.client_id,
        client_secret: plainSecret, // Only returned at creation
        name: client.name,
        redirect_uris: client.redirect_uris,
        grants: client.grants,
        scopes: client.scopes,
        created_at: client.created_at,
      },
      message:
        "Store the client_secret securely. It cannot be retrieved again.",
    })
  } catch (error: any) {
    console.error("Error creating OAuth client:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to create OAuth client",
    })
  }
}

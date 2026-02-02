import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import OAuthModuleService from "../../../../modules/oauth/service"
import { OAUTH_MODULE } from "../../../../modules/oauth"

// Validation schema for updating OAuth client
export const UpdateOAuthClientSchema = z.object({
  name: z.string().min(1).optional(),
  redirect_uris: z
    .array(z.string().url("Each redirect URI must be a valid URL"))
    .min(1, "At least one redirect URI is required")
    .optional(),
  grants: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
  scopes: z.array(z.string()).optional(),
})

type UpdateOAuthClientBody = z.infer<typeof UpdateOAuthClientSchema>

/**
 * GET /admin/oauth-clients/:id
 * Get a specific OAuth client by ID
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)

  try {
    const client = await oauthService.retrieveOAuthClient(id)

    if (!client) {
      return res.status(404).json({
        error: "not_found",
        error_description: "OAuth client not found",
      })
    }

    // Remove sensitive data
    return res.json({
      oauth_client: {
        id: client.id,
        client_id: client.client_id,
        name: client.name,
        redirect_uris: client.redirect_uris,
        grants: client.grants,
        scopes: client.scopes,
        revoked: client.revoked,
        created_at: client.created_at,
        updated_at: client.updated_at,
      },
    })
  } catch (error: any) {
    if (error.message?.includes("not found") || error.type === "not_found") {
      return res.status(404).json({
        error: "not_found",
        error_description: "OAuth client not found",
      })
    }
    console.error("Error retrieving OAuth client:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to retrieve OAuth client",
    })
  }
}

/**
 * PUT /admin/oauth-clients/:id
 * Update an OAuth client
 */
export async function PUT(
  req: AuthenticatedMedusaRequest<UpdateOAuthClientBody>,
  res: MedusaResponse
) {
  const { id } = req.params

  // Validate request body
  const parseResult = UpdateOAuthClientSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      error: "validation_error",
      error_description: "Invalid request body",
      details: parseResult.error.errors,
    })
  }

  const updateData = parseResult.data
  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)

  try {
    // Check if client exists
    const existingClient = await oauthService.retrieveOAuthClient(id)
    if (!existingClient) {
      return res.status(404).json({
        error: "not_found",
        error_description: "OAuth client not found",
      })
    }

    // Update the client
    const updatedClient = await oauthService.updateOAuthClients(
      { id },
      updateData
    )

    // Remove sensitive data
    return res.json({
      oauth_client: {
        id: updatedClient.id,
        client_id: updatedClient.client_id,
        name: updatedClient.name,
        redirect_uris: updatedClient.redirect_uris,
        grants: updatedClient.grants,
        scopes: updatedClient.scopes,
        revoked: updatedClient.revoked,
        created_at: updatedClient.created_at,
        updated_at: updatedClient.updated_at,
      },
    })
  } catch (error: any) {
    if (error.message?.includes("not found") || error.type === "not_found") {
      return res.status(404).json({
        error: "not_found",
        error_description: "OAuth client not found",
      })
    }
    console.error("Error updating OAuth client:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to update OAuth client",
    })
  }
}

/**
 * DELETE /admin/oauth-clients/:id
 * Revoke (soft delete) an OAuth client
 */
export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const oauthService = req.scope.resolve<OAuthModuleService>(OAUTH_MODULE)

  try {
    // Check if client exists
    const existingClient = await oauthService.retrieveOAuthClient(id)
    if (!existingClient) {
      return res.status(404).json({
        error: "not_found",
        error_description: "OAuth client not found",
      })
    }

    // Revoke the client (soft delete)
    await oauthService.updateOAuthClients({ id }, { revoked: true })

    // Also revoke all tokens for this client
    await oauthService.revokeClientTokens(existingClient.client_id)

    return res.status(200).json({
      id,
      object: "oauth_client",
      deleted: true,
    })
  } catch (error: any) {
    if (error.message?.includes("not found") || error.type === "not_found") {
      return res.status(404).json({
        error: "not_found",
        error_description: "OAuth client not found",
      })
    }
    console.error("Error deleting OAuth client:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to delete OAuth client",
    })
  }
}

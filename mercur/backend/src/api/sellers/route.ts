import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /sellers
 * List all sellers with optional pagination
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Parse pagination params
  const limit = parseInt(req.query.limit as string) || 50
  const offset = parseInt(req.query.offset as string) || 0

  try {
    const { data: sellers } = await query.graph({
      entity: "seller",
      fields: ["id", "name", "created_at", "updated_at"],
      pagination: {
        skip: offset,
        take: limit,
      },
    })

    // Get total count
    const { data: allSellers } = await query.graph({
      entity: "seller",
      fields: ["id"],
    })

    return res.json({
      sellers,
      count: allSellers.length,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("Error listing sellers:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to list sellers",
    })
  }
}

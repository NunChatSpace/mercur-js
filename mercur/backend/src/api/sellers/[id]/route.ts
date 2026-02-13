import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /sellers/:id
 * Get a specific seller by ID
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { data: sellers } = await query.graph({
      entity: "seller",
      fields: ["id", "name", "created_at", "updated_at"],
      filters: {
        id,
      },
    })

    if (!sellers || sellers.length === 0) {
      return res.status(404).json({
        error: "not_found",
        error_description: "Seller not found",
      })
    }

    return res.json({
      seller: sellers[0],
    })
  } catch (error: any) {
    console.error("Error retrieving seller:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to retrieve seller",
    })
  }
}

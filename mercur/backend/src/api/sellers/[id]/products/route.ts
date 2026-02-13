import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SELLER_PRODUCT_LINK } from "@mercurjs/framework"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * GET /sellers/:id/products
 * Get products for a specific seller with pagination
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id: sellerId } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Parse pagination params
  const limit = parseInt(req.query.limit as string) || 50
  const offset = parseInt(req.query.offset as string) || 0

  try {
    // First verify the seller exists
    const { data: sellers } = await query.graph({
      entity: "seller",
      fields: ["id"],
      filters: {
        id: sellerId,
      },
    })

    if (!sellers || sellers.length === 0) {
      return res.status(404).json({
        error: "not_found",
        error_description: "Seller not found",
      })
    }

    // Query product links for this seller
    const { data: productLinks } = await query.graph({
      entity: SELLER_PRODUCT_LINK,
      fields: ["product_id"],
      filters: {
        seller_id: sellerId,
      },
    })

    // Get product IDs
    const productIds = productLinks.map((link: any) => link.product_id)

    if (productIds.length === 0) {
      return res.json({
        products: [],
        count: 0,
        limit,
        offset,
      })
    }

    // Query products with pagination
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "thumbnail",
        "created_at",
        "updated_at",
        "variants.id",
        "variants.title",
        "variants.sku",
      ],
      filters: {
        id: productIds,
      },
      pagination: {
        skip: offset,
        take: limit,
      },
    })

    return res.json({
      products,
      count: productIds.length,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("Error retrieving seller products:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to retrieve seller products",
    })
  }
}

/**
 * POST /sellers/:id/products
 * Create a product for a specific seller
 * Requires OAuth authentication (adapter bearer token)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: sellerId } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  try {
    // Verify the seller exists
    const { data: sellers } = await query.graph({
      entity: "seller",
      fields: ["id"],
      filters: {
        id: sellerId,
      },
    })

    if (!sellers || sellers.length === 0) {
      return res.status(404).json({
        error: "not_found",
        error_description: "Seller not found",
      })
    }

    // Build product input from request body
    const productData = req.body as Record<string, any>

    const { result } = await createProductsWorkflow.run({
      container: req.scope,
      input: {
        products: [productData],
        additional_data: {
          seller_id: sellerId,
        },
      },
    })

    return res.status(201).json({
      product: result[0],
    })
  } catch (error: any) {
    console.error("Error creating seller product:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: error.message || "Failed to create seller product",
    })
  }
}

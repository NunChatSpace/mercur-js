import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import WebhookModuleService from "../../../../modules/webhook/service"
import { WEBHOOK_MODULE } from "../../../../modules/webhook"
import { WebhookEventType } from "../../../../modules/webhook/types"

// Validation schema for webhook registration
export const CreateWebhookRegistrationSchema = z.object({
  url: z.string().url("URL must be a valid URL"),
  event_types: z
    .array(z.nativeEnum(WebhookEventType))
    .min(1, "At least one event type is required"),
  shop_id: z.string().min(1, "shop_id is required"),
})

type CreateWebhookRegistrationBody = z.infer<typeof CreateWebhookRegistrationSchema>

/**
 * POST /mock-platform/:platform/webhook
 * Register a webhook endpoint for a platform/shop
 * Requires OAuth Bearer token authentication
 */
export async function POST(
  req: MedusaRequest<CreateWebhookRegistrationBody>,
  res: MedusaResponse
) {
  const { platform } = req.params

  // Validate Bearer token
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      error_description: "Missing or invalid Authorization header",
    })
  }

  // Validate request body
  const parseResult = CreateWebhookRegistrationSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      error: "validation_error",
      error_description: "Invalid request body",
      details: parseResult.error.errors,
    })
  }

  const { url, event_types, shop_id } = parseResult.data

  try {
    const webhookService = req.scope.resolve<WebhookModuleService>(WEBHOOK_MODULE)

    // Check if registration already exists for this platform/shop
    const existing = await webhookService.findRegistration(platform, shop_id)
    if (existing) {
      // Update existing registration
      await webhookService.updateWebhookRegistrations(
        { id: existing.id },
        { url, event_types, is_active: true }
      )

      const updated = await webhookService.retrieveWebhookRegistration(existing.id)
      return res.status(200).json({
        webhook: {
          id: updated.id,
          platform_id: updated.platform_id,
          shop_id: updated.shop_id,
          url: updated.url,
          event_types: updated.event_types,
          is_active: updated.is_active,
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        },
        message: "Webhook registration updated",
      })
    }

    // Create new registration
    const { registration, secret } = await webhookService.registerWebhook({
      platform_id: platform,
      shop_id,
      url,
      event_types,
    })

    return res.status(201).json({
      webhook: {
        id: registration.id,
        platform_id: registration.platform_id,
        shop_id: registration.shop_id,
        url: registration.url,
        event_types: registration.event_types,
        is_active: registration.is_active,
        created_at: registration.created_at,
        updated_at: registration.updated_at,
      },
      // Secret is only returned on creation
      secret,
      message: "Webhook registered successfully. Store the secret securely - it will not be shown again.",
    })
  } catch (error: any) {
    console.error("Webhook registration error:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: "Failed to register webhook",
    })
  }
}

/**
 * GET /mock-platform/:platform/webhook
 * Get webhook registration for a platform/shop
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { platform } = req.params
  const shop_id = req.query.shop_id as string

  // Validate Bearer token
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      error_description: "Missing or invalid Authorization header",
    })
  }

  if (!shop_id) {
    return res.status(400).json({
      error: "validation_error",
      error_description: "shop_id query parameter is required",
    })
  }

  try {
    const webhookService = req.scope.resolve<WebhookModuleService>(WEBHOOK_MODULE)
    const registration = await webhookService.findRegistration(platform, shop_id)

    if (!registration) {
      return res.status(404).json({
        error: "not_found",
        error_description: "Webhook registration not found",
      })
    }

    return res.status(200).json({
      webhook: {
        id: registration.id,
        platform_id: registration.platform_id,
        shop_id: registration.shop_id,
        url: registration.url,
        event_types: registration.event_types,
        is_active: registration.is_active,
        created_at: registration.created_at,
        updated_at: registration.updated_at,
      },
    })
  } catch (error: any) {
    console.error("Webhook retrieval error:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: "Failed to retrieve webhook",
    })
  }
}

/**
 * DELETE /mock-platform/:platform/webhook
 * Deactivate webhook registration for a platform/shop
 */
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { platform } = req.params
  const shop_id = req.query.shop_id as string

  // Validate Bearer token
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      error_description: "Missing or invalid Authorization header",
    })
  }

  if (!shop_id) {
    return res.status(400).json({
      error: "validation_error",
      error_description: "shop_id query parameter is required",
    })
  }

  try {
    const webhookService = req.scope.resolve<WebhookModuleService>(WEBHOOK_MODULE)
    const registration = await webhookService.findRegistration(platform, shop_id)

    if (!registration) {
      return res.status(404).json({
        error: "not_found",
        error_description: "Webhook registration not found",
      })
    }

    await webhookService.deactivateWebhook(registration.id)

    return res.status(200).json({
      message: "Webhook deactivated successfully",
    })
  } catch (error: any) {
    console.error("Webhook deactivation error:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: "Failed to deactivate webhook",
    })
  }
}

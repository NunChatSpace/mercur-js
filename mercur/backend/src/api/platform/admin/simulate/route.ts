import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import WebhookModuleService from "../../../../modules/webhook/service"
import { WEBHOOK_MODULE } from "../../../../modules/webhook"
import { WebhookEventType } from "../../../../modules/webhook/types"

// Validation schema for simulate request
export const SimulateWebhookSchema = z.object({
  type: z.literal("webhook_event"),
  platform: z.string().min(1, "platform is required"),
  shop_id: z.string().min(1, "shop_id is required"),
  event_type: z.nativeEnum(WebhookEventType),
  data: z.record(z.any()),
})

type SimulateWebhookBody = z.infer<typeof SimulateWebhookSchema>

/**
 * POST /mock-platform/admin/simulate
 * Trigger a webhook event for testing purposes
 */
export async function POST(
  req: MedusaRequest<SimulateWebhookBody>,
  res: MedusaResponse
) {
  // Validate request body
  const parseResult = SimulateWebhookSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      error: "validation_error",
      error_description: "Invalid request body",
      details: parseResult.error.errors,
    })
  }

  const { platform, shop_id, event_type, data } = parseResult.data

  try {
    const webhookService = req.scope.resolve<WebhookModuleService>(WEBHOOK_MODULE)

    // Trigger the webhook event
    const { deliveries, results } = await webhookService.triggerWebhookEvent(
      platform,
      shop_id,
      event_type,
      data
    )

    // Summarize results
    const successCount = results.filter((r) => r.success).length
    const failureCount = results.filter((r) => !r.success).length

    return res.status(200).json({
      message: `Webhook event triggered`,
      event_type,
      platform,
      shop_id,
      summary: {
        total_deliveries: deliveries.length,
        succeeded: successCount,
        failed: failureCount,
      },
      deliveries: deliveries.map((d, i) => ({
        id: d.id,
        status: results[i].success ? "delivered" : "failed",
        error: results[i].error || null,
      })),
    })
  } catch (error: any) {
    console.error("Simulate webhook error:", error)
    return res.status(500).json({
      error: "server_error",
      error_description: "Failed to simulate webhook event",
    })
  }
}

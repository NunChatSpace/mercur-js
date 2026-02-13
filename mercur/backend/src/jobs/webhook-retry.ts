import { MedusaContainer } from "@medusajs/framework/types"
import WebhookModuleService from "../modules/webhook/service"
import { WEBHOOK_MODULE } from "../modules/webhook"

/**
 * Scheduled job to process webhook delivery retries
 * Runs every minute to check for deliveries that are ready for retry
 */
export default async function webhookRetryJob(container: MedusaContainer) {
  const webhookService = container.resolve<WebhookModuleService>(WEBHOOK_MODULE)

  try {
    const result = await webhookService.processRetries()

    if (result.processed > 0) {
      console.log(
        `[webhook-retry] Processed ${result.processed} retries: ${result.succeeded} succeeded, ${result.failed} failed`
      )
    }
  } catch (error: any) {
    console.error("[webhook-retry] Error processing retries:", error.message)
  }
}

export const config = {
  name: "webhook-retry",
  schedule: "* * * * *", // Every minute
}

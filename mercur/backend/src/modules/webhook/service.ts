import { MedusaService } from "@medusajs/framework/utils"
import crypto from "crypto"
import { WebhookRegistration, WebhookDelivery } from "./models"
import {
  CreateWebhookRegistrationInput,
  CreateWebhookDeliveryInput,
  WebhookDeliveryStatus,
} from "./types"
import {
  deliverWebhook,
  buildWebhookPayload,
  WebhookDeliveryResult,
} from "../../shared/webhook"

const DEFAULT_MAX_ATTEMPTS = 3

class WebhookModuleService extends MedusaService({
  WebhookRegistration,
  WebhookDelivery,
}) {
  /**
   * Generate a cryptographically secure webhook secret
   */
  private generateSecret(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString("hex")
  }

  /**
   * Register a new webhook endpoint
   */
  async registerWebhook(
    input: CreateWebhookRegistrationInput
  ): Promise<{ registration: any; secret: string }> {
    const secret = this.generateSecret()

    const registration = await this.createWebhookRegistrations({
      platform_id: input.platform_id,
      shop_id: input.shop_id,
      url: input.url,
      event_types: input.event_types,
      secret,
      is_active: true,
    } as any)

    return { registration, secret }
  }

  /**
   * Find active webhook registrations by platform, shop, and event type
   */
  async findActiveRegistrations(
    platformId: string,
    shopId: string,
    eventType: string
  ): Promise<any[]> {
    const registrations = await this.listWebhookRegistrations({
      platform_id: platformId,
      shop_id: shopId,
      is_active: true,
    } as any)

    // Filter by event type (event_types is a JSON array)
    return registrations.filter((reg: any) => {
      const eventTypes = reg.event_types as string[]
      return eventTypes.includes(eventType)
    })
  }

  /**
   * Find registration by platform and shop
   */
  async findRegistration(
    platformId: string,
    shopId: string
  ): Promise<any | null> {
    const registrations = await this.listWebhookRegistrations({
      platform_id: platformId,
      shop_id: shopId,
    } as any)

    return registrations.length ? registrations[0] : null
  }

  /**
   * Deactivate a webhook registration
   */
  async deactivateWebhook(registrationId: string): Promise<void> {
    await this.updateWebhookRegistrations(
      { id: registrationId },
      { is_active: false }
    )
  }

  // ============================================
  // Webhook Delivery Methods
  // ============================================

  /**
   * Create a webhook delivery record
   */
  async createDelivery(input: CreateWebhookDeliveryInput): Promise<any> {
    const result = await this.createWebhookDeliveries({
      registration_id: input.registration_id,
      event_type: input.event_type,
      payload: input.payload,
      status: WebhookDeliveryStatus.PENDING,
      attempt_count: 0,
      max_attempts: input.max_attempts || DEFAULT_MAX_ATTEMPTS,
      next_retry_at: null,
      last_error: null,
    } as any)

    // createWebhookDeliveries returns an array, extract the first item
    const delivery = Array.isArray(result) ? result[0] : result
    console.log(`[webhook] Created delivery: ${delivery?.id} for registration: ${input.registration_id}`)
    return delivery
  }

  /**
   * Create delivery records for all matching registrations
   */
  async createDeliveriesForEvent(
    platformId: string,
    shopId: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<any[]> {
    const registrations = await this.findActiveRegistrations(
      platformId,
      shopId,
      eventType
    )

    const deliveries = await Promise.all(
      registrations.map((registration) =>
        this.createDelivery({
          registration_id: registration.id,
          event_type: eventType,
          payload,
        })
      )
    )

    return deliveries
  }

  /**
   * Mark delivery as delivered (success)
   */
  async markDeliverySuccess(deliveryId: string): Promise<void> {
    await this.updateWebhookDeliveries(
      { id: deliveryId },
      {
        status: WebhookDeliveryStatus.DELIVERED,
        last_error: null,
      }
    )
  }

  /**
   * Mark delivery as failed and schedule retry if attempts remain
   */
  async markDeliveryFailed(
    deliveryId: string,
    error: string,
    attemptCount: number,
    maxAttempts: number
  ): Promise<{ shouldRetry: boolean; nextRetryAt: Date | null }> {
    const newAttemptCount = attemptCount + 1

    if (newAttemptCount >= maxAttempts) {
      // Max attempts reached, mark as failed
      await this.updateWebhookDeliveries(
        { id: deliveryId },
        {
          status: WebhookDeliveryStatus.FAILED,
          attempt_count: newAttemptCount,
          last_error: error,
          next_retry_at: null,
        }
      )
      return { shouldRetry: false, nextRetryAt: null }
    }

    // Calculate exponential backoff: 1s * 2^attempt (1s, 2s, 4s, 8s...)
    const delayMs = 1000 * Math.pow(2, newAttemptCount)
    const nextRetryAt = new Date(Date.now() + delayMs)

    await this.updateWebhookDeliveries(
      { id: deliveryId },
      {
        status: WebhookDeliveryStatus.RETRYING,
        attempt_count: newAttemptCount,
        last_error: error,
        next_retry_at: nextRetryAt,
      }
    )

    return { shouldRetry: true, nextRetryAt }
  }

  /**
   * Find deliveries that are ready for retry
   */
  async findPendingRetries(): Promise<any[]> {
    const now = new Date()

    // Get all retrying deliveries
    const deliveries = await this.listWebhookDeliveries(
      {
        status: WebhookDeliveryStatus.RETRYING,
      } as any,
      { relations: ["registration"] }
    )

    // Filter to those where next_retry_at <= now
    return deliveries.filter((delivery: any) => {
      if (!delivery.next_retry_at) return false
      return new Date(delivery.next_retry_at) <= now
    })
  }

  /**
   * Find pending deliveries (initial delivery attempt)
   */
  async findPendingDeliveries(): Promise<any[]> {
    const deliveries = await this.listWebhookDeliveries(
      {
        status: WebhookDeliveryStatus.PENDING,
      } as any,
      { relations: ["registration"] }
    )

    return deliveries
  }

  /**
   * Get delivery with registration details
   */
  async getDeliveryWithRegistration(deliveryId: string): Promise<any> {
    const delivery = await this.retrieveWebhookDelivery(deliveryId, {
      relations: ["registration"],
    })
    return delivery
  }

  // ============================================
  // Webhook Delivery Execution
  // ============================================

  /**
   * Execute delivery for a single delivery record
   */
  async executeDelivery(deliveryId: string): Promise<WebhookDeliveryResult> {
    console.log(`[webhook] Executing delivery: ${deliveryId}`)

    if (!deliveryId) {
      console.error(`[webhook] Invalid delivery ID: ${deliveryId}`)
      return { success: false, error: "Invalid delivery ID" }
    }

    const delivery = await this.getDeliveryWithRegistration(deliveryId)
    const registration = delivery.registration

    console.log(`[webhook] Delivery loaded, registration: ${registration?.id}, url: ${registration?.url}`)

    if (!registration || !registration.is_active) {
      console.error(`[webhook] Registration not found or inactive for delivery ${deliveryId}`)
      await this.updateWebhookDeliveries(
        { id: deliveryId },
        {
          status: WebhookDeliveryStatus.FAILED,
          last_error: "Registration not found or inactive",
        }
      )
      return { success: false, error: "Registration not found or inactive" }
    }

    const payload = buildWebhookPayload(delivery.event_type, delivery.payload)
    console.log(`[webhook] Sending to ${registration.url} with event ${delivery.event_type}`)

    const result = await deliverWebhook({
      url: registration.url,
      secret: registration.secret,
      eventType: delivery.event_type,
      payload,
    })

    console.log(`[webhook] Delivery result: ${JSON.stringify(result)}`)

    if (result.success) {
      try {
        await this.markDeliverySuccess(deliveryId)
        console.log(`[webhook] Marked delivery ${deliveryId} as delivered`)
      } catch (err: any) {
        console.error(`[webhook] Failed to mark delivery as success: ${err.message}`)
      }
    } else {
      try {
        await this.markDeliveryFailed(
          deliveryId,
          result.error || "Unknown error",
          delivery.attempt_count,
          delivery.max_attempts
        )
        console.log(`[webhook] Marked delivery ${deliveryId} as failed/retrying`)
      } catch (err: any) {
        console.error(`[webhook] Failed to mark delivery as failed: ${err.message}`)
      }
    }

    return result
  }

  /**
   * Trigger webhook event - creates deliveries and executes them
   */
  async triggerWebhookEvent(
    platformId: string,
    shopId: string,
    eventType: string,
    data: Record<string, any>
  ): Promise<{ deliveries: any[]; results: WebhookDeliveryResult[] }> {
    // Create delivery records for all matching registrations
    const deliveries = await this.createDeliveriesForEvent(
      platformId,
      shopId,
      eventType,
      data
    )

    // Execute deliveries
    const results = await Promise.all(
      deliveries.map((delivery) => this.executeDelivery(delivery.id))
    )

    return { deliveries, results }
  }

  /**
   * Process all pending retries
   */
  async processRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const pendingRetries = await this.findPendingRetries()
    let succeeded = 0
    let failed = 0

    for (const delivery of pendingRetries) {
      const result = await this.executeDelivery(delivery.id)
      if (result.success) {
        succeeded++
      } else {
        failed++
      }
    }

    return {
      processed: pendingRetries.length,
      succeeded,
      failed,
    }
  }
}

export default WebhookModuleService

import { generateWebhookSignature } from "./signature"

export type WebhookPayload = {
  event_type: string
  timestamp: string
  data: Record<string, any>
}

export type WebhookDeliveryResult = {
  success: boolean
  statusCode?: number
  error?: string
}

export type WebhookDeliveryOptions = {
  url: string
  secret: string
  eventType: string
  payload: WebhookPayload
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30000 // 30 seconds

/**
 * Build webhook payload with event metadata
 */
export function buildWebhookPayload(
  eventType: string,
  data: Record<string, any>
): WebhookPayload {
  return {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    data,
  }
}

/**
 * Deliver webhook to the registered URL with signature
 */
export async function deliverWebhook(
  options: WebhookDeliveryOptions
): Promise<WebhookDeliveryResult> {
  const { url, secret, eventType, payload, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const payloadString = JSON.stringify(payload)
  const signature = generateWebhookSignature(payloadString, secret)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": eventType,
      },
      body: payloadString,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
      }
    }

    // Non-2xx response
    const errorText = await response.text().catch(() => "Unknown error")
    return {
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
    }
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error.name === "AbortError") {
      return {
        success: false,
        error: `Timeout after ${timeoutMs}ms`,
      }
    }

    return {
      success: false,
      error: error.message || "Unknown error",
    }
  }
}

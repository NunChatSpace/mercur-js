export type WebhookRegistrationDTO = {
  id: string
  platform_id: string
  shop_id: string
  url: string
  event_types: string[]
  secret: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export type CreateWebhookRegistrationInput = {
  platform_id: string
  shop_id: string
  url: string
  event_types: string[]
}

export type UpdateWebhookRegistrationInput = {
  url?: string
  event_types?: string[]
  is_active?: boolean
}

export enum WebhookEventType {
  ORDER_PLACED = "order.placed",
  ORDER_CREATED = "order.created",
  ORDER_UPDATED = "order.updated",
  ORDER_CANCELLED = "order.cancelled",
  ORDER_COMPLETED = "order.completed",
  ORDER_FULFILLMENT_CREATED = "order.fulfillment_created",
}

// Webhook Delivery Types
export type WebhookDeliveryDTO = {
  id: string
  registration_id: string
  event_type: string
  payload: Record<string, any>
  status: WebhookDeliveryStatus
  attempt_count: number
  max_attempts: number
  next_retry_at: Date | null
  last_error: string | null
  created_at: Date
  updated_at: Date
}

export enum WebhookDeliveryStatus {
  PENDING = "pending",
  RETRYING = "retrying",
  DELIVERED = "delivered",
  FAILED = "failed",
}

export type CreateWebhookDeliveryInput = {
  registration_id: string
  event_type: string
  payload: Record<string, any>
  max_attempts?: number
}

export type UpdateWebhookDeliveryInput = {
  status?: WebhookDeliveryStatus
  attempt_count?: number
  next_retry_at?: Date | null
  last_error?: string | null
}

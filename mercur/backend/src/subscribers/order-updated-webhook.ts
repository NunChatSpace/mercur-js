import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import WebhookModuleService from "../modules/webhook/service"
import { WEBHOOK_MODULE } from "../modules/webhook"
import { WebhookEventType } from "../modules/webhook/types"

type OrderUpdatedEventData = {
  id?: string
  order_id?: string
  fulfillment_id?: string
}

/**
 * Subscriber that triggers webhook delivery when an order status changes
 * (updated, canceled, completed, fulfillment created)
 * Groups order items by seller and dispatches webhook for each seller
 */
export default async function orderUpdatedWebhookHandler({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<OrderUpdatedEventData>) {
  // Normalize order ID from different payload shapes
  let orderId = data.order_id || data.id

  // Shipment/delivery events only include fulfillment id
  if (!orderId && (eventName === "shipment.created" || eventName === "delivery.created")) {
    const fulfillmentId = data.fulfillment_id || data.id
    if (fulfillmentId) {
      const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      const link = await db("order_fulfillment")
        .select("order_id")
        .where("fulfillment_id", fulfillmentId)
        .first()
      orderId = link?.order_id
    }
  }

  if (!orderId) {
    console.error(`[order-updated-webhook] No order ID found in event data`)
    return
  }

  try {
    const webhookService = container.resolve<WebhookModuleService>(WEBHOOK_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Retrieve the order with status, items, and fulfillments
    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "currency_code",
        "created_at",
        "updated_at",
        "items.*",
        "items.variant.*",
        "fulfillments.*",
      ],
      filters: {
        id: orderId,
      },
    })

    if (!order) {
      console.error(`[order-updated-webhook] Order ${orderId} not found`)
      return
    }

    console.log(
      `[order-updated-webhook] Processing event ${eventName} for order ${orderId} with ${order.items?.length || 0} items`
    )

    // Get product IDs from order items
    const productIds: string[] = []
    for (const item of order.items || []) {
      const productId = (item as any).variant?.product_id || (item as any).product_id
      if (productId) {
        productIds.push(productId)
      }
    }

    if (productIds.length === 0) {
      console.log(`[order-updated-webhook] No products found in order ${orderId}`)
      return
    }

    // Query seller-product links using Knex
    const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const sellerProductLinks = await db("seller_seller_product_product")
      .select("seller_id", "product_id")
      .whereIn("product_id", productIds)

    // Build a map of product_id -> seller_id
    const productToSeller = new Map<string, string>()
    for (const link of sellerProductLinks || []) {
      productToSeller.set(link.product_id, link.seller_id)
    }

    // Group items by seller_id
    const itemsBySeller = new Map<string, any[]>()

    for (const item of order.items || []) {
      const productId = (item as any).variant?.product_id || (item as any).product_id
      const sellerId = productToSeller.get(productId)

      if (!sellerId) continue

      if (!itemsBySeller.has(sellerId)) {
        itemsBySeller.set(sellerId, [])
      }
      itemsBySeller.get(sellerId)!.push(item)
    }

    // Trigger webhook for each seller
    for (const [sellerId, items] of itemsBySeller) {
      const sellerPayload = {
        order_id: order.id,
        seller_id: sellerId,
        shop_id: sellerId,
        event_name: eventName,
        status: (order as any).status,
        items: items.map((item: any) => ({
          id: item.id,
          variant_id: item.variant_id,
          product_id: item.variant?.product_id || item.product_id,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        })),
        fulfillments: (order as any).fulfillments || [],
        currency_code: order.currency_code,
        updated_at: order.updated_at,
      }

      try {
        await webhookService.triggerWebhookEvent(
          "default",
          sellerId,
          WebhookEventType.ORDER_UPDATED,
          sellerPayload
        )
        console.log(
          `[order-updated-webhook] Triggered webhook for event ${eventName}, order ${orderId}, seller ${sellerId}`
        )
      } catch (webhookError: any) {
        console.error(
          `[order-updated-webhook] Failed to trigger webhook for seller ${sellerId}:`,
          webhookError.message
        )
      }
    }
  } catch (error: any) {
    console.error(
      `[order-updated-webhook] Error processing event ${eventName} for order ${orderId}:`,
      error.message
    )
    console.error(`[order-updated-webhook] Stack:`, error.stack)
  }
}

export const config: SubscriberConfig = {
  event: [
    "order.updated",
    "order.canceled",
    "order.completed",
    "order.fulfillment_created",
    "shipment.created",
    "delivery.created",
  ],
}

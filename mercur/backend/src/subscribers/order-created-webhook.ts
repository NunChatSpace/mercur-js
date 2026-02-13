import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import WebhookModuleService from "../modules/webhook/service"
import { WEBHOOK_MODULE } from "../modules/webhook"
import { WebhookEventType } from "../modules/webhook/types"

type OrderCreatedEventData = {
  id: string
}

/**
 * Subscriber that triggers webhook delivery when an order is created
 * Groups order items by seller and dispatches webhook for each seller
 */
export default async function orderCreatedWebhookHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderCreatedEventData>) {
  const orderId = data.id

  try {
    const webhookService = container.resolve<WebhookModuleService>(WEBHOOK_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Retrieve the order with items using Query API
    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "currency_code",
        "created_at",
        "customer_id",
        "email",
        "shipping_address.*",
        "billing_address.*",
        "items.*",
        "items.variant.*",
      ],
      filters: {
        id: orderId
      }
    })

    if (!order) {
      console.error(`[order-placed-webhook] Order ${orderId} not found`)
      return
    }

    console.log(`[order-placed-webhook] Processing order ${orderId} with ${order.items?.length || 0} items`)

    // Get product IDs from order items
    const productIds: string[] = []
    for (const item of order.items || []) {
      const productId = (item as any).variant?.product_id || (item as any).product_id
      console.log(`[order-placed-webhook] Item: ${(item as any).title}, product_id: ${productId}`)
      if (productId) {
        productIds.push(productId)
      }
    }

    if (productIds.length === 0) {
      console.log(`[order-placed-webhook] No products found in order ${orderId}`)
      return
    }

    console.log(`[order-placed-webhook] Product IDs: ${productIds.join(', ')}`)

    // Query seller-product links using Knex
    const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const sellerProductLinks = await db("seller_seller_product_product")
      .select("seller_id", "product_id")
      .whereIn("product_id", productIds)

    console.log(`[order-placed-webhook] Found ${sellerProductLinks?.length || 0} seller-product links`)

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
      // Build per-seller payload
      const sellerOrderPayload = {
        order_id: order.id,
        seller_id: sellerId,
        shop_id: sellerId,  // Adapter expects shop_id for routing
        items: items.map((item: any) => ({
          id: item.id,
          variant_id: item.variant_id,
          product_id: item.variant?.product_id || item.product_id,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        })),
        currency_code: order.currency_code,
        created_at: order.created_at,
        customer_id: order.customer_id,
        email: order.email,
        shipping_address: order.shipping_address,
        billing_address: order.billing_address,
      }

      // Trigger webhook - failures won't block order creation
      // Use 'default' as platformId since we removed platform concept
      try {
        await webhookService.triggerWebhookEvent(
          "default",
          sellerId,
          WebhookEventType.ORDER_PLACED,
          sellerOrderPayload
        )
        console.log(
          `[order-placed-webhook] Triggered webhook for order ${orderId}, seller ${sellerId}`
        )
      } catch (webhookError: any) {
        // Log but don't throw - webhook failure shouldn't affect order
        console.error(
          `[order-placed-webhook] Failed to trigger webhook for seller ${sellerId}:`,
          webhookError.message
        )
      }
    }
  } catch (error: any) {
    // Log but don't throw - don't block order creation
    console.error(
      `[order-placed-webhook] Error processing order ${orderId}:`,
      error.message
    )
    console.error(`[order-placed-webhook] Stack:`, error.stack)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}

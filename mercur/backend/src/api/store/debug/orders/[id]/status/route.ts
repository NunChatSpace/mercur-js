import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  completeOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
} from "@medusajs/medusa/core-flows"
import { UpdateOrderStatusSchema } from "./middlewares"

export async function POST(
  req: MedusaRequest<UpdateOrderStatusSchema>,
  res: MedusaResponse
) {
  const { id: orderId } = req.params
  const { action } = req.validatedBody
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "fulfillment_status",
      "payment_status",
      "items.id",
      "items.quantity",
      "items.requires_shipping",
      "fulfillments.id",
    ],
    filters: {
      id: orderId,
    },
  })

  const order = orders?.[0]
  if (!order) {
    return res.status(404).json({
      error: "not_found",
      message: "Order not found",
    })
  }

  const items = (order.items || [])
    .filter((item: any) => item.requires_shipping !== false)
    .map((item: any) => ({
      id: item.id,
      quantity: item.quantity,
    }))

  if ((action === "fulfill" || action === "ship") && items.length === 0) {
    return res.status(400).json({
      error: "invalid_items",
      message: "Order has no shippable items",
    })
  }

  if (action === "cancel") {
    await cancelOrderWorkflow.run({
      container: req.scope,
      input: {
        order_id: orderId,
      },
    })
  }

  if (action === "complete") {
    await completeOrderWorkflow.run({
      container: req.scope,
      input: {
        orderIds: [orderId],
      },
    })
  }

  if (action === "fulfill") {
    await createOrderFulfillmentWorkflow.run({
      container: req.scope,
      input: {
        order_id: orderId,
        items,
      },
    })
  }

  if (action === "ship") {
    const fulfillmentId = order.fulfillments?.[0]?.id
    if (!fulfillmentId) {
      return res.status(400).json({
        error: "missing_fulfillment",
        message: "Order has no fulfillment to ship",
      })
    }

    await createOrderShipmentWorkflow.run({
      container: req.scope,
      input: {
        order_id: orderId,
        fulfillment_id: fulfillmentId,
        items,
      },
    })
  }

  const { data: updatedOrders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "fulfillment_status", "payment_status"],
    filters: {
      id: orderId,
    },
  })

  return res.json({
    action,
    order: updatedOrders?.[0] || null,
  })
}

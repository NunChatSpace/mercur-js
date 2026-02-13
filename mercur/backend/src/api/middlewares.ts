import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/utils"
import { oauthAuthenticate } from "../shared/oauth/oauth-authenticate"
import { CreateOAuthClientSchema } from "./admin/oauth-clients/route"
import { UpdateOAuthClientSchema } from "./admin/oauth-clients/[id]/route"
import { orderStatusMiddlewares } from "./store/debug/orders/[id]/status/middlewares"

const vendorCorsMiddleware = (req: any, res: any, next: any) => {
  const origin = req.headers?.origin
  const allowedOrigins = (process.env.VENDOR_CORS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    const reqHeaders = req.headers["access-control-request-headers"]
    res.setHeader(
      "Access-Control-Allow-Headers",
      reqHeaders || "authorization,x-publishable-api-key,content-type"
    )
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
    )
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204)
  }

  return next()
}

const emitVendorFulfillmentEvent = (eventName: string) => {
  return (req: any, res: any, next: any) => {
    res.on("finish", async () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return
      }

      const fulfillmentId = req.params?.fulfillment_id || req.params?.fulfillmentId
      const orderId = req.params?.id
      if (!fulfillmentId) {
        return
      }

      try {
        const eventBus = req.scope.resolve(Modules.EVENT_BUS)
        await eventBus.emit({
          name: eventName,
          data: {
            id: fulfillmentId,
            fulfillment_id: fulfillmentId,
            order_id: orderId,
          },
        })
      } catch (error) {
        // Best-effort emit; don't fail the request on event errors.
        console.error(`[vendor-fulfillment] Failed to emit ${eventName}:`, (error as any)?.message)
      }
    })

    return next()
  }
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/vendor/*",
      method: ["GET", "POST", "DELETE", "OPTIONS"],
      middlewares: [vendorCorsMiddleware],
    },
    {
      matcher: "/vendor/orders/:id/fulfillments/:fulfillment_id/shipments",
      method: ["POST"],
      middlewares: [emitVendorFulfillmentEvent("shipment.created")],
    },
    {
      matcher: "/vendor/orders/:id/fulfillments/:fulfillment_id/mark-as-delivered",
      method: ["POST"],
      middlewares: [emitVendorFulfillmentEvent("delivery.created")],
    },
    // Admin OAuth client management - require admin authentication
    {
      matcher: "/admin/oauth-clients",
      method: ["GET"],
      middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
    },
    {
      matcher: "/admin/oauth-clients",
      method: ["POST"],
      middlewares: [
        authenticate("user", ["session", "bearer", "api-key"]),
        validateAndTransformBody(CreateOAuthClientSchema),
      ],
    },
    {
      matcher: "/admin/oauth-clients/:id",
      method: ["GET", "DELETE"],
      middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
    },
    {
      matcher: "/admin/oauth-clients/:id",
      method: ["PUT"],
      middlewares: [
        authenticate("user", ["session", "bearer", "api-key"]),
        validateAndTransformBody(UpdateOAuthClientSchema),
      ],
    },
    // Seller endpoints - public read-only access for demo
    // In production, you may want to add oauthAuthenticate() for external platform access
    // {
    //   matcher: "/sellers",
    //   method: ["GET"],
    //   middlewares: [oauthAuthenticate()],
    // },
    // Seller product creation - requires OAuth authentication
    {
      matcher: "/sellers/:id/products",
      method: ["POST"],
      middlewares: [oauthAuthenticate()],
    },
    ...orderStatusMiddlewares,
  ],
})

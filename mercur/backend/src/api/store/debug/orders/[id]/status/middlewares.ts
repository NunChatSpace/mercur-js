import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework"
import { z } from "zod"

export const UpdateOrderStatusSchema = z.object({
  action: z.enum(["fulfill", "ship", "complete", "cancel"]),
})

export type UpdateOrderStatusSchema = z.infer<typeof UpdateOrderStatusSchema>

export const orderStatusMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/debug/orders/:id/status",
    method: ["OPTIONS"],
    middlewares: [
      (req, res) => {
        res.sendStatus(204)
      },
    ],
  },
  {
    matcher: "/store/debug/orders/:id/status",
    method: ["POST"],
    middlewares: [validateAndTransformBody(UpdateOrderStatusSchema)],
  },
]

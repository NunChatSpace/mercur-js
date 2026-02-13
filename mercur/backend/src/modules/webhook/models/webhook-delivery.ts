import { model } from "@medusajs/framework/utils"
import WebhookRegistration from "./webhook-registration"

const WebhookDelivery = model.define("webhook_delivery", {
  id: model.id().primaryKey(),
  registration: model.belongsTo(() => WebhookRegistration, {
    mappedBy: "deliveries",
  }),
  event_type: model.text(),
  payload: model.json(), // the webhook payload
  status: model.enum(["pending", "retrying", "delivered", "failed"]).default("pending"),
  attempt_count: model.number().default(0),
  max_attempts: model.number().default(3),
  next_retry_at: model.dateTime().nullable(),
  last_error: model.text().nullable(),
}).indexes([
  {
    on: ["status", "next_retry_at"],
    where: "deleted_at IS NULL",
  },
])

export default WebhookDelivery

import { model } from "@medusajs/framework/utils"
import WebhookDelivery from "./webhook-delivery"

const WebhookRegistration = model.define("webhook_registration", {
  id: model.id().primaryKey(),
  platform_id: model.text(),
  shop_id: model.text(),
  url: model.text(), // adapter endpoint URL
  event_types: model.json(), // string[] e.g., ["order.created", "order.updated"]
  secret: model.text(), // for HMAC signing
  is_active: model.boolean().default(true),
  deliveries: model.hasMany(() => WebhookDelivery, {
    mappedBy: "registration",
  }),
}).indexes([
  {
    on: ["platform_id", "shop_id"],
    where: "deleted_at IS NULL",
  },
]).cascades({
  delete: ["deliveries"],
})

export default WebhookRegistration

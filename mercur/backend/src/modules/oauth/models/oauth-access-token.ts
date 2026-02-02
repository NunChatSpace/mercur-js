import { model } from "@medusajs/framework/utils"
import OAuthClient from "./oauth-client"

const OAuthAccessToken = model.define("oauth_access_token", {
  id: model.id().primaryKey(),
  token: model.text().unique(),
  client: model.belongsTo(() => OAuthClient, {
    mappedBy: "access_tokens",
  }),
  user_id: model.text(),
  user_type: model.text(), // "customer", "user", "seller"
  scope: model.text().nullable(),
  expires_at: model.dateTime(),
  revoked: model.boolean().default(false),
}).indexes([
  {
    on: ["token"],
    unique: true,
  },
])

export default OAuthAccessToken

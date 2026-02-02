import { model } from "@medusajs/framework/utils"
import OAuthClient from "./oauth-client"

const OAuthAuthorizationCode = model.define("oauth_authorization_code", {
  id: model.id().primaryKey(),
  code: model.text().unique(),
  client: model.belongsTo(() => OAuthClient, {
    mappedBy: "authorization_codes",
  }),
  user_id: model.text(),
  user_type: model.text(), // "customer", "user", "seller"
  redirect_uri: model.text(),
  scope: model.text().nullable(),
  state: model.text().nullable(),
  expires_at: model.dateTime(),
  revoked: model.boolean().default(false),
}).indexes([
  {
    on: ["code"],
    unique: true,
  },
])

export default OAuthAuthorizationCode

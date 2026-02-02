import { model } from "@medusajs/framework/utils"
import OAuthAuthorizationCode from "./oauth-authorization-code"
import OAuthAccessToken from "./oauth-access-token"
import OAuthRefreshToken from "./oauth-refresh-token"

const OAuthClient = model.define("oauth_client", {
  id: model.id().primaryKey(),
  client_id: model.text().unique(),
  client_secret: model.text(), // bcrypt hashed
  name: model.text(),
  redirect_uris: model.json(), // string[]
  grants: model.json(), // string[] - e.g., ["authorization_code", "refresh_token"]
  scopes: model.array(), // string[]
  revoked: model.boolean().default(false),
  authorization_codes: model.hasMany(() => OAuthAuthorizationCode, {
    mappedBy: "client",
  }),
  access_tokens: model.hasMany(() => OAuthAccessToken, {
    mappedBy: "client",
  }),
  refresh_tokens: model.hasMany(() => OAuthRefreshToken, {
    mappedBy: "client",
  }),
}).cascades({
  delete: ["authorization_codes", "access_tokens", "refresh_tokens"],
})

export default OAuthClient

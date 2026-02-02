import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { oauthAuthenticate } from "../shared/oauth/oauth-authenticate"
import { CreateOAuthClientSchema } from "./admin/oauth-clients/route"
import { UpdateOAuthClientSchema } from "./admin/oauth-clients/[id]/route"

export default defineMiddlewares({
  routes: [
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
    // Example: OAuth protected routes
    // Uncomment and modify as needed for your protected resources
    // {
    //   matcher: "/oauth/protected/*",
    //   middlewares: [oauthAuthenticate()],
    // },
    // {
    //   matcher: "/oauth/protected/scoped/*",
    //   middlewares: [oauthAuthenticate({ scopes: ["read:products"] })],
    // },
  ],
})

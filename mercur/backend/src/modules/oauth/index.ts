import OAuthModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const OAUTH_MODULE = "oauth"

export default Module(OAUTH_MODULE, {
  service: OAuthModuleService,
})

import WebhookModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const WEBHOOK_MODULE = "webhook"

export default Module(WEBHOOK_MODULE, {
  service: WebhookModuleService,
})

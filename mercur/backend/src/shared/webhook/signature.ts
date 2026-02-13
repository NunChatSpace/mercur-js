import crypto from "crypto"

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(
  payload: string | Buffer,
  secret: string
): string {
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(payload)
  return hmac.digest("hex")
}

/**
 * Verify webhook signature using timing-safe comparison
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  secret: string,
  signature: string
): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret)

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    )
  } catch {
    // If signatures have different lengths, timingSafeEqual throws
    return false
  }
}

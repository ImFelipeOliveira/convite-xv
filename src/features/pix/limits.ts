// Pix amount limits, shared by the invite form (client) and the service (server). Integer cents.

/** R$ 70,00 (also enforced by the pix_payments_amount_minimum check constraint). */
export const PIX_MIN_CENTS = 7000
/** R$ 10.000,00 */
export const PIX_MAX_CENTS = 1_000_000

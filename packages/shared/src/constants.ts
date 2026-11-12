/**
 * Every number here is a GUESS from the brief (section 5.3), to be replaced
 * by pilot data. Each one is logged in DECISIONS.md. Do not tune these to
 * make the adversarial suite pass.
 */
export const GUARD_THRESHOLDS_GUESS = {
  minPaidHouseholds: 15,
  supplyConfirmationHours: 48,
  quoteStaleHours: 72,
  dalPriceShockBp: 800,
  paymentSettledBp: 9500,
  complaintSpikeCount: 3,
  complaintSpikeWindowHours: 48,
  deliverySlipHours: 24,
  persistenceChecks: 2,
  immatureBaselineCycles: 2,
} as const;

/**
 * Publicly stated margin cap: our margin is never more than 18% of the price
 * before GST. See DECISIONS.md D9 for why 18 and not 16.
 */
export const MARGIN_CAP_BP = 1800;

/** Costs that scale with revenue: UPI 1.5% + captain 2% + returns 1%. GUESS. */
export const VARIABLE_COST_BP_GUESS = 450;

/** Sample limits per item. PLACEHOLDERS until mills give their spec (G12). */
export const LOT_SPEC_PLACEHOLDER = {
  PONNI_RICE_BOILED: { maxMoistureBp: 1400, maxBrokenBp: 500 },
  PONNI_RICE_RAW: { maxMoistureBp: 1400, maxBrokenBp: 500 },
  TOOR_DAL: { maxMoistureBp: 1200, maxBrokenBp: 300 },
} as const;

/**
 * How many consecutive failed checks before a guard acts. null = notice only,
 * never blocks. LOT_QUALITY acts on one sample. PRICE_SHOCK acts on one
 * written quote because its action is a hold for review, not a cancellation.
 */
export const CHECKS_BEFORE_ACTING = {
  MIN_HOUSEHOLDS: 2, SUPPLY_UNCONFIRMED: 2, QUOTE_STALE: 2, MARGIN_FLOOR: 2, COMPLAINT_SPIKE: 2,
  LOT_QUALITY: 1, PRICE_SHOCK: 1, PAYMENT_SETTLED: null, DELIVERY_SLIP: null,
} as const;

/** Replacement or refund without argument, first year (section 8). */
export const COMPLAINT_WINDOW_DAYS = 7;

/** Retain a 1 kg sample of every lot for this long. */
export const SAMPLE_RETENTION_DAYS = 90;

/**
 * GST by pack size. UNCONFIRMED: sources disagree on whether exactly 25 kg
 * is exempt. A chartered accountant must confirm before launch.
 */
export const GST_RULES_UNCONFIRMED = {
  prePackedLabelledRateBp: 500,
  exemptAtOrAboveGrams: 25_000,
  exactly25kgIsExempt: true,
} as const;

/** Paddy seasons as month numbers (1 = January). Source: brief section 9. */
export const PADDY_SEASON_MONTHS = {
  KURUVAI: [4, 5, 6, 7],
  SAMBA: [8, 9, 10, 11],
  NAVARAI: [12, 1, 2, 3],
} as const;

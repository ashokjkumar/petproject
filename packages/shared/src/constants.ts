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

/** Publicly stated margin cap. 1600 bp = 16%. Base (price vs landed cost) is an OPEN QUESTION. */
export const MARGIN_CAP_BP_GUESS = 1600;

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

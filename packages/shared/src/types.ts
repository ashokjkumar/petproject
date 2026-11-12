import { z } from "zod";
import {
  ApartmentId, BasisPoints, CycleId, Day, Grams, Instant, ItemId, LotId,
  OrderId, Paise, QuoteId, Reason, SupplierId,
} from "./units.js";

/* ------------------------------------------------------------------ */
/* INPUTS: the facts of one monthly cycle (brief section 5.1)          */
/* ------------------------------------------------------------------ */

/**
 * Payment state is the real commitment signal.
 * Only SETTLED counts as a paid household. PENDING is "UPI says maybe".
 */
export const PaymentState = z.enum(["UNPAID", "PENDING", "SETTLED", "FAILED", "REFUNDED"]);
export type PaymentState = z.infer<typeof PaymentState>;

export const OrderLine = z.object({
  itemId: ItemId,
  /** Size of one pack, e.g. 25_000 for a 25 kg sack. Pack size drives GST. */
  packGrams: Grams,
  packs: z.number().int().positive(),
});
export type OrderLine = z.infer<typeof OrderLine>;

export const Order = z.object({
  id: OrderId,
  cycleId: CycleId,
  apartmentId: ApartmentId,
  /** As typed by the resident. Typos are expected; the engine normalises, never guesses. */
  flat: z.string().min(1),
  /** Used to address the resident by name in messages. Never "the user". */
  residentName: z.string().min(1),
  lines: z.array(OrderLine).min(1),
  payment: z.object({
    state: PaymentState,
    amountPaise: Paise,
    settledAt: Instant.nullable(),
  }),
  /** STANDING = repeated from last cycle. Still needs the resident's own consent on record. */
  source: z.enum(["FORM", "APP", "STANDING"]),
  /** Consent to join (section 8): when the resident themselves confirmed. No consent, no order. */
  consentConfirmedAt: Instant,
  placedAt: Instant,
});
export type Order = z.infer<typeof Order>;

export const ApartmentProfile = z.object({
  id: ApartmentId,
  /** The apartment's own name, used in every message. */
  name: z.string().min(1),
  nameTa: z.string().min(1).nullable(),
  flats: z.number().int().positive(),
  /** Apartments in one cluster can share a truck run or merge when one is under the minimum. */
  routeClusterId: z.string().min(1),
  /** Largest vehicle the gate allows. */
  maxVehicle: z.enum(["THREE_WHEELER", "MINI_TRUCK", "LIGHT_TRUCK"]),
  dropPoint: z.object({
    kind: z.enum(["GATE", "SOCIETY_OFFICE", "OTHER"]),
    note: z.string().nullable(),
  }),
  /** A captain-led group must work with or without a formal association. */
  association: z.enum(["REGISTERED", "INFORMAL", "NONE"]),
  /** Committee consent for truck entry and sack storage. Null = not yet obtained. */
  gateConsentAt: Instant.nullable(),
  captain: z.object({ name: z.string().min(1), flat: z.string().min(1) }).nullable(),
  /**
   * How many cycles this apartment has finished. Below 2 the baseline is
   * immature and auto-pauses must not fire (adversarial suite, section 6.3).
   */
  cyclesCompleted: z.number().int().nonnegative(),
});
export type ApartmentProfile = z.infer<typeof ApartmentProfile>;

export const SupplierQuote = z.object({
  id: QuoteId,
  supplierId: SupplierId,
  supplierName: z.string().min(1),
  supplierKind: z.enum(["MILL", "FARMER_GROUP", "PROCESSOR"]),
  itemId: ItemId,
  pricePerKgPaise: Paise,
  /** Written quotes only. A verbal quote cannot be represented, on purpose. */
  form: z.literal("WRITTEN"),
  receivedAt: Instant,
  validUntil: Instant,
  minOrderGrams: Grams,
  leadTimeDays: z.number().int().nonnegative(),
  /** Signed declaration that this is not diverted ration rice (section 8). */
  rationDeclarationSigned: z.boolean(),
  /** Written confirmation that stock is held for us. Null = not confirmed (SUPPLY_UNCONFIRMED). */
  supplyConfirmedAt: Instant.nullable(),
});
export type SupplierQuote = z.infer<typeof SupplierQuote>;

export const PaddySeason = z.enum(["KURUVAI", "SAMBA", "NAVARAI"]);
export type PaddySeason = z.infer<typeof PaddySeason>;

/**
 * No lot, no dispatch. Every sack is bound to one of these and the QR
 * label resolves to it. "New-crop" / "aged" is NOT stored here: the engine
 * derives it from harvest season + milling date + the injected date.
 */
export const LotRecord = z.object({
  id: LotId,
  supplierId: SupplierId,
  quoteId: QuoteId,
  itemId: ItemId,
  variety: z.string().min(1),
  /** Null for dal. Year is the harvest year. */
  harvest: z.object({ season: PaddySeason, year: z.number().int() }).nullable(),
  milledOn: Day,
  /** Place shown on the QR page, e.g. "Thanjavur". */
  milledAt: z.string().min(1),
  /** Goods-in sample. Null = not yet sampled, which LOT_QUALITY treats as "cannot dispatch". */
  sample: z
    .object({ moistureBp: BasisPoints, brokenBp: BasisPoints, sampledAt: Instant, retainedUntil: Day })
    .nullable(),
  /** Weight on the slip captured at goods-in. Null until the lot arrives. */
  weightSlipGrams: Grams.nullable(),
});
export type LotRecord = z.infer<typeof LotRecord>;

/* ------------------------------------------------------------------ */
/* OUTPUTS: decisions with reasons. The engine never executes.         */
/* ------------------------------------------------------------------ */

export const GstTreatment = z.enum(["EXEMPT", "TAXABLE_5_PERCENT"]);
export type GstTreatment = z.infer<typeof GstTreatment>;

/**
 * One line of the open-book price card. The price is not a field someone
 * types: it must equal the sum of its published parts, to the paisa.
 */
export const PriceCardLine = z
  .object({
    itemId: ItemId,
    packGrams: Grams,
    quoteId: QuoteId,
    /** Null only before lot lock. */
    lotId: LotId.nullable(),
    /** All four parts are for ONE pack, in paise. Per-kg figures are derived for display. */
    parts: z.object({
      supplierPaise: Paise,
      transportPackingPaise: Paise,
      marginPaise: Paise,
      gstPaise: Paise,
    }),
    gstTreatment: GstTreatment,
    packPricePaise: Paise,
    /** Last cycle's price for the same pack, so "what's different" can be stated. Null = first cycle. */
    previous: z.object({ cycleId: CycleId, packPricePaise: Paise }).nullable(),
    /** Why the price is what it is, and why it moved. A change without its reason cannot publish. */
    reasons: z.array(Reason).min(1),
  })
  .refine(
    (l) =>
      l.packPricePaise ===
      l.parts.supplierPaise + l.parts.transportPackingPaise + l.parts.marginPaise + l.parts.gstPaise,
    { message: "Pack price must equal supplier + transport/packing + margin + GST exactly" },
  )
  .refine((l) => (l.gstTreatment === "EXEMPT") === (l.parts.gstPaise === 0), {
    message: "GST amount must be zero if and only if the pack is exempt",
  });
export type PriceCardLine = z.infer<typeof PriceCardLine>;

export const PriceCard = z.object({
  cycleId: CycleId,
  routeClusterId: z.string().min(1),
  lines: z.array(PriceCardLine).min(1),
  /** Injected, never read from the clock. */
  computedAt: Instant,
});
export type PriceCard = z.infer<typeof PriceCard>;

export const GuardId = z.enum([
  "MIN_HOUSEHOLDS", "SUPPLY_UNCONFIRMED", "QUOTE_STALE", "PRICE_SHOCK", "PAYMENT_SETTLED",
  "MARGIN_FLOOR", "LOT_QUALITY", "COMPLAINT_SPIKE", "DELIVERY_SLIP",
]);
export type GuardId = z.infer<typeof GuardId>;

/** What a failing guard stops. NOTICE_ONLY guards never block anything. */
export const BlockTarget = z.enum([
  "RUN_DISPATCH", "LOT_LOCK", "PRICE_CARD", "MILL_PURCHASE_ORDER", "LOT_DISPATCH",
  "SUPPLIER_REMAINING_LOTS", "NOTICE_ONLY",
]);
export type BlockTarget = z.infer<typeof BlockTarget>;

export const GuardResult = z.object({
  guard: GuardId,
  blocks: BlockTarget,
  pass: z.boolean(),
  /** 0 to 1. Not money, so a fraction is allowed here. */
  confidence: z.number().min(0).max(1),
  /** Mandatory. Flows straight into message copy. */
  reasons: z.array(Reason).min(1),
  /** How complete the facts were. Missing facts lower confidence; they never silently pass. */
  dataQuality: z.enum(["COMPLETE", "PARTIAL", "MISSING"]),
  /**
   * Persistence rule: nothing is cancelled or paused on one signal. A guard
   * only acts when this reaches 2 (LOT_QUALITY acts at 1).
   */
  consecutiveFailures: z.number().int().nonnegative(),
  /** What the guard recommends a human or the planner do next. One action, not a menu. */
  recommendation: z.enum([
    "PROCEED", "ROLL_TO_NEXT_CYCLE", "MERGE_WITH_NEIGHBOUR", "REPRICE", "HOLD_FOR_HUMAN",
    "ORDER_PAID_ONLY", "REJECT_LOT", "PAUSE_SUPPLIER", "NOTIFY_CAPTAIN", "REFUND",
  ]),
  checkedAt: Instant,
});
export type GuardResult = z.infer<typeof GuardResult>;

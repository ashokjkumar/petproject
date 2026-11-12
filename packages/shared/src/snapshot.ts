import { z } from "zod";
import { ApartmentProfile, LotRecord, Order, SupplierQuote } from "./types.js";
import { ApartmentId, CycleId, Instant, ItemId, LotId, Paise } from "./units.js";

/** How one item is priced this cycle. The margin is a fixed rupee amount per kg, published. */
export const ItemPricing = z.object({
  itemId: ItemId,
  transportPackingPaisePerKg: Paise,
  marginPaisePerKg: Paise,
  /** Pre-packed and labelled packs under 25 kg carry 5% GST. */
  prePackedLabelled: z.boolean(),
});
export type ItemPricing = z.infer<typeof ItemPricing>;

export const Complaint = z.object({
  lotId: LotId,
  apartmentId: ApartmentId,
  at: Instant,
  /** Cycles the complaining apartment has completed. Under 2 = immature baseline. */
  apartmentCyclesCompleted: z.number().int().nonnegative(),
});
export type Complaint = z.infer<typeof Complaint>;

/** A same-route apartment that could share this truck run. */
export const Neighbour = z.object({
  apartmentId: ApartmentId,
  name: z.string().min(1),
  paidHouseholds: z.number().int().nonnegative(),
  contributionBeforeDropPaise: z.number().int(),
});
export type Neighbour = z.infer<typeof Neighbour>;

/**
 * Everything the engine is told about one apartment's cycle at one moment.
 * The engine reads this, decides, explains, and does nothing else.
 */
export const CycleSnapshot = z.object({
  now: Instant,
  cycleId: CycleId,
  apartment: ApartmentProfile,
  orders: z.array(Order),
  neighbours: z.array(Neighbour),
  quotes: z.array(SupplierQuote),
  previousQuotes: z.array(z.object({ itemId: ItemId, pricePerKgPaise: Paise })),
  supplyRequestedAt: Instant,
  lotLockAt: Instant,
  /** Once the card is published the price is a promise; staleness no longer applies. */
  cardPublished: z.boolean(),
  lots: z.array(LotRecord),
  complaints: z.array(Complaint),
  delivery: z.object({ committedAt: Instant, estimatedAt: Instant }).nullable(),
  dropCostPaise: Paise,
  pricing: z.array(ItemPricing),
});
export type CycleSnapshot = z.infer<typeof CycleSnapshot>;

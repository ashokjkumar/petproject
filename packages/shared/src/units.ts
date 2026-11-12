import { z } from "zod";

/**
 * Units. Hard rule from the brief (section 4): money is integer paise,
 * weight is integer grams. No floating-point currency anywhere.
 */

/** Money in paise. ₹1 = 100 paise. Always a whole number, never negative. */
export const Paise = z.number().int().nonnegative();
export type Paise = z.infer<typeof Paise>;

/** Weight in grams. 25 kg = 25_000. Always a whole, positive number. */
export const Grams = z.number().int().positive();
export type Grams = z.infer<typeof Grams>;

/**
 * Percentages as basis points so they stay integers.
 * 1 bp = 0.01%. 13.5% moisture = 1350. 16% margin cap = 1600.
 */
export const BasisPoints = z.number().int().min(0).max(10_000);
export type BasisPoints = z.infer<typeof BasisPoints>;

/** A moment in time, ISO-8601 with offset. The engine never reads the clock; time is injected. */
export const Instant = z.string().datetime({ offset: true });
export type Instant = z.infer<typeof Instant>;

/** A calendar day, YYYY-MM-DD (milling date, delivery date). */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type Day = z.infer<typeof Day>;

/** A monthly cycle, named by its delivery month: "2027-01" delivers 1-5 January 2027. */
export const CycleId = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export type CycleId = z.infer<typeof CycleId>;

const id = () => z.string().min(1);
export const ApartmentId = id();
export const SupplierId = id();
export const QuoteId = id();
export const LotId = id();
export const OrderId = id();

/** What we sell. Deliberately a short closed list: staples only (section 10). */
export const ItemId = z.enum(["PONNI_RICE_BOILED", "PONNI_RICE_RAW", "TOOR_DAL"]);
export type ItemId = z.infer<typeof ItemId>;

/**
 * Every explanation is written twice, Tamil first (section 9).
 * A reason with no plain-language text cannot exist, which is how
 * "if a guard cannot explain itself, it cannot ship" is enforced.
 */
export const Reason = z.object({
  /** Stable machine code, e.g. "MILL_PRICE_UP". Used for the suppression histogram. */
  code: z.string().min(1),
  ta: z.string().min(1),
  en: z.string().min(1),
});
export type Reason = z.infer<typeof Reason>;

import { priceLine } from "@kootu/engine";
import type { CycleSnapshot, GuardId, ItemPricing, LotRecord, Order, SupplierQuote } from "@kootu/shared";
import { generateOrders, SEEDS } from "./generator.js";

export const T0 = "2026-12-26T09:00:00+05:30";
export const shift = (iso: string, hours: number): string => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();

const PRICING: ItemPricing[] = [
  { itemId: "PONNI_RICE_BOILED", transportPackingPaisePerKg: 300, marginPaisePerKg: 900, prePackedLabelled: true },
  { itemId: "TOOR_DAL", transportPackingPaisePerKg: 300, marginPaisePerKg: 1200, prePackedLabelled: true },
];

const quote = (id: string, itemId: SupplierQuote["itemId"], name: string, paise: number): SupplierQuote => ({
  id, supplierId: `s-${id}`, supplierName: name, supplierKind: itemId === "TOOR_DAL" ? "PROCESSOR" : "MILL",
  itemId, pricePerKgPaise: paise, form: "WRITTEN", receivedAt: shift(T0, -24), validUntil: shift(T0, 72),
  minOrderGrams: 500_000, leadTimeDays: 3, rationDeclarationSigned: true, supplyConfirmedAt: shift(T0, -10),
});

const lot = (id: string, itemId: LotRecord["itemId"], quoteId: string, moistureBp: number, brokenBp: number): LotRecord => ({
  id, supplierId: `s-${quoteId}`, quoteId, itemId, variety: itemId === "TOOR_DAL" ? "Toor" : "Ponni",
  harvest: itemId === "TOOR_DAL" ? null : { season: "SAMBA", year: 2026 }, milledOn: "2026-12-12", milledAt: "Thanjavur",
  sample: { moistureBp, brokenBp, sampledAt: shift(T0, -12), retainedUntil: "2027-03-26" }, weightSlipGrams: 2_000_000,
});

export function packPrices(quotes: SupplierQuote[]): { rice25Paise: number; dal4Paise: number } {
  const price = (itemId: SupplierQuote["itemId"], grams: number) => {
    const out = priceLine({ quote: quotes.find((q) => q.itemId === itemId)!, packGrams: grams, pricing: PRICING.find((p) => p.itemId === itemId)!, lotId: null, previous: null });
    if (!out.ok) throw new Error("simulator pricing breached the margin cap");
    return out.line.packPricePaise;
  };
  return { rice25Paise: price("PONNI_RICE_BOILED", 25_000), dal4Paise: price("TOOR_DAL", 4_000) };
}

/** A month where nothing is wrong: Tower A in its fourth cycle, everything paid, confirmed and sampled. */
export function healthy(now: string = T0): CycleSnapshot {
  const quotes = [quote("q-rice", "PONNI_RICE_BOILED", "Delta Mill", 4300), quote("q-dal", "TOOR_DAL", "Kalaburagi Dal", 10_300)];
  const cfg = { ...SEEDS[0]!, pendingShare: 0, failedShare: 0 };
  return {
    now, cycleId: "2027-01", apartment: cfg.profile,
    orders: generateOrders(cfg, { cycleIndex: 3, cycleId: "2027-01", now: shift(T0, -30), seed: 42, prices: packPrices(quotes), pendingHaveSettled: true }),
    neighbours: [], quotes,
    previousQuotes: [{ itemId: "PONNI_RICE_BOILED", pricePerKgPaise: 4200 }, { itemId: "TOOR_DAL", pricePerKgPaise: 10_100 }],
    supplyRequestedAt: shift(T0, -20), lotLockAt: T0, cardPublished: false,
    lots: [lot("lot-rice", "PONNI_RICE_BOILED", "q-rice", 1300, 400), lot("lot-dal", "TOOR_DAL", "q-dal", 1000, 200)],
    complaints: [], delivery: { committedAt: shift(T0, 144), estimatedAt: shift(T0, 144) },
    dropCostPaise: 250_000, pricing: PRICING,
  };
}

export interface Scenario {
  id: string;
  title: string;
  kind: "INCIDENT" | "ADVERSARIAL";
  /** One snapshot per check, in time order. */
  steps: CycleSnapshot[];
  /** Incidents only: the guard that must fire and how. */
  expect?: { guard: GuardId; state: "BLOCK" | "WATCH"; alsoCorrect?: GuardId[] };
}

type Change = (s: CycleSnapshot) => void;
const steps = (...at: Array<[hours: number, change?: Change]>): CycleSnapshot[] =>
  at.map(([h, change]) => {
    const s = healthy(shift(T0, h));
    change?.(s);
    return s;
  });
const setQuote = (s: CycleSnapshot, itemId: string, patch: Partial<SupplierQuote>) => {
  s.quotes = s.quotes.map((q) => (q.itemId === itemId ? { ...q, ...patch } : q));
};
const complaints = (s: CycleSnapshot, n: number, cyclesCompleted: number) => {
  s.complaints = Array.from({ length: n }, (_, i) => ({ lotId: "lot-rice", apartmentId: s.apartment.id, at: shift(s.now, -2 - i), apartmentCyclesCompleted: cyclesCompleted }));
};
const allPending = (s: CycleSnapshot) => {
  s.orders = s.orders.map((o): Order => ({ ...o, payment: { ...o.payment, state: "PENDING", settledAt: null } }));
};

export const INCIDENTS: Scenario[] = [
  { id: "mill-misses-confirmation", title: "Mill misses written confirmation", kind: "INCIDENT", expect: { guard: "SUPPLY_UNCONFIRMED", state: "BLOCK" },
    steps: steps([0, (s) => { s.supplyRequestedAt = shift(T0, -50); setQuote(s, "PONNI_RICE_BOILED", { supplyConfirmedAt: null }); }], [12, (s) => { s.supplyRequestedAt = shift(T0, -50); setQuote(s, "PONNI_RICE_BOILED", { supplyConfirmedAt: null }); }]) },
  { id: "dal-jumps-12", title: "Dal quote jumps 12%", kind: "INCIDENT", expect: { guard: "PRICE_SHOCK", state: "BLOCK" },
    steps: steps([0, (s) => setQuote(s, "TOOR_DAL", { pricePerKgPaise: 11_312 })]) },
  { id: "under-minimum", title: "Apartment falls under the minimum, no neighbour", kind: "INCIDENT", 
    // 12 households also cannot pay for the truck (break-even is about 13), so MARGIN_FLOOR acting is correct too.
    expect: { guard: "MIN_HOUSEHOLDS", state: "BLOCK", alsoCorrect: ["MARGIN_FLOOR"] },
    steps: steps([0, (s) => { s.orders = s.orders.slice(0, 12); }], [12, (s) => { s.orders = s.orders.slice(0, 12); }]) },
  { id: "lot-fails-moisture", title: "Lot fails the moisture sample", kind: "INCIDENT", expect: { guard: "LOT_QUALITY", state: "BLOCK" },
    steps: steps([0, (s) => { s.lots[0]!.sample!.moistureBp = 1550; }]) },
  { id: "complaint-cluster", title: "Cluster of complaints on one lot", kind: "INCIDENT", expect: { guard: "COMPLAINT_SPIKE", state: "BLOCK" },
    steps: steps([0, (s) => complaints(s, 4, 3)], [6, (s) => complaints(s, 4, 3)]) },
  { id: "truck-breakdown", title: "Truck breakdown on dispatch day", kind: "INCIDENT", expect: { guard: "DELIVERY_SLIP", state: "WATCH" },
    steps: steps([0, (s) => { s.delivery!.estimatedAt = shift(s.delivery!.committedAt, 30); }]) },
  { id: "upi-failures-at-close", title: "UPI failure cluster at order close", kind: "INCIDENT", expect: { guard: "PAYMENT_SETTLED", state: "WATCH" },
    steps: steps([0, (s) => { s.orders = s.orders.map((o, i): Order => (i % 5 === 0 ? { ...o, payment: { ...o.payment, state: "FAILED", settledAt: null } } : o)); }]) },
];

export const ADVERSARIAL: Scenario[] = [
  { id: "single-late-quote", title: "A single late quote refresh", kind: "ADVERSARIAL",
    steps: steps([0, (s) => setQuote(s, "PONNI_RICE_BOILED", { receivedAt: shift(T0, -80) })], [6]) },
  { id: "festival-surge", title: "Festival week doubles orders", kind: "ADVERSARIAL",
    steps: steps([0, (s) => { s.orders = [...s.orders, ...s.orders.map((o) => ({ ...o, id: `${o.id}-b`, flat: o.flat.replace(/^a/i, "B") }))]; }]) },
  { id: "one-loud-complaint", title: "One loud complaint on a good lot", kind: "ADVERSARIAL",
    steps: steps([0, (s) => complaints(s, 1, 3)], [6, (s) => complaints(s, 1, 3)]) },
  { id: "rain-delay-12h", title: "Heavy rain delays delivery 12 hours", kind: "ADVERSARIAL",
    steps: steps([0, (s) => { s.delivery!.estimatedAt = shift(s.delivery!.committedAt, 12); }]) },
  { id: "captain-on-leave", title: "Captain on leave", kind: "ADVERSARIAL",
    steps: steps([0, (s) => { s.apartment = { ...s.apartment, captain: null }; }]) },
  { id: "fourteen-with-neighbour", title: "14 households, neighbour can merge", kind: "ADVERSARIAL",
    steps: [0, 12].flatMap((h) => steps([h, (s) => { s.orders = s.orders.slice(0, 14); s.neighbours = [{ apartmentId: "nbr", name: "Lake View", paidHouseholds: 20, contributionBeforeDropPaise: 370_000 }]; }])) },
  { id: "upi-outage-day", title: "UPI outage day", kind: "ADVERSARIAL", steps: steps([0, allPending], [20]) },
  { id: "dal-moves-5", title: "Dal quote moves 5%", kind: "ADVERSARIAL",
    steps: steps([0, (s) => setQuote(s, "TOOR_DAL", { pricePerKgPaise: 10_605 })]) },
  { id: "skip-wave", title: "Skip wave at month-end", kind: "ADVERSARIAL",
    steps: steps([0, (s) => { s.orders = s.orders.slice(0, 25); }], [12, (s) => { s.orders = s.orders.slice(0, 25); }]) },
  { id: "new-apartment", title: "New apartment, first two cycles", kind: "ADVERSARIAL",
    steps: [0, 6].flatMap((h) => steps([h, (s) => { s.apartment = { ...s.apartment, cyclesCompleted: 0 }; s.previousQuotes = []; complaints(s, 3, 0); }])) },
  { id: "harvest-price-drop", title: "Harvest-time price drop", kind: "ADVERSARIAL",
    steps: steps([0, (s) => { setQuote(s, "PONNI_RICE_BOILED", { pricePerKgPaise: 3850 }); setQuote(s, "TOOR_DAL", { pricePerKgPaise: 9200 }); }]) },
];

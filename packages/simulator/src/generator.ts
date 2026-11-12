import type { ApartmentProfile, Order } from "@kootu/shared";

/** Small seeded random source so every simulated month can be replayed exactly. */
export function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ApartmentConfig {
  profile: ApartmentProfile;
  /** Share of flats ordering: starts at `start`, grows `perCycle` each month, stops at `max`. */
  adoption: { start: number; perCycle: number; max: number };
  twoSackShare: number;
  partialShare: number;
  skipShare: number;
  pendingShare: number;
  failedShare: number;
  typoShare: number;
}

const profile = (id: string, name: string, flats: number, association: ApartmentProfile["association"]): ApartmentProfile => ({
  id, name, nameTa: null, flats, routeClusterId: "OMR-SOUTH", maxVehicle: "MINI_TRUCK",
  dropPoint: { kind: "GATE", note: null }, association, gateConsentAt: "2026-12-01T10:00:00+05:30",
  captain: { name: "Captain", flat: "A-101" }, cyclesCompleted: 3,
});

/** The four seed apartments from section 6.1. Every number is an assumption about behaviour. */
export const SEEDS: ApartmentConfig[] = [
  { profile: profile("tower-a", "Tower A, Sholinganallur", 300, "REGISTERED"), adoption: { start: 0.1, perCycle: 0.04, max: 0.25 }, twoSackShare: 0.1, partialShare: 0.1, skipShare: 0.08, pendingShare: 0.1, failedShare: 0.02, typoShare: 0.05 },
  { profile: profile("medavakkam-40", "Small building, Medavakkam", 40, "NONE"), adoption: { start: 0.2, perCycle: 0.08, max: 0.5 }, twoSackShare: 0.1, partialShare: 0.1, skipShare: 0.1, pendingShare: 0.15, failedShare: 0.02, typoShare: 0.05 },
  { profile: profile("porur-villas", "Villa community, Porur", 120, "REGISTERED"), adoption: { start: 0.12, perCycle: 0.05, max: 0.35 }, twoSackShare: 0.5, partialShare: 0.05, skipShare: 0.08, pendingShare: 0.1, failedShare: 0.02, typoShare: 0.03 },
  { profile: profile("tambaram-80", "Older building, Tambaram", 80, "INFORMAL"), adoption: { start: 0.05, perCycle: 0.03, max: 0.25 }, twoSackShare: 0.05, partialShare: 0.2, skipShare: 0.15, pendingShare: 0.25, failedShare: 0.04, typoShare: 0.08 },
];

export interface GenerateOptions {
  cycleIndex: number;
  cycleId: string;
  now: string;
  seed: number;
  prices: { rice25Paise: number; dal4Paise: number };
  /** Second check of the day: payments that were pending have now settled. */
  pendingHaveSettled: boolean;
}

export function generateOrders(cfg: ApartmentConfig, o: GenerateOptions): Order[] {
  const rnd = seeded(o.seed + o.cycleIndex * 7919);
  const share = Math.min(cfg.adoption.max, cfg.adoption.start + cfg.adoption.perCycle * o.cycleIndex);
  const households = Math.round(cfg.profile.flats * share);
  const orders: Order[] = [];
  for (let i = 0; i < households; i++) {
    // Draw every random number every time so check 1 and check 2 see the same households.
    const [skip, typo, sacks, partial, fail, pend] = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
    if (o.cycleIndex > 0 && skip < cfg.skipShare) continue;
    const flat = `A-${101 + i}`;
    const riceSacks = sacks < cfg.twoSackShare ? 2 : 1;
    const riceOnly = partial < cfg.partialShare / 2;
    const dalOnly = !riceOnly && partial < cfg.partialShare;
    const lines: Order["lines"] = [];
    if (!dalOnly) lines.push({ itemId: "PONNI_RICE_BOILED", packGrams: 25_000, packs: riceSacks });
    if (!riceOnly) lines.push({ itemId: "TOOR_DAL", packGrams: 4_000, packs: 1 });
    const amountPaise = (dalOnly ? 0 : riceSacks * o.prices.rice25Paise) + (riceOnly ? 0 : o.prices.dal4Paise);
    const state = fail < cfg.failedShare ? "FAILED" : pend < cfg.pendingShare && !o.pendingHaveSettled ? "PENDING" : "SETTLED";
    orders.push({
      id: `${cfg.profile.id}-${o.cycleId}-${i}`, cycleId: o.cycleId, apartmentId: cfg.profile.id,
      flat: typo < cfg.typoShare ? flat.toLowerCase().replace("-", " ") : flat,
      residentName: `Resident ${i + 1}`, lines,
      payment: { state, amountPaise, settledAt: state === "SETTLED" ? o.now : null },
      source: o.cycleIndex > 0 ? "STANDING" : "FORM", consentConfirmedAt: o.now, placedAt: o.now,
    });
  }
  return orders;
}

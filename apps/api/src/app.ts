import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { evaluateCycle, normaliseFlat, priceLine, type CycleDecision } from "@kootu/engine";
import {
  ApartmentProfile, CycleId, Grams, Instant, ItemId, ItemPricing, LotRecord, Paise, SupplierQuote,
  type CycleSnapshot, type Order, type PriceCard, type PriceCardLine, type Reason,
} from "@kootu/shared";
import { apartments, cycles, guardCounters, ledger, lots, orders, priceCards, quotes, residents, type Db } from "./db.js";

/** Captain commission, 2% of settled order value. GUESS G11. */
const CAPTAIN_COMMISSION_BP = 200;

class Refusal extends Error {
  constructor(public status: number, public code: string, public reasons: Reason[] | string) {
    super(code);
  }
}
const refuse = (status: number, code: string, reasons: Reason[] | string): never => {
  throw new Refusal(status, code, reasons);
};

const previousCycle = (cycleId: string): string => {
  const [y, m] = cycleId.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

const JoinBody = z.object({
  name: z.string().min(1),
  flat: z.string().min(1),
  phone: z.string().regex(/^\+?\d{10,13}$/),
  /** Must be literally true: the resident's own explicit action. */
  iConfirmIWantToJoin: z.literal(true),
});
const CyclePlanBody = z.object({ supplyRequestedAt: Instant, lotLockAt: Instant, dropCostPaise: Paise });
const PublishBody = z.object({
  items: z.array(z.object({ quoteId: z.string(), packGrams: Grams, pricing: ItemPricing, lotId: z.string().nullable() })).min(1),
  /** Name of the person who reviewed a held price shock. Never overrides a stale quote or the margin cap. */
  priceShockApprovedBy: z.string().min(1).optional(),
});
const OrderBody = z.object({
  cycleId: CycleId,
  residentId: z.string(),
  lines: z.array(z.object({ itemId: ItemId, packGrams: Grams, packs: z.number().int().positive() })).min(1),
});
const PaymentBody = z.object({ state: z.enum(["SETTLED", "FAILED"]), amountPaise: Paise, upiRef: z.string().min(1) });

/**
 * The backend. It stores facts and asks the engine what may be promised;
 * it never decides on its own. `now` is injected so tests can set the date.
 */
export function buildApp(db: Db, now: () => string): FastifyInstance {
  const app = Fastify();

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) return reply.status(err.status).send({ error: err.code, reasons: err.reasons });
    if (err instanceof ZodError) return reply.status(400).send({ error: "INVALID_INPUT", reasons: err.issues });
    return reply.status(500).send({ error: "INTERNAL", reasons: String(err) });
  });

  const one = async <T>(rows: Promise<T[]>, what: string): Promise<T> => {
    const row = (await rows)[0];
    return row ?? refuse(404, "NOT_FOUND", `${what} not found`);
  };

  /* ---------------- reference data (operations) ---------------- */

  app.post("/apartments", async (req) => {
    const doc = ApartmentProfile.parse(req.body);
    await db.insert(apartments).values({ id: doc.id, doc }).onConflictDoUpdate({ target: apartments.id, set: { doc } });
    return doc;
  });
  app.post("/quotes", async (req) => {
    const doc = SupplierQuote.parse(req.body);
    if (!doc.rationDeclarationSigned) refuse(409, "NO_RATION_DECLARATION", "A quote is accepted only with the signed ration-rice declaration.");
    await db.insert(quotes).values({ id: doc.id, doc }).onConflictDoUpdate({ target: quotes.id, set: { doc } });
    return doc;
  });
  app.post("/lots", async (req) => {
    const doc = LotRecord.parse(req.body);
    await db.insert(lots).values({ id: doc.id, doc }).onConflictDoUpdate({ target: lots.id, set: { doc } });
    return doc;
  });
  app.put<{ Params: { cycleId: string; cluster: string } }>("/cycles/:cycleId/clusters/:cluster/plan", async (req) => {
    const plan = CyclePlanBody.parse(req.body);
    const id = `${CycleId.parse(req.params.cycleId)}:${req.params.cluster}`;
    await db.insert(cycles).values({ id, plan }).onConflictDoUpdate({ target: cycles.id, set: { plan } });
    return plan;
  });

  /* ---------------- residents: consent to join ---------------- */

  app.post<{ Params: { id: string } }>("/apartments/:id/residents", async (req, reply) => {
    await one(db.select().from(apartments).where(eq(apartments.id, req.params.id)), "Apartment");
    const body = JoinBody.parse(req.body);
    const row = { id: randomUUID(), apartmentId: req.params.id, flat: normaliseFlat(body.flat), name: body.name, phone: body.phone, consentConfirmedAt: now() };
    await db.insert(residents).values(row);
    return reply.status(201).send(row);
  });

  /* ---------------- price card ---------------- */

  const buildSnapshot = async (cycleId: string, apartmentId: string, cardPublished: boolean, draft?: { quoteIds: string[]; lotIds: string[]; pricing: ItemPricing[] }): Promise<CycleSnapshot> => {
    const apt = (await one(db.select().from(apartments).where(eq(apartments.id, apartmentId)), "Apartment")).doc;
    const plan = (await one(db.select().from(cycles).where(eq(cycles.id, `${cycleId}:${apt.routeClusterId}`)), "Cycle plan")).plan;
    const cardRow = (await db.select().from(priceCards).where(eq(priceCards.id, `${cycleId}:${apt.routeClusterId}`)))[0];
    const quoteIds = draft?.quoteIds ?? cardRow?.card.lines.map((l) => l.quoteId) ?? [];
    const lotIds = draft?.lotIds ?? cardRow?.card.lines.flatMap((l) => (l.lotId ? [l.lotId] : [])) ?? [];
    const allQuotes = (await db.select().from(quotes)).map((r) => r.doc);
    const allLots = (await db.select().from(lots)).map((r) => r.doc);
    const prevCard = (await db.select().from(priceCards).where(eq(priceCards.id, `${previousCycle(cycleId)}:${apt.routeClusterId}`)))[0];
    const previousQuotes = (prevCard?.card.lines ?? []).flatMap((l) => {
      const q = allQuotes.find((x) => x.id === l.quoteId);
      return q ? [{ itemId: q.itemId, pricePerKgPaise: q.pricePerKgPaise }] : [];
    });
    const orderRows = await db.select().from(orders).where(and(eq(orders.cycleId, cycleId), eq(orders.apartmentId, apartmentId)));
    return {
      now: now(), cycleId, apartment: apt, orders: orderRows.map((r) => r.doc), neighbours: [],
      quotes: allQuotes.filter((q) => quoteIds.includes(q.id)), previousQuotes,
      supplyRequestedAt: plan.supplyRequestedAt, lotLockAt: plan.lotLockAt, cardPublished,
      lots: allLots.filter((l) => lotIds.includes(l.id)), complaints: [], delivery: null,
      dropCostPaise: plan.dropCostPaise, pricing: draft?.pricing ?? cardRow?.pricing ?? [],
    };
  };

  app.post<{ Params: { cycleId: string; cluster: string } }>("/cycles/:cycleId/clusters/:cluster/price-card", async (req, reply) => {
    const cycleId = CycleId.parse(req.params.cycleId);
    const { cluster } = req.params;
    const body = PublishBody.parse(req.body);
    const id = `${cycleId}:${cluster}`;
    if ((await db.select().from(priceCards).where(eq(priceCards.id, id)))[0]) {
      refuse(409, "CARD_ALREADY_PUBLISHED", "A published price is a promise; it cannot be replaced.");
    }
    const anchor = (await db.select().from(apartments)).map((r) => r.doc).find((a) => a.routeClusterId === cluster)
      ?? refuse(409, "NO_APARTMENT_IN_CLUSTER", "A price card needs at least one apartment on the route.");

    // Gate: the engine's price-card guards (stale quote, price shock) must all pass.
    const snapshot = await buildSnapshot(cycleId, anchor.id, false, {
      quoteIds: body.items.map((i) => i.quoteId), lotIds: [], pricing: body.items.map((i) => i.pricing),
    });
    const held = evaluateCycle({ ...snapshot, orders: [] }).results.filter(
      (r) => r.blocks === "PRICE_CARD" && r.state !== "PASS" && !(r.guard === "PRICE_SHOCK" && body.priceShockApprovedBy),
    );
    if (held.length > 0) refuse(409, "PRICE_CARD_HELD", held.flatMap((r) => r.reasons));

    const prevCard = (await db.select().from(priceCards).where(eq(priceCards.id, `${previousCycle(cycleId)}:${cluster}`)))[0]?.card;
    const lines: PriceCardLine[] = [];
    for (const item of body.items) {
      const quote = (await one(db.select().from(quotes).where(eq(quotes.id, item.quoteId)), "Quote")).doc;
      const before = prevCard?.lines.find((l) => l.itemId === quote.itemId && l.packGrams === item.packGrams);
      const out = priceLine({
        quote, packGrams: item.packGrams, pricing: item.pricing, lotId: item.lotId,
        previous: before && prevCard ? { cycleId: prevCard.cycleId, packPricePaise: before.packPricePaise, supplierPaise: before.parts.supplierPaise } : null,
      });
      if (!out.ok) refuse(409, "PRICE_REFUSED", out.reasons);
      else lines.push(out.line);
    }
    const card: PriceCard = { cycleId, routeClusterId: cluster, lines, computedAt: now() };
    await db.insert(priceCards).values({ id, card, pricing: body.items.map((i) => i.pricing), approvedBy: body.priceShockApprovedBy ?? null });
    return reply.status(201).send(card);
  });

  app.get<{ Params: { cycleId: string; cluster: string } }>("/cycles/:cycleId/clusters/:cluster/price-card", async (req) =>
    (await one(db.select().from(priceCards).where(eq(priceCards.id, `${req.params.cycleId}:${req.params.cluster}`)), "Price card")).card);

  /** Binding a lot to a card line after goods-in. No lot, no dispatch. */
  app.put<{ Params: { cycleId: string; cluster: string; itemId: string }; Body: { lotId: string } }>(
    "/cycles/:cycleId/clusters/:cluster/price-card/:itemId/lot", async (req) => {
      const id = `${req.params.cycleId}:${req.params.cluster}`;
      const row = await one(db.select().from(priceCards).where(eq(priceCards.id, id)), "Price card");
      const lot = (await one(db.select().from(lots).where(eq(lots.id, z.object({ lotId: z.string() }).parse(req.body).lotId)), "Lot")).doc;
      const card = { ...row.card, lines: row.card.lines.map((l) => (l.itemId === req.params.itemId && l.itemId === lot.itemId ? { ...l, lotId: lot.id } : l)) };
      await db.update(priceCards).set({ card }).where(eq(priceCards.id, id));
      return card;
    });

  /* ---------------- orders and payments ---------------- */

  app.post("/orders", async (req, reply) => {
    const body = OrderBody.parse(req.body);
    const resident = await one(db.select().from(residents).where(eq(residents.id, body.residentId)), "Resident");
    const apt = (await one(db.select().from(apartments).where(eq(apartments.id, resident.apartmentId)), "Apartment")).doc;
    const card = (await one(db.select().from(priceCards).where(eq(priceCards.id, `${body.cycleId}:${apt.routeClusterId}`)), "Price card")).card;
    let amountPaise = 0;
    for (const line of body.lines) {
      const priced = card.lines.find((l) => l.itemId === line.itemId && l.packGrams === line.packGrams)
        ?? refuse(409, "NOT_ON_PRICE_CARD", `${line.itemId} in ${line.packGrams} g packs is not on this month's price card.`);
      amountPaise += priced.packPricePaise * line.packs;
    }
    const doc: Order = {
      id: randomUUID(), cycleId: body.cycleId, apartmentId: apt.id, flat: resident.flat, residentName: resident.name,
      lines: body.lines, payment: { state: "UNPAID", amountPaise, settledAt: null },
      source: "APP", consentConfirmedAt: resident.consentConfirmedAt, placedAt: now(),
    };
    await db.insert(orders).values({ id: doc.id, cycleId: doc.cycleId, apartmentId: apt.id, residentId: resident.id, doc });
    return reply.status(201).send(doc);
  });

  /** Payment reconciliation: operations records what the bank statement shows. */
  app.post<{ Params: { id: string } }>("/orders/:id/payment", async (req) => {
    const body = PaymentBody.parse(req.body);
    const row = await one(db.select().from(orders).where(eq(orders.id, req.params.id)), "Order");
    if (body.state === "SETTLED" && body.amountPaise !== row.doc.payment.amountPaise) {
      refuse(409, "AMOUNT_MISMATCH", `Paid ${body.amountPaise} paise but the order is ${row.doc.payment.amountPaise} paise.`);
    }
    const doc: Order = { ...row.doc, payment: { ...row.doc.payment, state: body.state, settledAt: body.state === "SETTLED" ? now() : null } };
    await db.update(orders).set({ doc, upiRef: body.upiRef }).where(eq(orders.id, row.id));
    return doc;
  });

  /* ---------------- decisions: every dispatch path goes through the guards ---------------- */

  const decide = async (cycleId: string, apartmentId: string, persist: boolean): Promise<CycleDecision> => {
    const snapshot = await buildSnapshot(cycleId, apartmentId, true);
    const id = `${cycleId}:${apartmentId}`;
    const prior = (await db.select().from(guardCounters).where(eq(guardCounters.id, id)))[0]?.counters ?? {};
    const decision = evaluateCycle(snapshot, prior);
    if (persist) {
      await db.insert(guardCounters).values({ id, counters: decision.counters })
        .onConflictDoUpdate({ target: guardCounters.id, set: { counters: decision.counters } });
    }
    return decision;
  };

  /** One scheduled check. Counts towards the "two consecutive checks" rule. */
  app.post<{ Params: { cycleId: string; id: string } }>("/cycles/:cycleId/apartments/:id/check", async (req) =>
    decide(CycleId.parse(req.params.cycleId), req.params.id, true));

  app.post<{ Params: { cycleId: string; id: string } }>("/cycles/:cycleId/apartments/:id/purchase-order", async (req, reply) => {
    const cycleId = CycleId.parse(req.params.cycleId);
    const apartmentId = req.params.id;
    const decision = await decide(cycleId, apartmentId, false);
    if (!decision.mayProceed) {
      refuse(409, "GUARDS_NOT_PASSED", decision.results.filter((r) => r.state !== "PASS" && r.blocks !== "NOTICE_ONLY").flatMap((r) => r.reasons));
    }
    const apt = (await one(db.select().from(apartments).where(eq(apartments.id, apartmentId)), "Apartment")).doc;
    const card = (await one(db.select().from(priceCards).where(eq(priceCards.id, `${cycleId}:${apt.routeClusterId}`)), "Price card")).card;
    const settled = (await db.select().from(orders).where(and(eq(orders.cycleId, cycleId), eq(orders.apartmentId, apartmentId))))
      .map((r) => r.doc).filter((o) => o.payment.state === "SETTLED");

    const poLines = card.lines.map((l) => {
      const packs = settled.flatMap((o) => o.lines).filter((x) => x.itemId === l.itemId && x.packGrams === l.packGrams).reduce((n, x) => n + x.packs, 0);
      return { itemId: l.itemId, packGrams: l.packGrams, packs, totalGrams: packs * l.packGrams, lotId: l.lotId, quoteId: l.quoteId, supplierPaise: packs * l.parts.supplierPaise };
    }).filter((l) => l.packs > 0);
    const unbound = poLines.filter((l) => l.lotId === null);
    if (unbound.length > 0) refuse(409, "NO_LOT_NO_DISPATCH", `No lot record is bound to: ${unbound.map((l) => l.itemId).join(", ")}.`);

    const revenue = settled.reduce((n, o) => n + o.payment.amountPaise, 0);
    const commission = Math.floor((revenue * CAPTAIN_COMMISSION_BP) / 10_000);
    const entry = { id: `commission:${cycleId}:${apartmentId}`, apartmentId, cycleId, kind: "CAPTAIN_COMMISSION", amountPaise: commission, note: `2% of ${settled.length} paid orders`, at: now() };
    await db.insert(ledger).values(entry).onConflictDoUpdate({ target: ledger.id, set: { amountPaise: commission, note: entry.note, at: entry.at } });

    return reply.status(201).send({ cycleId, apartmentId, paidOrders: settled.length, lines: poLines, captainCommissionPaise: commission });
  });

  app.get<{ Params: { id: string } }>("/apartments/:id/ledger", async (req) =>
    db.select().from(ledger).where(eq(ledger.apartmentId, req.params.id)));

  return app;
}

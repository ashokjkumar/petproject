import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";

/**
 * API integration tests: the real routes, the real engine and a real
 * (in-process) Postgres. Not SIT: no real UPI, no hosted environment.
 */
let app: FastifyInstance;
let clock = "2026-12-19T10:00:00+05:30";
const CYCLE = "2027-01";
const CLUSTER = "OMR-SOUTH";

const OPS = { "x-ops-key": "test-ops-key" };
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url: `/api${url}`, payload: payload as object, headers: OPS });
const put = (url: string, payload: unknown) => app.inject({ method: "PUT", url: `/api${url}`, payload: payload as object, headers: OPS });

const quote = (id: string, itemId: string, paise: number, over: object = {}) => ({
  id, supplierId: `s-${id}`, supplierName: "Delta Mill", supplierKind: "MILL", itemId, pricePerKgPaise: paise, form: "WRITTEN",
  receivedAt: "2026-12-18T10:00:00+05:30", validUntil: "2026-12-28T10:00:00+05:30", minOrderGrams: 500_000, leadTimeDays: 3,
  rationDeclarationSigned: true, supplyConfirmedAt: "2026-12-19T09:00:00+05:30", ...over,
});
const lot = (id: string, itemId: string, quoteId: string, moistureBp = 1300) => ({
  id, supplierId: `s-${quoteId}`, quoteId, itemId, variety: "Ponni", harvest: itemId === "TOOR_DAL" ? null : { season: "SAMBA", year: 2026 },
  milledOn: "2026-12-12", milledAt: "Thanjavur",
  sample: { moistureBp: itemId === "TOOR_DAL" ? 1000 : moistureBp, brokenBp: 200, sampledAt: "2026-12-18T10:00:00+05:30", retainedUntil: "2027-03-18" },
  weightSlipGrams: 2_000_000,
});
const rice = { itemId: "PONNI_RICE_BOILED", transportPackingPaisePerKg: 300, marginPaisePerKg: 900, prePackedLabelled: true };
const dal = { itemId: "TOOR_DAL", transportPackingPaisePerKg: 300, marginPaisePerKg: 1200, prePackedLabelled: true };
const items = (riceLot: string | null = "lot-rice") => [
  { quoteId: "q-rice", packGrams: 25_000, pricing: rice, lotId: riceLot },
  { quoteId: "q-dal", packGrams: 4_000, pricing: dal, lotId: "lot-dal" },
];

async function seed() {
  await post("/apartments", {
    id: "tower-a", name: "Tower A", nameTa: null, flats: 300, routeClusterId: CLUSTER, maxVehicle: "MINI_TRUCK",
    dropPoint: { kind: "GATE", note: null }, association: "REGISTERED", gateConsentAt: null, captain: { name: "Meena", flat: "A-101" }, cyclesCompleted: 3,
  });
  await put(`/cycles/${CYCLE}/clusters/${CLUSTER}/plan`, { supplyRequestedAt: "2026-12-18T12:00:00+05:30", lotLockAt: "2026-12-26T09:00:00+05:30", dropCostPaise: 250_000 });
  await post("/quotes", quote("q-rice", "PONNI_RICE_BOILED", 4300));
  await post("/quotes", quote("q-dal", "TOOR_DAL", 10_300));
  await post("/lots", lot("lot-rice", "PONNI_RICE_BOILED", "q-rice"));
  await post("/lots", lot("lot-dal", "TOOR_DAL", "q-dal"));
}

/** n households join, order one rice sack and one dal pack, and pay. */
async function households(n: number, pay = true) {
  for (let i = 0; i < n; i++) {
    const r = (await post("/apartments/tower-a/residents", { name: `Resident ${i}`, flat: `A-${101 + i}`, phone: "9800000000", iConfirmIWantToJoin: true })).json();
    const o = (await post("/orders", { cycleId: CYCLE, residentId: r.id, lines: [{ itemId: "PONNI_RICE_BOILED", packGrams: 25_000, packs: 1 }, { itemId: "TOOR_DAL", packGrams: 4_000, packs: 1 }] })).json();
    if (pay) await post(`/orders/${o.id}/payment`, { state: "SETTLED", amountPaise: o.payment.amountPaise, upiRef: `UPI${i}` });
  }
}

beforeEach(async () => {
  clock = "2026-12-19T10:00:00+05:30";
  app = buildApp(await openDb(), () => clock, { opsKey: "test-ops-key", upiVpa: null });
  await seed();
});

describe("consent to join", () => {
  it("refuses to add a resident who has not confirmed themselves", async () => {
    const res = await post("/apartments/tower-a/residents", { name: "X", flat: "A-1", phone: "9800000000", iConfirmIWantToJoin: false });
    expect(res.statusCode).toBe(400);
  });
});

describe("price card", () => {
  it("publishes an open-book card: 25 kg ponni ₹1,375, 4 kg dal ₹495.60 with GST shown", async () => {
    const res = await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    expect(res.statusCode).toBe(201);
    const [r, d] = res.json().lines;
    expect(r.packPricePaise).toBe(137_500);
    expect(d.packPricePaise).toBe(49_560);
    expect(d.parts.gstPaise).toBe(2_360);
  });
  it("refuses a margin above the cap", async () => {
    const greedy = [{ ...items()[0], pricing: { ...rice, marginPaisePerKg: 1500 } }];
    const res = await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: greedy });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("PRICE_REFUSED");
  });
  it("holds the card when the quote is stale", async () => {
    clock = "2026-12-22T12:00:00+05:30"; // quote is now 98 hours old
    const res = await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    expect(res.statusCode).toBe(409);
    expect(res.json().reasons[0].code).toBe("QUOTE_STALE");
  });
  it("holds the card when the quote expires before lot lock", async () => {
    await post("/quotes", quote("q-rice", "PONNI_RICE_BOILED", 4300, { validUntil: "2026-12-24T10:00:00+05:30" }));
    const res = await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    expect(res.json().reasons[0].code).toBe("QUOTE_EXPIRES_BEFORE_LOCK");
  });
  it("cannot be replaced once published", async () => {
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    const again = await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    expect(again.json().error).toBe("CARD_ALREADY_PUBLISHED");
  });
  it("rejects a quote without the ration-rice declaration", async () => {
    const res = await post("/quotes", quote("q-bad", "PONNI_RICE_BOILED", 4000, { rationDeclarationSigned: false }));
    expect(res.statusCode).toBe(409);
  });
});

describe("orders and payments", () => {
  beforeEach(async () => { await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() }); });

  it("computes the order amount from the published card, never from the client", async () => {
    await households(1, false);
    const r = (await post("/apartments/tower-a/residents", { name: "Kavitha", flat: "b 202", phone: "9800000001", iConfirmIWantToJoin: true })).json();
    expect(r.flat).toBe("B202");
    const o = (await post("/orders", { cycleId: CYCLE, residentId: r.id, lines: [{ itemId: "PONNI_RICE_BOILED", packGrams: 25_000, packs: 2 }] })).json();
    expect(o.payment.amountPaise).toBe(275_000);
    expect(o.payment.state).toBe("UNPAID");
  });
  it("refuses a pack size that is not on the card", async () => {
    const r = (await post("/apartments/tower-a/residents", { name: "K", flat: "B-1", phone: "9800000001", iConfirmIWantToJoin: true })).json();
    const res = await post("/orders", { cycleId: CYCLE, residentId: r.id, lines: [{ itemId: "PONNI_RICE_BOILED", packGrams: 10_000, packs: 1 }] });
    expect(res.json().error).toBe("NOT_ON_PRICE_CARD");
  });
  it("refuses a payment that does not match the order amount", async () => {
    const r = (await post("/apartments/tower-a/residents", { name: "K", flat: "B-1", phone: "9800000001", iConfirmIWantToJoin: true })).json();
    const o = (await post("/orders", { cycleId: CYCLE, residentId: r.id, lines: [{ itemId: "TOOR_DAL", packGrams: 4_000, packs: 1 }] })).json();
    const res = await post(`/orders/${o.id}/payment`, { state: "SETTLED", amountPaise: 49_000, upiRef: "UPI-X" });
    expect(res.json().error).toBe("AMOUNT_MISMATCH");
  });
});

describe("dispatch goes through the guards", () => {
  it("16 paid households: guards pass, mill order covers paid orders, captain commission is a ledger entry", async () => {
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    await households(16);
    await households(2, false); // two who ordered but did not pay
    const check = (await post(`/cycles/${CYCLE}/apartments/tower-a/check`, {})).json();
    expect(check.mayProceed).toBe(true);
    const po = await post(`/cycles/${CYCLE}/apartments/tower-a/purchase-order`, {});
    expect(po.statusCode).toBe(201);
    expect(po.json().paidOrders).toBe(16);
    expect(po.json().lines[0].totalGrams).toBe(400_000);
    expect(po.json().captainCommissionPaise).toBe(Math.floor((16 * 187_060 * 200) / 10_000));
    const book = (await app.inject({ method: "GET", url: "/api/apartments/tower-a/ledger", headers: OPS })).json();
    expect(book).toHaveLength(1);
    expect(book[0].kind).toBe("CAPTAIN_COMMISSION");
  });
  it("10 paid households: watched on the first check, rolled on the second, and no mill order either time", async () => {
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    await households(10);
    const first = (await post(`/cycles/${CYCLE}/apartments/tower-a/check`, {})).json();
    expect(first.results.find((r: { guard: string }) => r.guard === "MIN_HOUSEHOLDS").state).toBe("WATCH");
    expect((await post(`/cycles/${CYCLE}/apartments/tower-a/purchase-order`, {})).statusCode).toBe(409);
    const second = (await post(`/cycles/${CYCLE}/apartments/tower-a/check`, {})).json();
    const g = second.results.find((r: { guard: string }) => r.guard === "MIN_HOUSEHOLDS");
    expect(g.state).toBe("BLOCK");
    expect(g.recommendation).toBe("ROLL_TO_NEXT_CYCLE");
    expect((await post(`/cycles/${CYCLE}/apartments/tower-a/purchase-order`, {})).json().error).toBe("GUARDS_NOT_PASSED");
  });
  it("no lot, no dispatch: a card line without a lot record cannot be ordered from the mill", async () => {
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items(null) });
    await households(16);
    const po = await post(`/cycles/${CYCLE}/apartments/tower-a/purchase-order`, {});
    expect(po.json().error).toBe("NO_LOT_NO_DISPATCH");
    await put(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card/PONNI_RICE_BOILED/lot`, { lotId: "lot-rice" });
    expect((await post(`/cycles/${CYCLE}/apartments/tower-a/purchase-order`, {})).statusCode).toBe(201);
  });
  it("a lot that fails its sample stops the mill order", async () => {
    await post("/lots", lot("lot-rice", "PONNI_RICE_BOILED", "q-rice", 1600));
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    await households(16);
    const po = await post(`/cycles/${CYCLE}/apartments/tower-a/purchase-order`, {});
    expect(po.json().error).toBe("GUARDS_NOT_PASSED");
    expect(po.json().reasons[0].code).toBe("LOT_OUT_OF_SPEC");
  });
});

describe("who may do what", () => {
  it("refuses operations actions without the operations key", async () => {
    const res = await app.inject({ method: "POST", url: `/api/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, payload: { items: items() } });
    expect(res.statusCode).toBe(401);
    const pay = await app.inject({ method: "POST", url: "/api/orders/x/payment", payload: { state: "SETTLED", amountPaise: 1, upiRef: "x" } });
    expect(pay.statusCode).toBe(401);
  });
  it("lets a resident see the card, join, order once, and see only their own order", async () => {
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    const pub = (await app.inject({ method: "GET", url: "/api/apartments/tower-a/public" })).json();
    expect(pub.card.lines).toHaveLength(2);
    expect(pub.lots[0].milledAt).toBe("Thanjavur");
    const r = (await app.inject({ method: "POST", url: "/api/apartments/tower-a/residents", payload: { name: "Kavitha", flat: "B-202", phone: "9800000001", iConfirmIWantToJoin: true } })).json();
    const order = { cycleId: CYCLE, residentId: r.id, lines: [{ itemId: "TOOR_DAL", packGrams: 4_000, packs: 1 }] };
    expect((await app.inject({ method: "POST", url: "/api/orders", payload: order })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/api/orders", payload: order })).json().error).toBe("ALREADY_ORDERED");
    const me = (await app.inject({ method: "GET", url: `/api/residents/${r.id}` })).json();
    expect(me.orders).toHaveLength(1);
  });
  it("shows the roster only with the captain code", async () => {
    await post(`/cycles/${CYCLE}/clusters/${CLUSTER}/price-card`, { items: items() });
    await households(3);
    await put("/apartments/tower-a/captain-code", { code: "meena-2027" });
    const url = `/api/apartments/tower-a/roster?cycleId=${CYCLE}`;
    expect((await app.inject({ method: "GET", url, headers: { "x-captain-code": "guess" } })).statusCode).toBe(401);
    const roster = (await app.inject({ method: "GET", url, headers: { "x-captain-code": "meena-2027" } })).json();
    expect(roster.paidHouseholds).toBe(3);
    expect(roster.orders[0]).not.toHaveProperty("phone");
  });
});

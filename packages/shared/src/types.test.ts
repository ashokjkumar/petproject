import { describe, expect, it } from "vitest";
import { GuardResult, PriceCardLine, SupplierQuote } from "./index.js";

const reason = { code: "MILL_PRICE_UP", ta: "ஆலை விலை உயர்ந்தது", en: "The rise came from the mill, not from us." };

// The worked example from section 1(b) of the brief: 25 kg ponni at ₹1,375.
const ponni = {
  itemId: "PONNI_RICE_BOILED",
  packGrams: 25_000,
  quoteId: "q1",
  lotId: "lot1",
  parts: { supplierPaise: 107_500, transportPackingPaise: 7_500, marginPaise: 22_500, gstPaise: 0 },
  gstTreatment: "EXEMPT",
  packPricePaise: 137_500,
  previous: { cycleId: "2026-12", packPricePaise: 135_000 },
  reasons: [reason],
};

describe("open-book price card line", () => {
  it("accepts the brief's ponni example", () => {
    expect(PriceCardLine.safeParse(ponni).success).toBe(true);
  });
  it("rejects a price that is not the sum of its parts", () => {
    expect(PriceCardLine.safeParse({ ...ponni, packPricePaise: 137_600 }).success).toBe(false);
  });
  it("rejects a price with no reason", () => {
    expect(PriceCardLine.safeParse({ ...ponni, reasons: [] }).success).toBe(false);
  });
  it("rejects fractional money", () => {
    expect(PriceCardLine.safeParse({ ...ponni, packPricePaise: 137_500.5 }).success).toBe(false);
  });
  it("rejects an exempt pack that carries GST", () => {
    const parts = { ...ponni.parts, gstPaise: 100 };
    expect(PriceCardLine.safeParse({ ...ponni, parts, packPricePaise: 137_600 }).success).toBe(false);
  });
});

describe("supplier quote", () => {
  const quote = {
    id: "q1", supplierId: "s1", supplierName: "Example Mill", supplierKind: "MILL",
    itemId: "PONNI_RICE_BOILED", pricePerKgPaise: 4_300, form: "WRITTEN",
    receivedAt: "2026-12-18T10:00:00+05:30", validUntil: "2026-12-27T10:00:00+05:30",
    minOrderGrams: 1_000_000, leadTimeDays: 3, rationDeclarationSigned: true, supplyConfirmedAt: null,
  };
  it("accepts a written quote", () => {
    expect(SupplierQuote.safeParse(quote).success).toBe(true);
  });
  it("cannot represent a verbal quote", () => {
    expect(SupplierQuote.safeParse({ ...quote, form: "VERBAL" }).success).toBe(false);
  });
});

describe("guard result", () => {
  const result = {
    guard: "MIN_HOUSEHOLDS", blocks: "RUN_DISPATCH", pass: false, confidence: 0.9,
    reasons: [reason], dataQuality: "COMPLETE", consecutiveFailures: 1,
    recommendation: "MERGE_WITH_NEIGHBOUR", checkedAt: "2026-12-26T09:00:00+05:30",
  };
  it("accepts a guard that explains itself", () => {
    expect(GuardResult.safeParse(result).success).toBe(true);
  });
  it("rejects a guard with no explanation", () => {
    expect(GuardResult.safeParse({ ...result, reasons: [] }).success).toBe(false);
  });
});

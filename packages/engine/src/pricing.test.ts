import { describe, expect, it } from "vitest";
import { PriceCardLine, type ItemPricing, type SupplierQuote } from "@kootu/shared";
import { priceLine, rupees } from "./index.js";

const quote = (itemId: SupplierQuote["itemId"], pricePerKgPaise: number): SupplierQuote => ({
  id: "q", supplierId: "s", supplierName: "Example Mill", supplierKind: "MILL", itemId, pricePerKgPaise,
  form: "WRITTEN", receivedAt: "2026-12-18T10:00:00+05:30", validUntil: "2026-12-27T10:00:00+05:30",
  minOrderGrams: 1_000_000, leadTimeDays: 3, rationDeclarationSigned: true, supplyConfirmedAt: null,
});
const rice: ItemPricing = { itemId: "PONNI_RICE_BOILED", transportPackingPaisePerKg: 300, marginPaisePerKg: 900, prePackedLabelled: true };
const dal: ItemPricing = { itemId: "TOOR_DAL", transportPackingPaisePerKg: 300, marginPaisePerKg: 1200, prePackedLabelled: true };

describe("open-book pricing", () => {
  it("reproduces the brief's example: 25 kg ponni at ₹1,375, rise from the mill", () => {
    const out = priceLine({
      quote: quote("PONNI_RICE_BOILED", 4300), packGrams: 25_000, pricing: rice, lotId: "lot1",
      previous: { cycleId: "2026-12", packPricePaise: 135_000, supplierPaise: 105_000 },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.line.packPricePaise).toBe(137_500);
    expect(out.line.gstTreatment).toBe("EXEMPT");
    expect(out.line.reasons.map((r) => r.code)).toEqual(["PRICE_BREAKDOWN", "MILL_PRICE_UP"]);
    expect(PriceCardLine.safeParse(out.line).success).toBe(true);
  });
  it("adds 5% GST to a labelled 4 kg dal pack and shows it as its own part", () => {
    const out = priceLine({ quote: quote("TOOR_DAL", 10_300), packGrams: 4_000, pricing: dal, lotId: null, previous: null });
    expect(out.ok && out.line.parts.gstPaise).toBe(2_360);
    expect(out.ok && out.line.packPricePaise).toBe(49_560);
  });
  it("refuses a price whose margin is above the 18% cap", () => {
    const greedy = { ...rice, marginPaisePerKg: 1500 };
    const out = priceLine({ quote: quote("PONNI_RICE_BOILED", 4300), packGrams: 25_000, pricing: greedy, lotId: null, previous: null });
    expect(out.ok).toBe(false);
  });
  it("says so plainly when a rise is ours, not the mill's", () => {
    const out = priceLine({
      quote: quote("PONNI_RICE_BOILED", 4300), packGrams: 25_000, pricing: rice, lotId: null,
      previous: { cycleId: "2026-12", packPricePaise: 135_000, supplierPaise: 107_500 },
    });
    expect(out.ok && out.line.reasons[1]?.code).toBe("OWN_COST_CHANGED");
  });
  it("is deterministic", () => {
    const input = { quote: quote("TOOR_DAL", 10_300), packGrams: 4_000, pricing: dal, lotId: null, previous: null };
    expect(priceLine(input)).toEqual(priceLine(input));
  });
  it("formats rupees the Indian way", () => {
    expect(rupees(137_500)).toBe("₹1,375");
    expect(rupees(12_345_678)).toBe("₹1,23,456.78");
  });
});

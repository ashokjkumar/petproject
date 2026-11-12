import {
  GST_RULES_UNCONFIRMED, MARGIN_CAP_BP,
  type ItemPricing, type PriceCardLine, type Reason, type SupplierQuote,
} from "@kootu/shared";
import { kg, rupees } from "./format.js";

export interface PriceInput {
  quote: SupplierQuote;
  packGrams: number;
  pricing: ItemPricing;
  lotId: string | null;
  previous: PriceCardLine["previous"];
}

export type PriceOutcome = { ok: true; line: PriceCardLine } | { ok: false; reasons: Reason[] };

/**
 * Open-book price for one pack: mill price + transport/packing + our fixed
 * margin + GST. Refuses to produce a price whose margin is above the cap.
 */
export function priceLine(input: PriceInput): PriceOutcome {
  const { quote, packGrams, pricing, previous } = input;
  const perPack = (paisePerKg: number) => Math.round((paisePerKg * packGrams) / 1000);

  const supplierPaise = perPack(quote.pricePerKgPaise);
  const transportPackingPaise = perPack(pricing.transportPackingPaisePerKg);
  const marginPaise = perPack(pricing.marginPaisePerKg);
  const beforeGst = supplierPaise + transportPackingPaise + marginPaise;

  if (marginPaise * 10_000 > MARGIN_CAP_BP * beforeGst) {
    return {
      ok: false,
      reasons: [{
        code: "MARGIN_ABOVE_CAP",
        ta: "எங்கள் லாபம் அறிவிக்கப்பட்ட வரம்பை மீறுகிறது; இந்த விலையை வெளியிட முடியாது.",
        en: `Our margin would be above the published cap of ${MARGIN_CAP_BP / 100}%; this price cannot be published.`,
      }],
    };
  }

  const taxable =
    pricing.prePackedLabelled &&
    (packGrams < GST_RULES_UNCONFIRMED.exemptAtOrAboveGrams ||
      (packGrams === GST_RULES_UNCONFIRMED.exemptAtOrAboveGrams && !GST_RULES_UNCONFIRMED.exactly25kgIsExempt));
  const gstPaise = taxable ? Math.round((beforeGst * GST_RULES_UNCONFIRMED.prePackedLabelledRateBp) / 10_000) : 0;
  const packPricePaise = beforeGst + gstPaise;

  const breakdown: Reason = {
    code: "PRICE_BREAKDOWN",
    ta: `உங்கள் ${kg(packGrams)} கிலோ பை ${rupees(packPricePaise)}: ஆலை விலை ${rupees(supplierPaise)}, போக்குவரத்து மற்றும் பேக்கிங் ${rupees(transportPackingPaise)}, எங்கள் நிலையான லாபம் ${rupees(marginPaise)}${taxable ? `, ஜிஎஸ்டி ${rupees(gstPaise)}` : ""}.`,
    en: `Your ${kg(packGrams)} kg pack is ${rupees(packPricePaise)}: ${quote.supplierName} price ${rupees(supplierPaise)}, transport and packing ${rupees(transportPackingPaise)}, our fixed margin ${rupees(marginPaise)}${taxable ? `, GST ${rupees(gstPaise)}` : ""}.`,
  };

  return {
    ok: true,
    line: {
      itemId: quote.itemId,
      packGrams,
      quoteId: quote.id,
      lotId: input.lotId,
      parts: { supplierPaise, transportPackingPaise, marginPaise, gstPaise },
      gstTreatment: taxable ? "TAXABLE_5_PERCENT" : "EXEMPT",
      packPricePaise,
      previous,
      reasons: [breakdown, changeReason(packPricePaise, supplierPaise, previous)],
    },
  };
}

function changeReason(price: number, supplier: number, previous: PriceCardLine["previous"]): Reason {
  if (!previous) {
    return {
      code: "FIRST_CYCLE",
      ta: "இது உங்கள் முதல் மாதம்; ஒப்பிட முந்தைய விலை இல்லை.",
      en: "This is your first month, so there is no earlier price to compare with.",
    };
  }
  const delta = price - previous.packPricePaise;
  if (delta === 0) {
    return { code: "PRICE_UNCHANGED", ta: "கடந்த மாத விலையே; மாற்றம் இல்லை.", en: "Same price as last month." };
  }
  const millDelta = supplier - previous.supplierPaise;
  // GST moves with the mill price, so allow 5% of the mill change plus a paisa of rounding.
  const fromMillOnly =
    Math.sign(delta) === Math.sign(millDelta) && Math.abs(delta - millDelta) <= Math.abs(millDelta) * 0.05 + 1;
  const amount = rupees(Math.abs(delta));
  if (fromMillOnly && delta > 0) {
    return {
      code: "MILL_PRICE_UP",
      ta: `கடந்த மாதத்தை விட ${amount} அதிகம்; உயர்வு ஆலையிலிருந்து வந்தது, எங்களிடமிருந்து அல்ல.`,
      en: `${amount} higher than last month; the rise came from the mill, not from us.`,
    };
  }
  if (fromMillOnly) {
    return {
      code: "MILL_PRICE_DOWN",
      ta: `கடந்த மாதத்தை விட ${amount} குறைவு; ஆலை விலை குறைந்தது, அதை அப்படியே உங்களுக்குத் தருகிறோம்.`,
      en: `${amount} lower than last month; the mill price fell and we passed all of it on.`,
    };
  }
  return {
    code: "OWN_COST_CHANGED",
    ta: `கடந்த மாதத்தை விட ${amount} ${delta > 0 ? "அதிகம்" : "குறைவு"}; இதில் ஒரு பகுதி ஆலை விலையால் அல்ல, போக்குவரத்து அல்லது எங்கள் லாப மாற்றத்தால்.`,
    en: `${amount} ${delta > 0 ? "higher" : "lower"} than last month; part of this is not the mill but a change in transport or in our own margin.`,
  };
}

import {
  CHECKS_BEFORE_ACTING, CycleSnapshot, GUARD_THRESHOLDS_GUESS as T, LOT_SPEC_PLACEHOLDER,
  VARIABLE_COST_BP_GUESS,
  type BlockTarget, type GuardId, type GuardResult, type Reason,
} from "@kootu/shared";
import { hoursBetween, normaliseFlat, percent } from "./format.js";

/** Consecutive failed checks so far, per guard and subject. Carried between checks by the caller. */
export type Counters = Record<string, number>;

export interface CycleDecision {
  results: GuardResult[];
  counters: Counters;
  /** True only if no blocking guard is in WATCH or BLOCK. Every dispatch path must check this. */
  mayProceed: boolean;
}

interface Verdict {
  pass: boolean;
  confidence: number;
  reason: Reason;
  dataQuality: GuardResult["dataQuality"];
  recommendation: GuardResult["recommendation"];
  /** Set when a guard must alert a human instead of acting on its own (immature baseline, unsampled lot). */
  neverAuto?: boolean;
}

const BLOCKS: Record<GuardId, BlockTarget> = {
  MIN_HOUSEHOLDS: "RUN_DISPATCH", SUPPLY_UNCONFIRMED: "LOT_LOCK", QUOTE_STALE: "PRICE_CARD",
  PRICE_SHOCK: "PRICE_CARD", PAYMENT_SETTLED: "NOTICE_ONLY", MARGIN_FLOOR: "RUN_DISPATCH",
  LOT_QUALITY: "LOT_DISPATCH", COMPLAINT_SPIKE: "SUPPLIER_REMAINING_LOTS", DELIVERY_SLIP: "NOTICE_ONLY",
};

/**
 * Run every guard over one snapshot. Pure: same snapshot and counters in,
 * same decision out. Returns decisions with reasons; executes nothing.
 */
export function evaluateCycle(input: unknown, prior: Counters = {}): CycleDecision {
  const s = CycleSnapshot.parse(input);
  const counters: Counters = {};
  const results: GuardResult[] = [];

  const add = (guard: GuardId, subject: string, v: Verdict) => {
    const key = `${guard}:${subject}`;
    const consecutiveFailures = v.pass ? 0 : (prior[key] ?? 0) + 1;
    counters[key] = consecutiveFailures;
    const needed = CHECKS_BEFORE_ACTING[guard];
    const acts = !v.pass && needed !== null && !v.neverAuto && consecutiveFailures >= needed;
    const state = v.pass ? "PASS" : acts ? "BLOCK" : "WATCH";
    const waiting = state === "WATCH" && needed !== null;
    results.push({
      guard, subject, blocks: BLOCKS[guard], pass: v.pass, state,
      confidence: v.confidence, reasons: [v.reason], dataQuality: v.dataQuality, consecutiveFailures,
      recommendation: waiting ? "HOLD_FOR_HUMAN" : v.recommendation,
      checkedAt: s.now,
    });
  };

  const apt = s.apartment;
  const settled = s.orders.filter((o) => o.payment.state === "SETTLED");
  const paid = new Set(settled.map((o) => normaliseFlat(o.flat))).size;
  const unsure = s.orders.some((o) => o.payment.state === "PENDING" || o.payment.state === "FAILED");

  // MIN_HOUSEHOLDS
  {
    const min = T.minPaidHouseholds;
    const partner = s.neighbours.find((n) => paid > 0 && paid + n.paidHouseholds >= min);
    if (paid >= min) {
      add("MIN_HOUSEHOLDS", apt.id, {
        pass: true, confidence: 1, dataQuality: "COMPLETE", recommendation: "PROCEED",
        reason: { code: "HOUSEHOLDS_ENOUGH", ta: `${paid} குடும்பங்கள் பணம் செலுத்தியுள்ளன; வண்டி அனுப்பலாம்.`, en: `${paid} households at ${apt.name} have paid; the run can go.` },
      });
    } else if (partner) {
      add("MIN_HOUSEHOLDS", apt.id, {
        pass: true, confidence: 0.9, dataQuality: "COMPLETE", recommendation: "MERGE_WITH_NEIGHBOUR",
        reason: { code: "HOUSEHOLDS_MERGED", ta: `${paid} குடும்பங்கள் மட்டுமே; அருகிலுள்ள ${partner.name} உடன் சேர்த்து ஒரே வண்டியில் அனுப்பலாம்.`, en: `${apt.name} has ${paid} paid households, under the minimum of ${min}; it can share one truck with ${partner.name}.` },
      });
    } else {
      add("MIN_HOUSEHOLDS", apt.id, {
        pass: false, confidence: unsure ? 0.5 : 0.95, dataQuality: unsure ? "PARTIAL" : "COMPLETE",
        recommendation: "ROLL_TO_NEXT_CYCLE",
        reason: { code: "HOUSEHOLDS_BELOW_MIN", ta: `${paid} குடும்பங்கள் மட்டுமே பணம் செலுத்தியுள்ளன (குறைந்தபட்சம் ${min}); ஆர்டர்கள் அடுத்த மாதத்துக்கு மாற்றப்படும் அல்லது பணம் திருப்பித் தரப்படும்.`, en: `Only ${paid} households at ${apt.name} have paid (minimum ${min}); orders roll to next month or are refunded.` },
      });
    }
  }

  // MARGIN_FLOOR
  {
    let margin = 0;
    let revenue = 0;
    let missingPricing = false;
    for (const o of settled) {
      revenue += o.payment.amountPaise;
      for (const l of o.lines) {
        const p = s.pricing.find((x) => x.itemId === l.itemId);
        if (!p) { missingPricing = true; continue; }
        margin += Math.round((p.marginPaisePerKg * l.packGrams * l.packs) / 1000);
      }
    }
    const beforeDrop = margin - Math.floor((revenue * VARIABLE_COST_BP_GUESS) / 10_000);
    const contribution = beforeDrop - s.dropCostPaise;
    const partner = s.neighbours.find((n) => paid > 0 && contribution + n.contributionBeforeDropPaise >= 0);
    const dq = missingPricing ? "PARTIAL" : unsure ? "PARTIAL" : "COMPLETE";
    if (contribution >= 0) {
      add("MARGIN_FLOOR", apt.id, {
        pass: true, confidence: 1, dataQuality: dq, recommendation: "PROCEED",
        reason: { code: "RUN_COVERS_COST", ta: "இந்த வண்டி தன் செலவை ஈடுகட்டுகிறது.", en: "This run covers its own cost." },
      });
    } else if (partner) {
      add("MARGIN_FLOOR", apt.id, {
        pass: true, confidence: 0.9, dataQuality: dq, recommendation: "MERGE_WITH_NEIGHBOUR",
        reason: { code: "RUN_COVERS_COST_MERGED", ta: `தனியாக இந்த வண்டி நஷ்டம்; ${partner.name} உடன் சேர்த்தால் செலவு ஈடாகும்.`, en: `Alone this run loses money; shared with ${partner.name} it covers its cost.` },
      });
    } else {
      add("MARGIN_FLOOR", apt.id, {
        pass: false, confidence: unsure ? 0.5 : 0.95, dataQuality: dq, recommendation: "ROLL_TO_NEXT_CYCLE",
        reason: { code: "RUN_BELOW_COST", ta: "இந்த வண்டி தன் செலவை ஈடுகட்டவில்லை; வழித்தடத்தை இணைக்க வேண்டும் அல்லது அடுத்த மாதத்துக்கு மாற்ற வேண்டும்.", en: "This run does not cover its cost; merge the route or roll to next month." },
      });
    }
  }

  // PAYMENT_SETTLED (notice only: paid households are never held back by unpaid neighbours)
  {
    const counted = s.orders.filter((o) => o.payment.state !== "REFUNDED");
    if (counted.length === 0) {
      add("PAYMENT_SETTLED", apt.id, {
        pass: true, confidence: 0.5, dataQuality: "MISSING", recommendation: "PROCEED",
        reason: { code: "NO_ORDERS_YET", ta: "இன்னும் ஆர்டர்கள் இல்லை.", en: "No orders yet." },
      });
    } else {
      const bp = Math.floor((settled.length * 10_000) / counted.length);
      const ok = bp >= T.paymentSettledBp;
      add("PAYMENT_SETTLED", apt.id, {
        pass: ok, confidence: 1, dataQuality: "COMPLETE", recommendation: ok ? "PROCEED" : "ORDER_PAID_ONLY",
        reason: ok
          ? { code: "PAYMENTS_SETTLED", ta: `${percent(bp)}% ஆர்டர்களுக்குப் பணம் வந்துவிட்டது.`, en: `${percent(bp)}% of orders are paid.` }
          : { code: "PAYMENTS_UNSETTLED", ta: `${percent(bp)}% ஆர்டர்களுக்கு மட்டுமே பணம் வந்துள்ளது; பணம் வந்த ஆர்டர்கள் மட்டும் ஆலைக்கு அனுப்பப்படும், மற்றவை அடுத்த மாதத்துக்கு.`, en: `Only ${percent(bp)}% of orders are paid; the mill order covers paid orders only and the rest roll to next month.` },
      });
    }
  }

  for (const q of s.quotes) {
    // SUPPLY_UNCONFIRMED
    if (q.supplyConfirmedAt) {
      add("SUPPLY_UNCONFIRMED", q.id, {
        pass: true, confidence: 1, dataQuality: "COMPLETE", recommendation: "PROCEED",
        reason: { code: "SUPPLY_CONFIRMED", ta: "ஆலை எழுத்துப்பூர்வமாக இருப்பை உறுதி செய்துள்ளது.", en: `${q.supplierName} has confirmed the stock in writing.` },
      });
    } else {
      const waited = Math.floor(hoursBetween(s.supplyRequestedAt, s.now));
      const late = waited > T.supplyConfirmationHours;
      add("SUPPLY_UNCONFIRMED", q.id, {
        pass: !late, confidence: late ? 0.95 : 0.6, dataQuality: late ? "COMPLETE" : "PARTIAL",
        recommendation: late ? "ROLL_TO_NEXT_CYCLE" : "PROCEED",
        reason: late
          ? { code: "SUPPLY_NOT_CONFIRMED", ta: `${waited} மணி நேரமாகியும் ஆலை எழுத்துப்பூர்வமாக உறுதி செய்யவில்லை; உறுதி இல்லாத இருப்பை நாங்கள் வாக்களிக்க மாட்டோம்.`, en: `${q.supplierName} has not confirmed in writing after ${waited} hours; we do not promise stock the mill has not confirmed.` }
          : { code: "SUPPLY_AWAITING", ta: `ஆலையின் எழுத்துப்பூர்வ உறுதிக்காகக் காத்திருக்கிறோம் (${waited} மணி நேரம்).`, en: `Waiting for written confirmation from ${q.supplierName} (${waited} hours so far).` },
      });
    }

    // QUOTE_STALE (only before the card is published; after that the price is a promise)
    if (!s.cardPublished) {
      const age = Math.floor(hoursBetween(q.receivedAt, s.now));
      const expiresEarly = hoursBetween(q.validUntil, s.lotLockAt) > 0;
      const stale = age > T.quoteStaleHours;
      add("QUOTE_STALE", q.id, {
        pass: !stale && !expiresEarly, confidence: 1, dataQuality: "COMPLETE",
        recommendation: stale || expiresEarly ? "REPRICE" : "PROCEED",
        reason: stale
          ? { code: "QUOTE_STALE", ta: `ஆலை விலைப்பட்டியல் ${age} மணி நேரம் பழையது; விலை அட்டை வெளியிடும் முன் புதிய விலை கேட்க வேண்டும்.`, en: `The quote from ${q.supplierName} is ${age} hours old; ask for a fresh one before publishing the price card.` }
          : expiresEarly
            ? { code: "QUOTE_EXPIRES_BEFORE_LOCK", ta: "ஆலை விலை ஆர்டர் முடியும் நாள் வரை செல்லாது; புதிய எழுத்துப்பூர்வ விலை தேவை.", en: `The quote from ${q.supplierName} expires before orders lock; a paid price must never change, so a longer written quote is needed.` }
            : { code: "QUOTE_FRESH", ta: "ஆலை விலைப்பட்டியல் புதியது.", en: `The quote from ${q.supplierName} is ${age} hours old and valid through lot lock.` },
      });
    }

    // PRICE_SHOCK (dal only; rice is priced once per cycle)
    if (q.itemId === "TOOR_DAL") {
      const prev = s.previousQuotes.find((p) => p.itemId === q.itemId);
      if (!prev || prev.pricePerKgPaise === 0) {
        add("PRICE_SHOCK", q.id, {
          pass: true, confidence: 0.5, dataQuality: "MISSING", recommendation: "PROCEED",
          reason: { code: "NO_PRICE_BASELINE", ta: "ஒப்பிட கடந்த மாத பருப்பு விலை இல்லை.", en: "There is no dal price from last month to compare with." },
        });
      } else {
        const moveBp = Math.round(((q.pricePerKgPaise - prev.pricePerKgPaise) * 10_000) / prev.pricePerKgPaise);
        const shock = moveBp > T.dalPriceShockBp;
        const pct = percent(Math.abs(moveBp));
        add("PRICE_SHOCK", q.id, {
          pass: !shock, confidence: 1, dataQuality: "COMPLETE", recommendation: shock ? "HOLD_FOR_HUMAN" : "PROCEED",
          reason: shock
            ? { code: "DAL_PRICE_SHOCK", ta: `பருப்பு விலை கடந்த மாதத்தை விட ${pct}% உயர்ந்துள்ளது; வெளியிடும் முன் ஒருவர் சரிபார்ப்பார்.`, en: `The dal quote is ${pct}% above last month; a person will check it before the price is published.` }
            : moveBp < -T.dalPriceShockBp
              ? { code: "DAL_PRICE_DROP", ta: `பருப்பு விலை ${pct}% குறைந்துள்ளது; குறைவு அப்படியே உங்களுக்கு.`, en: `The dal quote fell ${pct}%; the whole fall is passed on.` }
              : { code: "DAL_PRICE_NORMAL", ta: `பருப்பு விலை கடந்த மாதத்தை விட ${pct}% மாறியுள்ளது; இது வழக்கமான வரம்புக்குள்.`, en: `The dal quote moved ${pct}% against last month, within the normal range.` },
        });
      }
    }
  }

  for (const lot of s.lots) {
    // LOT_QUALITY
    const spec = LOT_SPEC_PLACEHOLDER[lot.itemId];
    if (!lot.sample) {
      add("LOT_QUALITY", lot.id, {
        pass: false, confidence: 0.5, dataQuality: "MISSING", recommendation: "HOLD_FOR_HUMAN", neverAuto: true,
        reason: { code: "LOT_NOT_SAMPLED", ta: "இந்த லாட் இன்னும் சோதிக்கப்படவில்லை; சோதனை இல்லாமல் அனுப்ப மாட்டோம்.", en: `Lot ${lot.id} has not been sampled yet; nothing is dispatched without a test.` },
      });
    } else {
      const m = percent(lot.sample.moistureBp);
      const b = percent(lot.sample.brokenBp);
      const ok = lot.sample.moistureBp <= spec.maxMoistureBp && lot.sample.brokenBp <= spec.maxBrokenBp;
      add("LOT_QUALITY", lot.id, {
        pass: ok, confidence: 1, dataQuality: "COMPLETE", recommendation: ok ? "PROCEED" : "REJECT_LOT",
        reason: ok
          ? { code: "LOT_IN_SPEC", ta: `மாதிரி சோதனை சரி: ஈரப்பதம் ${m}%, உடைந்த தானியம் ${b}%.`, en: `Sample in spec: moisture ${m}%, broken grain ${b}%.` }
          : { code: "LOT_OUT_OF_SPEC", ta: `மாதிரி சோதனை தவறியது (ஈரப்பதம் ${m}%, உடைந்த தானியம் ${b}%); இந்த லாட் நிராகரிக்கப்பட்டது, கலக்கப்படாது.`, en: `Sample failed (moisture ${m}%, broken grain ${b}%); lot ${lot.id} is rejected and will not be blended.` },
      });
    }

    // COMPLAINT_SPIKE
    const recent = s.complaints.filter((c) => {
      const h = hoursBetween(c.at, s.now);
      return c.lotId === lot.id && h >= 0 && h <= T.complaintSpikeWindowHours;
    });
    const n = recent.length;
    const spike = n >= T.complaintSpikeCount;
    const allNew = spike && recent.every((c) => c.apartmentCyclesCompleted < T.immatureBaselineCycles);
    add("COMPLAINT_SPIKE", lot.id, {
      pass: !spike, confidence: allNew ? 0.6 : 1, dataQuality: "COMPLETE",
      recommendation: !spike ? "PROCEED" : allNew ? "HOLD_FOR_HUMAN" : "PAUSE_SUPPLIER", neverAuto: allNew,
      reason: !spike
        ? { code: "COMPLAINTS_NORMAL", ta: `48 மணி நேரத்தில் ${n} புகார்; வரம்புக்குள்.`, en: `${n} complaint(s) on lot ${lot.id} in 48 hours; within the normal range.` }
        : allNew
          ? { code: "COMPLAINTS_NEW_APARTMENT", ta: `இந்த லாட்டில் 48 மணி நேரத்தில் ${n} புகார்கள்; குடியிருப்பு புதியது என்பதால் தானாக நிறுத்தவில்லை, ஒருவர் உடனே பார்ப்பார்.`, en: `${n} complaints on lot ${lot.id} in 48 hours, all from an apartment in its first two cycles; not paused automatically, a person is looking now.` }
          : { code: "COMPLAINT_SPIKE", ta: `இந்த லாட்டில் 48 மணி நேரத்தில் ${n} புகார்கள்; இந்த ஆலையின் மீதமுள்ள லாட்டுகள் நிறுத்தப்படும், ஒருவர் பார்த்த பிறகே தொடரும்.`, en: `${n} complaints on lot ${lot.id} in 48 hours; remaining lots from this mill are paused until a person clears them.` },
    });
  }

  // DELIVERY_SLIP (notice only)
  if (s.delivery) {
    const slip = Math.round(hoursBetween(s.delivery.committedAt, s.delivery.estimatedAt));
    const late = slip > T.deliverySlipHours;
    add("DELIVERY_SLIP", apt.id, {
      pass: !late, confidence: 1, dataQuality: "COMPLETE", recommendation: late ? "NOTIFY_CAPTAIN" : "PROCEED",
      reason: late
        ? { code: "DELIVERY_LATE", ta: `டெலிவரி ${slip} மணி நேரம் தாமதம்; கேப்டனுக்கு முதலில் புதிய நேரம் தெரிவிக்கப்படும்.`, en: `Delivery to ${apt.name} is running ${slip} hours late; the captain is told first, with the new time.` }
        : { code: "DELIVERY_ON_TIME", ta: "டெலிவரி சொன்ன நாளில் நடக்கும்.", en: `Delivery to ${apt.name} is within a day of the committed time.` },
    });
  }

  const mayProceed = results.every((r) => r.state === "PASS" || r.blocks === "NOTICE_ONLY");
  return { results, counters, mayProceed };
}

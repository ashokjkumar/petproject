# DECISIONS

Every non-obvious modelling choice, with its reason. Status is one of:
DECIDED (by the founder), PROPOSED (by the builder, awaiting review),
GUESS (a number to be learned from pilot data), OPEN (needs an answer).

## Guesses to be replaced by pilot data
| # | Value | Where | Status |
|---|---|---|---|
| G1 | 15 paid households minimum per run | MIN_HOUSEHOLDS | GUESS |
| G2 | 48 h for written mill confirmation | SUPPLY_UNCONFIRMED | GUESS |
| G3 | 72 h quote staleness | QUOTE_STALE | GUESS |
| G4 | 8% dal movement vs last cycle | PRICE_SHOCK | GUESS |
| G5 | 95% of orders settled at close | PAYMENT_SETTLED | GUESS |
| G6 | 3 complaints on one lot in 48 h | COMPLAINT_SPIKE | GUESS |
| G7 | 24 h arrival slip | DELIVERY_SLIP | GUESS |
| G8 | 2 consecutive checks before acting | persistence | GUESS |
| G9 | First 2 cycles of an apartment are "immature" | all auto-pauses | GUESS |
| G10 | 16% margin cap | price card | GUESS |
| G11 | Captain commission about 2% | ledger (Phase 3) | GUESS |
| G12 | Moisture and broken-grain spec limits | LOT_QUALITY | OPEN, no number in brief |

## Modelling choices
- **D1. Price parts are stored per pack, in paise.** PROPOSED. Per-kg figures
  are derived for display. This keeps "price = sum of parts" exact with no
  rounding. The schema rejects any card line where it does not add up.
- **D2. A verbal quote cannot be represented.** PROPOSED. `form` only accepts
  `WRITTEN`, so the rule "verbal does not count" is structural.
- **D3. "New-crop" and "aged" are derived, not stored.** PROPOSED. Computed
  from harvest season, milling date and the injected date, per section 9.
- **D4. Percentages are integer basis points.** PROPOSED. 13.5% = 1350.
- **D5. A cycle is named by its delivery month.** PROPOSED. "2027-01" opens
  20 Dec 2026 and delivers 1-5 Jan 2027.
- **D6. Reasons carry Tamil and English text, both mandatory.** PROPOSED.
  Tamil copy written by the builder needs a native-speaker review before use.
- **D7. GST: 5% on pre-packed labelled packs under 25 kg; exactly 25 kg
  treated as exempt.** GUESS, sources disagree. CA to confirm.
- **D8. Only SETTLED payment counts as a paid household.** PROPOSED.

## Open conflicts found in the brief (need the founder's call)
- **O1. The brief's own example breaks the example margin cap.** ₹9 margin on
  a ₹55/kg price is 16.4% of price and 19.6% of landed cost; the cap example
  is 16%. Need: the cap number and whether it is a share of price or of cost.
- **O2. A 72-hour quote cannot cover a 5-day order window.** Orders are open
  20th-25th. If a quote goes stale mid-window we would have to reprice orders
  already paid, which breaks the promise. Proposal: QUOTE_STALE applies at
  publish time, and a card may publish only if the mill's written validity
  runs through lot lock (26th).
- **O3. PAYMENT_SETTLED as written can punish paid households.** "Fewer than
  95% settled blocks the mill PO" would stop everyone's order because a few
  neighbours had not paid. Proposal: the PO always goes out for settled orders
  only; unsettled orders roll to the next cycle; below 95% raises a human
  review (likely a UPI outage) instead of a block.
- **O4. How does a standing order get paid?** Auto-debit needs a UPI mandate;
  a monthly pay link needs one tap. Proposal for the pilot: monthly pay link,
  where paying is the confirmation and not paying is a skip. No mandates.
- **O5. "Referral between apartments" (Appendix E) vs "no referral bonuses"
  (section 10).** Proposal: an unrewarded introduction is fine; no reward.
- **O6. The pilot may miss its own ₹100 contribution gate.** At 30 households
  per run the model gives about ₹107; after 5% GST on the 4 kg dal pack
  (about ₹22) it is about ₹84. Either the dal price carries the GST, or the
  gate should be read at 40 households.

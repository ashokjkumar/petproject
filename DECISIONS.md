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

- **D9. Margin: fixed rupees per kg, capped at 18% of the price before GST.**
  DECIDED 12 Nov 2026 (founder delegated: "profitable for me and for
  customers"). Starting margins: ponni ₹9/kg, toor dal ₹12/kg. Why fixed
  rupees: our costs (truck, captain, testing) are in rupees, so a fixed rupee
  margin keeps us whole when mill prices fall and stops us earning more when
  they rise; every rise the resident sees is the mill's. Why 18 and not 16:
  ₹9 on a ₹55 price is already 16.4%, and it reaches 17.3% if the mill price
  falls to ₹40 at harvest. 18% lets the margin stay fixed through a harvest
  drop. The engine refuses to produce a price above the cap.
- **D10. GST is shown as its own line and passed through.** DECIDED with D9.
  At 30 households per run this gives about ₹106 contribution per household
  (gate: ₹100); absorbing GST on dal would give about ₹84 and fail the gate.
- **D11. Three guard states: PASS, WATCH, BLOCK.** PROPOSED. WATCH means the
  gated step waits and a human is told, but nothing is cancelled, rejected or
  paused. Only BLOCK counts as a guard having acted.
- **D12. Checks before acting.** PROPOSED. Two consecutive failed checks for
  MIN_HOUSEHOLDS, SUPPLY_UNCONFIRMED, QUOTE_STALE, MARGIN_FLOOR and
  COMPLAINT_SPIKE. One for LOT_QUALITY (per brief). One for PRICE_SHOCK,
  which departs from the brief's wording: its action is a hold for human
  review, not a cancellation, and a written quote is not a noisy signal.
- **D13. PRICE_SHOCK fires on rises only.** PROPOSED. A fall of more than 8%
  passes, with the fall passed on in full and stated.
- **D14. Immature apartments never trigger an automatic mill pause.**
  PROPOSED. If every complaint in the window is from an apartment in its
  first two cycles, a human is alerted instead.
- **D15. An unsampled lot is held, not rejected.** PROPOSED.
- **D16. Merging.** PROPOSED. An apartment under the minimum passes if one
  same-route neighbour brings the combined run to the minimum.

- **D17. Backend and app built in parallel with the pilot.** DECIDED by the
  founder, 14 Nov 2026, overruling section 3 of the brief ("do not begin
  Phase 3 until the harness and the pilot both hit the targets"). Risk
  accepted: build cost is spent before reorder evidence exists.
- **D18. Records are stored as validated documents (jsonb) plus lookup
  columns.** PROPOSED. Fewer moving parts while the data shapes still change.
- **D19. The database runs in-process (PGlite) for tests and the pilot.**
  PROPOSED. It is real Postgres; moving to a hosted Postgres is a driver swap.
- **D20. Payments are reconciled by hand for now.** PROPOSED. Operations
  records each UPI payment against its order; the amount must match exactly.
  A payment gateway needs a merchant account the company does not have yet.
- **D21. A published price card cannot be replaced.** PROPOSED. A published
  price is a promise.
- **D22. The order amount is computed on the server from the card.** PROPOSED.

## Resolved conflicts
- **O1. Margin cap.** Resolved by D9.
- **O2. Quote validity.** DECIDED: QUOTE_STALE applies before publishing only,
  and the mill's written validity must run through lot lock.
- **O3. PAYMENT_SETTLED.** DECIDED: notice only. The mill order always covers
  paid orders; unpaid orders roll. It never blocks.
- **O4. Standing orders.** DECIDED: monthly pay link. Paying confirms, not
  paying skips. No auto-debit mandates.

## Still open
- **O5. "Referral between apartments" vs "no referral bonuses".** Proposal:
  an unrewarded introduction is fine; no reward.
- **O7. QUOTE_STALE and MARGIN_FLOOR have no incident scenario of their own**
  in section 6.2, so the scorecard shows no recall figure for them.
- **O8. Several adversarial cases pass because no guard looks at the thing
  being varied** (order volume, captain on leave). They guard against future
  regressions more than they test today's logic.
- **O9. Tamil copy is the builder's draft.** Needs a native-speaker read.

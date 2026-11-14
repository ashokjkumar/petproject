# CONSTRAINTS (permanent)

These rules come from sections 5.1, 8 and 10 of the business case. They do not
change without the founder's written decision. Any future session must read
this file before writing code.

## The thesis
We sell a monthly staple nobody has to think about or doubt. Boring is the
feature. Optimise for promises kept, not orders taken.

## Never collect
- Contacts, location tracking, device identifiers beyond what login needs
- Contents of resident chats or any message content
- Anything beyond name, flat, phone and order history

## Never do
- Substitute a variety or ship short. Roll to the next cycle or refund instead.
- Dispatch stock that has no lot record ("no lot, no dispatch").
- Publish a price above landed cost plus the per-item margin cap.
- Publish a price change without its reason.
- Let a captain hold or front money. Residents pay the company by UPI.
- Add anyone to a group, standing order or mandate without their own confirmation.
- Cancel a run or pause a mill on a single signal (two consecutive checks),
  except LOT_QUALITY, which acts on one failed sample.
- Auto-resume a paused mill. A human resumes.
- Blend a rejected lot.
- Leave a captain to explain a failure alone.

## Never build
- Flash sales, coupons, cashback, referral bonuses, streaks, badges, daily
  deals, or any push designed to drive opens or order frequency
- Dark stores, 10-minute or on-demand delivery
- Vegetables or fruit before Phase 5 and the section 7 gates
- A third-party marketplace; sales to kiranas or businesses
- Credit, BNPL or lending
- Social features, feeds, resident chat, ads, a free tier
- Untestable claims ("organic", "pure", "adulteration-free")

## Engineering rules
- `packages/engine` is pure and deterministic: no network, no filesystem,
  no `Date.now()`. All time is injected.
- Money is integer paise. Weight is integer grams. No floating-point currency.
- No `any`. Zod schemas at every boundary. Vitest for tests.
- Every dispatch path passes through the guards. Every guard fills `reasons[]`
  in plain Tamil and English.
- Adversarial (false-positive) tests are written before each guard. A
  regression there is a build failure. Never tune the suite to pass.
- Phase 3 gate OVERRULED by the founder on 14 Nov 2026: backend and app are
  built in parallel with the pilot (DECISIONS.md D17). Still in force: nothing
  goes live to real residents beyond the pilot apartments until the section 7
  targets are met.

## Always
- Tamil first, English second.
- A complaint within 7 days gets a replacement or refund without argument (year one).
- Every lot: named supplier, written quote, signed ration-rice declaration,
  sample test, 1 kg sample kept 90 days.
- FSSAI number on every invoice and label; GST by pack size; weight slip at goods-in.

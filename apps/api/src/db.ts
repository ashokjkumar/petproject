import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { ApartmentProfile, ItemPricing, LotRecord, Order, PriceCard, SupplierQuote } from "@kootu/shared";

/**
 * Tables. Each business record is stored as the Zod-validated document from
 * @kootu/shared, plus the few columns we look things up by. Only name, flat,
 * phone and order history are kept about a resident (CONSTRAINTS.md).
 */
export const apartments = pgTable("apartments", {
  id: text("id").primaryKey(),
  doc: jsonb("doc").$type<ApartmentProfile>().notNull(),
});
export const residents = pgTable("residents", {
  id: text("id").primaryKey(),
  apartmentId: text("apartment_id").notNull(),
  flat: text("flat").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  consentConfirmedAt: text("consent_confirmed_at").notNull(),
});
export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  doc: jsonb("doc").$type<SupplierQuote>().notNull(),
});
export const lots = pgTable("lots", {
  id: text("id").primaryKey(),
  doc: jsonb("doc").$type<LotRecord>().notNull(),
});
export interface CyclePlan {
  supplyRequestedAt: string;
  lotLockAt: string;
  dropCostPaise: number;
}
/** One row per cycle and route cluster, id "2027-01:OMR-SOUTH". */
export const cycles = pgTable("cycles", {
  id: text("id").primaryKey(),
  plan: jsonb("plan").$type<CyclePlan>().notNull(),
});
export const priceCards = pgTable("price_cards", {
  id: text("id").primaryKey(),
  card: jsonb("card").$type<PriceCard>().notNull(),
  pricing: jsonb("pricing").$type<ItemPricing[]>().notNull(),
  approvedBy: text("approved_by"),
});
export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull(),
  apartmentId: text("apartment_id").notNull(),
  residentId: text("resident_id").notNull(),
  upiRef: text("upi_ref"),
  doc: jsonb("doc").$type<Order>().notNull(),
});
/** Consecutive failed guard checks, id "2027-01:tower-a". */
export const guardCounters = pgTable("guard_counters", {
  id: text("id").primaryKey(),
  counters: jsonb("counters").$type<Record<string, number>>().notNull(),
});
/** Money owed to captains is a ledger entry they can see. Captains never hold money. */
export const ledger = pgTable("ledger", {
  id: text("id").primaryKey(),
  apartmentId: text("apartment_id").notNull(),
  cycleId: text("cycle_id").notNull(),
  kind: text("kind").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  note: text("note").notNull(),
  at: text("at").notNull(),
});

const DDL = `
CREATE TABLE IF NOT EXISTS apartments (id text PRIMARY KEY, doc jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS residents (id text PRIMARY KEY, apartment_id text NOT NULL, flat text NOT NULL,
  name text NOT NULL, phone text NOT NULL, consent_confirmed_at text NOT NULL);
CREATE TABLE IF NOT EXISTS quotes (id text PRIMARY KEY, doc jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS lots (id text PRIMARY KEY, doc jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS cycles (id text PRIMARY KEY, plan jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS price_cards (id text PRIMARY KEY, card jsonb NOT NULL, pricing jsonb NOT NULL, approved_by text);
CREATE TABLE IF NOT EXISTS orders (id text PRIMARY KEY, cycle_id text NOT NULL, apartment_id text NOT NULL,
  resident_id text NOT NULL, upi_ref text, doc jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS guard_counters (id text PRIMARY KEY, counters jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (id text PRIMARY KEY, apartment_id text NOT NULL, cycle_id text NOT NULL,
  kind text NOT NULL, amount_paise integer NOT NULL, note text NOT NULL, at text NOT NULL);
`;

export type Db = PgliteDatabase;

/** Opens a database. No path = in memory (tests). A path = a folder on disk (pilot). */
export async function openDb(dataDir?: string): Promise<Db> {
  const client = new PGlite(dataDir);
  await client.exec(DDL);
  return drizzle(client);
}

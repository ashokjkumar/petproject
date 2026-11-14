import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";

/** The only place that reads the clock and the environment. The engine never does. */
const opsKey = process.env.OPS_KEY;
if (!opsKey || opsKey.length < 16) throw new Error("Set OPS_KEY to a secret of at least 16 characters.");

const db = await openDb(process.env.DATA_DIR ?? "./data");
const app = buildApp(db, () => new Date().toISOString(), { opsKey, upiVpa: process.env.UPI_VPA ?? null });

const webDist = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) await app.register(fastifyStatic, { root: webDist });

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
console.log(`Kootu Maligai listening on ${process.env.PORT ?? 3000}`);

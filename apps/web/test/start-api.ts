import type { TestProject } from "vitest/node";
import { buildApp } from "@kootu/api";
import { openDb } from "../../api/src/db.js";

declare module "vitest" {
  export interface ProvidedContext { apiUrl: string }
}

/** Starts the real backend on a spare port so the screen tests talk to the real thing. */
export default async function setup(project: TestProject) {
  const app = buildApp(await openDb(), () => "2026-12-21T10:00:00+05:30", { opsKey: "test-ops-key", upiVpa: "kootu@upi" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  project.provide("apiUrl", `http://127.0.0.1:${address.port}`);
  return () => app.close();
}

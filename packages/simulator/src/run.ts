import { evaluateCycle, hoursBetween, type Counters } from "@kootu/engine";
import type { GuardId, GuardResult } from "@kootu/shared";
import type { Scenario } from "./scenarios.js";

export interface ScenarioRun {
  scenario: Scenario;
  /** Every guard result, per check. */
  checks: GuardResult[][];
  /** Guards that acted (BLOCK) at any check. */
  blocked: GuardId[];
  /** Incidents: did the expected guard fire, and how many hours after the first check? */
  detected: boolean;
  latencyHours: number | null;
}

export function runScenario(scenario: Scenario): ScenarioRun {
  let counters: Counters = {};
  const checks: GuardResult[][] = [];
  for (const step of scenario.steps) {
    const d = evaluateCycle(step, counters);
    counters = d.counters;
    checks.push(d.results);
  }
  const blocked = [...new Set(checks.flat().filter((r) => r.state === "BLOCK").map((r) => r.guard))];
  let latencyHours: number | null = null;
  if (scenario.expect) {
    const { guard, state } = scenario.expect;
    const at = checks.findIndex((c) => c.some((r) => r.guard === guard && r.state === state));
    if (at >= 0) latencyHours = hoursBetween(scenario.steps[0]!.now, scenario.steps[at]!.now);
  }
  return { scenario, checks, blocked, detected: latencyHours !== null, latencyHours };
}

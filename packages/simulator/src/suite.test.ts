import { describe, expect, it } from "vitest";
import { evaluateCycle } from "@kootu/engine";
import { runScenario } from "./run.js";
import { ADVERSARIAL, healthy, INCIDENTS } from "./scenarios.js";

describe("healthy month", () => {
  it("passes every guard and may proceed", () => {
    const d = evaluateCycle(healthy());
    expect(d.results.filter((r) => r.state !== "PASS")).toEqual([]);
    expect(d.mayProceed).toBe(true);
  });
  it("is deterministic", () => {
    expect(evaluateCycle(healthy())).toEqual(evaluateCycle(healthy()));
  });
});

describe("adversarial suite: zero wrongful cancellations, rejections or pauses", () => {
  for (const s of ADVERSARIAL) {
    it(s.title, () => {
      expect(runScenario(s).blocked).toEqual([]);
    });
  }
});

describe("incident suite: the right guard fires, and only that guard acts", () => {
  for (const s of INCIDENTS) {
    it(s.title, () => {
      const run = runScenario(s);
      expect(run.detected).toBe(true);
      const allowed = [...(s.expect!.state === "BLOCK" ? [s.expect!.guard] : []), ...(s.expect!.alsoCorrect ?? [])];
      expect(run.blocked.filter((g) => !allowed.includes(g))).toEqual([]);
    });
  }
});

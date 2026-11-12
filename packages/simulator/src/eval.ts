import { evaluateCycle, type Counters } from "@kootu/engine";
import { GuardId } from "@kootu/shared";
import { generateOrders, SEEDS } from "./generator.js";
import { runScenario } from "./run.js";
import { ADVERSARIAL, healthy, INCIDENTS, packPrices, shift, T0 } from "./scenarios.js";

const runs = [...INCIDENTS, ...ADVERSARIAL].map(runScenario);
const adversarial = runs.filter((r) => r.scenario.kind === "ADVERSARIAL");
const incidents = runs.filter((r) => r.scenario.kind === "INCIDENT");
const ratio = (a: number, b: number) => (b === 0 ? "  n/a" : (a / b).toFixed(2).padStart(5));
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null);

console.log("\nKOOTU MALIGAI: PROMISE-KEEPING SCORECARD");
console.log(`${incidents.length} incident scenarios, ${adversarial.length} adversarial scenarios\n`);
console.log("Guard               type     precision  recall  false-pos rate  median latency");
let wrongful = 0;
let tpAll = 0;
let fpAll = 0;
for (const guard of GuardId.options) {
  const mine = incidents.filter((r) => r.scenario.expect!.guard === guard);
  const blocking = mine.some((r) => r.scenario.expect!.state === "BLOCK") || mine.length === 0;
  const tp = mine.filter((r) => r.detected).length;
  const fp = runs.filter((r) => r.blocked.includes(guard) && !(r.scenario.expect?.guard === guard && r.scenario.expect.state === "BLOCK") && !r.scenario.expect?.alsoCorrect?.includes(guard)).length;
  const fpAdv = adversarial.filter((r) => r.blocked.includes(guard)).length;
  wrongful += fpAdv;
  if (mine.some((r) => r.scenario.expect!.state === "BLOCK")) { tpAll += tp; fpAll += fp; }
  const lat = median(mine.filter((r) => r.latencyHours !== null).map((r) => r.latencyHours!));
  console.log(
    `${guard.padEnd(19)} ${(mine.some((r) => r.scenario.expect!.state === "WATCH") ? "notice" : blocking ? "blocks" : "").padEnd(8)} ${ratio(tp, tp + fp)}      ${ratio(tp, mine.length)}   ${ratio(fpAdv, adversarial.length)}           ${lat === null ? "n/a" : `${lat} h`}`,
  );
}

console.log(`\nWrongful cancellations, rejections or pauses on the adversarial suite: ${wrongful}  (target: 0)`);
console.log(`Precision of blocking guards, combined suite: ${ratio(tpAll, tpAll + fpAll).trim()}  (target: at least 0.95)`);

const suppressed: Record<string, number> = {};
for (const r of adversarial) for (const c of r.checks) for (const g of c) if (g.state === "WATCH") for (const why of g.reasons) suppressed[why.code] = (suppressed[why.code] ?? 0) + 1;
console.log("\nSuppression reasons (a guard saw something but correctly did not act):");
for (const [code, n] of Object.entries(suppressed).sort((a, b) => b[1] - a[1])) console.log(`  ${code.padEnd(28)} ${"#".repeat(n)} ${n}`);

console.log("\nSeed apartments over six cycles, no neighbour to merge with (paid households -> decision):");
const prices = packPrices(healthy().quotes);
for (const cfg of SEEDS) {
  const cells: string[] = [];
  for (let cycle = 0; cycle < 6; cycle++) {
    let counters: Counters = {};
    let outcome = "";
    let paid = 0;
    for (const [h, settledNow] of [[0, false], [12, true]] as const) {
      const s = healthy(shift(T0, h));
      s.apartment = { ...cfg.profile, cyclesCompleted: cycle };
      s.orders = generateOrders(cfg, { cycleIndex: cycle, cycleId: s.cycleId, now: shift(T0, -30), seed: 7, prices, pendingHaveSettled: settledNow });
      const d = evaluateCycle(s, counters);
      counters = d.counters;
      paid = Number(/^\D*(\d+)/.exec(d.results.find((r) => r.guard === "MIN_HOUSEHOLDS")!.reasons[0]!.en)?.[1] ?? 0);
      outcome = d.mayProceed ? "go" : "roll";
    }
    cells.push(`${String(paid).padStart(3)} ${outcome.padEnd(4)}`);
  }
  console.log(`  ${cfg.profile.name.padEnd(28)} ${cells.join(" | ")}`);
}
console.log("");
if (wrongful > 0 || (tpAll + fpAll > 0 && tpAll / (tpAll + fpAll) < 0.95)) process.exit(1);

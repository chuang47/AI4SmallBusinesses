// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { WEIGHTS, budgetFit, rank } = require("../lib/score");

const checks = { a: "Check A", b: "Check B", c: "Check C", d: "Check D" };
const all = { a: true, b: true, c: true, d: true };
const half = { a: true, b: true, c: false, d: false };
const tool = (name, category, price_monthly, features, extra = {}) => ({
  name, category, price_monthly, features, custom_pricing: false, price_note: "", summary: "", source_url: "x", last_verified: "x", ...extra,
});
const run = (profile, tools) => rank(profile, { tools, checks });

test("weights sum to 100", () => {
  assert.strictEqual(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("budgetFit", () => {
  assert.strictEqual(budgetFit(50, 100), 100);
  assert.strictEqual(budgetFit(100, 100), 100);
  assert.strictEqual(budgetFit(150, 100), 50);
  assert.strictEqual(budgetFit(200, 100), 0);
  assert.strictEqual(budgetFit(null, 100), 50);
  assert.strictEqual(budgetFit(50, null), 50);
  assert.strictEqual(budgetFit(0, 0), 100, "free tool, zero budget");
  assert.strictEqual(budgetFit(10, 0), 0);
});

test("gate: only tools in the owner's problem categories are shown", () => {
  const tools = [tool("Inv", "ops", 10, all), tool("Sched", "staff", 10, all), tool("Hire", "staff", 10, half)];
  assert.deepStrictEqual(run({ problems: ["staff"], budget: 100 }, tools).map((r) => r.name), ["Sched", "Hire"]);
  assert.deepStrictEqual(run({ problems: [], budget: 100 }, tools), [], "no problems, no tools");
  assert.deepStrictEqual(run({ problems: ["teleport"], budget: 100 }, tools), [], "unknown problem ids match nothing");
});

test("scores: checks 60, budget 40, shown as 0-5 in half steps", () => {
  const tools = [
    tool("Full", "staff", 80, all), //            60*1   + 40*1   = 100 -> 5
    tool("Half", "staff", 150, half), //          60*0.5 + 40*0.5 =  50 -> 2.5
    tool("Unpriced", "staff", null, all), //      60*1   + 40*0.5 =  80 -> 4
  ];
  const recs = run({ problems: ["staff"], budget: 100 }, tools);
  assert.deepStrictEqual(recs.map((r) => [r.name, r.match]), [["Full", 5], ["Unpriced", 4], ["Half", 2.5]]);
  assert.strictEqual(recs[0].feature_coverage, "4/4");
});

test("an owner with two problems isn't penalised (scores don't drop)", () => {
  const tools = [tool("Sched", "staff", 10, all), tool("Inv", "ops", 10, all)];
  const recs = run({ problems: ["staff", "ops"], budget: 100 }, tools);
  assert.deepStrictEqual(recs.map((r) => r.match), [5, 5]);
});

test("reasons come from the data", () => {
  const [within] = run({ problems: ["staff"], budget: 100 }, [tool("A", "staff", 80, half)]);
  assert.deepStrictEqual(within.reasons, ["Passes 2 of 4 small-business checks", "Within your $100/month budget"]);
  const [over] = run({ problems: ["staff"], budget: 30 }, [tool("A", "staff", 35.99, all)]);
  assert.ok(over.reasons.includes("$5.99 over your $30/month budget"), "no float noise with cents");
  const [noBudget] = run({ problems: ["staff"], budget: null }, [tool("A", "staff", 10, all)]);
  assert.deepStrictEqual(noBudget.reasons, ["Passes 4 of 4 small-business checks"]);
  const [custom] = run({ problems: ["staff"], budget: 100 }, [tool("A", "staff", null, all, { custom_pricing: true })]);
  assert.strictEqual(custom.reasons.length, 1, "price line on the card covers custom pricing");
  assert.strictEqual(custom.custom_pricing, true);
});

test("ties: lower price, then priced before unpublished, then name", () => {
  const tools = [
    tool("Zeta", "staff", 30, half),
    tool("Unpriced", "staff", null, half),
    tool("Alpha", "staff", 30, half),
    tool("Cheap", "staff", 10, half),
  ];
  // No budget: every tool gets budget fit 50 and the same score.
  assert.deepStrictEqual(run({ problems: ["staff"], budget: null }, tools).map((r) => r.name), ["Cheap", "Alpha", "Zeta", "Unpriced"]);
});

test("returns at most 4, without internal fields", () => {
  const tools = ["A", "B", "C", "D", "E"].map((n) => tool(n, "staff", 10, all));
  const recs = run({ problems: ["staff"], budget: 50 }, tools);
  assert.strictEqual(recs.length, 4);
  assert.ok(!("score" in recs[0]) && !("_coverage" in recs[0]));
});

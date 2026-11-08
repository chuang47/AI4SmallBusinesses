// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { WEIGHTS, budgetFit, rank } = require("./score");

const categories = {
  scheduling: { label: "Scheduling", table_stakes: { s1: "", s2: "", s3: "", s4: "" } },
  inventory_waste: { label: "Inventory and waste", table_stakes: { i1: "", i2: "", i3: "" } },
  hiring: { label: "Hiring", table_stakes: { h1: "", h2: "" } },
};
const problems = [
  { id: "scheduling", label: "Shifts", categories: ["scheduling"] },
  { id: "costs_waste", label: "Costs", categories: ["inventory_waste"] },
  { id: "hiring", label: "Hiring", categories: ["hiring"] },
];
const tool = (name, category, price_monthly, features) => ({
  name, category, price_monthly, features, summary: "", source_url: "x", last_verified: "x",
});

test("weights sum to 100", () => {
  assert.strictEqual(WEIGHTS.problem + WEIGHTS.features + WEIGHTS.budget, 100);
});

test("budgetFit", () => {
  assert.strictEqual(budgetFit(50, 100), 100);
  assert.strictEqual(budgetFit(100, 100), 100);
  assert.strictEqual(budgetFit(150, 100), 50);
  assert.strictEqual(budgetFit(200, 100), 0);
  assert.strictEqual(budgetFit(null, 100), 50);
  assert.strictEqual(budgetFit(50, null), 50);
});

test("profile 1: hiring problem excludes inventory and scheduling tools", () => {
  const tools = [
    tool("Inv", "inventory_waste", 10, { i1: true, i2: true, i3: true }),
    tool("Sched", "scheduling", 10, { s1: true, s2: true, s4: true, s3: true }),
    tool("Hire", "hiring", 10, { h1: true, h2: false }),
  ];
  const recs = rank({ problems: ["hiring"], budget: 100 }, { tools, categories, problems });
  assert.deepStrictEqual(recs.map((r) => r.name), ["Hire"]);
});

test("profile 2: two problems, full scoring and reasons", () => {
  const tools = [
    tool("Full", "scheduling", 80, { s1: true, s2: true, s4: true, s3: true }),
    tool("Half", "scheduling", 150, { s1: true, s2: true, s4: false, s3: false }),
    tool("Inv", "inventory_waste", null, { i1: true, i2: false, i3: false }),
  ];
  const recs = rank({ problems: ["scheduling", "costs_waste"], budget: 100 }, { tools, categories, problems });
  // Full: 30*0.5 + 40*1 + 30*1 = 85 -> 4.5
  // Half: 30*0.5 + 40*0.5 + 30*0.5 = 50 -> 2.5
  // Inv:  30*0.5 + 40*(1/3) + 30*0.5 = 43.3 -> 2
  assert.deepStrictEqual(recs.map((r) => [r.name, r.match]), [["Full", 4.5], ["Half", 2.5], ["Inv", 2]]);
  assert.strictEqual(recs[0].feature_coverage, "4/4");
  assert.ok(recs[0].reasons.includes("Within your $100/month budget"));
  assert.ok(recs[1].reasons.includes("$50 over your $100/month budget"));
  assert.ok(recs[2].reasons.includes("Price not published"));
  assert.ok(!("score" in recs[0]) && !("_coverage" in recs[0]), "internal fields are not returned");
});

test("profile 3: ties resolved by price, null price last, then name", () => {
  const f = { s1: true, s2: true, s4: false, s3: false };
  const tools = [
    tool("Zeta", "scheduling", 30, f),
    tool("Unpriced", "scheduling", null, f),
    tool("Alpha", "scheduling", 30, f),
    tool("Cheap", "scheduling", 10, f),
  ];
  // No budget given, so every tool gets budget fit 50 and the same score.
  const recs = rank({ problems: ["scheduling"], budget: null }, { tools, categories, problems });
  assert.deepStrictEqual(recs.map((r) => r.name), ["Cheap", "Alpha", "Zeta", "Unpriced"]);
});

test("no problems means no recommendations", () => {
  const tools = [tool("Sched", "scheduling", 10, { s1: true, s2: true, s4: true, s3: true })];
  assert.deepStrictEqual(rank({ problems: [], budget: null }, { tools, categories, problems }), []);
});

test("prices with cents are formatted without float noise", () => {
  const tools = [tool("Cents", "scheduling", 35.99, { s1: true, s2: true, s3: true, s4: true })];
  const [rec] = rank({ problems: ["scheduling"], budget: 30 }, { tools, categories, problems });
  assert.ok(rec.reasons.includes("$5.99 over your $30/month budget"), rec.reasons.join(" | "));
});

test("budget of 0: only free tools get budget credit", () => {
  assert.strictEqual(budgetFit(0, 0), 100);
  assert.strictEqual(budgetFit(10, 0), 0);
});

test("unknown problem ids in the profile are ignored", () => {
  const tools = [tool("Sched", "scheduling", 10, { s1: true, s2: true, s3: true, s4: true })];
  const recs = rank({ problems: ["scheduling", "teleport"], budget: null }, { tools, categories, problems });
  assert.strictEqual(recs.length, 1);
  // Only the known problem counts toward coverage, so problem coverage is 1, not 0.5.
  assert.strictEqual(recs[0].match, 4.5); // 30*1 + 40*1 + 30*0.5 = 85
});

test("a problem that maps to two categories gates in both", () => {
  const multi = [{ id: "labor", label: "Labor", categories: ["scheduling", "hiring"] }];
  const tools = [
    tool("Sched", "scheduling", 10, { s1: true, s2: true, s3: true, s4: true }),
    tool("Hire", "hiring", 10, { h1: true, h2: true }),
    tool("Inv", "inventory_waste", 10, { i1: true, i2: true, i3: true }),
  ];
  const recs = rank({ problems: ["labor"], budget: null }, { tools, categories, problems: multi });
  assert.deepStrictEqual(recs.map((r) => r.name).sort(), ["Hire", "Sched"]);
});

test("reasons: no budget line when no budget and price is known", () => {
  const tools = [tool("Sched", "scheduling", 10, { s1: true, s2: true, s3: true, s4: true })];
  const [rec] = rank({ problems: ["scheduling"], budget: null }, { tools, categories, problems });
  assert.strictEqual(rec.reasons.length, 2);
});

test("returns at most 4", () => {
  const f = { s1: true, s2: true, s4: true, s3: true };
  const tools = ["A", "B", "C", "D", "E"].map((n) => tool(n, "scheduling", 10, f));
  assert.strictEqual(rank({ problems: ["scheduling"], budget: 50 }, { tools, categories, problems }).length, 4);
});

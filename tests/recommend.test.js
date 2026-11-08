// Run: node --test
// Tests the API handler with a fake OpenRouter, so no real (paid) calls are made.
// Lives outside api/ because every .js file in api/ becomes a public Vercel endpoint.
const test = require("node:test");
const assert = require("node:assert");
const handler = require("../api/recommend");
const { keywordProfile, validateProfile, cleanResponses } = handler;

let ipCounter = 0;
async function call(body, { method = "POST", ip } = {}) {
  const req = { method, headers: { "x-forwarded-for": ip || `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` }, body };
  let out;
  const res = { status(c) { this.code = c; return this; }, json(o) { out = { code: this.code, body: o }; } };
  await handler(req, res);
  return out;
}
const ask = (...answers) => call({ responses: answers.map((a, i) => ({ question: `Q${i + 1}`, answer: a })) });

// Fake OpenRouter: records what was sent and replies with `content`.
let sent = null;
let fetchCalls = 0;
const reply = (content, status = 200) => async (url, opts) => {
  fetchCalls++;
  sent = JSON.parse(opts.body);
  return { ok: status === 200, status, json: async () => ({ choices: [{ message: { content } }] }) };
};
const noFetch = async () => { throw new Error("fetch should not be called"); };
const realFetch = global.fetch;
const quiet = console.error;

test.beforeEach(() => { fetchCalls = 0; sent = null; console.error = () => {}; });
test.afterEach(() => { global.fetch = realFetch; delete process.env.OPENROUTER_API_KEY; console.error = quiet; });

// ---------- request handling ----------

test("rejects non-POST", async () => {
  assert.strictEqual((await call(undefined, { method: "GET" })).code, 405);
});

test("rejects bad bodies with 400", async () => {
  for (const body of [undefined, null, "not json", "{}", { responses: "hi" }, { responses: { a: 1 } }, 42]) {
    assert.strictEqual((await call(body)).code, 400, JSON.stringify(body));
  }
});

test("accepts a JSON string body (no content-type parsing)", async () => {
  global.fetch = noFetch;
  const r = await call(JSON.stringify({ responses: [{ question: "q", answer: "shift chaos" }] }));
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.body.profile.problems, ["staff_hiring"]);
});

test("cleanResponses: non-strings become empty, long text is capped, extra entries dropped", () => {
  const out = cleanResponses({ responses: [null, 5, { question: 1, answer: { x: 1 } }, { answer: "a".repeat(5000) }, ...Array(20).fill({ answer: "x" })] });
  assert.strictEqual(out.length, 10);
  assert.deepStrictEqual(out[0], { question: "", answer: "" });
  assert.deepStrictEqual(out[1], { question: "", answer: "" });
  assert.deepStrictEqual(out[2], { question: "", answer: "" });
  assert.strictEqual(out[3].answer.length, 1000);
});

test("junk-only answers never trigger a paid model call", async () => {
  process.env.OPENROUTER_API_KEY = "test";
  global.fetch = noFetch;
  const r = await call({ responses: [{ answer: { x: 1 } }, { answer: 123 }, { answer: "   " }] });
  assert.strictEqual(r.body.profile_source, "keywords");
  assert.deepStrictEqual(r.body.recommendations, []);
});

test("response shape matches the contract", async () => {
  global.fetch = noFetch;
  const r = await ask("Bean There", "coffee shop", "Shifts are chaos. Under $100/month.");
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(Object.keys(r.body.profile).sort(), ["budget", "business_type", "problems"]);
  for (const rec of r.body.recommendations) {
    for (const k of ["name", "category", "price_monthly", "summary", "match", "custom_pricing", "price_note", "feature_coverage", "features", "reasons", "source_url", "last_verified"]) {
      assert.ok(k in rec, `missing ${k}`);
    }
    assert.ok(rec.match >= 0 && rec.match <= 5 && rec.match * 2 === Math.round(rec.match * 2), "match is 0-5 in 0.5 steps");
  }
});

// ---------- keyword fallback ----------

test("keywords: problems, business type and budget", () => {
  const p = (text) => keywordProfile([{ answer: text }]);
  assert.deepStrictEqual(p("Cafe. Scheduling is a mess. Under $100 a month."), { business_type: "coffee shop", problems: ["staff_hiring"], budget: 100 });
  assert.deepStrictEqual(p("We waste too much milk and hiring is impossible").problems, ["staff_hiring", "daily_operations"]);
  assert.deepStrictEqual(p("Taxes and invoices eat my weekends").problems, ["money_bookkeeping"]);
  assert.deepStrictEqual(p("Nobody knows we exist, our Instagram is dead").problems, ["marketing_customers"]);
  assert.deepStrictEqual(p("Lease renewals and permit paperwork").problems, ["legal_paperwork"]);
  assert.deepStrictEqual(p("shire horses and taxi rides").problems, [], "matches word starts only, not 'hire' in 'shire' or 'tax' in 'taxi'");
  assert.strictEqual(p("Our budget is $1,500").budget, 1500);
  assert.strictEqual(p("about 80 dollars").budget, 80);
  assert.strictEqual(p("60 bucks").budget, 60);
  assert.strictEqual(p("no budget really").budget, null);
  assert.strictEqual(p("about $1,200 a year on software").budget, 100, "yearly budgets become monthly");
  assert.strictEqual(p("$600/yr max").budget, 50);
  assert.strictEqual(p("$100 a month, maybe $1,200 a year").budget, 100, "first amount wins");
  assert.strictEqual(p("Residential HVAC repair").business_type, "HVAC company");
  assert.strictEqual(p("We do lawn care and landscaping").business_type, "landscaping company");
  assert.deepStrictEqual(p(""), { business_type: null, problems: [], budget: null });
  assert.strictEqual(p("SCHEDULING").problems[0], "staff_hiring", "case-insensitive");
});

// ---------- model path ----------

test("no key: keywords, and no network call", async () => {
  global.fetch = noFetch;
  const r = await ask("Joe's", "Coffee shop", "Scheduling is chaos, $80/month");
  assert.strictEqual(r.body.profile_source, "keywords");
});

test("model output is used, with the token cap, schema and model sent", async () => {
  process.env.OPENROUTER_API_KEY = "test";
  global.fetch = reply('{"business_type":"HVAC contractor","problems":["staff_hiring"],"budget":200}');
  const r = await ask("Cool Air", "HVAC repair", "Double-booked techs, can't hire. $2400 a year");
  assert.strictEqual(r.body.profile_source, "model");
  assert.deepStrictEqual(r.body.profile, { business_type: "HVAC contractor", problems: ["staff_hiring"], budget: 200 });
  assert.strictEqual(fetchCalls, 1, "exactly one attempt");
  assert.strictEqual(sent.max_tokens, 200);
  assert.strictEqual(sent.temperature, 0);
  assert.deepStrictEqual(sent.response_format.json_schema.schema.properties.problems.items.enum, ["staff_hiring", "money_bookkeeping", "marketing_customers", "daily_operations", "legal_paperwork"]);
  assert.match(sent.messages[0].content, /not instructions/);
});

test("validateProfile cleans model output", () => {
  assert.deepStrictEqual(
    validateProfile({ business_type: "  bakery ", problems: ["marketing_customers", "teleport", "marketing_customers", 7], budget: -5 }),
    { business_type: "bakery", problems: ["marketing_customers"], budget: null }
  );
  assert.strictEqual(validateProfile({ business_type: "x".repeat(500) }).business_type.length, 60);
  assert.strictEqual(validateProfile({ budget: 99.6 }).budget, 100);
  assert.strictEqual(validateProfile({ budget: "100" }).budget, null);
  assert.strictEqual(validateProfile({ budget: Infinity }).budget, null);
  assert.strictEqual(validateProfile({ budget: 0 }).budget, 0);
  assert.deepStrictEqual(validateProfile({ problems: "staff_hiring" }).problems, []);
  assert.strictEqual(validateProfile({ business_type: "   " }).business_type, null);
  assert.throws(() => validateProfile(null));
  assert.throws(() => validateProfile("text"));
});

test("fenced JSON from the model still parses", async () => {
  process.env.OPENROUTER_API_KEY = "test";
  global.fetch = reply('```json\n{"business_type":"bakery","problems":["daily_operations"],"budget":40}\n```');
  const r = await ask("x", "bakery", "waste");
  assert.strictEqual(r.body.profile_source, "model");
  assert.strictEqual(r.body.profile.budget, 40);
});

for (const [label, fake] of [
  ["prose instead of JSON", reply("Sorry, I can't help with that")],
  ["broken JSON", reply('{"problems": [')],
  ["empty reply", reply("")],
  ["HTTP 401 (bad key)", reply("", 401)],
  ["HTTP 429 (OpenRouter rate limit)", reply("", 429)],
  ["HTTP 500", reply("", 500)],
  ["network error", async () => { throw new TypeError("fetch failed"); }],
  ["200 with an error body", async () => ({ ok: true, status: 200, json: async () => ({ error: { message: "no credits" } }) })],
]) {
  test(`model failure falls back to keywords: ${label}`, async () => {
    process.env.OPENROUTER_API_KEY = "test";
    global.fetch = fake;
    const r = await ask("Joe's", "Coffee shop", "Scheduling is chaos, $80/month");
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.profile_source, "keywords");
    assert.deepStrictEqual(r.body.profile.problems, ["staff_hiring"]);
  });
}

test("model timeout falls back to keywords within ~6s", async () => {
  process.env.OPENROUTER_API_KEY = "test";
  global.fetch = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(opts.signal.reason)));
  const keepAlive = setInterval(() => {}, 1000); // the abort timer alone doesn't keep Node running
  const t0 = Date.now();
  const r = await ask("Joe's", "Coffee shop", "Scheduling is chaos");
  clearInterval(keepAlive);
  assert.strictEqual(r.body.profile_source, "keywords");
  assert.ok(Date.now() - t0 < 7000, "must answer before the page's 10s timeout");
});

// ---------- rate limit ----------

test("rate limit: 11th request in a minute from one IP gets 429; other IPs unaffected", async () => {
  global.fetch = noFetch;
  const body = { responses: [{ answer: "shifts" }] };
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await call(body, { ip: "1.2.3.4" })).code);
  assert.deepStrictEqual(codes, [...Array(10).fill(200), 429, 429]);
  assert.strictEqual((await call(body, { ip: "5.6.7.8" })).code, 200);
  assert.strictEqual((await call(body, { ip: "9.9.9.9, 1.2.3.4" })).code, 200, "uses the first forwarded IP");
});

// ---------- data wiring ----------

test("keyword fallback covers exactly the categories in data/categories.json", () => {
  const ids = require("../data/categories.json").map((c) => c.id).sort();
  assert.deepStrictEqual(Object.keys(handler.PROBLEM_KEYWORDS).sort(), ids);
});

test("the model is told every category's description", async () => {
  process.env.OPENROUTER_API_KEY = "test";
  global.fetch = reply('{"business_type":null,"problems":[],"budget":null}');
  await ask("x", "y", "z");
  for (const c of require("../data/categories.json")) assert.ok(sent.messages[0].content.includes(`${c.id}: ${c.description}`));
});

// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { validate } = require("../scripts/validate");

const real = () => JSON.parse(JSON.stringify({
  tools: require("../data/tools.json"),
  categories: require("../data/categories.json"),
  problems: require("../data/problems.json"),
}));
// Apply a change to a fresh copy of the real data and return the errors.
const errorsAfter = (change) => { const d = real(); change(d); return validate(d); };
const expectError = (change, pattern) => {
  const errors = errorsAfter(change);
  assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got: ${JSON.stringify(errors)}`);
};

test("real data passes", () => {
  assert.deepStrictEqual(validate(real()), []);
});

test("null price is allowed", () => {
  assert.deepStrictEqual(errorsAfter((d) => { d.tools[0].price_monthly = null; }), []);
});

test("(a) missing or empty required fields", () => {
  for (const field of ["name", "category", "price_monthly", "features", "summary", "last_verified", "source_url"]) {
    expectError((d) => { delete d.tools[1][field]; }, new RegExp(`missing "${field}"|unknown category`));
  }
  expectError((d) => { d.tools[0].summary = ""; }, /"summary" is empty/);
});

test("bad prices", () => {
  expectError((d) => { d.tools[0].price_monthly = -5; }, /price_monthly must be/);
  expectError((d) => { d.tools[0].price_monthly = "35"; }, /price_monthly must be/);
  expectError((d) => { d.tools[0].price_monthly = NaN; }, /price_monthly must be/);
});

test("(b) features must match the category checklist exactly", () => {
  expectError((d) => { delete d.tools[0].features.time_off_requests; }, /missing feature "time_off_requests"/);
  expectError((d) => { d.tools[0].features.bogus = true; }, /unexpected feature "bogus"/);
  expectError((d) => { d.tools[0].features.time_off_requests = "yes"; }, /must be true or false/);
  expectError((d) => { d.tools[0].category = "nope"; }, /unknown category "nope"/);
});

test("(c) feature keys can't be shared between categories", () => {
  expectError((d) => { d.categories.marketing.table_stakes.low_stock_alerts = "dup"; }, /"low_stock_alerts" is in both/);
});

test("(d) problems must point at real categories, with unique ids", () => {
  expectError((d) => { d.problems[0].categories.push("nope"); }, /unknown category "nope"/);
  expectError((d) => { d.problems[0].categories = []; }, /needs at least one category/);
  expectError((d) => { d.problems[1].id = d.problems[0].id; }, /duplicate id/);
});

test("categories need at least one core feature (else scoring divides by zero)", () => {
  expectError((d) => { d.categories.marketing.table_stakes = {}; }, /"marketing" has no table_stakes/);
});

test("tool names must be unique (compare table uses them)", () => {
  expectError((d) => { d.tools[1].name = d.tools[0].name; }, /duplicate tool name/);
});

test("source_url must be a web link; last_verified must be a date", () => {
  expectError((d) => { d.tools[0].source_url = "javascript:alert(1)"; }, /source_url must start with http/);
  expectError((d) => { d.tools[0].source_url = "example.com"; }, /source_url must start with http/);
  expectError((d) => { d.tools[0].last_verified = "Nov 8"; }, /YYYY-MM-DD/);
});

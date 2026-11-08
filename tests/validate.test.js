// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { validate, loadData } = require("../scripts/validate");

const real = () => JSON.parse(JSON.stringify(loadData()));
// Apply a change to a fresh copy of the real data and return the errors.
const errorsAfter = (change) => { const d = real(); change(d); return validate(d); };
const expectError = (change, pattern) => {
  const errors = errorsAfter(change);
  assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got: ${JSON.stringify(errors)}`);
};

test("real data passes", () => {
  assert.deepStrictEqual(validate(real()), []);
});

test("null price and an empty price note are allowed", () => {
  assert.deepStrictEqual(errorsAfter((d) => { d.tools[0].price_monthly = null; d.tools[0].price_note = ""; }), []);
});

test("missing or empty required fields", () => {
  for (const field of ["name", "category", "price_monthly", "custom_pricing", "price_note", "summary", "features", "source_url", "last_verified"]) {
    expectError((d) => { delete d.tools[1][field]; }, new RegExp(`missing "${field}"`));
  }
  for (const field of ["summary", "source_url", "last_verified"]) {
    expectError((d) => { d.tools[0][field] = "  "; }, new RegExp(`"${field}" is empty`));
  }
});

test("bad prices and flags", () => {
  expectError((d) => { d.tools[0].price_monthly = -5; }, /price_monthly must be/);
  expectError((d) => { d.tools[0].price_monthly = "35"; }, /price_monthly must be/);
  expectError((d) => { d.tools[0].price_monthly = NaN; }, /price_monthly must be/);
  expectError((d) => { d.tools[0].custom_pricing = "TRUE"; }, /custom_pricing must be true or false/);
  expectError((d) => { d.tools[0].price_note = 5; }, /price_note must be text/);
});

test("each tool answers exactly the shared checks", () => {
  expectError((d) => { delete d.tools[0].features.mobile_app; }, /missing check "mobile_app"/);
  expectError((d) => { d.tools[0].features.bogus = true; }, /unexpected check "bogus"/);
  expectError((d) => { d.tools[0].features.mobile_app = "yes"; }, /must be true or false/);
  expectError((d) => { d.checks = {}; }, /no checks/);
});

test("categories: known, unique, labelled", () => {
  expectError((d) => { d.tools[0].category = "nope"; }, /unknown category "nope"/);
  expectError((d) => { d.categories[1].id = d.categories[0].id; }, /duplicate id/);
  expectError((d) => { delete d.categories[0].label; }, /"label" is missing/);
  expectError((d) => { d.categories[0].description = ""; }, /"description" is missing/);
});

test("names unique; links are web links; dates are YYYY-MM-DD", () => {
  expectError((d) => { d.tools[1].name = d.tools[0].name; }, /duplicate tool name/);
  expectError((d) => { d.tools[0].source_url = "javascript:alert(1)"; }, /source_url must start with http/);
  expectError((d) => { d.tools[0].source_url = "example.com"; }, /source_url must start with http/);
  expectError((d) => { d.tools[0].last_verified = "Nov 8"; }, /YYYY-MM-DD/);
});

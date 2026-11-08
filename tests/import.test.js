// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { parseCsv, convert, COLUMNS } = require("../scripts/import");
const categories = require("../data/categories.json");
const checks = require("../data/checks.json");

const HEADER = COLUMNS.join(",");
const good = "Tool A,Staff & Hiring,35,FALSE,,Drafts schedules,TRUE,TRUE,TRUE,FALSE,https://a.com,2026-11-08";
const importCsv = (...lines) => convert(parseCsv([HEADER, ...lines].join("\n")), { categories, checks });

test("parseCsv: quotes, commas and line breaks inside cells, CRLF, Excel marker", () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n');
  assert.deepStrictEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"]]);
});

test("a good row converts to the right types", () => {
  const { tools, errors } = importCsv(good);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(tools[0], {
    name: "Tool A", category: "staff_hiring", price_monthly: 35, custom_pricing: false, price_note: "",
    summary: "Drafts schedules",
    features: { free_trial: true, month_to_month: true, mobile_app: true, works_with_common_tools: false },
    source_url: "https://a.com", last_verified: "2026-11-08",
  });
});

test("forgiving where it's safe: $ and commas in prices, yes/no, any-case category, US dates, column order", () => {
  const header = [...COLUMNS].reverse().join(",");
  const row = "11/8/2026,https://a.com,no,Yes,y,true,Drafts,promo,false,\"$1,200\",staff & hiring,Tool A";
  const { tools, errors } = convert(parseCsv(`${header}\n${row}`), { categories, checks });
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(tools[0].price_monthly, 1200);
  assert.strictEqual(tools[0].category, "staff_hiring");
  assert.strictEqual(tools[0].last_verified, "2026-11-08");
  assert.deepStrictEqual(Object.values(tools[0].features), [true, true, true, false]);
});

test("blank price = not published; 0 = free plan", () => {
  const { tools } = importCsv(good.replace(",35,", ",,"), good.replace("Tool A", "Tool B").replace(",35,", ",0,"));
  assert.strictEqual(tools[0].price_monthly, null);
  assert.strictEqual(tools[1].price_monthly, 0);
});

test("blank checks become FALSE with a warning", () => {
  const { tools, errors, warnings } = importCsv(good.replace("TRUE,TRUE,TRUE,FALSE", ",TRUE,TRUE,FALSE"));
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(tools[0].features.free_trial, false);
  assert.match(warnings[0], /Row 2 \(Tool A\): free_trial is blank/);
});

test("errors name the sheet row and column", () => {
  const { errors } = importCsv(
    good,
    "Tool B,Plumbing,35,FALSE,,x,TRUE,TRUE,TRUE,FALSE,https://b.com,2026-11-08",
    "Tool C,Staff & Hiring,about 20,FALSE,,x,TRUE,TRUE,TRUE,FALSE,https://c.com,2026-11-08",
    "Tool D,Staff & Hiring,20,FALSE,,x,maybe,TRUE,TRUE,FALSE,https://d.com,2026-11-08",
    ",Staff & Hiring,20,FALSE,,x,TRUE,TRUE,TRUE,FALSE,https://e.com,2026-11-08",
  );
  assert.ok(errors.some((e) => /^Row 3 \(Tool B\): category "Plumbing" must be one of/.test(e)));
  assert.ok(errors.some((e) => /^Row 4 \(Tool C\): price_monthly "about 20"/.test(e)));
  assert.ok(errors.some((e) => /^Row 5 \(Tool D\): free_trial "maybe" must be TRUE or FALSE/.test(e)));
  assert.ok(errors.some((e) => /^Row 6: name is empty/.test(e)));
});

test("catalog-wide rules still apply after conversion", () => {
  assert.ok(importCsv(good, good).errors.some((e) => /duplicate tool name/.test(e)));
  assert.ok(importCsv(good.replace("https://a.com", "a.com")).errors.some((e) => /source_url must start with http/.test(e)));
  assert.ok(importCsv(good.replace("Drafts schedules", "")).errors.some((e) => /"summary" is empty/.test(e)));
});

test("missing columns are reported up front", () => {
  const { errors } = convert(parseCsv("name,category\nA,Staff & Hiring"), { categories, checks });
  assert.match(errors[0], /Missing column\(s\): price_monthly/);
});

test("blank lines are skipped", () => {
  const { tools, errors } = importCsv(good, "", ",,,,,,,,,,,");
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(tools.length, 1);
});

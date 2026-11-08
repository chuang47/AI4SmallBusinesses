// Validates the data files. Run: node scripts/validate.js
const tools = require("../data/tools.json");
const categories = require("../data/categories.json");
const problems = require("../data/problems.json");
require("../data/config.json"); // must at least parse

const errors = [];
const REQUIRED = ["name", "category", "price_monthly", "features", "summary", "last_verified", "source_url"];

// (c) no feature key shared between categories
const keyOwner = {};
for (const [cat, def] of Object.entries(categories)) {
  for (const key of Object.keys(def.table_stakes)) {
    if (keyOwner[key]) errors.push(`Feature "${key}" is in both "${keyOwner[key]}" and "${cat}"`);
    keyOwner[key] = cat;
  }
}

for (const tool of tools) {
  const id = tool.name || JSON.stringify(tool).slice(0, 40);

  // (a) required fields (price_monthly may be null, but the key must exist)
  for (const field of REQUIRED) {
    if (!(field in tool)) errors.push(`${id}: missing "${field}"`);
    else if (field !== "price_monthly" && (tool[field] === null || tool[field] === "")) errors.push(`${id}: "${field}" is empty`);
  }
  if (tool.price_monthly !== null && typeof tool.price_monthly !== "number") errors.push(`${id}: price_monthly must be a number or null`);

  // (b) features match the category's checklist exactly
  const def = categories[tool.category];
  if (!def) {
    errors.push(`${id}: unknown category "${tool.category}"`);
    continue;
  }
  const expected = Object.keys(def.table_stakes);
  const actual = Object.keys(tool.features || {});
  for (const key of expected) if (!actual.includes(key)) errors.push(`${id}: missing feature "${key}"`);
  for (const key of actual) if (!expected.includes(key)) errors.push(`${id}: unexpected feature "${key}"`);
  for (const [key, val] of Object.entries(tool.features || {})) {
    if (typeof val !== "boolean") errors.push(`${id}: feature "${key}" must be true or false`);
  }
}

// (d) every problem's categories exist
for (const p of problems) {
  for (const cat of p.categories) {
    if (!categories[cat]) errors.push(`Problem "${p.id}": unknown category "${cat}"`);
  }
}

if (errors.length) {
  console.error(`${errors.length} problem(s) found:\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log(`OK: ${tools.length} tools, ${Object.keys(categories).length} categories, ${problems.length} problems`);

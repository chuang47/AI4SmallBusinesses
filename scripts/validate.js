// Validates the data files. Run: node scripts/validate.js
// validate() is also used by tests/validate.test.js.

const REQUIRED = ["name", "category", "price_monthly", "features", "summary", "last_verified", "source_url"];

function validate({ tools, categories, problems }) {
  const errors = [];

  // Every category needs at least one core feature, or coverage would divide by zero.
  // (c) no feature key shared between categories
  const keyOwner = {};
  for (const [cat, def] of Object.entries(categories)) {
    const keys = Object.keys((def && def.table_stakes) || {});
    if (keys.length === 0) errors.push(`Category "${cat}" has no table_stakes features`);
    for (const key of keys) {
      if (keyOwner[key]) errors.push(`Feature "${key}" is in both "${keyOwner[key]}" and "${cat}"`);
      keyOwner[key] = cat;
    }
  }

  const names = new Set();
  for (const tool of tools) {
    const id = tool.name || JSON.stringify(tool).slice(0, 40);

    // (a) required fields (price_monthly may be null, but the key must exist)
    for (const field of REQUIRED) {
      if (!(field in tool)) errors.push(`${id}: missing "${field}"`);
      else if (field !== "price_monthly" && (tool[field] === null || tool[field] === "")) errors.push(`${id}: "${field}" is empty`);
    }
    if (tool.price_monthly !== null && (typeof tool.price_monthly !== "number" || !(tool.price_monthly >= 0))) {
      errors.push(`${id}: price_monthly must be a number >= 0, or null`);
    }
    // Names identify tools in the compare table, so they must be unique.
    if (names.has(tool.name)) errors.push(`${id}: duplicate tool name`);
    names.add(tool.name);
    // The link is rendered as a clickable href, so only allow web links.
    if (typeof tool.source_url === "string" && !/^https?:\/\//.test(tool.source_url)) {
      errors.push(`${id}: source_url must start with http:// or https://`);
    }
    if (typeof tool.last_verified === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(tool.last_verified)) {
      errors.push(`${id}: last_verified must be YYYY-MM-DD`);
    }

    // (b) features match the category's checklist exactly
    const def = categories[tool.category];
    if (!def) {
      errors.push(`${id}: unknown category "${tool.category}"`);
      continue;
    }
    const expected = Object.keys(def.table_stakes || {});
    const actual = Object.keys(tool.features || {});
    for (const key of expected) if (!actual.includes(key)) errors.push(`${id}: missing feature "${key}"`);
    for (const key of actual) if (!expected.includes(key)) errors.push(`${id}: unexpected feature "${key}"`);
    for (const [key, val] of Object.entries(tool.features || {})) {
      if (typeof val !== "boolean") errors.push(`${id}: feature "${key}" must be true or false`);
    }
  }

  // (d) every problem's categories exist; ids are unique
  const ids = new Set();
  for (const p of problems) {
    if (ids.has(p.id)) errors.push(`Problem "${p.id}": duplicate id`);
    ids.add(p.id);
    if (!Array.isArray(p.categories) || p.categories.length === 0) errors.push(`Problem "${p.id}": needs at least one category`);
    for (const cat of p.categories || []) {
      if (!categories[cat]) errors.push(`Problem "${p.id}": unknown category "${cat}"`);
    }
  }

  return errors;
}

module.exports = { validate };

if (require.main === module) {
  const data = {
    tools: require("../data/tools.json"),
    categories: require("../data/categories.json"),
    problems: require("../data/problems.json"),
  };
  require("../data/config.json"); // must at least parse
  const errors = validate(data);
  if (errors.length) {
    console.error(`${errors.length} problem(s) found:\n- ` + errors.join("\n- "));
    process.exit(1);
  }
  console.log(`OK: ${data.tools.length} tools, ${Object.keys(data.categories).length} categories, ${data.problems.length} problems`);
}

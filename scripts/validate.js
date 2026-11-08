// Checks the data files before they ship. Run: node scripts/validate.js
// validate() is also used by scripts/import.js and the tests.

const REQUIRED = ["name", "category", "price_monthly", "custom_pricing", "price_note", "summary", "features", "source_url", "last_verified"];

function validate({ tools, categories, checks }) {
  const errors = [];

  // Categories: unique ids and a label to show on cards.
  const ids = new Set();
  for (const c of categories) {
    if (!c || typeof c.id !== "string" || !c.id) { errors.push(`Category with no id: ${JSON.stringify(c)}`); continue; }
    if (ids.has(c.id)) errors.push(`Category "${c.id}": duplicate id`);
    ids.add(c.id);
    for (const field of ["label", "description"]) {
      if (typeof c[field] !== "string" || !c[field].trim()) errors.push(`Category "${c.id}": "${field}" is missing or empty`);
    }
  }

  // Checks: at least one, or the coverage score would divide by zero.
  const checkKeys = Object.keys(checks || {});
  if (checkKeys.length === 0) errors.push("checks.json has no checks");

  const names = new Set();
  for (const tool of tools) {
    const id = tool.name || JSON.stringify(tool).slice(0, 40);

    for (const field of REQUIRED) {
      if (!(field in tool)) errors.push(`${id}: missing "${field}"`);
    }
    for (const field of ["name", "summary", "source_url", "last_verified"]) {
      if (field in tool && (typeof tool[field] !== "string" || !tool[field].trim())) errors.push(`${id}: "${field}" is empty`);
    }
    if (!ids.has(tool.category)) errors.push(`${id}: unknown category "${tool.category}"`);

    // Price: a number >= 0, or null when it isn't published.
    if (tool.price_monthly !== null && (typeof tool.price_monthly !== "number" || !(tool.price_monthly >= 0))) {
      errors.push(`${id}: price_monthly must be a number >= 0, or blank`);
    }
    if (typeof tool.custom_pricing !== "boolean") errors.push(`${id}: custom_pricing must be true or false`);
    if ("price_note" in tool && typeof tool.price_note !== "string") errors.push(`${id}: price_note must be text`);

    // Names identify tools in the compare table, so they must be unique.
    if (names.has(tool.name)) errors.push(`${id}: duplicate tool name`);
    names.add(tool.name);
    // The link is rendered as a clickable href, so only allow web links.
    if (typeof tool.source_url === "string" && tool.source_url && !/^https?:\/\//.test(tool.source_url)) {
      errors.push(`${id}: source_url must start with http:// or https://`);
    }
    if (typeof tool.last_verified === "string" && tool.last_verified && !/^\d{4}-\d{2}-\d{2}$/.test(tool.last_verified)) {
      errors.push(`${id}: last_verified must be YYYY-MM-DD`);
    }

    // Every tool answers exactly the shared checks, each true or false.
    const actual = Object.keys(tool.features || {});
    for (const key of checkKeys) if (!actual.includes(key)) errors.push(`${id}: missing check "${key}"`);
    for (const key of actual) if (!checkKeys.includes(key)) errors.push(`${id}: unexpected check "${key}"`);
    for (const [key, val] of Object.entries(tool.features || {})) {
      if (typeof val !== "boolean") errors.push(`${id}: check "${key}" must be true or false`);
    }
  }

  return errors;
}

// Load the data files from disk (shared by the CLI, the import script and the API).
function loadData() {
  return {
    tools: require("../data/tools.json"),
    categories: require("../data/categories.json"),
    checks: require("../data/checks.json"),
  };
}

module.exports = { validate, loadData };

if (require.main === module) {
  const data = loadData();
  const errors = validate(data);
  if (errors.length) {
    console.error(`${errors.length} problem(s) found:\n- ` + errors.join("\n- "));
    process.exit(1);
  }
  console.log(`OK: ${data.tools.length} tools, ${data.categories.length} categories, ${Object.keys(data.checks).length} checks`);
}

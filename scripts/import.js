// Turns the team's spreadsheet into data/tools.json.
//
//   1. Google Sheets: File > Download > Comma-separated values (.csv)
//   2. Save it as data/tools.csv (or pass a path: node scripts/import.js ~/Downloads/sheet.csv)
//   3. node scripts/import.js
//
// Nothing is written unless every row is valid; errors name the sheet row and column.
const fs = require("fs");
const path = require("path");
const { validate } = require("./validate");

const COLUMNS = [
  "name", "category", "price_monthly", "custom_pricing", "price_note", "summary",
  "free_trial", "month_to_month", "mobile_app", "works_with_common_tools", "source_url", "last_verified",
];

// Minimal CSV parser: handles quoted cells with commas, quotes ("") and line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = text.replace(/^﻿/, ""); // Excel adds an invisible marker at the start
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Other column names the team's sheet may use for the same thing.
const ALIASES = { last_verified_date: "last_verified" };

const BOOL = { true: true, yes: true, y: true, false: false, no: false, n: false, "": false };

// Sheets may export dates as 11/8/2026 depending on the cell format; store YYYY-MM-DD.
function toIsoDate(value) {
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return value;
}

// rows: parsed CSV including the header. Returns { tools, errors, warnings }.
function convert(rows, { categories, checks }) {
  const errors = [], warnings = [], tools = [];
  const header = (rows[0] || []).map((h) => {
    const name = h.trim().toLowerCase();
    return ALIASES[name] || name;
  });
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { tools, warnings, errors: [`Missing column(s): ${missing.join(", ")}. Expected: ${COLUMNS.join(", ")}`] };

  // Accept the category's label ("Staff & Hiring") or its id ("staff_hiring"), any case.
  const categoryId = {};
  for (const c of categories) {
    categoryId[c.label.toLowerCase()] = c.id;
    categoryId[c.id.toLowerCase()] = c.id;
  }
  const checkKeys = Object.keys(checks);

  rows.slice(1).forEach((cells, i) => {
    const sheetRow = i + 2; // row 1 is the header
    const get = (col) => (cells[header.indexOf(col)] || "").trim();
    if (cells.every((c) => !c.trim())) return; // blank line
    const name = get("name");
    const where = `Row ${sheetRow}${name ? ` (${name})` : ""}`;
    const fail = (msg) => errors.push(`${where}: ${msg}`);

    if (!name) fail("name is empty");

    const category = categoryId[get("category").toLowerCase()];
    if (!category) fail(`category "${get("category")}" must be one of: ${categories.map((c) => c.label).join(", ")}`);

    // Price: plain number; tolerate "$27" and "1,200". Blank = not published.
    const rawPrice = get("price_monthly").replace(/[$,\s]/g, "");
    let price = null;
    if (rawPrice !== "") {
      price = Number(rawPrice);
      if (!Number.isFinite(price) || price < 0) fail(`price_monthly "${get("price_monthly")}" must be a number (no words), or blank if not published`);
    }

    const bool = (col) => {
      const raw = get(col).toLowerCase();
      if (!(raw in BOOL)) { fail(`${col} "${get(col)}" must be TRUE or FALSE`); return false; }
      if (raw === "" && checkKeys.includes(col)) warnings.push(`${where}: ${col} is blank, treated as FALSE`);
      return BOOL[raw];
    };

    const custom = bool("custom_pricing");
    // 0 means "has a free plan" and ranks as the cheapest option, so it shouldn't be used for "contact sales".
    if (price === 0 && custom) {
      warnings.push(`${where}: price 0 means a free plan, but custom_pricing is TRUE. If there's no free plan, leave the price blank.`);
    }

    tools.push({
      name,
      category,
      price_monthly: price,
      custom_pricing: custom,
      price_note: get("price_note"),
      summary: get("summary"),
      features: Object.fromEntries(checkKeys.map((k) => [k, bool(k)])),
      source_url: get("source_url"),
      last_verified: toIsoDate(get("last_verified")),
    });
  });

  // Row-level problems first; then whole-catalog rules (duplicates, links, dates, empty fields).
  if (!errors.length) errors.push(...validate({ tools, categories, checks }));
  return { tools, errors, warnings };
}

module.exports = { parseCsv, convert, COLUMNS };

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const csvPath = process.argv[2] || path.join(root, "data", "tools.csv");
  const outPath = path.join(root, "data", "tools.json");
  if (!fs.existsSync(csvPath)) {
    console.error(`No CSV at ${csvPath}. Export the sheet as CSV and save it there, or pass its path.`);
    process.exit(1);
  }
  const { tools, errors, warnings } = convert(parseCsv(fs.readFileSync(csvPath, "utf8")), {
    categories: require("../data/categories.json"),
    checks: require("../data/checks.json"),
  });
  warnings.forEach((w) => console.warn("warning: " + w));
  if (errors.length) {
    console.error(`\nNot imported. Fix ${errors.length} problem(s) in the sheet:\n- ` + errors.join("\n- "));
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(tools, null, 2) + "\n");
  const counts = {};
  tools.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
  console.log(`Imported ${tools.length} tools into data/tools.json`);
  Object.entries(counts).forEach(([c, n]) => console.log(`  ${c}: ${n}`));
  console.log("Next: node --test, then commit and push to deploy.");
}

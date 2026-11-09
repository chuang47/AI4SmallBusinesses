// Gate, scoring, and tiebreakers. Pure functions: no network, no file reads.
// Every number shown to the owner comes from tools.json plus the rules below.

// Starting proposal. Must sum to 100. Problem fit is a gate (in or out), not a weight:
// each tool belongs to one category, so it would add the same points to every tool shown.
const WEIGHTS = { features: 60, budget: 40 };
const MAX_RESULTS = 12; // the results list scrolls, with sort and filter, so show every good fit

// "35" or "5.99": avoids float noise like 5.990000000000002 when prices have cents.
const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// 0-100. Full marks at or under budget, linear down to 0 at twice the budget.
function budgetFit(price, budget) {
  if (price == null || budget == null) return 50;
  if (price <= budget) return 100;
  if (price >= 2 * budget) return 0;
  return (100 * (2 * budget - price)) / budget;
}

// data = { tools, checks }; profile.problems holds category ids.
function scoreTool(tool, profile, data) {
  // Gate: the tool's category must be one of the owner's problems.
  if (!profile.problems.includes(tool.category)) return null;

  const keys = Object.keys(data.checks);
  const have = keys.filter((k) => tool.features[k]).length;

  const featureCoverage = have / keys.length;
  const fit = budgetFit(tool.price_monthly, profile.budget);
  const score = WEIGHTS.features * featureCoverage + (WEIGHTS.budget * fit) / 100;

  // The card's price line already says "Contact sales" / "not published", so reasons skip it.
  const reasons = [`Passes ${have} of ${keys.length} small-business checks`];
  if (tool.price_monthly != null && profile.budget != null) {
    reasons.push(
      tool.price_monthly <= profile.budget
        ? `Starting price fits your $${money(profile.budget)}/month budget`
        : `Starting price is $${money(tool.price_monthly - profile.budget)} over your $${money(profile.budget)}/month budget`
    );
  }

  return {
    name: tool.name,
    category: tool.category,
    price_monthly: tool.price_monthly,
    custom_pricing: tool.custom_pricing,
    price_note: tool.price_note,
    summary: tool.summary,
    score,
    match: Math.round((score / 100) * 5 * 2) / 2,
    feature_coverage: `${have}/${keys.length}`,
    features: tool.features,
    reasons,
    source_url: tool.source_url,
    last_verified: tool.last_verified,
    _coverage: featureCoverage,
  };
}

// Higher score, higher coverage, lower price (null last), then name.
function compare(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a._coverage !== b._coverage) return b._coverage - a._coverage;
  if (a.price_monthly !== b.price_monthly) {
    if (a.price_monthly == null) return 1;
    if (b.price_monthly == null) return -1;
    return a.price_monthly - b.price_monthly;
  }
  return a.name.localeCompare(b.name);
}

function rank(profile, data, limit = MAX_RESULTS) {
  return data.tools
    .map((t) => scoreTool(t, profile, data))
    .filter(Boolean)
    .sort(compare)
    .slice(0, limit)
    .map(({ _coverage, score, ...rec }) => rec);
}

module.exports = { WEIGHTS, budgetFit, rank };

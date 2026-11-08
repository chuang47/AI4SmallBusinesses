// Gate, scoring, and tiebreakers. Pure functions: no network, no file reads.
// Every number shown to the owner comes from tools.json plus the rules below.

// Starting proposal. Must sum to 100.
const WEIGHTS = { problem: 30, features: 40, budget: 30 };
const MAX_RESULTS = 4;

// 0-100. Full marks at or under budget, linear down to 0 at twice the budget.
function budgetFit(price, budget) {
  if (price == null || budget == null) return 50;
  if (price <= budget) return 100;
  if (price >= 2 * budget) return 0;
  return (100 * (2 * budget - price)) / budget;
}

function scoreTool(tool, profile, data) {
  const def = data.categories[tool.category];
  const ownerProblems = data.problems.filter((p) => profile.problems.includes(p.id));
  const addressed = ownerProblems.filter((p) => p.categories.includes(tool.category));

  // Gate: the tool's category must address at least one of the owner's problems.
  if (addressed.length === 0) return null;

  const keys = Object.keys(def.table_stakes);
  const total = keys.length;
  const have = keys.filter((k) => tool.features[k]).length;

  const problemCoverage = addressed.length / ownerProblems.length;
  const featureCoverage = have / total;
  const fit = budgetFit(tool.price_monthly, profile.budget);

  const score =
    WEIGHTS.problem * problemCoverage + WEIGHTS.features * featureCoverage + (WEIGHTS.budget * fit) / 100;

  const reasons = [`Helps with: ${addressed.map((p) => p.label.toLowerCase()).join(", ")}`];
  reasons.push(`Covers ${have} of ${total} features on our ${def.label} checklist`);
  if (tool.price_monthly == null) reasons.push("Price not published");
  else if (profile.budget != null) {
    reasons.push(
      tool.price_monthly <= profile.budget
        ? `Within your $${profile.budget}/month budget`
        : `$${tool.price_monthly - profile.budget} over your $${profile.budget}/month budget`
    );
  }

  return {
    name: tool.name,
    category: tool.category,
    price_monthly: tool.price_monthly,
    summary: tool.summary,
    score,
    match: Math.round((score / 100) * 5 * 2) / 2,
    feature_coverage: `${have}/${total}`,
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

// data = { tools, categories, problems }
function rank(profile, data, limit = MAX_RESULTS) {
  return data.tools
    .map((t) => scoreTool(t, profile, data))
    .filter(Boolean)
    .sort(compare)
    .slice(0, limit)
    .map(({ _coverage, score, ...rec }) => rec);
}

module.exports = { WEIGHTS, budgetFit, scoreTool, rank };

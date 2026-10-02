'use strict';

// Budget screen (DESIGN.md 5.1).
// Privacy rule: the family's numbers live only in `familyBudget`, in this
// page's memory. Nothing here writes to localStorage, cookies, the URL or the
// network, so a refresh or closing the tab clears everything.

const familyBudget = {
  takeHome: null,      // required
  debts: null,
  otherCosts: null,
  savings: null,
  ratePercent: null,
  termYears: null,
  grossMonthly: null,  // optional, only for the guideline line
  monthlySaving: null, // optional, only for months-to-save
};

let plannerConfig = null; // planner-config.json, loaded once

// Reads one entry from planner-config.json, e.g. plannerSetting('loan.default_interest_rate').
function plannerSetting(path) {
  let node = plannerConfig;
  for (const key of path.split('.')) node = node && node[key];
  return node || { value: null, source: 'TODO' };
}

// Everything the monthly cost needs besides the price and down payment.
// The family's own rate and loan length win over the config defaults.
function homeCostSettings(market) {
  const v = path => plannerSetting(path).value;
  return {
    ratePercent: familyBudget.ratePercent ?? v('loan.default_interest_rate'),
    termYears: familyBudget.termYears ?? v('loan.default_term_years'),
    assessmentRatio: v('property_tax.assessment_ratio'),
    // the Alpharetta data has no tax district per home yet, so only Forsyth has a rate
    mills: market === 'forsyth' ? v('property_tax.millage.forsyth_county') : null,
    exemption: v('property_tax.homestead_exemption') || 0,
    insurancePer1000: v('insurance.homeowners_rate_per_1000'),
    pmiPer100k: v('mortgage_insurance.monthly_per_100k'),
    pmiRequiredBelowPercent: v('mortgage_insurance.required_below_down_payment_percent'),
    closingPercent: v('closing_costs.percent_of_price'),
  };
}

// Monthly cost of one home for this family, with the down payment taken from
// their savings after closing costs unless a down payment is given.
function familyHomeCost(market, price, downPayment) {
  const s = homeCostSettings(market);
  const down = downPayment ?? PlannerMath.downPaymentFromSavings(familyBudget.savings || 0, price, s.closingPercent) ?? 0;
  return PlannerMath.monthlyHousingCost({ ...s, price, downPayment: down });
}

function budgetIsFilledIn() { return familyBudget.takeHome != null; }

// Other screens listen for this to redraw when the budget or config changes.
function announceBudgetChange() { window.dispatchEvent(new Event('budgetchange')); }

const BUDGET_FIELDS = {
  takeHome: {},
  debts: {},
  otherCosts: {},
  savings: {},
  ratePercent: { max: 100, message: 'Rate: enter a yearly rate under 100%, like 6.5' },
  termYears: { wholeNumber: true, min: 1, max: 50, message: 'Length: enter whole years from 1 to 50' },
  grossMonthly: {},
  monthlySaving: {},
};

(function budgetWorksheet() {
  const byId = id => document.getElementById(id);
  const form = byId('budgetForm');
  const money = v => '$' + Math.round(v).toLocaleString('en-US');

  // Browsers can refill form boxes after a refresh or the back button.
  // Clear them so old numbers never come back on their own.
  form.reset();
  window.addEventListener('pageshow', e => { if (e.persisted) clearBudget(); });

  function readField(name) {
    const input = byId('b-' + name);
    const rule = BUDGET_FIELDS[name];
    const value = PlannerMath.parseAmount(input.value);
    let problem = '';
    if (Number.isNaN(value)) problem = 'Use numbers only, like 2450';
    else if (value != null && rule.wholeNumber && !Number.isInteger(value)) problem = rule.message;
    else if (value != null && rule.min != null && value < rule.min) problem = rule.message;
    else if (value != null && rule.max != null && value > rule.max) problem = rule.message;
    else if (name === 'takeHome' && value === 0) problem = 'Take-home pay needs to be more than $0';
    input.closest('[data-field]').classList.toggle('invalid', !!problem);
    byId('b-' + name + '-err').textContent = problem;
    familyBudget[name] = problem ? null : value;
    return !problem;
  }

  const configValue = plannerSetting;

  function sourceLine(label, entry, unitText) {
    if (entry.value == null) return `${label}: no starting value yet (TODO in planner-config.json). Type your own.`;
    return `${label}: starts at ${entry.value}${unitText} (${entry.cite || entry.source}, ${entry.as_of})`;
  }

  function applyDefaults() {
    const rate = configValue('loan.default_interest_rate');
    const term = configValue('loan.default_term_years');
    byId('b-ratePercent').value = rate.value ?? '';
    byId('b-termYears').value = term.value ?? '';
    byId('b-ratePercent-src').textContent = sourceLine('Rate', rate, '%');
    byId('b-termYears-src').textContent = sourceLine('Length', term, ' years');
  }

  function render() {
    const fieldOk = {};
    for (const name of Object.keys(BUDGET_FIELDS)) fieldOk[name] = readField(name);
    const b = familyBudget;
    const keepPercent = configValue('comfort.comfortable_min_left_percent').value;
    byId('r-cutoffTag').textContent = keepPercent == null ? 'Cutoff not set' : `Keep ${keepPercent}% left`;
    renderGuideline();

    // a typo in the first three boxes would otherwise count as $0 and overstate what's left
    const linesOk = fieldOk.takeHome && fieldOk.debts && fieldOk.otherCosts;
    if (b.takeHome == null || !linesOk) {
      const waitText = linesOk ? 'Fill in take-home pay' : 'Fix the marked box';
      setText('r-takeHome', '—');
      setText('r-leftBeforeHousing', waitText);
      setText('r-comfortLimit', '—');
      byId('r-comfortNote').textContent = keepPercent == null ? 'Needs a comfort cutoff' : waitText;
      byId('r-narrativeWrap').hidden = true;
      renderSplit(null);
      renderMaxPrice(null);
      announceBudgetChange();
      return;
    }

    const costs = (b.debts || 0) + (b.otherCosts || 0);
    const left = PlannerMath.moneyLeftBeforeHousing(b.takeHome, b.debts, b.otherCosts);
    const limit = PlannerMath.comfortableHousingLimit(b.takeHome, b.debts, b.otherCosts, keepPercent);
    setText('r-takeHome', money(b.takeHome) + ' / mo');
    setText('r-leftBeforeHousing', left > 0 ? money(left) + ' / mo' : '$0 / mo');

    const narrative = byId('r-narrative');
    if (left <= 0) {
      setText('r-comfortLimit', '$0 / mo');
      byId('r-comfortNote').textContent = 'Regular costs use up all of take-home pay';
      narrative.textContent = 'Your regular costs are at or above your take-home pay, so this plan has no room for a housing payment.';
    } else if (limit == null) {
      setText('r-comfortLimit', '—');
      byId('r-comfortNote').textContent = 'Needs a comfort cutoff (placeholder in planner-config.json)';
      narrative.innerHTML = `Before housing, you have <strong>${money(left)}</strong> left each month. How much of that should stay unspent is the comfort cutoff, which hasn’t been chosen yet.`;
    } else {
      setText('r-comfortLimit', 'up to ' + money(limit) + ' / mo');
      byId('r-comfortNote').textContent = `Keeps ${keepPercent}% of take-home pay left after every bill`;
      narrative.innerHTML = limit === 0
        ? `Keeping <strong>${keepPercent}%</strong> of your take-home pay after every bill leaves nothing for housing with your current costs.`
        : `With a <strong>${money(limit)}</strong> housing payment, you would still have <strong>${money(b.takeHome - costs - limit)} (${keepPercent}%)</strong> left each month after every bill, including housing.`;
    }
    byId('r-narrativeWrap').hidden = false;
    renderSplit(b.takeHome, Math.min(costs, b.takeHome), left > 0 ? limit : 0);
    renderMaxPrice(left > 0 ? limit : 0);
    announceBudgetChange();
  }

  // The most a Forsyth home could cost and still keep the comfortable amount
  // free each month, with the down payment coming out of savings.
  function renderMaxPrice(limit) {
    const s = homeCostSettings('forsyth');
    const note = byId('r-maxPriceNote');
    if (limit == null) { setText('r-maxPrice', '—'); note.textContent = 'Needs take-home pay and a comfort cutoff'; return; }
    if (s.ratePercent == null || s.termYears == null) { setText('r-maxPrice', '—'); note.textContent = 'Needs an interest rate and loan length'; return; }
    const costAt = price => familyHomeCost('forsyth', price).total;
    const price = PlannerMath.maxPriceForMonthly(limit, costAt);
    if (price == null) { setText('r-maxPrice', '—'); note.textContent = 'A cost source is still missing in planner-config.json'; return; }
    setText('r-maxPrice', price > 0 ? 'about ' + money(price) : '$0');
    const down = PlannerMath.downPaymentFromSavings(familyBudget.savings || 0, price, s.closingPercent);
    note.textContent = price > 0
      ? `With ${money(down)} down after closing costs, ${s.ratePercent}% for ${s.termYears} years, and Forsyth taxes and insurance`
      : 'No room for a housing payment with these numbers';
  }

  function setText(id, text) { byId(id).textContent = text; }

  // The one chart (DESIGN.md section 4): take-home pay split into bills and
  // debt, housing, and what is left. Before a comfort cutoff exists there is
  // no housing amount, so that part stays empty and "left over" is everything
  // after bills.
  function renderSplit(takeHome, costs, housing) {
    const parts = { costs: 0, housing: 0, left: 0 };
    if (takeHome) {
      parts.costs = costs;
      parts.housing = housing || 0;
      parts.left = Math.max(0, takeHome - costs - parts.housing);
    }
    const pct = a => takeHome ? a / takeHome * 100 : 0;
    for (const key of Object.keys(parts)) {
      byId('bar-' + key).style.width = pct(parts[key]).toFixed(2) + '%';
      const unknownHousing = key === 'housing' && takeHome && housing == null;
      byId('leg-' + key).textContent = !takeHome || unknownHousing ? '—' : money(parts[key]);
      byId('leg-' + key + '-pct').textContent = !takeHome || unknownHousing ? '' : Math.round(pct(parts[key])) + '%';
    }
    byId('splitBar').setAttribute('aria-label', takeHome
      ? `Take-home pay split: bills and debt ${Math.round(pct(parts.costs))}%, housing ${Math.round(pct(parts.housing))}%, left over ${Math.round(pct(parts.left))}%`
      : 'Take-home pay split will show once take-home pay is filled in');
  }

  function renderGuideline() {
    const guide = configValue('guidelines.housing_share_of_gross_income');
    const row = byId('r-guidelineRow');
    row.hidden = familyBudget.grossMonthly == null;
    if (row.hidden) return;
    if (guide.value == null) {
      setText('r-guideline', '—');
      byId('r-guidelineNote').textContent = 'Housing-to-pay guideline still needs a source (TODO)';
      return;
    }
    setText('r-guideline', money(PlannerMath.guidelineHousingAmount(familyBudget.grossMonthly, guide.value)) + ' / mo');
    byId('r-guidelineNote').textContent = `${guide.value}% of pay before taxes. A guideline, not a rule (${guide.cite || guide.source})`;
  }

  // The +/- buttons next to each money box.
  form.addEventListener('click', e => {
    const btn = e.target.closest('button[data-step]');
    if (!btn) return;
    const input = byId(btn.dataset.for);
    const current = PlannerMath.parseAmount(input.value);
    const base = Number.isFinite(current) ? current : 0;
    input.value = Math.max(0, base + Number(btn.dataset.step));
    render();
  });

  function clearBudget() {
    form.reset();
    for (const name of Object.keys(familyBudget)) familyBudget[name] = null;
    if (plannerConfig) applyDefaults();
    render();
    byId('clearNote').textContent = 'Cleared.';
    setTimeout(() => { byId('clearNote').textContent = ''; }, 2000);
    byId('b-takeHome').focus();
  }

  form.addEventListener('input', render);
  form.addEventListener('submit', e => e.preventDefault());
  byId('clearBudget').addEventListener('click', clearBudget);

  render();
  fetch('planner-config.json')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(config => { plannerConfig = config; applyDefaults(); render(); })
    .catch(() => {
      byId('b-ratePercent-src').textContent = 'Couldn’t load planner-config.json. Type your own rate.';
      byId('b-termYears-src').textContent = 'Couldn’t load planner-config.json. Type your own loan length.';
    });
})();

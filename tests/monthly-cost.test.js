// Tests for the monthly cost pieces in assets/planner-math.js.
// Run from the planner folder with:  node --test
// The example numbers can be checked by hand on a calculator.
const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('../assets/planner-math.js');

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.005, `${label}: expected about ${expected}, got ${actual}`);

test('property tax: 40% of the price times the millage', () => {
  // $500,000 * 0.40 = $200,000 assessed; * 24.522 / 1000 = $4,904.40 a year = $408.70 a month
  near(PM.monthlyPropertyTax(500000, 0.40, 24.522), 408.70, '$500k in Forsyth');
  // a $50,000 exemption comes off the assessed value: $150,000 * 24.522 / 1000 / 12 = $306.525
  near(PM.monthlyPropertyTax(500000, 0.40, 24.522, 50000), 306.525, 'with exemption');
  assert.equal(PM.monthlyPropertyTax(500000, 0.40, 24.522, 999999), 0, 'exemption bigger than assessed value');
  assert.equal(PM.monthlyPropertyTax(500000, 0.40, null), null, 'no millage yet');
});

test('home insurance: dollars per $1,000 of value per year', () => {
  // $500,000 / 1000 * $4.90 = $2,450 a year = $204.17 a month
  near(PM.monthlyHomeInsurance(500000, 4.90), 204.1667, '$500k');
  assert.equal(PM.monthlyHomeInsurance(500000, null), null);
});

test('mortgage insurance only under 20% down', () => {
  // $450,000 loan on $500,000 (10% down): 4.5 * $70 = $315 a month
  assert.equal(PM.monthlyMortgageInsurance(450000, 500000, 50000, 70, 20), 315);
  assert.equal(PM.monthlyMortgageInsurance(400000, 500000, 100000, 70, 20), 0, 'exactly 20% down');
  assert.equal(PM.monthlyMortgageInsurance(350000, 500000, 150000, null, 20), 0, 'no rate needed when not charged');
  assert.equal(PM.monthlyMortgageInsurance(450000, 500000, 50000, null, 20), null, 'charged but rate unknown');
  assert.equal(PM.monthlyMortgageInsurance(0, 0, 0, 70, 20), 0, 'no loan, no mortgage insurance');
});

test('closing costs and the down payment left after them', () => {
  assert.equal(PM.closingCosts(500000, 5), 25000);
  // $85,000 saved - $25,000 closing = $60,000 down
  assert.equal(PM.downPaymentFromSavings(85000, 500000, 5), 60000);
  assert.equal(PM.downPaymentFromSavings(20000, 500000, 5), 0, 'not enough to cover closing');
  assert.equal(PM.downPaymentFromSavings(900000, 500000, 5), 500000, 'never more than the price');
});

const forsyth = {
  ratePercent: 7, termYears: 30, assessmentRatio: 0.40, mills: 24.522,
  insurancePer1000: 4.90, pmiPer100k: 70, pmiRequiredBelowPercent: 20,
};

test('full monthly cost adds every piece', () => {
  // $500,000 home, $60,000 down (12%), $440,000 loan at 7% for 30 years
  const c = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 60000 });
  assert.equal(c.loan, 440000);
  near(c.loanPayment, 2927.331, 'loan payment');
  near(c.propertyTax, 408.70, 'tax');
  near(c.homeInsurance, 204.1667, 'insurance');
  assert.equal(c.mortgageInsurance, 308, 'PMI: 4.4 * $70');
  near(c.total, 3848.1976, 'total');
  assert.deepEqual(c.missing, []);
});

test('a typed insurance quote replaces the estimate', () => {
  const c = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 60000, insuranceMonthly: 250 });
  assert.equal(c.homeInsurance, 250);
});

test('a missing source leaves the total empty instead of too low', () => {
  const c = PM.monthlyHousingCost({ ...forsyth, mills: null, price: 500000, downPayment: 60000 });
  assert.equal(c.total, null);
  assert.deepEqual(c.missing, ['propertyTax']);
});

test('comfort label follows the two cutoffs', () => {
  assert.equal(PM.comfortLabel(25, 20, 10), 'Comfortable');
  assert.equal(PM.comfortLabel(20, 20, 10), 'Comfortable', 'at the cutoff counts');
  assert.equal(PM.comfortLabel(15, 20, 10), 'Tight');
  assert.equal(PM.comfortLabel(10, 20, 10), 'Tight', 'at the lower cutoff is still tight');
  assert.equal(PM.comfortLabel(9.9, 20, 10), 'Stretching');
  assert.equal(PM.comfortLabel(-5, 20, 10), 'Stretching', 'costs more than take-home pay');
  assert.equal(PM.comfortLabel(15, null, 10), null, 'cutoff not set');
});

test('share of pay left after housing', () => {
  // 7,800 - 650 - 2,450 - 3,000 = 1,700 left, 21.79% of 7,800
  near(PM.leftAfterHousingPercent(7800, 650, 2450, 3000), 21.7949, 'left %');
  assert.equal(PM.leftAfterHousingPercent(7800, 650, 2450, null), null);
});

test('highest price for a monthly budget', () => {
  const costAt = price => PM.monthlyHousingCost({
    ...forsyth, price, downPayment: PM.downPaymentFromSavings(85000, price, 5),
  }).total;
  const best = PM.maxPriceForMonthly(3140, costAt);
  assert.ok(costAt(best) <= 3140, 'the answer fits the budget');
  assert.ok(costAt(best + 200) > 3140, 'a little more would not fit');
  assert.equal(PM.maxPriceForMonthly(0, costAt), 0);
  assert.equal(PM.maxPriceForMonthly(3140, () => null), null, 'cost unknown');
});

test('months to save the rest', () => {
  assert.equal(PM.monthsToSave(10000, 1500), 7, '6.67 rounds up to 7');
  assert.equal(PM.monthsToSave(0, 1500), 0);
  assert.equal(PM.monthsToSave(10000, null), null, 'no saving amount given');
});

test('savings limit the price: closing costs plus the minimum down payment', () => {
  // $85,000 / (5% + 3%) = $1,062,500
  assert.equal(PM.maxPriceForCash(85000, 5, 3), 1062500);
  // $20,000 / 8% = $250,000
  assert.equal(PM.maxPriceForCash(20000, 5, 3), 250000);
  assert.equal(PM.maxPriceForCash(0, 5, 3), 0, 'no savings, no purchase');
  assert.equal(PM.maxPriceForCash(null, 5, 3), 0, 'blank savings counts as none');
  assert.equal(PM.maxPriceForCash(20000, null, 3), null, 'closing cost source missing');
});

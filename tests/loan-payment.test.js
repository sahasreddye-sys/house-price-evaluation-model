// Tests for PlannerMath.monthlyLoanPayment (the function you write).
// Run from the planner folder with:  node --test
// These fail until the function is written. You're done when they all pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const PlannerMath = require('../assets/planner-math.js');

const pay = (...args) => PlannerMath.monthlyLoanPayment(...args);

// Payments are compared to the cent: within half a cent of the exact answer.
function closeTo(actual, expected, label) {
  assert.ok(typeof actual === 'number' && Number.isFinite(actual), `${label}: expected a number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) < 0.005, `${label}: expected about ${expected.toFixed(2)}, got ${actual}`);
}

test('known payments (check one or two with an online amortization calculator yourself)', () => {
  closeTo(pay(200000, 6, 30), 1199.10, '$200,000 at 6% for 30 years');
  closeTo(pay(300000, 7, 30), 1995.91, '$300,000 at 7% for 30 years');
  closeTo(pay(250000, 6.5, 15), 2177.77, '$250,000 at 6.5% for 15 years');
  closeTo(pay(400000, 6.875, 30), 2627.72, '$400,000 at 6.875% for 30 years');
  closeTo(pay(150000, 5, 10), 1590.98, '$150,000 at 5% for 10 years');
  closeTo(pay(1000, 12, 1), 88.85, '$1,000 at 12% for 1 year');
});

test('0% interest just splits the loan evenly over the months', () => {
  // the usual formula divides by zero here, so this case needs its own line
  closeTo(pay(100000, 0, 30), 100000 / 360, '$100,000 at 0% for 30 years');
  closeTo(pay(12000, 0, 1), 1000, '$12,000 at 0% for 1 year');
});

test('borrowing nothing costs nothing', () => {
  assert.equal(pay(0, 6.5, 30), 0);
});

test('inputs that cannot make a real loan return null', () => {
  assert.equal(pay(-5000, 6, 30), null, 'negative loan');
  assert.equal(pay(200000, -1, 30), null, 'negative rate');
  assert.equal(pay(200000, 6, 0), null, '0-year loan');
  assert.equal(pay(200000, 6, 30.5), null, 'term must be whole years');
  assert.equal(pay(null, 6, 30), null, 'missing loan amount');
  assert.equal(pay(200000, null, 30), null, 'missing rate');
  assert.equal(pay(200000, 6, null), null, 'missing term');
});

test('the payment actually pays the loan off (checks the formula without using the numbers above)', () => {
  // Pretend to make every payment: each month interest is added, then the payment is subtracted.
  // If the payment is right, the balance ends at $0 after the last month.
  for (const [loan, rate, years] of [[300000, 7, 30], [250000, 6.5, 15], [80000, 3.25, 20]]) {
    const payment = pay(loan, rate, years);
    const monthlyRate = rate / 100 / 12;
    let balance = loan;
    for (let month = 0; month < years * 12; month++) balance = balance * (1 + monthlyRate) - payment;
    assert.ok(Math.abs(balance) < 0.01, `${loan} at ${rate}% for ${years} years leaves ${balance.toFixed(2)} unpaid`);
  }
});

test('higher rates cost more each month; longer loans cost less each month', () => {
  assert.ok(pay(300000, 7, 30) > pay(300000, 6, 30));
  assert.ok(pay(300000, 6, 30) < pay(300000, 6, 15));
});

'use strict';

// Budget arithmetic for the planner. Pure functions only: nothing here touches
// the page, the network or storage, so the same file runs in the browser and
// in the Node tests (tests/planner-math.test.js).

const PlannerMath = {
  // Turns what someone typed ("$7,800", "7800.50", "") into a number.
  // Returns null for an empty box and NaN for something that isn't a number,
  // so the form can tell "not filled in" apart from "typo".
  parseAmount(text) {
    const cleaned = String(text ?? '').replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return NaN;
    return Number(cleaned);
  },

  // Line 4 of the worksheet: take-home pay minus debts and other regular costs.
  moneyLeftBeforeHousing(takeHome, debts, otherCosts) {
    return takeHome - (debts || 0) - (otherCosts || 0);
  },

  // The most a family can spend on housing each month and still keep
  // `keepPercent` of take-home pay after every monthly cost.
  //   left = takeHome - debts - other - housing  >=  takeHome * keepPercent / 100
  //   so housing <= takeHome * (1 - keepPercent / 100) - debts - other
  // Returns null when the cutoff hasn't been decided yet, and never goes below 0.
  comfortableHousingLimit(takeHome, debts, otherCosts, keepPercent) {
    if (keepPercent == null) return null;
    const limit = takeHome * (1 - keepPercent / 100) - (debts || 0) - (otherCosts || 0);
    return Math.max(0, limit);
  },

  // The "housing near X% of gross income" reference line. Not used for the label.
  guidelineHousingAmount(grossMonthly, guidelinePercent) {
    if (grossMonthly == null || guidelinePercent == null) return null;
    return grossMonthly * guidelinePercent / 100;
  },

  // Monthly principal + interest payment on a fixed-rate loan (DESIGN.md section 6):
  //   M = P * r * (1 + r)^n / ((1 + r)^n - 1)
  //
  //   loanAmount         dollars borrowed (price minus down payment), e.g. 200000
  //   annualRatePercent  yearly rate as a percent, e.g. 6.5 means 6.5%
  //   termYears          whole years, e.g. 30
  //
  // Returns the payment in dollars, not rounded (the screen rounds it).
  // Returns null when the inputs can't make a real loan.
  monthlyLoanPayment(loanAmount, annualRatePercent, termYears) {
    if (loanAmount == null || annualRatePercent == null || termYears == null) return null;
    if (loanAmount < 0 || annualRatePercent < 0) return null;
    if (!Number.isInteger(termYears) || termYears <= 0) return null;

    const P = loanAmount;
    const r = annualRatePercent / 100 / 12; // yearly percent -> monthly decimal
    const n = termYears * 12;               // years -> monthly payments

    // at 0% the formula divides by zero; the loan is just split evenly
    if (r === 0) return P / n;

    const growth = (1 + r) ** n;
    return P * r * growth / (growth - 1);
  },
};

if (typeof module !== 'undefined') module.exports = PlannerMath;

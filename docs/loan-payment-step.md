# Step: the monthly loan payment (you write this one)

**Goal:** fill in `monthlyLoanPayment` in `assets/planner-math.js` so every test in `tests/loan-payment.test.js` passes.

This is the first piece of the money math. The property tax, mortgage insurance and comfort label steps will build on it, so it has to be right.

## What the function does

A fixed-rate loan has the same payment every month. Each payment covers that month's interest and pays back some of the loan. Early on most of it is interest; near the end most of it is loan. The payment is set so the loan reaches exactly $0 on the last month.

From DESIGN.md section 6:

    M = P * r * (1 + r)^n / ((1 + r)^n - 1)

| Letter | Meaning | What the function gets | What you have to do |
|---|---|---|---|
| P | amount borrowed | `loanAmount`, in dollars | nothing |
| r | interest rate **per month**, as a decimal | `annualRatePercent`, like `6.5` | turn a yearly percent into a monthly decimal |
| n | number of monthly payments | `termYears`, like `30` | turn years into months |
| M | the monthly payment | — | return this |

## Work one by hand first

$200,000 at 6% for 30 years:

1. r = 6 / 100 / 12 = **0.005**
2. n = 30 × 12 = **360**
3. (1 + r)^n = 1.005^360 ≈ **6.0225752**
4. top: 200,000 × 0.005 × 6.0225752 ≈ **6,022.5752**
5. bottom: 6.0225752 − 1 ≈ **5.0225752**
6. M = 6,022.5752 / 5.0225752 ≈ **$1,199.10**

If your calculator gets $1,199.10, you understand the formula. Then check the same loan on any online mortgage or amortization calculator and write down which one you used (see "For your AI log" below).

## Things that commonly go wrong

- **Percent vs decimal.** `6.5` means 6.5%, which is 0.065 per year.
- **Yearly vs monthly.** Both the rate and the term have to be monthly.
- **0% interest.** Then r = 0, and the bottom of the formula is (1 + 0)^n − 1 = 0, which divides by zero. A 0% loan just splits the amount evenly over the months, so that case needs its own line.
- **Inputs that don't make a loan.** The tests expect `null` for a negative loan, a negative rate, a term of 0 or less, a term that isn't whole years (like 30.5), or a missing input (`null`). Check these before doing any math.
- **Borrowing $0.** The tests expect `0`.
- **Don't round.** Return the full number. The screen rounds to cents when it shows it.
- **JavaScript notes.** `**` raises to a power (`1.005 ** 360`). `Number.isInteger(30.5)` is `false`.

## How to run the tests

From the `planner` folder:

```bash
node --test
```

- Right now 6 tests fail on purpose. That's expected until the function is written.
- A failing test prints a message like `$300,000 at 7% for 30 years: expected about 1995.91, got ...`, which tells you which case is off.
- When it prints `# fail 0`, you're done.

## What the tests check

1. **Known payments:** six loans compared to the cent.
2. **0% interest:** splits evenly.
3. **$0 loan:** costs $0.
4. **Bad inputs:** return `null`.
5. **"Pays the loan off":** pretends to make every payment (add a month of interest, subtract the payment) and checks the balance ends at $0. It catches a wrong formula even if a number in test 1 were wrong.
6. **Common sense:** a higher rate means a higher payment, and a longer loan means a lower payment.

## When you're done

Tell me, and I'll connect it to the screens. I won't change your function. If something in it looks off, I'll point to it and you fix it.

## For your AI log

Write down, in your own words:

- That the test cases and this guide were made with AI help. The expected payments were computed with high-precision math and match common textbook examples, like $200,000 at 6% for 30 years being $1,199.10.
- Which online calculator you used to double-check, and that it matched.
- That you wrote `monthlyLoanPayment` yourself.

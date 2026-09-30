/**
 * Financial education answers that need no live data. Each concept has four explanations (professional,
 * client, beginner, technical) written and reviewed as reference text, plus a formula and a worked
 * calculation where one helps. Nothing here depends on current figures: tax limits and rates that
 * change each year are deliberately left out and the answer says to check the current figure.
 */
import type { Audience } from "./types";

export interface Concept {
  id: string;
  title: string;
  match: RegExp;
  text: Record<Audience, string>;
  formula?: string;
  calc?: { title: string; inputs: [string, string][]; formula: string; result: string };
  related?: string[];
  /** A Viridia place where the concept shows up with real data. */
  see?: { label: string; href: string };
}

export const CONCEPTS: Concept[] = [
  {
    id: "pe", title: "Price-to-earnings ratio (P/E)", match: /\bp\s*\/?\s*e( ratio)?\b|price[- ]to[- ]earnings/i,
    text: {
      professional: "P/E divides share price by earnings per share, usually trailing twelve months or next-twelve-month estimates. It expresses how many dollars investors pay per dollar of earnings and is only comparable across companies with similar growth, risk and accounting.",
      client: "The P/E ratio tells you how much investors are paying for each dollar a company earns. A higher number usually means investors expect more growth, or are willing to pay more for stability.",
      beginner: "If a share costs $50 and the company earned $2.50 per share last year, the P/E is 20: you pay $20 for every $1 of yearly profit.",
      technical: "P/E = Price / EPS. Forward P/E uses consensus next-twelve-month EPS; the earnings yield is its inverse (EPS / Price). Negative EPS makes the ratio meaningless, so P/S or EV/Sales is used instead.",
    },
    formula: "P/E = Share price ÷ Earnings per share",
    calc: { title: "P/E", inputs: [["Share price", "$50.00"], ["Earnings per share", "$2.50"]], formula: "$50.00 ÷ $2.50", result: "20.0×" },
    related: ["eps", "earnings_yield", "ev_ebitda"],
  },
  {
    id: "eps", title: "Earnings per share (EPS)", match: /\beps\b|earnings per share/i,
    text: {
      professional: "EPS is net income available to common shareholders divided by weighted average shares outstanding; diluted EPS includes options, RSUs and convertibles. Adjusted EPS excludes items management considers non-recurring and is not a GAAP measure.",
      client: "EPS is the company's profit divided among all its shares. It's the number most often quoted when a company reports quarterly results.",
      beginner: "If a company makes $10 million of profit and has 5 million shares, each share 'earned' $2.",
      technical: "Basic EPS = (Net income − Preferred dividends) / Weighted average common shares. Diluted EPS adds potentially dilutive securities using the treasury-stock and if-converted methods.",
    },
    formula: "EPS = (Net income − Preferred dividends) ÷ Weighted average shares",
    calc: { title: "EPS", inputs: [["Net income", "$10,000,000"], ["Preferred dividends", "$0"], ["Shares outstanding", "5,000,000"]], formula: "$10,000,000 ÷ 5,000,000", result: "$2.00" },
    related: ["pe"],
  },
  {
    id: "ev_ebitda", title: "EV/EBITDA", match: /\bev\s*\/\s*ebitda\b|enterprise value to ebitda/i,
    text: {
      professional: "EV/EBITDA compares enterprise value (equity plus net debt and other claims) with EBITDA. Because both sides are capital-structure neutral, it compares companies with different leverage better than P/E.",
      client: "This ratio compares what a whole business is worth, including its debt, with the profit it generates from operations. Lower numbers generally mean investors are paying less for each dollar of operating profit.",
      beginner: "It's like a P/E ratio for the whole company, debts included, instead of just the shares.",
      technical: "EV/EBITDA = (Market cap + Total debt + Preferred + Minority interest − Cash) / EBITDA, typically on trailing or forward twelve months.",
    },
    formula: "EV/EBITDA = Enterprise value ÷ EBITDA",
    calc: { title: "EV/EBITDA", inputs: [["Market cap", "$2,000M"], ["Debt", "$500M"], ["Cash", "$300M"], ["EBITDA", "$220M"]], formula: "($2,000M + $500M − $300M) ÷ $220M", result: "10.0×" },
    related: ["enterprise_value", "ebitda"],
  },
  {
    id: "ebitda", title: "EBITDA", match: /\bebitda\b(?!.*\bev\b)/i,
    text: {
      professional: "EBITDA is earnings before interest, taxes, depreciation and amortization: a proxy for operating cash generation before capital structure and non-cash charges. It ignores capital expenditure and working capital, so it can overstate cash flow for capital-intensive businesses.",
      client: "EBITDA is a way of measuring how much a business earns from its operations before financing costs, taxes and accounting charges for wear and tear. It's useful for comparing companies, but it isn't the same as cash in the bank.",
      beginner: "Take a company's operating profit and add back the accounting cost of its equipment wearing out. That's roughly EBITDA.",
      technical: "EBITDA = Net income + Interest + Taxes + Depreciation + Amortization (equivalently EBIT + D&A). Non-GAAP; companies define adjustments differently.",
    },
    formula: "EBITDA = EBIT + Depreciation + Amortization",
    calc: { title: "EBITDA", inputs: [["Operating income (EBIT)", "$120M"], ["Depreciation", "$30M"], ["Amortization", "$10M"]], formula: "$120M + $30M + $10M", result: "$160M" },
    related: ["ev_ebitda", "fcf"],
  },
  {
    id: "enterprise_value", title: "Enterprise value", match: /enterprise value|\bev\b(?!\s*\/)/i,
    text: {
      professional: "Enterprise value is the value of the operating business to all capital providers: equity market value plus debt, preferred and minority interests, less cash and equivalents.",
      client: "Enterprise value is roughly what it would cost to buy the whole company: its shares, plus its debts, minus the cash it already holds.",
      beginner: "If you bought a house for $300,000 that came with a $100,000 mortgage and $20,000 in a safe, the real cost is $380,000. Enterprise value works the same way.",
      technical: "EV = Market capitalization + Total debt + Preferred equity + Non-controlling interest − Cash and equivalents.",
    },
    formula: "EV = Market cap + Debt + Preferred + Minority interest − Cash",
    related: ["ev_ebitda", "market_cap"],
  },
  {
    id: "market_cap", title: "Market capitalization", match: /market cap(itali[sz]ation)?/i,
    text: {
      professional: "Market capitalization is shares outstanding multiplied by share price: the equity market's value of the company. Size categories (small, mid, large cap) use thresholds that vary by index provider.",
      client: "Market cap is the total value the stock market puts on a company's shares right now.",
      beginner: "If a company has 1 million shares and each trades at $40, its market cap is $40 million.",
      technical: "Market cap = Shares outstanding × Price. Float-adjusted market cap uses only freely tradable shares and is what most indexes weight by.",
    },
    formula: "Market cap = Shares outstanding × Share price",
    calc: { title: "Market cap", inputs: [["Shares outstanding", "1,000,000"], ["Share price", "$40.00"]], formula: "1,000,000 × $40.00", result: "$40,000,000" },
  },
  {
    id: "fcf", title: "Free cash flow", match: /free cash flow(?! yield)|\bfcf\b(?! yield)/i,
    text: {
      professional: "Free cash flow is operating cash flow less capital expenditure: the cash available to service debt, pay dividends, buy back shares or reinvest. Stock-based compensation, working-capital swings and capitalized costs can distort it.",
      client: "Free cash flow is the cash a business has left after paying to run and maintain itself. It's what the company can use to pay dividends, reduce debt or grow.",
      beginner: "Money coming in from the business, minus money spent on equipment and buildings. What's left over is free cash flow.",
      technical: "FCF = Cash flow from operations − Capital expenditures. Unlevered FCF = EBIT × (1 − tax rate) + D&A − CapEx − ΔNWC.",
    },
    formula: "Free cash flow = Operating cash flow − Capital expenditures",
    calc: { title: "Free cash flow", inputs: [["Operating cash flow", "$850M"], ["Capital expenditures", "$230M"]], formula: "$850M − $230M", result: "$620M" },
    related: ["fcf_yield", "ebitda"],
  },
  {
    id: "fcf_yield", title: "Free cash flow yield", match: /free cash flow yield|\bfcf yield\b/i,
    text: {
      professional: "FCF yield is free cash flow divided by market capitalization (equity FCF yield) or enterprise value (unlevered). It's a cash-based valuation measure, roughly the inverse of a price-to-FCF multiple.",
      client: "FCF yield shows how much free cash a company generates compared with its market value. A higher yield means you're paying less for each dollar of cash the business produces.",
      beginner: "If a company worth $10 billion produces $500 million of free cash a year, its FCF yield is 5%.",
      technical: "FCF yield = FCF / Market cap (or FCF / EV for the unlevered version).",
    },
    formula: "FCF yield = Free cash flow ÷ Market cap",
    calc: { title: "FCF yield", inputs: [["Free cash flow", "$500M"], ["Market cap", "$10,000M"]], formula: "$500M ÷ $10,000M", result: "5.0%" },
    related: ["fcf", "earnings_yield"],
  },
  {
    id: "earnings_yield", title: "Earnings yield", match: /earnings yield/i,
    text: {
      professional: "Earnings yield is EPS divided by price, the inverse of P/E. It lets equity valuation be compared with bond yields, though earnings are not distributed like coupons.",
      client: "Earnings yield flips the P/E ratio around: it shows a company's earnings as a percentage of its share price.",
      beginner: "A stock with a P/E of 20 has an earnings yield of 5% (1 ÷ 20).",
      technical: "Earnings yield = EPS / Price = 1 / (P/E).",
    },
    formula: "Earnings yield = EPS ÷ Price",
    related: ["pe"],
  },
  {
    id: "gross_margin", title: "Gross margin", match: /gross margin/i,
    text: {
      professional: "Gross margin is revenue less cost of goods sold, as a share of revenue. It reflects pricing power and production efficiency before operating expenses.",
      client: "Gross margin is the share of each sales dollar left after paying the direct cost of making the product.",
      beginner: "Sell a mug for $10 that costs $4 to make and your gross margin is 60%.",
      technical: "Gross margin = (Revenue − COGS) / Revenue.",
    },
    formula: "Gross margin = (Revenue − Cost of goods sold) ÷ Revenue",
    calc: { title: "Gross margin", inputs: [["Revenue", "$10.00"], ["Cost of goods sold", "$4.00"]], formula: "($10.00 − $4.00) ÷ $10.00", result: "60.0%" },
    related: ["operating_margin"],
  },
  {
    id: "operating_margin", title: "Operating margin", match: /operating margin|ebit margin/i,
    text: {
      professional: "Operating margin is operating income (EBIT) divided by revenue: profitability after cost of goods and operating expenses, before interest and taxes.",
      client: "Operating margin shows how much of each sales dollar a company keeps after paying for its products and running the business.",
      beginner: "If a company sells $100 of goods and has $15 left after all its normal business costs, its operating margin is 15%.",
      technical: "Operating margin = EBIT / Revenue.",
    },
    formula: "Operating margin = Operating income ÷ Revenue",
    related: ["gross_margin", "ebitda"],
  },
  {
    id: "dividend_yield", title: "Dividend yield", match: /dividend yield/i,
    text: {
      professional: "Dividend yield is annual dividends per share divided by price. It says nothing about dividend sustainability; payout ratio and free-cash-flow coverage do.",
      client: "Dividend yield is the yearly dividend as a percentage of the share price, the income part of a stock's return.",
      beginner: "A $100 stock paying $3 a year in dividends has a 3% dividend yield.",
      technical: "Dividend yield = Annual DPS / Price. Trailing uses the last twelve months; indicated uses the latest dividend annualized.",
    },
    formula: "Dividend yield = Annual dividends per share ÷ Share price",
    calc: { title: "Dividend yield", inputs: [["Annual dividend", "$3.00"], ["Share price", "$100.00"]], formula: "$3.00 ÷ $100.00", result: "3.0%" },
  },
  {
    id: "beta", title: "Beta", match: /\bbeta\b/i,
    text: {
      professional: "Beta is the slope of a security's returns regressed on a benchmark's returns: its sensitivity to market moves. It's backward-looking, depends on the window and frequency, and says nothing about idiosyncratic risk.",
      client: "Beta shows how much an investment has tended to move compared with the overall market. A beta of 1.2 means it has usually moved about 20% more than the market, up and down.",
      beginner: "If the market goes up 10% and a stock with a beta of 1.5 tends to go up about 15%, that's what beta measures.",
      technical: "β = Cov(Rᵢ, Rₘ) / Var(Rₘ), estimated here from daily returns over the past year against SPY.",
    },
    formula: "β = Covariance(asset, market) ÷ Variance(market)",
    see: { label: "See your portfolio's beta in Portfolio X-Ray", href: "/portfolio" },
    related: ["volatility", "correlation"],
  },
  {
    id: "volatility", title: "Volatility", match: /\bvolatility\b|standard deviation of returns/i,
    text: {
      professional: "Volatility is the annualized standard deviation of returns. It measures dispersion, not direction, and assumes risk is symmetric; drawdown and downside deviation complement it.",
      client: "Volatility measures how much an investment's value has swung up and down. Higher volatility means bigger swings in both directions.",
      beginner: "Two funds can both average 8% a year, but one might go up and down a lot more along the way. That bumpiness is volatility.",
      technical: "σ_annual = σ_daily × √252, with σ_daily the sample standard deviation of daily simple returns.",
    },
    formula: "Annual volatility = Daily standard deviation × √252",
    see: { label: "See risk by position in Portfolio X-Ray", href: "/portfolio#risk" },
    related: ["beta", "sharpe", "drawdown"],
  },
  {
    id: "sharpe", title: "Sharpe ratio", match: /sharpe( ratio)?/i,
    text: {
      professional: "The Sharpe ratio is excess return over the risk-free rate divided by the standard deviation of excess returns: return per unit of total volatility. It penalizes upside and downside volatility alike.",
      client: "The Sharpe ratio measures how much return an investment has earned for the ups and downs it put you through. Higher is better.",
      beginner: "If two investments both returned 10%, the one that got there with smaller swings has the higher Sharpe ratio.",
      technical: "Sharpe = (R_p − R_f) / σ(R_p − R_f), annualized as mean daily excess × 252 over daily σ × √252.",
    },
    formula: "Sharpe ratio = (Return − Risk-free rate) ÷ Volatility of excess returns",
    calc: { title: "Sharpe ratio", inputs: [["Portfolio return", "11.0%"], ["Risk-free rate", "4.0%"], ["Volatility", "14.0%"]], formula: "(11.0% − 4.0%) ÷ 14.0%", result: "0.50" },
    related: ["volatility"],
  },
  {
    id: "drawdown", title: "Maximum drawdown", match: /(max(imum)? )?drawdown/i,
    text: {
      professional: "Maximum drawdown is the largest peak-to-trough decline over a period, a path-dependent measure of loss that volatility does not capture.",
      client: "Maximum drawdown is the biggest drop from a high point to a low point an investment went through over a period.",
      beginner: "If your account grew to $120,000 and then fell to $90,000 before recovering, the drawdown was 25%.",
      technical: "MDD = min over t of (Vₜ / max_{s≤t} Vₛ − 1).",
    },
    formula: "Drawdown = Trough value ÷ Prior peak − 1",
    calc: { title: "Drawdown", inputs: [["Peak value", "$120,000"], ["Trough value", "$90,000"]], formula: "$90,000 ÷ $120,000 − 1", result: "−25.0%" },
  },
  {
    id: "correlation", title: "Correlation", match: /\bcorrelat/i,
    text: {
      professional: "Correlation is the normalized covariance of two return series, from −1 to +1. It drives diversification: the lower the correlation between holdings, the more risk offsets. Correlations tend to rise in selloffs.",
      client: "Correlation shows whether two investments tend to move together. Holdings that move together add less protection than they seem to.",
      beginner: "If two stocks nearly always rise and fall on the same days, their correlation is close to 1.",
      technical: "ρ = Cov(X, Y) / (σ_X σ_Y), estimated here from daily returns over the past year.",
    },
    formula: "ρ = Covariance(X, Y) ÷ (σX × σY)",
    see: { label: "See your correlation matrix in Portfolio X-Ray", href: "/portfolio#correlation" },
    related: ["diversification"],
  },
  {
    id: "diversification", title: "Diversification", match: /diversif/i,
    text: {
      professional: "Diversification reduces portfolio variance by combining assets whose returns are imperfectly correlated. It removes idiosyncratic risk, not market risk, and holding many correlated positions provides little of it.",
      client: "Diversification means spreading money across investments that don't all move the same way, so one setback has less effect on the whole portfolio.",
      beginner: "Don't put all your eggs in one basket, and make sure the baskets aren't all carried by the same person.",
      technical: "σ²_p = wᵀΣw; with N equally weighted assets of equal variance σ² and average correlation ρ̄, σ²_p = σ²[1/N + (1 − 1/N)ρ̄].",
    },
    see: { label: "Check independent exposures in Portfolio X-Ray", href: "/portfolio#correlation" },
    related: ["correlation"],
  },
  {
    id: "duration", title: "Duration", match: /\bduration\b/i,
    text: {
      professional: "Modified duration estimates a bond's percentage price change for a 1-point change in yield; Macaulay duration is the weighted average time to cash flows. Longer duration means greater rate sensitivity; convexity refines the estimate for larger moves.",
      client: "Duration tells you how sensitive a bond or bond fund is to interest-rate changes. The longer the duration, the more its price tends to fall when rates rise, and rise when rates fall.",
      beginner: "A bond fund with a duration of 7 would lose roughly 7% of its value if interest rates rose by one percentage point.",
      technical: "ΔP/P ≈ −D_mod × Δy + ½ × Convexity × (Δy)². D_mod = D_Mac / (1 + y/k).",
    },
    formula: "Price change ≈ −Modified duration × Change in yield",
    calc: { title: "Price change from a rate rise", inputs: [["Modified duration", "7.0"], ["Change in yield", "+1.00 percentage point"]], formula: "−7.0 × 1.00%", result: "≈ −7.0%" },
    related: ["bond_yield", "yield_curve"],
  },
  {
    id: "bond_yield", title: "Bond yields", match: /bond yields?|how do bonds work|how does a bond work|yield to maturity|\bytm\b/i,
    text: {
      professional: "Yield to maturity is the discount rate that equates a bond's price with its remaining coupon and principal payments. Price and yield move inversely; spreads over Treasuries compensate for credit and liquidity risk.",
      client: "A bond's yield is the return you'd earn if you bought it at today's price and held it to maturity. When yields go up, existing bonds' prices go down, and the reverse.",
      beginner: "You lend money to a government or company, they pay you interest, and you get the money back at the end. The yield is your yearly return at the price you paid.",
      technical: "P = Σ C/(1+y)ᵗ + F/(1+y)ⁿ, solved for y. Current yield = annual coupon / price.",
    },
    formula: "Price = Σ Coupon ÷ (1 + y)ᵗ + Face ÷ (1 + y)ⁿ",
    calc: { title: "Current yield", inputs: [["Annual coupon", "$50"], ["Bond price", "$950"]], formula: "$50 ÷ $950", result: "5.26%" },
    related: ["duration", "yield_curve"],
  },
  {
    id: "yield_curve", title: "Yield curve (and inversion)", match: /yield curve|inverted curve|curve inversion|inverted yield/i,
    text: {
      professional: "The yield curve plots Treasury yields across maturities. Normally it slopes upward; an inversion, with short rates above long rates (often measured by 2s10s or 3m10y), has preceded most U.S. recessions, though timing is highly variable and it has given false signals.",
      client: "The yield curve compares interest rates on short-term and long-term government bonds. Usually longer bonds pay more. When short-term rates are higher, the curve is 'inverted', which has historically often come before economic slowdowns, but not on a reliable timetable.",
      beginner: "Normally, lending money for 10 years earns more interest than lending for 2 years. When that flips, people call the yield curve inverted.",
      technical: "Slope measures: 10y − 2y and 10y − 3m yields. Inversion: spread < 0. Expectations hypothesis: long rates ≈ average expected short rates + term premium.",
    },
    related: ["bond_yield", "fed_funds"],
    see: { label: "Viridia shows Treasury ETF proxies (SHY, IEF, TLT) on Mission Control; it doesn't hold yield data yet", href: "/terminal" },
  },
  {
    id: "fed_funds", title: "Federal funds rate", match: /fed funds|federal funds|the fed\b|fomc/i,
    text: {
      professional: "The federal funds rate is the overnight rate banks charge each other for reserves; the FOMC sets a target range and steers it with interest on reserves and the overnight reverse repo facility. It anchors the short end of the curve.",
      client: "The fed funds rate is the short-term interest rate the Federal Reserve targets. Changes to it ripple through to savings rates, loan rates and markets.",
      beginner: "It's the Fed's main dial for making borrowing cheaper or more expensive across the economy.",
      technical: "Implemented through the interest on reserve balances (IORB) rate and ON RRP rate as the ceiling and floor of the target range.",
    },
    related: ["yield_curve", "inflation"],
  },
  {
    id: "inflation", title: "Inflation (CPI)", match: /\binflation\b|\bcpi\b|consumer price index/i,
    text: {
      professional: "Inflation is the rate of increase in the general price level, commonly measured by CPI or the Fed's preferred PCE price index; core measures exclude food and energy. Real returns are nominal returns less inflation.",
      client: "Inflation is how fast prices are rising. It matters because it erodes what your money can buy, so returns are best judged after inflation.",
      beginner: "If a sandwich cost $10 last year and $10.30 this year, sandwich inflation was 3%.",
      technical: "Inflation = CPIₜ / CPIₜ₋₁₂ − 1 (year over year). Real return ≈ (1 + nominal) / (1 + inflation) − 1.",
    },
    formula: "Real return ≈ (1 + Nominal return) ÷ (1 + Inflation) − 1",
    related: ["fed_funds"],
  },
  {
    id: "roth_ira", title: "Roth IRA", match: /roth ira|\broth\b(?! conversion)/i,
    text: {
      professional: "A Roth IRA is funded with after-tax dollars; qualified withdrawals of contributions and earnings are tax-free, and there are no lifetime required minimum distributions for the original owner. Direct contributions are subject to income limits and annual contribution limits that the IRS adjusts, so check the current figures.",
      client: "A Roth IRA is a retirement account you pay into with money you've already paid tax on. In return, qualified withdrawals in retirement, including growth, are tax-free.",
      beginner: "Pay tax now, not later: money grows inside the account, and if you follow the rules you won't owe tax when you take it out in retirement.",
      technical: "Qualified distributions require age 59½ (or another qualifying event) and the five-year rule. Contributions (not earnings) can be withdrawn at any time without tax or penalty.",
    },
    related: ["roth_conversion", "traditional_ira"],
  },
  {
    id: "roth_conversion", title: "Roth conversion", match: /roth conversion|convert(ing)? to (a )?roth/i,
    text: {
      professional: "A Roth conversion moves pre-tax retirement assets (traditional IRA or eligible plan money) into a Roth, with the converted amount taxed as ordinary income that year. It can make sense when the current marginal rate is below the expected future rate; it affects the tax bracket, IRMAA and other income-linked items, and each conversion has its own five-year clock for penalty purposes.",
      client: "A Roth conversion means paying income tax now on money in a traditional retirement account so that it, and its future growth, can come out tax-free later. Whether it helps depends on your tax rate today versus what you expect in retirement.",
      beginner: "You move money from a 'pay tax later' account to a 'pay tax now' account and pay the tax this year to avoid tax later.",
      technical: "Tax cost = converted amount × marginal rate(s) spanned. Break-even compares that cost with the tax avoided on future withdrawals, given growth and future rates. Recharacterization of conversions is no longer allowed.",
    },
    related: ["roth_ira", "traditional_ira"],
  },
  {
    id: "traditional_ira", title: "Traditional IRA", match: /traditional ira|\bira\b(?!.*roth)/i,
    text: {
      professional: "A traditional IRA allows tax-deferred growth; contributions may be deductible depending on income and workplace plan coverage, and withdrawals are taxed as ordinary income, with required minimum distributions starting at the applicable age. Limits change annually.",
      client: "A traditional IRA lets your savings grow without yearly taxes; you generally pay tax when you take money out in retirement.",
      beginner: "Pay tax later: you may get a tax break now, and you pay tax when you withdraw.",
      technical: "Early withdrawals before 59½ generally incur a 10% additional tax unless an exception applies.",
    },
    related: ["roth_ira", "rmd"],
  },
  {
    id: "rmd", title: "Required minimum distributions", match: /\brmds?\b|required minimum distribution/i,
    text: {
      professional: "RMDs are annual withdrawals required from tax-deferred retirement accounts once the owner reaches the applicable age, calculated from the prior year-end balance and the IRS life-expectancy table. The starting age has changed under recent legislation, so confirm the current rule.",
      client: "Once you reach a certain age, the IRS requires you to take a minimum amount out of most tax-deferred retirement accounts each year and pay tax on it.",
      beginner: "The government eventually wants its tax, so it makes you start withdrawing from these accounts.",
      technical: "RMD = Prior December 31 balance ÷ Distribution period from the Uniform Lifetime Table (or Joint Life table where applicable).",
    },
    formula: "RMD = Prior year-end balance ÷ IRS distribution period",
    related: ["traditional_ira"],
  },
  {
    id: "k401", title: "401(k)", match: /\b401\s*\(?k\)?/i,
    text: {
      professional: "A 401(k) is an employer-sponsored defined-contribution plan with pre-tax and, where offered, Roth deferrals, often with an employer match subject to a vesting schedule. Contribution limits are set annually by the IRS.",
      client: "A 401(k) is a retirement plan through your employer. You save from each paycheck, often with a matching contribution from the company.",
      beginner: "A workplace retirement account where money comes out of your paycheck before you see it, sometimes with free money added by your employer.",
      technical: "Employee deferral, catch-up and total annual addition limits are indexed; check the current year's figures.",
    },
    related: ["traditional_ira", "roth_ira"],
  },
  {
    id: "exchange_1031", title: "1031 exchange", match: /\b1031\b|like[- ]kind exchange/i,
    text: {
      professional: "A Section 1031 like-kind exchange defers capital gains tax when investment or business real property is exchanged for other like-kind real property, with strict identification (45 days) and closing (180 days) deadlines and a qualified intermediary holding proceeds. Since 2018 it applies only to real property.",
      client: "A 1031 exchange lets a real estate investor sell one investment property and buy another without paying capital gains tax right away, as long as strict rules and deadlines are followed.",
      beginner: "Swap one rental property for another and put off the tax bill, if you follow the rules exactly.",
      technical: "Replacement property must be identified within 45 days and acquired within 180 days of the sale; boot (cash or debt relief) received is taxable.",
    },
  },
  {
    id: "tax_loss_harvesting", title: "Tax-loss harvesting", match: /tax[- ]loss harvest/i,
    text: {
      professional: "Tax-loss harvesting realizes losses to offset realized gains and, beyond that, a limited amount of ordinary income per year, with the remainder carried forward. The wash-sale rule disallows the loss if a substantially identical security is bought within 30 days before or after the sale.",
      client: "Tax-loss harvesting means selling an investment that's down to use the loss to reduce taxes on gains, while staying invested in something similar but not identical.",
      beginner: "Turn a losing investment into a tax break, then keep your money invested.",
      technical: "Net short-term and long-term gains and losses separately, then against each other; disallowed wash-sale losses are added to the basis of the replacement shares.",
    },
    see: { label: "See unrealized losses by lot in Portfolio X-Ray", href: "/portfolio#tax" },
    related: ["wash_sale", "capital_gains"],
  },
  {
    id: "wash_sale", title: "Wash-sale rule", match: /wash[- ]sale/i,
    text: {
      professional: "The wash-sale rule disallows a loss on a security sale if a substantially identical security is acquired within 30 days before or after the sale (including in IRAs and a spouse's accounts); the disallowed loss is added to the replacement's basis.",
      client: "If you sell an investment at a loss and buy the same or a nearly identical one within 30 days before or after, the IRS doesn't let you claim that loss yet.",
      beginner: "You can't sell at a loss for the tax break and buy the same thing right back.",
      technical: "61-day window centered on the sale date; holding period of the replacement includes that of the sold shares.",
    },
    related: ["tax_loss_harvesting"],
  },
  {
    id: "capital_gains", title: "Short- and long-term capital gains", match: /capital gains?|long[- ]term gain|short[- ]term gain|holding period/i,
    text: {
      professional: "Gains on assets held more than one year are long-term and taxed at preferential rates; gains on assets held one year or less are short-term and taxed as ordinary income. The holding period starts the day after acquisition.",
      client: "If you sell an investment you've held for more than a year, the gain is usually taxed at a lower rate than if you'd held it for a year or less.",
      beginner: "Hold longer than a year and the tax on your profit is usually lower.",
      technical: "Holding period > 1 year → long-term. Net investment income tax may also apply above income thresholds.",
    },
    see: { label: "See short- and long-term lots in Portfolio X-Ray", href: "/portfolio#tax" },
    related: ["tax_loss_harvesting"],
  },
  {
    id: "dca", title: "Dollar-cost averaging", match: /dollar[- ]cost averag|\bdca\b/i,
    text: {
      professional: "Dollar-cost averaging invests fixed amounts at regular intervals regardless of price. It lowers the average cost per share versus the average price and reduces timing regret, though with rising markets a lump sum has historically tended to do better on average.",
      client: "Dollar-cost averaging means investing the same amount on a regular schedule, so you automatically buy more shares when prices are low and fewer when they're high.",
      beginner: "Put $500 in every month no matter what the market's doing.",
      technical: "Average cost = Total invested / Total shares = harmonic mean of purchase prices (for equal dollar amounts).",
    },
    calc: { title: "Average cost from three equal purchases", inputs: [["$300 at", "$10 (30 shares)"], ["$300 at", "$15 (20 shares)"], ["$300 at", "$12 (25 shares)"]], formula: "$900 ÷ 75 shares", result: "$12.00 per share" },
  },
  {
    id: "etf", title: "ETFs and index funds", match: /\betfs?\b|index funds?|exchange[- ]traded fund/i,
    text: {
      professional: "ETFs are pooled vehicles that trade intraday on exchanges, with creation/redemption by authorized participants keeping prices near NAV and usually making them more tax-efficient than mutual funds. Index funds track a rules-based benchmark; costs, tracking difference and liquidity separate otherwise similar funds.",
      client: "An ETF is a basket of investments you can buy or sell like a single stock. Index ETFs simply track a market index, usually at low cost.",
      beginner: "Instead of buying 500 companies one by one, you buy one fund that owns all of them.",
      technical: "Tracking difference = fund return − index return; tracking error = its standard deviation.",
    },
    related: ["expense_ratio"],
  },
  {
    id: "expense_ratio", title: "Expense ratio", match: /expense ratio/i,
    text: {
      professional: "The expense ratio is a fund's annual operating costs as a share of assets, deducted from NAV. Over long horizons it compounds into a meaningful return difference.",
      client: "The expense ratio is the yearly fee a fund charges, as a percentage of what you have invested. It's taken out automatically.",
      beginner: "A 0.10% expense ratio costs $10 a year for every $10,000 invested.",
      technical: "Net return ≈ Gross return − Expense ratio.",
    },
    calc: { title: "Annual fee", inputs: [["Amount invested", "$10,000"], ["Expense ratio", "0.10%"]], formula: "$10,000 × 0.10%", result: "$10 per year" },
  },
  {
    id: "asset_allocation", title: "Asset allocation and rebalancing", match: /asset allocation|rebalanc|60\s*\/\s*40/i,
    text: {
      professional: "Asset allocation sets the mix of asset classes and drives most of a diversified portfolio's risk. Rebalancing restores target weights on a calendar or tolerance-band basis; it controls drift at the cost of turnover and potential taxes.",
      client: "Asset allocation is how your money is divided between stocks, bonds and cash. Rebalancing brings that mix back to plan after markets move it.",
      beginner: "Decide how much goes into stocks versus bonds, and every so often put it back to that split.",
      technical: "Drift = current weight − target; a common rule rebalances when any drift exceeds a set band (e.g. 3–5 percentage points).",
    },
    see: { label: "Compare current and target weights in Portfolio X-Ray", href: "/portfolio#holdings" },
  },
  {
    id: "elliott_wave", title: "Elliott Wave Principle", match: /elliott wave|wave (principle|theory)|\bwave count/i,
    text: {
      professional: "The Elliott Wave Principle describes market prices as moving in a five-wave motive pattern with the trend and three-wave corrections against it, nested across degrees. Viridia applies its hard rules strictly (wave 2 never retraces all of wave 1; wave 3 is never the shortest; wave 4 doesn't overlap wave 1 in an impulse) and ranks the valid counts.",
      client: "Elliott Wave is a way of describing how markets tend to move in recognizable patterns of advances and pullbacks. Viridia uses it to map where a price trend may stand and what would prove that reading wrong.",
      beginner: "Markets often move in five steps forward and three steps back. Elliott Wave gives those steps names and rules.",
      technical: "Motive: 1-2-3-4-5 (impulse or diagonal). Corrective: A-B-C (zigzag 5-3-5, flat 3-3-5) and A-B-C-D-E (triangle). Degrees nest: each wave subdivides at the next lower degree.",
    },
    see: { label: "Read the rulebook", href: "/analysis/rulebook" },
    related: ["fibonacci", "invalidation"],
  },
  {
    id: "fibonacci", title: "Fibonacci retracements and confluence", match: /fibonacci|\bfib\b|confluence zone|retracement/i,
    text: {
      professional: "Fibonacci retracements and extensions (0.382, 0.5, 0.618, 1.618 and so on) measure waves against each other. Viridia anchors them to the active wave count and marks a confluence zone where several independent relationships overlap; zones are areas of interest, not predicted turning points.",
      client: "Fibonacci ratios are mathematical proportions traders use to measure price moves. Viridia highlights price areas where several of these measurements line up, as levels worth watching.",
      beginner: "After a big move, prices often pull back by about a third to two-thirds before continuing. Fibonacci ratios describe those proportions.",
      technical: "Retracement level = End − r × (End − Start); extension = Start₂ + e × (End₁ − Start₁). Zones merge levels within a price tolerance and weight primary ratios and higher degrees more.",
    },
    calc: { title: "61.8% retracement", inputs: [["Move start", "$100.00"], ["Move end", "$150.00"], ["Ratio", "0.618"]], formula: "$150.00 − 0.618 × ($150.00 − $100.00)", result: "$119.10" },
    see: { label: "See Fibonacci zones across the market", href: "/analysis/fibonacci" },
    related: ["elliott_wave"],
  },
  {
    id: "invalidation", title: "Invalidation level", match: /invalidation( level)?\b(?!.*\b[A-Z]{2,5}\b)/,
    text: {
      professional: "An invalidation level is the price at which a wave count breaks one of its hard rules and must be discarded. It defines where an interpretation stops being true, which is what makes a structural scenario testable.",
      client: "An invalidation level is the price where Viridia's current reading of the chart would be proven wrong.",
      beginner: "It's the line in the sand: if price crosses it, that particular story about the chart is off the table.",
      technical: "Impulse examples: a close below the wave 1 origin invalidates a wave 2 in progress; wave 4 entering wave 1's territory invalidates an impulse (diagonals excepted).",
    },
    related: ["elliott_wave"],
  },
];

export function findConcept(q: string): Concept | null {
  return CONCEPTS.find((c) => c.match.test(q)) ?? null;
}

// Hard fixed US dollar pegs, used by fx.ts as an exact leg of the USD bridge.
//
// The World Bank annual average (PA.NUS.FCRF) for a pegged currency is only
// approximately its legal parity, because of reporting and floating-point
// noise. Where an issuing authority publishes a hard parity against the US
// dollar, the parity itself is the rate, so fx.ts uses it and cites it.
//
// House rules for this table:
//   - A row enters ONLY with a source that was opened and read, on the issuing
//     authority's own site where one exists, and that states the rate.
//   - The parity is kept exactly as the source prints it, as two numbers (local
//     units and US dollars), never rounded or inverted. The rate is derived
//     from those two numbers at the point of use.
//   - Bands, crawling pegs and managed rates are excluded. HKD (a 7.75 to 7.85
//     convertibility band) stays on the World Bank rail for that reason.
//   - ANG stays on the World Bank rail. The Netherlands Antilles guilder is
//     being replaced by the Caribbean guilder (XCG), so a parity for ANG would
//     describe a currency in the middle of being withdrawn.
//   - BHD stays on the World Bank rail. Read 2026-11-22, the Central Bank of
//     Bahrain states its parity two ways. Its rate table cites Decree 48 of
//     2001, "1 BHD= 2.659 USD", and lists USD at 0.376081, which is 1 / 2.659.
//     Its monetary policy page says "Bahrain maintains an exchange rate peg at
//     0.376 Bahraini dinars to the US dollar", and its FX swap facility quotes
//     spot BHD/USD at 0.37600. 0.376 and 0.376081 differ in the fifth
//     significant figure, so the bank's own figures do not settle which is the
//     exact rate.
//   - AED stays on the World Bank rail until a Central Bank of the UAE page
//     stating the parity is opened and read. Searches on 2026-11-22 found only
//     VAT reference tables and an annual report PDF that could not be read.
//     Read 2026-11-27, the bank's page "How the monetary system works" gives
//     dealing rates of 3.672 and 3.673 and no start date. Two dealing rates
//     are not one stated parity, so that page does not qualify either.
//
// effectiveFrom is the earliest date on which the cited source establishes
// that the parity was in force. Where the source names a day, it is that day.
// Where it names only a month or a year, it is the first day after that
// period, because a day inside the period may fall before the fixing. Where
// it names no start at all, it is the earliest date the document itself
// covers, and effectiveFromAsPublished is null. The peg itself may then be
// older than effectiveFrom, but StatCite has no source for the earlier years.
//
// Rule for applying a peg (pegDecision below):
//   - No date requested: the peg applies.
//   - A YYYY-MM-DD date: the peg applies if that date is on or after
//     effectiveFrom and not after today's UTC date.
//   - A YYYY year: the peg applies only if it was in force for that whole
//     year, so 1 January of that year must be on or after effectiveFrom, and
//     the year must be before the current UTC year. The current year is not
//     yet whole, so it does not use the peg.
//   - A future date or year never uses the peg. The sources show the peg in
//     force only up to the day they were read, and a later change of parity is
//     possible.
// When the peg does not apply, fx.ts falls back to the World Bank annual
// average and says so in a note. For a future period the World Bank usually
// has no data, so that request fails. The error opens with the peg's reason
// for not applying, then gives the World Bank's own error, and its details
// carry peg_not_applied.

export interface UsdPeg {
  /** ISO 4217 code. */
  currency: string;
  /** Local currency units in the published parity, as printed. */
  lcu: number;
  /** US dollars in the published parity, as printed. */
  usd: number;
  /** The parity in the source's own notation. */
  parityAsPublished: string;
  /** YYYY-MM-DD. See the header for how it is derived. */
  effectiveFrom: string;
  /** The start of the peg as the source gives it, phrased to follow "in force
   * since". null when the source gives no start date. */
  effectiveFromAsPublished: string | null;
  /** The issuing authority that publishes the parity. */
  authority: string;
  /** The title of the page or document cited. */
  sourceTitle: string;
  sourceUrl: string;
  /** YYYY-MM-DD on which the source was opened and read for this row. */
  sourceRead: string;
}

export const USD_PEGS: readonly UsdPeg[] = [
  {
    // Read 2026-11-15. "...fixed to the US dollar at a rate of USD1.00 to
    // BBD2.00." The page is dated 5 July 2016 and says "it was on this day in
    // 1975" that the change was announced.
    currency: "BBD",
    lcu: 2.0,
    usd: 1.0,
    parityAsPublished: "USD1.00 to BBD2.00",
    effectiveFrom: "1975-07-05",
    effectiveFromAsPublished: "5 July 1975",
    authority: "Central Bank of Barbados",
    sourceTitle: "Fixed for Forty-One Years, press release of 5 July 2016",
    sourceUrl: "https://www.centralbank.org.bb/news/general-press-release/fixed-for-forty-one-years",
    sourceRead: "2026-11-15",
  },
  {
    // Read 2026-11-15. "On 7 July 1976 ... the governments of the Eastern
    // Caribbean Currency Union fixed the value of the Eastern Caribbean dollar
    // at EC$2.70 to US$1.00".
    currency: "XCD",
    lcu: 2.7,
    usd: 1.0,
    parityAsPublished: "EC$2.70 to US$1.00",
    effectiveFrom: "1976-07-07",
    effectiveFromAsPublished: "7 July 1976",
    authority: "Eastern Caribbean Central Bank",
    sourceTitle: "50 Years of the EC Dollar's Peg",
    sourceUrl: "https://www.eccb-centralbank.org/50-years-of-the-ec-dollar-s-peg",
    sourceRead: "2026-11-15",
  },
  {
    // Read 2026-11-15. "Since May 1976, Belize has maintained a fixed exchange
    // rate of BZ$2.00 to US$1.00." The source names the month only.
    currency: "BZD",
    lcu: 2.0,
    usd: 1.0,
    parityAsPublished: "BZ$2.00 to US$1.00",
    effectiveFrom: "1976-06-01",
    effectiveFromAsPublished: "May 1976",
    authority: "Central Bank of Belize",
    sourceTitle: "Monetary Policy",
    sourceUrl: "https://www.centralbank.org.bz/home/core-functions/monetary-policy",
    sourceRead: "2026-11-15",
  },
  {
    // Read 2026-11-15. The bank "started its operations on January 1, 1986"
    // and "the Aruban florin was brought into circulation, pegged to the U.S.
    // dollar at a rate of Afl. 1.79 = US$ 1.00. This exchange rate has remained
    // unchanged since then."
    currency: "AWG",
    lcu: 1.79,
    usd: 1.0,
    parityAsPublished: "Afl. 1.79 = US$ 1.00",
    effectiveFrom: "1986-01-01",
    effectiveFromAsPublished: "January 1, 1986",
    authority: "Centrale Bank van Aruba",
    sourceTitle: "A brief history",
    sourceUrl: "https://www.cbaruba.org/about-us-a-brief-history-of-the-bank/",
    sourceRead: "2026-11-15",
  },
  {
    // Read 2026-11-15. "On 31 July 1972, the Bermuda dollar exchange was fixed
    // on par with the United States dollar". Page dated 20 February 2019.
    currency: "BMD",
    lcu: 1.0,
    usd: 1.0,
    parityAsPublished: "on par with the United States dollar",
    effectiveFrom: "1972-07-31",
    effectiveFromAsPublished: "31 July 1972",
    authority: "Bermuda Monetary Authority",
    sourceTitle: "Bermuda Monetary Authority Celebrating 50 Years",
    sourceUrl:
      "https://www.bma.bm/documents-centre/documents-news-and-press-releases/general-all-sectors/bermuda-monetary-authority-celebrating-50-years",
    sourceRead: "2026-11-15",
  },
  {
    // Read 2026-11-27. The bank's 40th anniversary newspaper supplement, dated
    // 10 June 2014 and linked from its news page of 20 June 2019, has a table
    // "A Chronology of Currency Developments in The Bahamas" whose 1973 row
    // reads "Devaluation of Bahamian Dollar to B$1 = US$1." (read from the
    // rendered page 7). Page 6 of the same document speaks of "the fixed
    // parity between The Bahamian and United States dollars that has
    // prevailed since 1973". The source names the year only. The bank's web
    // chronology dates the devaluation to February 1973 but does not restate
    // the rate there, so this row cites the supplement.
    currency: "BSD",
    lcu: 1.0,
    usd: 1.0,
    parityAsPublished: "B$1 = US$1",
    effectiveFrom: "1974-01-01",
    effectiveFromAsPublished: "1973",
    authority: "Central Bank of The Bahamas",
    sourceTitle: "40th Anniversary Newspaper Supplement, 10 June 2014",
    sourceUrl:
      "https://cdn.centralbankbahamas.com/tenantcbob_prod/assets/documents/2019-06-20-05-41-37-CBOBs-40th-Anniversary-Newspaper-Supplement-3-1776210645-o8XX3l.pdf",
    sourceRead: "2026-11-27",
  },
  {
    // Read 2026-11-15. "Cayman Islands currency is issued on demand only
    // against United States currency at the rate of one Cayman Islands dollar
    // per 1.20 US dollars." The report gives no start date, so effectiveFrom is
    // the first day of the financial year it covers (1 July 2011 to 30 June
    // 2012). Earlier periods stay on the World Bank rail. Read 2026-11-27, the
    // Monetary Authority Law (2020 Revision), section 22, leaves the value of
    // the Cayman dollar to an Order of the Cabinet, and section 53 keeps the
    // Cayman Islands Currency Order, 1974 in force. The text of that Order was
    // not found on legislation.gov.ky or cima.ky, and CIMA's currency pages
    // give no start date, so the start stays where it is.
    currency: "KYD",
    lcu: 1.0,
    usd: 1.2,
    parityAsPublished: "one Cayman Islands dollar per 1.20 US dollars",
    effectiveFrom: "2011-07-01",
    effectiveFromAsPublished: null,
    authority: "Cayman Islands Monetary Authority",
    sourceTitle: "Annual Report 2011-12",
    sourceUrl: "https://www.cima.ky/upimages/publicationdoc/AnnualReportandAu_1499163437.pdf",
    sourceRead: "2026-11-15",
  },
  {
    // Read 2026-11-22. A paper by the Governor, published on SAMA's site:
    // "Riyal has remained fixed to the American Dollar, which is the
    // intervention currency, at Rls 3.75 per U.S. Dollar, since 1986." The
    // source names the year only. SAMA's statement of 4 May 2020 ("the official
    // rate of 3.75 riyals to the dollar", news-557) confirms the same rate
    // later but gives no start, so this row cites the paper.
    currency: "SAR",
    lcu: 3.75,
    usd: 1.0,
    parityAsPublished: "Rls 3.75 per U.S. Dollar",
    effectiveFrom: "1987-01-01",
    effectiveFromAsPublished: "1986",
    authority: "Saudi Central Bank",
    sourceTitle: "Monetary and Banking Developments in the Kingdom of Saudi Arabia, a paper by the Governor for the Symposium on the Saudi Economy, September 2003",
    sourceUrl: "https://www.sama.gov.sa/en-US/MediaCenter/News/Pages/News20031004.aspx",
    sourceRead: "2026-11-22",
  },
  {
    // Read 2026-11-22. "a fixed parity between the Qatari riyal (QR) and the
    // United States dollar (USD) at QR 3.64 per USD", "officially authorized by
    // Amiri Decree No. 34 of 2001 issued in July". The page's table reads "From
    // July 2001 till date". The source names the month only.
    currency: "QAR",
    lcu: 3.64,
    usd: 1.0,
    parityAsPublished: "QR 3.64 per USD",
    effectiveFrom: "2001-08-01",
    effectiveFromAsPublished: "July 2001",
    authority: "Qatar Central Bank",
    sourceTitle: "Monetary Policy Tools",
    sourceUrl: "https://www.qcb.gov.qa/en/Pages/MonetaryPolicyTools.aspx",
    sourceRead: "2026-11-22",
  },
  {
    // Read 2026-11-22. "Since the last change in parity in 1986, the fixed peg
    // has remained unchanged at USD 2.6008 per RO." The source names the year
    // only. The parity is printed in US dollars per rial and is kept that way.
    currency: "OMR",
    lcu: 1.0,
    usd: 2.6008,
    parityAsPublished: "USD 2.6008 per RO",
    effectiveFrom: "1987-01-01",
    effectiveFromAsPublished: "1986",
    authority: "Central Bank of Oman",
    sourceTitle: "The Fixed Peg of the RO to the US Dollar",
    sourceUrl: "https://cbo.gov.om/Pages/FixedPeg.aspx",
    sourceRead: "2026-11-22",
  },
];

const BY_CODE = new Map(USD_PEGS.map((p) => [p.currency, p]));

/** The peg row for a currency, or undefined when it has none. */
export function usdPeg(currency: string): UsdPeg | undefined {
  return BY_CODE.get(currency);
}

/** Local currency units per US dollar, derived from the published parity. */
export function lcuPerUsd(p: UsdPeg): number {
  return p.lcu / p.usd;
}

/**
 * When the peg holds from, in words for a note or a citation. A row whose
 * source states a start says "in force since" that start. A row whose source
 * states none says the source confirms the peg only from effectiveFrom, that
 * the peg itself may be older, and that earlier dates use the World Bank rate.
 */
export function pegSinceText(p: UsdPeg): string {
  return p.effectiveFromAsPublished
    ? `in force since ${p.effectiveFromAsPublished}`
    : `confirmed by the cited source only from ${p.effectiveFrom}. The source gives no start date, so the peg itself may be older, and earlier dates use the World Bank rate`;
}

export type PegDecision =
  | { peg: UsdPeg; applies: true }
  | { peg: UsdPeg; applies: false; why: "before" | "future"; reason: string };

/**
 * Whether a currency's peg applies to the requested date. Undefined when the
 * currency has no peg. `todayUtc` is the current UTC date as YYYY-MM-DD, passed
 * in so tests can fix the clock. The rule is written out in the header.
 */
export function pegDecision(currency: string, date: string | undefined, todayUtc: string): PegDecision | undefined {
  const peg = usdPeg(currency);
  if (!peg) return undefined;
  if (!date) return { peg, applies: true };
  const yearOnly = date.length === 4;
  const future = yearOnly ? date >= todayUtc.slice(0, 4) : date > todayUtc;
  if (future) {
    const when = yearOnly && date === todayUtc.slice(0, 4)
      ? `${date} is the current year and not yet complete (today is ${todayUtc})`
      : `${date} is after today's date, ${todayUtc}`;
    return {
      peg,
      applies: false,
      why: "future",
      reason: `${currency} is fixed to the US dollar at ${peg.parityAsPublished} by the ${peg.authority}, but ${when}. The source shows the peg in force only up to the day it was read, so the peg is not applied to a period that has not yet ended. Tried the World Bank annual-average official rate for this leg instead.`,
    };
  }
  const inForce = yearOnly ? `${date}-01-01` >= peg.effectiveFrom : date >= peg.effectiveFrom;
  if (inForce) return { peg, applies: true };
  return {
    peg,
    applies: false,
    why: "before",
    reason: `${currency} is fixed to the US dollar at ${peg.parityAsPublished} by the ${peg.authority}, ${pegSinceText(peg)}. So the peg is not applied to ${yearOnly ? `the whole of ${date}` : date}. Used the World Bank annual-average official rate for this leg instead.`,
  };
}

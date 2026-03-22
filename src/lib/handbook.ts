export type HandbookChunk = {
  id: string;
  section: string;
  content: string;
};

/**
 * Fictional handbook snippets for demo / webinar use only.
 */
export const HANDBOOK_CHUNKS: HandbookChunk[] = [
  {
    id: "pto-accrual",
    section: "PTO — Accrual",
    content:
      "Full-time employees accrue 18 PTO days per calendar year, prorated in their hire year. " +
      "PTO accrues monthly (1.5 days per month) and is available after the probation period ends (typically 60 days).",
  },
  {
    id: "pto-carryover",
    section: "PTO — Carryover",
    content:
      "Up to 5 unused PTO days may roll over into the next calendar year. Rolled days must be used by March 31; " +
      "otherwise they are forfeited. Exceptions require written approval from HRBP.",
  },
  {
    id: "parental-leave",
    section: "Parental leave",
    content:
      "Eligible employees may take up to 12 weeks of parental leave for birth, adoption, or foster placement. " +
      "Job protection follows regional policy; pay during leave may combine company top-up and statutory benefits. " +
      "Requests should be submitted at least 30 days in advance when possible.",
  },
  {
    id: "sick-vs-pto",
    section: "Sick time vs PTO",
    content:
      "Sick time is separate from PTO and is intended for illness, medical appointments, and caregiver needs. " +
      "Do not use PTO to disguise extended sick absences—contact HR for medical leave coordination.",
  },
  {
    id: "approval",
    section: "Time off — Approvals",
    content:
      "Managers should approve or decline requests within 2 business days. Peak blackout periods (year-end freeze) " +
      "may apply; employees should plan around published team calendars.",
  },
  {
    id: "holidays",
    section: "Company holidays",
    content:
      "The company observes 10 standard holidays each year (published on the intranet). Holidays do not count against PTO balances.",
  },
];

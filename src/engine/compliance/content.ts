/** Compliance copy and verified Alberta resources (verified via web on 2026-10-25; re-check periodically). */
export const MIN_AGE = 18;
export const AGE_KEY = 'freecasino.age-confirmed.v1';

/** Must appear verbatim in the persistent footer. */
export const FOOTER_TEXT =
  'Free-to-play. Play chips have no cash value and cannot be purchased or redeemed. Simulated gambling does not guarantee real-money success.';

export const AGE_NOTICE = `This is a free-to-play game for adults. In Alberta the legal gambling age is ${MIN_AGE}. You must be ${MIN_AGE} or older to enter.`;

export interface HelpResource {
  name: string;
  description: string;
  phone?: string;
  tel?: string;
  url: string;
}

export const HELP_RESOURCES: readonly HelpResource[] = [
  {
    name: 'Alberta Health Services Addiction Helpline',
    description: 'Free, confidential, 24/7 support for addiction concerns including problem gambling.',
    phone: '1-866-332-2322',
    tel: '+18663322322',
    url: 'https://www.albertahealthservices.ca/findhealth/Service.aspx?serviceAtFacilityId=1047128',
  },
  {
    name: 'Health Link 811',
    description: 'Dial 811 anywhere in Alberta for health advice and referrals.',
    phone: '811',
    tel: '811',
    url: 'https://myhealth.alberta.ca/alberta/Pages/Find-help-for-drug-or-gambling-problem.aspx',
  },
  {
    name: '211 Alberta',
    description: 'Free, confidential community support by phone, text or chat.',
    phone: '211',
    tel: '211',
    url: 'https://ab.211.ca',
  },
  {
    name: 'GameSense (AGLC) Info Line',
    description: 'Information on gambling tools and limits. Check the site for current hours.',
    phone: '1-833-447-7523',
    tel: '+18334477523',
    url: 'https://gamesenseab.ca',
  },
  {
    name: 'AGLC Self-Exclusion Program',
    description: 'Voluntary self-exclusion from regulated gambling in Alberta.',
    url: 'https://aglc.ca/self-exclusion',
  },
];

export const PLAY_CHIP_DISCLAIMERS: readonly string[] = [
  'Play chips are fake and have no cash value.',
  'Chips cannot be purchased, sold, withdrawn, transferred or redeemed for anything.',
  'There are no deposits, withdrawals, prizes or real-money play in this app.',
  'Results shown here do not predict real-money results. Real games have different odds and real losses.',
];

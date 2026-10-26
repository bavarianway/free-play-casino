# Legal notes (not legal advice)

These are engineering notes to flag issues for a lawyer. They are **not legal advice**. Get advice from a lawyer experienced in gaming law in Alberta/Canada before any launch.

## Scope: stay free-play and social

* This project is a **free-to-play, play-money** product. Chips are never sold, never redeemable, never transferable.
* No deposits, withdrawals, payment processors, crypto, prizes, cash-outs, "sweepstakes" currencies or any other route from play to real value.
* The line between social gaming and gambling in Canada turns largely on whether anything of value can be paid in and won out. Adding **any**
  purchasable chips, rewards with value, or referral/cash incentives could change the legal analysis. Do not add them without legal advice.
  `tests/architecture.test.ts` guards against obvious payment/withdrawal code creeping in, but it is not a substitute for review.

## If a real-money version is ever considered

* Alberta regulates gaming through the **Alberta Gaming, Liquor and Cannabis Commission (AGLC)**. Alberta's regulated online offering is run through
  **iGaming Alberta** under the province's iGaming framework (check the current status of the *Alberta iGaming Act* and registration regime, which
  has been evolving).
* A real-money product would require **registering/licensing as an operator through AGLC / iGaming Alberta**, an approved RNG/game certification
  (independent testing lab), AML/KYC, geolocation, age verification, responsible-gambling tooling and advertising compliance.
* **Do not** build it on this codebase without that licence and legal advice. Treat this repository as free-play only.

## Age and responsible play

* Alberta's legal gambling age is **18**; this app gates at 18+ even though it uses play chips (conservative for marketing and app-store reasons).
* Responsible-play content and Alberta help lines are included; verify phone numbers, hours and links before release (see README for items that could not be verified).
* Self-imposed session limits and reminders are included. Consider adding cool-off periods and spending-neutral stats.

## Distribution & platform policies (to check)

* **Apple App Store** and **Google Play** have specific rules for simulated gambling/"social casino" apps (age ratings, "simulated gambling" content descriptors,
  restrictions on apps that blur into real-money gambling, regional availability, in-app purchase rules). Read the current guidelines before submitting.
* Ad networks and payment providers often restrict social-casino content; check each one's policy.
* Disclose clearly in listings that the app offers **simulated gambling with no real-money prizes**.

## Other items for a lawyer

* Privacy: the app stores only local data in the browser; if analytics/accounts are added, review PIPEDA/Alberta PIPA.
* Terms of service and disclaimers; intellectual property (see `docs/BRANDING.md`); accessibility obligations.
* Fairness claims: the README states the client-only trust model honestly; do not market the app as "certified" or "audited".

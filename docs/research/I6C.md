# I6C. Atlassian Marketplace money for our 19 Forge apps

## Summary
1. List these 5 first, all as Paid via Atlassian. AskSpace $23.0k, SignOff $13.6k, Markdown + Mermaid $8.1k, MathBlock $7.9k and EpicTotals $5.7k of expected 12-month revenue. Together that's $58k of the $92k base case for all 19 apps (ESTIMATE, math below).
2. A typical paid newcomer in our niches gains 60 installs a year. Eight 2024-2026 paid entrants ranged from 24 to 212 a year (FETCHED). Niche size barely predicts the rate, so the model damps it with a square root.
3. No public trial-to-paid rate exists (searched, NOT FOUND). Trials on monthly-billed sites turn into paid licences on their own, and Forge apps keep 100% of revenue up to $1M lifetime (FETCHED). So the unknown that matters is how many installs sit on free 1-10 user sites. The model assumes 40% of installs pay.
4. Raise 3 prices. SignOff goes $0.40 to $0.50, Markdown + Mermaid $0.25 to $0.30 and MathBlock $0.25 to $0.30. All stay below the cheapest maintained paid rival. Tier discounts follow the median of 68 paid rivals: 0.76x at 101-250 users, 0.50x at 251-1000 and 0.30x at 1001-2500.
5. Our listing drafts were written to an 80-character tagline, but the limit is 130 (FETCHED). The 100 top-grossing apps use a median of 121 characters, and 78 of them name Jira or Confluence in the tagline. New copy for the top 5 is in section D.

## Ranked actions

Score = expected 12-month revenue in $ / hours. Revenue is the base case at the recommended price. Hours are an ESTIMATE of 2 h per listing (partner-portal form, 5 screenshots at 1840x900, privacy tab, price table), plus 1 h once for payment and tax details.

| Rank | Action | Product | Store | Expected effect | Hours | Score | Evidence |
|---|---|---|---|---|---|---|---|
| 0 | Owner adds payment and tax details in the partner portal (blocker for every paid listing) | all 19 | Atlassian Marketplace | unlocks the $92,387 base case | 1 | 92,387 | COMMON.md; pricing-payment-and-billing page |
| 1 | List AskSpace, $0.75/user at 11-100, new tagline and highlights | AskSpace | Confluence | $23,018 in 12 months (low $2,877, high $206,887); ARR at month 12 $50,040 | 2 | 11,509 | Questions for Confluence 3,533 installs, 2.39 stars/80, $2.50/user |
| 2 | List SignOff, raise price to $0.50 | SignOff | Confluence | $13,579 (low $1,358, high $97,639); ARR $29,520 | 2 | 6,790 | Page Approval 1,619 installs, 2.62 stars/76, $0.77; AURA entrant 212 installs/yr |
| 3 | List Markdown + Mermaid, raise price to $0.30 | Markdown + Mermaid | Confluence | $8,148 (low $849, high $61,024); ARR $17,712 | 2 | 4,074 | Stratus Mermaid $0.40, top-grossing #32; Just Add+ $0.50, #18 |
| 4 | List MathBlock, raise price to $0.30 | MathBlock | Confluence | $7,883 (low $821, high $59,040); ARR $17,136 | 2 | 3,942 | LaTeX Math $1.83, top-grossing #12; LaTeX Math+ $0.39, 4.52 stars |
| 5 | List EpicTotals at $0.20 | EpicTotals | Jira | $5,741 (low $718, high $51,598); ARR $12,480 | 2 | 2,870 | ESU Lite 2,750 installs, 2.36 stars, $0.11; sumUp $0.75 |
| 6 | List SpaceCal | SpaceCal | Confluence | $5,564 | 2 | 2,782 | Calendar for Confluence frozen Connect, 3.23 stars; Capable Calendar entrant 82/yr |
| 7 | List Secret & PII Scanner (confirm billing product first) | Secret Scanner | Confluence + Jira | $5,299 | 2 | 2,650 | Soteri 4.83 stars at $1.74; Secret Sentinel entrant 97/yr |
| 8 | List Nudge | Nudge | Jira | $4,328 | 2 | 2,164 | My Reminders 3,425 installs, free, no release since 2026-04-30 |
| 9 | List Bulk Page Ops | Bulk Page Ops | Confluence | $3,886 | 2 | 1,943 | Pages Manager 2.5 stars free; Copy Page Tree $0.81, frozen since 2026-04-29 |
| 10 | List Filter Activity Stream | Filter Activity | Jira | $3,180 | 2 | 1,590 | UGUBI Connect $0.50, 320 installs; entrant 122/yr |
| 11 | List Watching Now | Watching Now | Jira | $3,180 | 2 | 1,590 | Who's Looking 2,295 installs, last release 2022-02-21 |
| 12-19 | List the rest in this order: GitHub Gists, Expression Validators, Dashboard Notes, Issue Dates Calendar, StatusBeacon, CodeBlock+, Description Diff, PortalSLA | 8 apps | Jira, Confluence, JSM | $406 to $1,656 each, $8,581 together | 16 | 536 | table B |

## A. The model, with the math

Expected 12-month revenue = reachable installs x paid share x price per paying site per year x ramp.

| Input | Value | Type | Source or method |
|---|---|---|---|
| Base install rate | 60 installs/yr | FETCHED-derived | Median of 8 paid entrants launched 2024-05 to 2026-04 in our niches. Installs divided by months since first cloud release (`/rest/2/addons/<key>/versions?hosting=cloud`, oldest version). Table C. |
| Niche size scale | sqrt(N / 2,104) | ESTIMATE | N = live installs of the direct rivals in table B. 2,104 is the median N those 8 entrants faced. Entrant rates barely track N (AURA 212/yr in N 3,937; Notes Gadget 24/yr in N 7,521), so I damp it. |
| Niche weakness m | 0.5, 1.0 or 1.5 | ESTIMATE | 1.5 if the leader is under 3.0 stars or a frozen Connect app (Connect support ends 2027-01-31). 0.5 if the leader is free and maintained. Else 1.0. |
| Paid share | 40% of installs | ESTIMATE | No public number (NOT FOUND, see section E). Installs on 1-10 user sites pay $0. Trials on monthly billing convert automatically (FETCHED, licensing FAQ). I assume about half the installs are on sites above 10 users, minus a margin for trials and annual-billed sites that lapse. |
| Seats per paying site | 100 users, 25 JSM agents | ESTIMATE | Live totalUsers / totalInstalls over 44 paid rivals with 150+ installs: median 391, p25 185 (FETCHED-derived). I take about half of p25, because a new vendor with 0 reviews wins small sites first. |
| Price per paying site per year | price x seats x 12 | FETCHED rule | Annual price = 10x monthly, matched in 68 of 68 rival price tables, so monthly billing x 12 is the top end. |
| Ramp | 0.46 | ESTIMATE | Installs arrive evenly over 12 months, then a 1-month trial. (12 - 1) / 2 / 12. |
| Revenue share | 100% to us | FETCHED | Forge apps keep 100% up to $1M lifetime Forge revenue (developer.atlassian.com/platform/marketplace/pricing-payment-and-billing/). |
| Low case | 24 installs/yr, 25% paid, 50 seats | ESTIMATE | Second-lowest entrant rate |
| High case | 212 installs/yr, 55% paid, 185 seats | ESTIMATE | Best entrant (AURA, which has Seibert's brand behind it) and the p25 site size |

Worked example for AskSpace. N = 4,983, so the scale is sqrt(4,983 / 2,104) = 1.54. Installs = 60 x 1.5 x 1.54 = 139. Paying = 139 x 0.40 = 56 sites. Per site = $0.75 x 100 x 12 = $900 a year. 12-month revenue = 139 x 0.40 x 900 x 0.46 = $23,018. ARR at month 12 = $50,040.

A cross-check against the one public indie number makes the base case look optimistic, not cautious. Agile Docs reached $4,149 MRR after 18 months (indiehackers.com post, about 2020, search snippet only). Our top app's month-12 ARR of $50,040 is $4,170 MRR, the same level, and it assumes we beat the median entrant by 2.3x. Plan around the low case and treat the base case as the target.

An earlier version of this model used a flat 4.9% yearly capture of the niche. It put Markdown + Mermaid at 866 installs a year, 14 times the median entrant, so I dropped it. The same 5 apps still came out on top.

## B. All 19 apps

N is live totalInstalls of direct rivals, fetched 2026-11-06 from `marketplace.atlassian.com/rest/2/addons/<key>`. Rival prices are the 11-100 user tier, $/user/month, from `/pricing/cloud/live`.

| # | App | Store | N | Leader (installs, live  stars, price, last release) | Other paid rivals ($/user) | m | Installs 12m | Paying | Price now -> recommended | 12-month $ base |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AskSpace | Confluence | 4,983 | Questions for Confluence 3,533, 2.39 stars, $2.50, 2026-08-03 | EliteSoft $0.40 (Connect), FAQ $0.50, Smart Q&A $0.44, Community Q $0.40 | 1.5 | 139 | 56 | 0.75 -> 0.75 | 23,018 |
| 2 | SignOff | Confluence | 3,937 | Page Approval 1,619, 2.62 stars, $0.77, 2026-08-04 | AppFox $0.94, Comala Doc Control $2.02, Comala Doc Approval $0.66, AURA $1.20, Breeze $1.40 | 1.5 | 123 | 49 | 0.40 -> 0.50 | 13,579 |
| 3 | Markdown + Mermaid | Confluence | 35,156 | Atlassian Mermaid viewer 7,769, 2.99 stars, free, 2026-11-04 | Just Add+ $0.50, Stratus Mermaid $0.40, Appfire Markdown $1.34, weweave $0.23 | 0.5 | 123 | 49 | 0.25 -> 0.30 | 8,148 |
| 4 | MathBlock | Confluence | 8,286 | LaTeX Math (Appfire) 3,079, 3.43 stars, $1.83, 2026-10-29 | LaTeX Math+ $0.39, Lite $0.53, Kolekti $0.49, Fulstech $0.77; 2 free | 1.0 | 119 | 48 | 0.25 -> 0.30 | 7,883 |
| 5 | EpicTotals | Jira | 9,847 | ESU Lite 2,750, 2.36 stars, $0.11, 2026-10-07 | ESU $0.90, sumUp $0.75, Bloompeak $0.70, Agilis $0.85, Pivot Report $1.80 | 1.0 | 130 | 52 | 0.20 -> 0.20 | 5,741 |
| 6 | SpaceCal | Confluence | 1,831 | Calendar for Confluence 1,302, 3.23 stars, free, Connect, 2025-06-04 | Capable $0.75, Calendar Pro $0.91, Space Calendar $0.10 | 1.5 | 84 | 34 | 0.30 | 5,564 |
| 7 | Secret Scanner | Confluence + Jira | 1,354 | AppFox Compliance 476, 3.27 stars, $0.59 | Soteri $1.74 / $1.50, Actonic $1.00, Polymetis $0.80, Secret Sentinel $0.24 | 1.0 | 48 | 19 | 0.50 | 5,299 |
| 8 | Nudge | Jira | 5,650 | My Reminders 3,425, 3.55 stars, free, 2026-04-30 | Teamlead $0.35, Starware $0.40, Simple Reminder $0.25, Boomerang $0.15 | 1.0 | 98 | 39 | 0.20 | 4,328 |
| 9 | Bulk Page Ops | Confluence | 4,496 | Copy Page Tree 2,052, 3.21 stars, $0.81, 2026-04-29 | Copy Space $0.88, Easy Apps $0.88, Label Manager $0.50; Pages Manager free, 2.5 stars | 1.0 | 88 | 35 | 0.20 | 3,886 |
| 10 | Filter Activity | Jira | 598 | UGUBI Filters Activity Stream 320, 3.78 stars, $0.50, Connect | Atlassway $0.91, DevAcrobats $1.25; Cappsule free | 1.5 | 48 | 19 | 0.30 | 3,180 |
| 11 | Watching Now | Jira | 2,377 | Who's Looking 2,295, 3.55 stars, free, 2022-02-21 | Who is Online $0.25, Who Viewed $0.30 | 1.5 | 96 | 38 | 0.15 | 3,180 |
| 12 | GitHub Gists | Confluence | 1,448 | David Simpson Gists 771, free, Connect, 2021-08-04 | Appfire GitHub Macros $0.98, Elevatic $0.47, Gist+ $0.19 | 1.5 | 75 | 30 | 0.10 | 1,656 |
| 13 | Expression Validators | Jira | 2,672 | Workflow Enhancer 1,353, 3.64 stars, $0.86 (JMWE $2.00 and JSU $1.35 not in N) | Building Blocks $0.79, Cloud Workflows $0.50; 3 free | 1.0 | 68 | 27 | 0.10 | 1,501 |
| 14 | Dashboard Notes | Jira | 7,521 | Rich Text Gadget 7,479, 3.30 stars, free, 2026-03-25 | DarkSky $0.49 (41 installs), Notation $0.35 (1) | 0.5 | 57 | 23 | 0.10 | 1,259 |
| 15 | Issue Dates Calendar | Confluence | 1,589 | Calendar for Confluence 1,302, free, Connect | none paid | 1.0 | 52 | 21 | 0.10 | 1,148 |
| 16 | StatusBeacon | JSM | 4,102 | Statuspage for JSM 3,929, 2.06 stars, free, Connect, 2025-09-23 | Simplify Banners $0.30, Nemetschek $0.20 | 1.5 | 126 | 50 | 0.15/agent | 1,043 |
| 17 | CodeBlock+ | Confluence | 3,033 | Better Code Macro 2,698, 3.08 stars, free, 2026-10-28 | Prism $0.22, Adv. Syntax Highlighter $0.20, Adv. Code Block $0.80 | 0.5 | 36 | 14 | 0.10 | 795 |
| 18 | Description Diff | Jira | 696 | Description History Tab 487, 3.0 stars, free, Connect, 2019-11-09 | ChangeLens $0.20 (1 install); EPOS free | 1.0 | 35 | 14 | 0.10 | 773 |
| 19 | PortalSLA | JSM | 247 | Extra Fields for JSM 191, 3.75 stars, $0.50 | ChiliShelf Customer Portal SLAs $1.00 (50) | 1.0 | 21 | 8 | 0.35/agent | 406 |

## C. Calibration, recent paid entrants (FETCHED)

| Entrant | Niche | First cloud release | Installs now | Installs/yr | Niche N |
|---|---|---|---|---|---|
| AURA Workflow & Approval (Seibert) | SignOff | 2025-06-30 | 286 | 212 | 3,937 |
| User Activity Timeline (DevAcrobats) | Filter Activity | 2026-04-02 | 73 | 122 | 598 |
| Secret Sentinel (Simplify) | Secret Scanner | 2026-02-10 | 71 (76 users in total, so mostly tiny sites) | 97 | 1,354 |
| Capable Calendar | SpaceCal | 2025-02-12 | 142 | 82 | 1,831 |
| Who is Online (Actonic) | Watching Now | 2025-02-05 | 67 | 38 | 2,377 |
| Customer Portal SLAs (ChiliShelf) | PortalSLA | 2025-02-03 | 50 | 28 | 247 |
| Rich Text Notes Gadget (DarkSky) | Dashboard Notes | 2025-02-11 | 41 | 24 | 7,521 |
| Portal Banners (Simplify) | StatusBeacon | 2024-05-06 | 61 | 24 | 4,102 |

The free counterexample is Narva's free "Mermaid" app. It got 986 installs in 3.3 months (300 a month). Free apps from a known vendor grow 5 to 10 times faster than paid ones, so a "free first, paid later" listing is a real option for Markdown + Mermaid. But it gives up the revenue above.

## D. Price tiers and listing copy for the first 5

Tiers use the median ratio of 68 paid rivals' live price tables: 101-250 users = 0.76x the 11-100 price, 251-1000 = 0.50x, 1001-2500 = 0.30x (FETCHED-derived). 1-10 users at $0 is optional (FETCHED). I recommend $0, because 53 of the 68 paid rivals in table B set 1-10 users to $0, and small sites are where a 0-review app gets its first reviews.

| App | 1-10 | 11-100 | 101-250 | 251-1000 | 1001-2500 | 50 users / month | 100 users / year |
|---|---|---|---|---|---|---|---|
| AskSpace | $0 | $0.75 | $0.57 | $0.38 | $0.23 | $37.50 | $750 |
| SignOff | $0 | $0.50 | $0.38 | $0.25 | $0.15 | $25.00 | $500 |
| Markdown + Mermaid | $0 | $0.30 | $0.23 | $0.15 | $0.09 | $15.00 | $300 |
| MathBlock | $0 | $0.30 | $0.23 | $0.15 | $0.09 | $15.00 | $300 |
| EpicTotals | $0 | $0.20 | $0.15 | $0.10 | $0.06 | $10.00 | $200 |

The partner portal takes a price for each tier. Check that it accepts these exact cents. The minimum is $0.01/user (search snippet, 2021).

### What converts on top sellers (FETCHED, 100 top-grossing cloud apps plus 16 listings read in full)
- Taglines use the room. The median is 121 characters against a 130 limit. 78 of 100 name Jira or Confluence. Only 8 contain a number.
- They lead with the job or the problem. Table Filter says "Stop exporting data to Excel! Make your reports LIVE in Confluence". Timepiece says "Generate Jira Time in Status & SLA reports. Track Cycle Time, Lead Time & spot bottlenecks".
- They load search words into the tagline. Great Gadgets lists "burndown, velocity, cycle time, time in status, SLA, CFD, pivot, WIP".
- Highlight titles are short benefit phrases that start with a verb, with a median of 43 characters (limit 50). Examples are "Filter & refine your Jira dashboard in seconds", "Define SLAs in minutes & quickly start tracking" and "Add complex math to a Confluence page".
- Listings sold to regulated teams name the standard. Approvals for Confluence (top-grossing #46) says "supporting ISO 9001 processes" and "a full audit trail. No setup needed". AppFox Compliance names "GDPR, NIS2 and ISO 27001".
- The summary appears in search results (limit 250, top-seller median 232). Its first words are the category nouns people search for.
- Atlassian has published no number on which field converts best (NOT FOUND). Its guide only says screenshots and video "drive higher engagement", and video should be under 30 seconds.

### AskSpace for Confluence
- Tagline (122): Q&A for Confluence. Ask questions, vote on answers and accept the best one in any space, with Confluence permissions kept.
- Summary (206): Turn Confluence into your team's Q&A site. Ask from a space or about the page you're reading, vote, and accept the best answer. Filter by unanswered or topic. Runs on Atlassian, so no data leaves your site.
- Highlight 1. Ask questions where people already read. Ask from the Q&A home, from any space, or with the "Ask about this page" button. A macro puts a question list on any page.
- Highlight 2. Get answers people can trust. One vote per person and no voting on your own posts. Only the asker accepts an answer, and it stays on top.
- Highlight 3. Keep space permissions on every question. Questions about a space, page or blog post are visible only to people who can view it. Every check runs as the current user.

### SignOff for Confluence
- Tagline (121): Page approval and sign-off for Confluence Standard. Version-locked approvals and an audit trail, with no Premium upgrade.
- Summary (205): Ask people or groups to approve a Confluence page. Each decision is tied to the page version and edits restart approval. Export the audit trail as CSV for quality and compliance reviews. Runs on Atlassian.
- Highlight 1. Approve pages without upgrading to Premium. Native Confluence approvals need Premium or Enterprise. SignOff gives Standard sites page approval, with approve or send-back comments.
- Highlight 2. Lock each approval to the version it saw. Publish a change and old approvals stop counting, so the byline never shows an approval for text nobody read.
- Highlight 3. Hand auditors a CSV trail. Requests, decisions, comments, withdrawals and edit resets are logged with time and person. Copy the history out as CSV in a couple of clicks.

### Markdown + Mermaid for Confluence
- Tagline (121): Render Markdown and Mermaid diagrams in Confluence. Tables, task lists, code and flowcharts from one macro, live preview.
- Summary (226): Paste GitHub-flavoured Markdown from a README or an AI assistant and get a finished Confluence page. Mermaid flowcharts, sequence, ER and Gantt diagrams render inline, and a typo shows the exact line. No data leaves Atlassian.
- Highlight 1. Paste Markdown and get a finished page. Tables, task lists, footnotes and highlighted code in 20 languages render in one macro, with a live preview while you edit.
- Highlight 2. See Mermaid errors on the exact line. A typo shows "Mermaid syntax error in diagram 2, line 3", and the rest of the page still renders.
- Highlight 3. Render diagrams in dark or light themes. Single diagrams get default, dark or neutral themes, and long documents scroll inside a fixed height.

### MathBlock LaTeX for Confluence
- Tagline (116): LaTeX math for Confluence. Inline and block equations rendered as SVG, readable in light and dark themes, no egress.
- Summary (207): Write LaTeX in a Confluence macro and get a clean SVG formula, inline or on its own line. MathJax renders it on Atlassian's servers, so nothing leaves Atlassian. Errors point at the exact spot in your LaTeX.
- Highlight 1. Add equations inline or as a block. Write LaTeX in the macro and the formula renders as SVG on the page, sized to sit in a sentence or on its own line.
- Highlight 2. Read formulas in dark mode too. Formulas are coloured for Confluence's light and dark themes, so they don't turn into black text on a dark page.
- Highlight 3. Fix LaTeX errors fast. A mistake shows where it is in your LaTeX instead of a blank box.

### EpicTotals for Jira
- Tagline (126): Epic roll-ups for Jira Standard. Story points, time logged, time remaining and status counts summed for every epic and parent.
- Summary (226): See story points, estimates, time logged and status counts added up on every epic, plus a dashboard gadget with one row per epic from any JQL. Works on Standard, where Plans roll-ups need Premium. Runs on Atlassian, read-only.
- Highlight 1. Sum story points and time on every epic. Open an epic and see children done, points done, original estimate, time logged and remaining, with a progress bar.
- Highlight 2. Count every work item once. Sub-task time is never doubled, and if a limit cuts a read short the panel says the totals are partial.
- Highlight 3. Track all epics on one dashboard. Point the gadget at any JQL and get up to 50 epic rows with points, time and progress, plus a total.

Each line above is within the official limits (tagline 130, summary 250, highlight title 50, highlight summary 220). Character counts were checked by script. Every feature claim comes from that app's own LISTING.md or README. Check the claims against the build before you submit.

## E. Facts used (FETCHED unless marked)
- Revenue share: Forge partners keep 100% up to $1M lifetime Forge revenue, then 83% from 2026-10-01 (developer.atlassian.com/platform/marketplace/pricing-payment-and-billing/).
- Annual = 10x monthly (same page, and 68 of 68 rival tables).
- Evaluations last at least 30 days, up to 59. Monthly-billed trials convert to paid automatically (developer.atlassian.com/platform/marketplace/knowledge-base/licensing-faq/). Annual-billed sites lose the app at trial end (help.easyagile.com, search snippet).
- Trial-to-paid rate: NOT FOUND. Atlassian publishes only the formula, new paid licences / evaluations (developer.atlassian.com/platform/marketplace/cloud-conversions/). A 2026-10-03 developer-community thread asking for the paid share of installs has 0 replies.
- Marketplace has passed $7B lifetime sales, and the last $1B took 9 months. It lists 6,000+ cloud apps and 3,700+ public Forge apps, and 40%+ of customers have at least one app (atlassian.com/blog/teamwork/atlassian-marketplace-7-billion, 2026-10-26).
- 67% of apps have under 100 installs (brighttail.com, 2023).
- Listing limits are name 60, tagline 130, summary 250, exactly 3 highlights, highlight title 50, highlight summary 220, screenshots 1840x900, video under 30 s (developer.atlassian.com/platform/marketplace/marketplace-app-listing-principles/, 2026-08-24).
- Top-grossing order is from `marketplace.atlassian.com/rest/2/addons?filter=top-grossing&hosting=cloud&application=jira|confluence&limit=50`.

## F. Risks and open checks
- Paid share and seats are the two biggest unknowns. Each one alone moves revenue by 2x. Read the real numbers from partner-portal reports at day 30 and re-run `I6C-scripts/model.py`.
- Secret Scanner covers Jira and Confluence. It's UNVERIFIED which product's user count Marketplace bills.
- Markdown + Mermaid competes with three free, maintained apps. If day-30 installs are under 10, consider making it free and moving price to a Pro feature.
- AskSpace's leader is Atlassian's own app. If Atlassian bundles Questions, the niche goes away (not re-checked today).

## Files
- Raw data in `out/I6C-raw/`. `live/` holds 309 addon, version and price files, `top/` the top-grossing lists, `first/` the first releases. `rivals_parsed.json`, `examples_parsed.json`, `entrants.json`, `model_final.json` and `web_conversion.md` hold the web facts with quotes.
- Scripts in `out/I6C-scripts/`. These are `niches.py`, `rivals.json`, `fetch.sh`, `first.sh`, `parse.py`, `entrants.py`, `model.py` and `finalize.py`. Run them with `python3 -I`.

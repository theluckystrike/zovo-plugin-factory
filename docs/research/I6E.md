## Summary
1. The new collector `factory/sprint/metrics/collect.py` covers 16 products across Apify, VS Code, Open VSX, GitHub and Atlassian. One run took 3 min 25 s, appended one line to `history.jsonl` and logged 0 errors. Every token check came back 0.
2. Biggest finding: the default Apify Store API search shows 0 of our 5 public Actors. They appear only when `includeUnrunnableActors=true` is set. The API spec says this filter hides Actors from developers without KYC. Ours are LIMITED_PERMISSIONS, so the missing owner verification is the likely cause (INFERENCE).
3. No store gives us revenue through an API today. Apify earnings live only in the Console (Insights). VS Code and Open VSX have no payments. Atlassian V3 reporting answers 404 until a Marketplace listing exists.
4. Traffic we can measure now: the VS Code search rank of Context Drift is 1 for "claude.md", 6 for "agents.md" and 4 for "context drift". With the filter off, Apify ranks are 245 to 1,022. GitHub repo views are 0 in 14 days.
5. Page views need owner credentials. VS Code needs an Azure DevOps sign-in (PATs retire 2026-12-01). GitHub Pages has no traffic API.

## Ranked actions

The effect units differ from row to row (Actors made visible, snapshots, downloads, pages), so the scores cannot be compared across rows. I ranked by expected paying users. Row 1 is the only one that changes who can find a paid product.

| rank | action | product | store | expected effect | hours | score | evidence |
|---|---|---|---|---|---|---|---|
| 1 | Owner finishes Apify identity/KYC verification, then re-run the collector to confirm `store_default_search_shows` goes from "0 of 5" to "5 of 5" | 5 public Actors (9 after 21:10 today) | Apify | 5 Actors become visible in default API, MCP and agent search (now 0) | 0.5 (ESTIMATE, owner form) | 10 | FETCHED `GET /v2/store?username=zovo-one` gives total 5, items 0. With `includeUnrunnableActors=true` it gives 1 item. `actorPermissionLevel` = LIMITED_PERMISSIONS on all 5 |
| 2 | Schedule the collector every 6 h (launchd, under `timeout 600`) | all 16 | all | 4 snapshots a day, so day-2 and day-7 trends exist for every product | 0.25 | 64 snapshots per hour of work (16 products x 4 runs / 1 h, ESTIMATE) | Run time 3 min 25 s FETCHED (this run) |
| 3 | Owner signs the Open VSX Publisher Agreement and publishes Context Drift | Context Drift | Open VSX | +14 downloads at today's level (ESTIMATE: 40 VS Code downloads x 0.36, the Open VSX/VS Code ratio of Excalidraw, 206,887/574,920 from run-20261105 I1) | 0.5 | 28 | FETCHED `open-vsx.org/api/zovo/context-drift` and `/theluckystrike/context-drift` both give 404 |
| 4 | Owner creates an Entra ID token (or a PAT before 2026-12-01) with Marketplace read, so the collector can read VS Code page views and installs | Context Drift | VS Code | Adds page views and installs, so the page-to-install rate becomes measurable for 1 product | 0.25 | 4 | FETCHED `/_apis/gallery/publishers/zovo/extensions/context-drift/stats` gives 302 to sign-in, and a fake path gives 404. PAT retirement date from code.visualstudio.com publishing docs |
| 5 | Add a cookie-free page counter to the github.io report and app pages (owner picks the service) | public report + 19 Forge doc pages | GitHub Pages | Page views for 20 pages that now have no measure | 1 | 20 | GitHub API covers repo pages only. FETCHED repo views = 0 for both repos in 14 days |
| 6 | When the first Forge app is listed, re-run the collector. The licenses, evaluations and sales code is written but untested | 19 Forge apps | Atlassian | Licenses, evaluations and vendor $ per app with no new code | 0 now (blocked on owner payment details) | n/a | FETCHED `GET /rest/3/developer-space/0c16709f-.../listings` gives `[]`, and the reporting paths give 404 |

## Current numbers fetched by collect.py on 2026-11-05 at 23.48 UTC

| product | store | traffic | users | money |
|---|---|---|---|---|
| App Reviews | Apify | rank 1,022 of 3,109 for "app reviews" (filter off), hidden in default search | 2 total, 1 in 7 d. 6 runs, 5 ours, 1 by others | no API |
| Screenshot/PDF | Apify | rank 245 of 749 for "website screenshot" | 2 total. 7 runs, 6 ours, 1 by others | no API |
| TubeText | Apify | rank 583 of 1,385 for "youtube transcript" | 2 total. 3 runs, 2 ours, 1 by others | no API |
| Google Trends | Apify | rank 581 of 2,340 for "google trends" | 2 total. 4 runs, 3 ours, 1 by others | no API |
| Ads Transparency | Apify | rank 369 of 911 for "ads transparency" | 2 total. 3 runs, 2 ours, 1 by others | no API |
| 5 private Actors | Apify | private | 1 user each (us), 1 run each | no API |
| Context Drift 0.1.4 | VS Code | rank 1 "claude.md", 4 "context drift", 6 "agents.md" | 40 downloads (`downloadCount`; it read 37 at 23:24 UTC) | $0, free |
| Context Drift | Open VSX | not published | n/a | n/a |
| zovo-plugin-factory | GitHub | 0 views, 0 clones, 14 d | 0 stars, 0 forks | none |
| context-drift | GitHub | 0 views, 0 clones, 14 d | 0 stars, 0 forks | none |
| 19 Forge apps | Atlassian | 0 listings | 0 | $0 |

Our Apify platform cost this cycle (2026-10-13 to 2026-11-12) is $0.1183 FETCHED (`/v2/users/me/limits`).

The "1 by others" run on each public Actor matches the Apify daily auto-test (5 of 5 show exactly 1). So no outside user has run an Actor yet (INFERENCE).

The VS Code number differs from the brief's "43 downloads". The public `downloadCount` read 37, 38 and 40 between 23:24 and 23:48 UTC. The 43 may come from another counter. The collector stores the raw statistics, so the two can be compared later.

## Endpoints and auth

### Apify (token `APIFY_TOKEN` as a Bearer header)
| endpoint | auth | gives | tested |
|---|---|---|---|
| `GET /v2/acts?my=1` | token | our 10 Actors | 200 |
| `GET /v2/acts/{id}` → `stats` | token (public fields also work without one for public Actors) | totalUsers, totalUsers7/30/90Days, totalRuns, bookmarkCount, review count and rating, `publicActorRunStats30Days` (runs by other users only, by status) | 200 |
| `GET /v2/acts/{id}/runs` | token | our own runs only. Runs by other users are not listed | 200. 5 runs listed vs totalRuns 6, and the gap equals `publicActorRunStats30Days.TOTAL` on 3 Actors checked |
| `GET /v2/store?search=&limit=&offset=&includeUnrunnableActors=&responseFormat=agent` | none | search rank. 1,000 rows take 17 to 24 s | 200 |
| `GET /v2/users/me/limits`, `/v2/users/me/usage/monthly` | token | our platform cost, not revenue | 200 |
| `/v2/users/me/payouts`, `/earnings`, `/payout-invoices`, `/v2/actor-earnings`, `/v2/acts/{id}/stats`, `/v2/acts/{id}/analytics` | token | nothing | 404 for each. The OpenAPI spec (141 paths, docs.apify.com/api/openapi.json) has no earnings or analytics path |
| Console > Development > Insights (Analytics, Payouts) | browser login | revenue, paid vs free users, funnel. "All metrics can be exported as JSON" | not tested (no browser). Source docs.apify.com/platform/actors/publishing/monetize |

### VS Code Marketplace
| endpoint | auth | gives | tested |
|---|---|---|---|
| `POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery` (filterType 7 = id, 10 = search text, flags 0x100 for statistics) | none | downloadCount (install, rating appear once they exist), version, search order | 200 |
| `GET /_apis/gallery/publishers/{pub}/extensions/{ext}/stats?type=&afterDate=&beforeDate=` and `/reports` | Azure DevOps sign-in (PAT with Marketplace read, or Entra ID token). The scope name is from Microsoft docs I could not load (learn.microsoft.com gave 404), so it is UNVERIFIED | page views, installs, uninstalls (publisher Reports hub) | 302 to sign-in with no token or a fake PAT. A fake path gives 404, so the route exists |

Global Azure DevOps PATs retire on 2026-12-01 (code.visualstudio.com publishing docs). Use Entra ID for the stats token.

### Open VSX
`GET https://open-vsx.org/api/{namespace}/{name}` needs no auth and gives downloadCount, averageRating and reviewCount (tested 200 on redhat/java). Neither namespace has Context Drift (404). Open VSX has no page-view or revenue API that I found.

### Atlassian Marketplace
| endpoint | auth | gives | tested |
|---|---|---|---|
| `marketplace.atlassian.com/rest/2/vendors/...` (all V2 reporting) | Basic | nothing | 410 "legacy API deprecated", removed 2026-06-30 |
| `GET https://api.atlassian.com/marketplace/rest/3/developer-space/vendor/{vendorId}` | Basic, email + API token (`FORGE_EMAIL`, `FORGE_API_TOKEN`) | developerId UUID | 200 |
| `GET .../rest/3/developer-space/{developerId}/listings` | Basic | our listings | 200, `[]` |
| `GET .../rest/3/reporting/developer-space/{developerId}/licenses`, `/sales/transactions`, `/evaluations/{metric}`, `/customer-insights/active-users` | Basic. Forge and OAuth2 apps cannot call these | licenses, evaluations, sales with vendor amount | 404 for our id (no Marketplace partner profile yet). 401 without auth |

Our developerId is `0c16709f-ce3f-427e-a352-8cce79b10e93` (space "Zovo", from `forge developer-spaces list`). `GET .../developer-space/{id}` itself gives 404 "No Developer space", which fits a Forge-only space with no Marketplace partner record. The reporting docs have no page-view or install endpoint.

### GitHub
`gh api repos/{owner}/{repo}/traffic/views|clones|popular/referrers|popular/paths` needs push access (the `gh` token has `repo` scope) and gives 14 days of data. Both repos are public (`.private` = false). GitHub Pages traffic has no API.

## Collector

- Run `python3 -I ~/plugin-market-intel-work/factory/sprint/metrics/collect.py`. It uses only the stdlib plus the `gh` CLI for GitHub.
- It reads `factory/.secrets.env`. It never prints a token, and it refuses to write the snapshot if a token or email value appears in it.
- Each run appends one line to `factory/sprint/metrics/history.jsonl` in the form `{"at","v","products":{"<store>:<id>":{"store","name","traffic","users","money"}},"account","errors"}`. A null means the store has no API for the value, and `note` says why.
- The file now holds 2 lines. The first, at 23:35 UTC, came from an earlier version that ranked only the top 100 of the filtered search. The second, at 23:48 UTC, is the current version.
- New Actors and the 4 that go public at 21:10 are picked up on their own. Add a search phrase in `APIFY_QUERIES`.

Raw probe files are in `out/I6E-raw/`. I removed the files that held the account email.

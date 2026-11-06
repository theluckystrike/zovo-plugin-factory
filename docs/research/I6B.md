## Summary
1. Context Drift is not on Open VSX. AI agent tools there get a median 7.9x more downloads than on VS Code (5 comparables), so publishing there is the best action per hour, at about 400 extra users per 30 days per hour of work.
2. The AGENTS.md / CLAUDE.md niche is small. New extensions there get a median 0.1 installs a day, and the 90th percentile gets 0.5 to 1.0 a day. We rank #1 for "claude.md" but are not in the top 200 for "cursor rules", "ai rules" or "claude code".
3. The live 0.1.4 README has 0 images. The fast-growing rivals have 4 to 14. Ship 0.1.5 with the screenshot (another lane added images/demo.png at 06:26) and grow the keywords from 11 to 30.
4. Money from Context Drift is small in every model, at $0 to $600 a year (ESTIMATE). Sponsors pay almost nothing: Bookmarks has 5.2M installs and 2 public GitHub sponsors. If we sell, use Paddle (5% + 50¢). Lemon Squeezy is moving its users to Stripe Managed Payments.
5. The next 3 extensions are a PDF viewer, a DOCX viewer and a Parquet/XLSX table viewer. File viewers get 7 to 18 installs a day at the 90th percentile, 10 to 100 times our niche. SQLite Viewer PRO proves people pay for viewers ($99 one-time).

All data was fetched 2026-11-06 between 06:24 and 06:45 (+07). Raw files are in `out/I6B-raw/`, scripts in `out/I6B-scripts/`. F means FETCHED, E means ESTIMATE.

## Ranked actions

Scores use installs per 30 days per hour of work for install actions, and dollars per year per hour of work for money actions. The two groups are ranked separately because they use different units.

| Rank | Action | Product | Store | Expected effect | Hours | Score | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Publish 0.1.5 to Open VSX (namespace zovo, Eclipse login exists in .secrets.env, coordinator generates the token) | Context Drift | Open VSX | +200 users / 30 d (E) | 0.5 | 400 | Open VSX "Extension not found: zovo.context-drift" (F). OVSX/VS Code ratio for 5 AI tools is 7.9x median (F), halved for download vs install counting (E) and applied to a 50 install / 30 d VS Code baseline (E) |
| 2 | Grow keywords from 11 to 30 (add "agents md", "claude md", "agentsmd", "claudemd", "ai rules", "copilot", "cursor", "windsurf", "cline", "codex", "claude code", "gemini cli", "context engineering", "docs lint", "markdown lint", "stale", "rules", "instructions", "prompt") | Context Drift | Both | +50 / 30 d (E, +20% of 250) | 0.3 | 167 | Position >50 on 5 of 13 queries and >200 on 5 (F). "agents md" without the dot ranks us #92, "agents.md" #6 (F) |
| 3 | Ship 0.1.5 with the screenshot in the first screen, one GIF of the quick fix, and 2 badges (VS Code installs, Open VSX version) | Context Drift | Both | +75 / 30 d (E, +30% conversion on 250) | 1.5 | 50 | Live readme has 0 images (F). Growing rivals have 4 to 14 images and 2 to 4 badges (F) |
| 4 | Build a PDF viewer (pdf.js, Apache-2.0) and publish to both stores | New: PDF viewer | Both | +216 / 30 d (E, p90 7.2/d) | 6 | 36 | "pdf viewer" entrants aged 7 to 240 d, p90 7.2/d (F). Leader tomoki1207.pdf has 14.4M installs and no update since 2025-01-11 (F) |
| 5 | Build a DOCX viewer (docx-preview, Apache-2.0) | New: DOCX viewer | Both | +225 / 30 d (E, p90 7.5/d) | 8 | 28 | "docx" entrants p90 7.5/d, best 181/d (F). ShahilKumar.docxreader 425,626 installs (F) |
| 6 | Build a Parquet + XLSX + CSV table viewer (hyparquet, exceljs, both MIT) | New: table viewer | Both | +360 / 30 d (E, 12/d from p90 18.2 parquet and 11.1 excel) | 16 | 22.5 | Entrant p90 (F). utiltools SQLite viewer got 11,107 installs in 39 d (F). dvirtz.parquet-viewer 447,412 installs at 3.48 stars (F) |
| 7 | Icon from 128 px to 256 px, keep banner #1E1B4B dark | Context Drift | Both | +2 / 30 d (E, 1%) | 0.2 | 10 | icon.png is 128x128 (F) |
| M1 | Pro tier for the table viewer (export, edit, big files), $49 one-time through Paddle | New: table viewer | Paddle | +$1,058 / yr gross (E) | 6 | $176 | SQLite Viewer PRO $99 one-time, $24 a month, "Purchased 18 times recently" (F, vscode.sqliteviewer.app). 4,320 installs/yr x 0.5% x $49 (E) |
| M2 | Context Drift Pro ($29/yr, CI report, org policy file, PR comments) through Paddle | Context Drift | Paddle | +$406 / yr net (E) | 8 | $51 | 3,000 installs/yr x 0.5% x $29 minus Paddle 5% + 50¢ (fee F, rest E) |
| M3 | Context Drift Team plan ($5/seat/month, shared baseline across repos) | Context Drift | Paddle | +$600 / yr (E, 2 teams x 5 seats) | 16 | $37 | Thunder Client $3, $7, $16 per user per month (F). GitKraken Advanced team max 10 seats (F) |
| M4 | Add a "sponsor" url to package.json (shows a Sponsor button) | Context Drift | VS Code | about $0 / yr (E) | 0.1 | about 0 | Public GitHub sponsors: alefragnani 2 (Bookmarks 5.2M), johnpapa 1 (Peacock 4.5M), hediet 24 (Draw.io 4.27M) (F) |

Recommendation. Do 1, 2 and 3 today (2.3 hours, about +325 users per 30 days). Do not build M2 or M3 before Context Drift passes 1,000 installs. Build the next extension from rows 4 to 6, and ship each one to both stores on day 1.

## Our install numbers today

- Gallery API, zovo.context-drift 0.1.4: statistics hold only `downloadCount = 24`. The `install` stat is not yet filled (F, `I6B-raw/ours_raw.json`). The brief says 43 downloads on day 1. The gap may come from a different counter in the publisher hub. Page views are only in the publisher hub (owner login), so the page-view-to-install rate cannot be fetched by API.
- Open VSX: not published (F, https://open-vsx.org/api/zovo/context-drift).

## Install curves of comparable extensions

The Marketplace gives no public daily history. I built two slopes per extension. The lifetime slope is installs divided by days since publishing. The current slope compares the 2026-11-05 14:48 snapshot from intel2 I1 with today's re-fetch of the same 582 extensions (0.65 days, `I6B-raw/delta.jsonl`). The window is short and noisy; it is a snapshot for later curves.

| Extension | Installs today (F) | Published | Lifetime /day | Current /day (0.65 d) |
|---|---|---|---|---|
| avifenesh.agnix (instruction-file linter) | 273 | 2026-02-05 | 1.0 | 0 (273 on 11-05 and today) |
| KamilJopek.agents-md-extension | 140 | 2026-01-07 | 0.5 | n/a |
| gentili.claude-sync | 153 | 2026-02-28 | 0.6 | n/a |
| BeilunYang.cursor-rules | 45,828 | 2024-11-11 | 63.3 | n/a (last update 2024-11-25) |
| genos-flow.skill-viewer | 2,784 | 2026-03-31 | 12.7 | 9.3 |
| formulahendry.agent-skills | 8,571 | (see raw) | n/a | 6.2 |
| growthjack.claude-code-usage | 76,920 | 2025-07-20 | 162.7 | 181.1 |
| long-kudo.vscode-claude-status | 18,338 | 2026-02-27 | 73.0 | 79.8 |
| utiltools.sqlite-viewer-utiltools | 11,107 | 2026-09-27 | 288 | 74.0 |
| utiltools.excel-csv-editor-utiltools | 7,166 | 2026-09-27 | 186 | 55.5 |
| Bowlerr.offline-markdown-preview | 195,080 | 2026-03-08 | 806 | 519.4 |
| nettrash.md-vscode | 59,230 | 2026-08-01 | 617 | 619.0 |

What the curves say. AI instruction-file tools sit at 0.5 to 1 install a day after the launch week. File viewers start at 200 to 300 a day and fall to about a quarter of that after 5 weeks (utiltools 288 to 74). Counts differ by about 2% between API calls (utiltools SQLite 11,091 to 11,300), so treat small deltas as noise.

New-entrant odds (extensions aged 7 to 240 days in the newest 200 per query, `I6B-raw/entrants_a.json`, `entrants_b.json`).

| Query | Entrants | Median /day | p90 /day | Best /day |
|---|---|---|---|---|
| agents.md | 47 | 0.1 | 0.5 | 1.9 |
| claude.md | 40 | 0.1 | 0.5 | 0.9 |
| cursor rules | 65 | 0.1 | 0.5 | 8.1 |
| copilot instructions | 50 | 0.2 | 1.5 | 84.4 |
| skill | 129 | 0.1 | 1.8 | 93.5 |
| mermaid | 134 | 0.3 | 2.1 | 619.6 |
| pdf viewer | 179 | 1.0 | 7.2 | 66.6 |
| docx | 119 | 1.3 | 7.5 | 181.2 |
| excel viewer | 176 | 1.2 | 11.1 | 289.7 |
| parquet | 51 | 1.0 | 18.2 | 289.7 |
| sqlite viewer | 132 | 1.0 | 5.6 | 289.7 |

"markdown preview", "claude usage" and "codex" each had 200 new extensions in the last 24 to 29 days (F). Those markets are flooded, and their p90 among the 7+ day old ones is 1.1 to 1.8 a day.

## Search position for Context Drift

Gallery API relevance sort (sortBy 0), which is the same endpoint the Marketplace search page calls. Pages of 50, checked to 200.

| Keyword | Results (F) | Our position (F) | Top result |
|---|---|---|---|
| claude.md | 64 | 1 | us |
| context drift | 2,812 | 4 | Waycoreinc.cognitive-drift-detector (26) |
| agents.md | 66 | 6 | KamilJopek.agents-md-extension (140) |
| gemini.md | 7 | 6 | chiragdarji.vscode-agent-doctor (13) |
| ai instructions lint | 14,766 | 6 | agentlint.agentlint (34) |
| claude md lint | n/a | 13 | n/a |
| skill.md | 30 | 26 | AlexeySedoykin.skill-md-inspector (140) |
| windsurf rules | 988 | 27 | BreakingRed.rules-manager (91) |
| cursorrules | 40 | 32 | nyxb.cursorrules (800) |
| copilot instructions | 4,269 | 91 | Dogmans.copilot-instructions-extension (127) |
| agents md | n/a | 92 | n/a |
| agent rules | 5,722 | 100 | openai.chatgpt |
| cursor rules | 3,297 | >200 | BeilunYang.cursor-rules (45,828) |
| ai rules | 13,342 | >200 | BjornLi.ai-rules (312) |
| claude code | 42,328 | >200 | anthropic.claude-code |

On Open VSX the niche is bigger. "agents.md" leaders there are abacusai 168,992, sessionlens 9,703, bastndev.f1 9,454 and ai-rulebook 6,198 downloads (F). Compare ai-rulebook with 25 installs on VS Code.

## Listing changes that raise page-view-to-install conversion

We cannot fetch page views, so each effect is an ESTIMATE. The evidence column shows what the fast-growing listings do.

| Change | Our state (F) | What growing rivals do (F) | Expected effect (E) | Hours |
|---|---|---|---|---|
| README first screen | Live 0.1.4 opens with 3 text paragraphs, 0 images. Local README now has a screenshot as the first block | utiltools SQLite and Bowlerr put a screenshot or banner in the first screen, plus one sentence on privacy ("No ads, no account, no AI") | +20% | 0.2 (ship it) |
| GIF of the quick fix | none | none of the 5 checked use a GIF; they use 4 to 14 PNGs | +10% | 1 |
| Badges | 0 | nettrash 4, growthjack 3 (including an Open VSX badge), Bowlerr 2 | +2% | 0.2 |
| Icon | 128x128 PNG | standard; use 256 px for sharp display | +1% | 0.2 |
| Gallery banner | #1E1B4B dark, set | utiltools, Bowlerr and nettrash set a dark color too | 0 (done) | 0 |
| Categories | Linters, AI | rivals use Visualization, Data Science; AI is right for us | 0 | 0 |
| Tags | 11 keywords | Bowlerr 15, nettrash 26 | +20% search impressions | 0.3 |
| Display name | "Context Drift for AGENTS.md & CLAUDE.md" | it gets us #1 on "claude.md" | keep | 0 |

## Three legal money paths for a free extension

The VS Code Marketplace allows paid features. The package.json `pricing` field shows "Trial" for Thunder Client, Database Client and MySQL Client (F). Keep the MIT core free, put paid code in a separate module or behind a license check, say so in the README, and set `pricing` to "Trial". Use a merchant of record so it handles VAT.

1. Pro license. Paddle charges 5% + 50¢ per checkout (F, paddle.com/pricing). Quokka sells Pro through Paddle (F, quokkajs.com/pro). Lemon Squeezy also charges 5% + 50¢ (F), but its 2026 post says it will help users "migrate to Stripe Managed Payments" (F, lemonsqueezy.com/blog/2026-update), so a new seller should pick Paddle. Real comparable: SQLite Viewer PRO, $99 one-time or $24 a month, 30% fall sale, "Purchased 18 times recently", on a 3.74M-install free viewer (F, vscode.sqliteviewer.app, sold with Stripe). Turbo Console Log Pro sells seat packs of 5, 10 and 15 activations (F; the page showed PLN prices, 85 zł for 5). For Context Drift this gives about $406 a year (E).
2. Sponsor. Free to add, but the numbers are close to zero. Public GitHub sponsor counts are 2 for alefragnani (Bookmarks, 5,210,009 installs), 1 for johnpapa (Peacock, 4,508,164), 24 for hediet (Draw.io, 4,270,038) and 0 or no listing for Error Lens, Todo Tree, SQLite Viewer and REST Client authors (F, GitHub GraphQL, `I6B-raw/gh_sponsors.txt`). Private sponsors are not counted.
3. Team plan. Thunder Client (7,688,655 installs) sells Starter at $3, Business at $7 and Enterprise at $16 per user per month, billed yearly (F, thunderclient.com/pricing). GitLens (53,760,722 installs) sells GitKraken Advanced teams of up to 10 seats (F). For Context Drift a team plan means a shared policy file and a CI report across repos. At 2 teams of 5 seats at $5 a month that is $600 a year (E), for 16 hours of work.

Conclusion on money. Context Drift will not make real money from any of the 3 paths at today's demand. The viewer category is the one with proof that people pay.

## Next 3 extensions

Ranked by expected installs per build hour, base case at the p90 entrant rate. The upside is the best 2026 entrant in the same query.

| Rank | Extension | Base installs/day (F p90) | Upside/day (F best) | Build hours (E) | Base 30 d installs per hour | Money path | Risk |
|---|---|---|---|---|---|---|---|
| 1 | PDF viewer with dark mode, search and outline | 7.2 | 66.6 | 6 | 36 | weak (free norm) | mathematic.vscode-pdf (2.86M, 4.83 stars, updated 2026-09-28) is active |
| 2 | DOCX viewer | 7.5 | 181.2 | 8 | 28 | weak | cweijan.vscode-office covers Office files (1.63M) |
| 3 | Parquet + XLSX + CSV table viewer | 12 | 289.7 | 16 | 22.5 | strong: SQLite Viewer PRO at $99 | Data Wrangler (Microsoft, 2.4M) |

Rejected after fetching. Markdown + Mermaid preview (two 2026 winners at 617 and 806 a day, but p90 is 2.1 and 200 new rivals in 24 days). Claude or Codex usage status bar (p90 1.8, 200 new rivals in 29 days). More AGENTS.md tools (p90 0.5).

## Method and limits

- Gallery API `POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`, flags 917, target Microsoft.VisualStudio.Code, sortBy 0 for position, 4 for installs, 5 for newest.
- Open VSX `https://open-vsx.org/api/-/search` and `/api/<ns>/<name>`. Its downloadCount counts downloads, not unique installs, so I halved the ratio.
- p90 rates come from the newest 200 results per query. Broad queries pull in unrelated extensions.
- Conversion lifts have no public data. They are my estimates. Check them against the publisher hub acquisition report 14 days after 0.1.5 ships.
- I did not edit product files. Another lane changed README.md and images/demo.png at 06:26 to 06:28.

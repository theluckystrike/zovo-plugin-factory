## Summary
1. Our 5 public Actors cannot be found in Apify Store search. The API counts them (`username=zovo-one` gives total 5) but returns 0 items, even for their exact titles. 825 Actors from other publishers, created after ours, are listed. Until this is fixed, Store traffic and Store users are 0.
2. The fix is an owner message to Apify support (15 minutes). Another publisher (`changeable_peddler`) had the same symptom in 2026 and is listed now. The cause for us is UNVERIFIED.
3. Pricing is fine: each of our prices is equal to or below the top 3 rivals. Do not cut prices. The gaps are the titles (TubeText, TikTok, Medium/Substack, Screenshot do not start with the phrase people search), placeholder `{"helloWorld":123}` API example input on all 10 Actors, and missing README sections (use cases, AI agents/MCP, free credit math).
4. Money in the next 30 days is small even when listed: net $0.22 low, $4.26 mid, $53.53 high for all 10 Actors together (ESTIMATE, model below). Leaders earn from a few heavy users (thewolves: 38,583 runs from 680 users in 30 days), so the goal is repeat API and agent users, not more trial runs.
5. `google-jobs-scraper` (a 10th Actor, private) has no pay-per-event price. It would earn $0 if it went public as it is.

Time of fetch: 2026-11-05 23:25 to 23:58 UTC (2026-11-06 06:25 to 06:58 +07). Raw data: `out/I6A-raw/`. Scripts: `out/I6A-scripts/` (run with `python3 -I`).

## Ranked actions

Effect is in extra Store users in 30 days (mid case, ESTIMATE), plus net $ where it applies. Score = effect / hours.

| Rank | Action | Product | Store | Expected effect (30 d) | Hours | Score | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Owner asks Apify support why zovo-one Actors return empty `items` in Store search (draft message below) | All 5 public + 4 going public tonight | Apify | 0 → 264 users (low 53, high 793); net $0 → $4.26 (high $53.53) | 0.25 | 1,057 users/h | FETCHED: `/v2/store?username=zovo-one` total 5, items []; exact-title searches return 677/106/58 items, none ours; 825 newest Actors back to 2026-11-04 13:44 UTC listed, ours absent |
| 2 | Retitle 4 Actors so the title starts with the searched phrase (table below) | TubeText, TikTok, Medium/Substack, Screenshot | Apify | +48 users (30% more of their 160 mid users) | 0.5 | 96 | FETCHED: "youtube transcript" top 10 = 15,238 u30; "tiktok transcript" 1,325 vs "tiktok captions" 33; "substack" 379 vs "medium articles" 41; an Apify user named `tubetext` already exists |
| 3 | Set a pay-per-event price on google-jobs-scraper before it goes public ($0.003/job, ESTIMATE) | Google Jobs | Apify | 8 users mid; $0 → $1.0 net mid ($12.5 high, at 20 jobs per run) | 0.25 | 33 | FETCHED: `pricingInfos` empty; rivals $0.0045 (epctex), $0.006 (gio21), $0.045/page of 10 (johnvc) |
| 4 | Add 4 README sections to all 10: "Use cases", "Use it from an AI agent (MCP)" with `https://mcp.apify.com?tools=zovo-one/<name>`, "Free plan: what $5 of credit buys", and a Python + JS example | All 10 | Apify | +40 users (15% of 264) | 2.0 | 20 | FETCHED: rivals have use cases 21/30, AI/MCP 19/30, FAQ 23/30, free-credit line 11/30; ours 1/10, 5/10, 5/10, 0/10. Median code blocks: rivals 4.5, ours 2 |
| 5 | Replace the placeholder example run input `{"helloWorld":123}` with the real prefill input | All 10 | Apify | +5 users (2% of 264, ESTIMATE); API example works on first copy | 0.3 | 17 | FETCHED: `exampleRunInput.body` = `{ "helloWorld": 123 }` on all 10 Actors |
| 6 | Put the price in the reviews title: "App Store & Google Play Reviews Scraper, $0.10/1K" | App Reviews | Apify | +1.6 users (10% of 16) | 0.1 | 16 | FETCHED: #1 and #2 of the niche (680 and 513 u30) both use "\| $0.10/1K Reviews" in the title |
| 7 | Remove developer-only README sections ("Local development", "Files") from Screenshot and move "Quick start (API)" below "What you get" | Screenshot/PDF | Apify | part of #4 | 0.2 | n/a | FETCHED: our README H2 list |
| 8 | Do not cut any price | All | Apify | avoids lost revenue | 0 | n/a | FETCHED price table below |

Not proposed: web-fetch-fallback changes. Its only big rival is `apify/web-fetch` (27,742 u30), a default tool in the Apify MCP server. The third-party rivals have 52 and 25 u30. Expected users stay below 3.

## Draft message for the owner to send to Apify support (not sent)
"Hi. My 5 public Actors under zovo-one (for example zovo-one/tubetext-youtube-transcript-scraper) do not appear in Apify Store search. `GET /v2/store?username=zovo-one` returns total 5 and items []. Exact-title searches do not return them either. The pages load with HTTP 200 and robots index,follow. Notice is NONE and none are deprecated. Can you tell me why they are filtered and what I need to change? 4 more Actors go public on 2026-11-06."

## Store search position (FETCHED 2026-11-05 23:25 UTC, `GET https://api.apify.com/v2/store?search=<kw>&limit=1000`)
"Not listed" means our Actor is not in the returned items (up to 1,000). The 5 private Actors cannot appear yet. The 4 that go public tonight will likely be hidden too, unless action 1 fixes the account.

| Actor | Keyword | Our position | Results (total) | Top 10 users/30d | #1 result |
|---|---|---|---|---|---|
| App Reviews | app store reviews | not listed | 2,052 | 1,172 | thewolves/appstore-reviews-scraper (680) |
| App Reviews | google play reviews | not listed | 1,322 | 1,200 | neatrat/google-play-store-reviews-scraper (415) |
| App Reviews | app reviews scraper | not listed | 3,095 | 915 | thewolves/appstore-reviews-scraper |
| TubeText | youtube transcript | not listed | 1,385 | 15,238 | pintostudio/youtube-transcript-scraper (2,768) |
| TubeText | youtube transcript scraper | not listed | 1,322 | 10,291 | pintostudio |
| TubeText | youtube subtitles | not listed | 1,220 | 5,868 | entertained_rattlesnake/youtube-subtitle-scraper-ai (24) |
| Trends | google trends | not listed | 2,340 | 5,027 | apify/google-trends-scraper (3,187) |
| Trends | google trends scraper | not listed | 2,268 | 5,011 | apify/google-trends-scraper |
| Trends | trends | not listed | 32,684 | 8,033 | aitorsm/keyword-volume (954) |
| Ads Transparency | google ads transparency | not listed | 587 | 2,700 | solidcode/ads-transparency-scraper (665, 1.93★) |
| Ads Transparency | ads transparency | not listed | 911 | 2,700 | solidcode |
| Ads Transparency | google ads scraper | not listed | 1,301 | 2,073 | silva95gustavo/google-ads-scraper (712) |
| Screenshot/PDF | website screenshot | not listed | 749 | 2,483 | apify/screenshot-url (1,969) |
| Screenshot/PDF | screenshot | not listed | 1,615 | 2,563 | apify/screenshot-url |
| Screenshot/PDF | html to pdf | not listed | 905 | 55 | rainminer/html-to-pdf-converter (9) |
| Web Fetch (private) | web fetch | private | 4,759 | 27,756 | apify/web-fetch (27,742) |
| Web Fetch (private) | website to markdown | private | 675 | 23 | s3nafps/ai-ready-webpage-extractor (3) |
| Web Fetch (private) | url to markdown | private | 1,922 | 49 | apify/url-to-markdown (10) |
| Google News (private) | google news | private | 3,952 | 1,380 | easyapi/google-news-scraper (127) |
| Google News (private) | google news scraper | private | 3,169 | 1,388 | easyapi |
| Google News (private) | news scraper | private | 31,058 | 1,380 | easyapi |
| TikTok (private) | tiktok transcript | private | 456 | 1,325 | clockworks/tiktok-transcript-extractor (481) |
| TikTok (private) | tiktok captions | private | 1,121 | 33 | linen_snack/tiktok-subtitles-extractor (4) |
| TikTok (private) | tiktok subtitles | private | 851 | 11 | linen_snack |
| Medium/Substack (private) | medium scraper | private | 17,883 | 592 | (media downloaders, off-topic) |
| Medium/Substack (private) | substack | private | 754 | 379 | easyapi/substack-posts-scraper (24) |
| Medium/Substack (private) | medium articles | private | 1,744 | 41 | logiover/medium-scraper (8) |
| Google Jobs (private) | google jobs | private | 1,193 | 1,108 | johnvc/Google-Jobs-Scraper (585) |
| Google Jobs (private) | google jobs scraper | private | 669 | 1,108 | johnvc |
| Google Jobs (private) | jobs scraper | private | 14,285 | 38,134 | curious_coder/linkedin-jobs-scraper (excluded niche) |

Search rank in the API follows relevance and is not the same as users. Example: "google news" ranks easyapi (127 u30) above data_xplorer (652 u30). So a new Actor with the exact phrase in its title can rank on page 1 without users. This is why action 2 matters once action 1 is done.

## Top 3 rivals per Actor (FETCHED, same Store search; u30 = users in 30 days)

| Our Actor (our price) | Rival | u30 | Runs 30d | Runs/user | Rating | Price (Bronze or flat) |
|---|---|---|---|---|---|---|
| App Reviews ($0.0001/review) | thewolves/appstore-reviews-scraper | 680 | 38,583 | 56.7 | 4.98/10 | $0.0001/item |
| | thewolves/google-play-reviews-scraper | 513 | 30,297 | 59.1 | 3.97/8 | $0.0001/item |
| | neatrat/google-play-store-reviews-scraper | 415 | 18,245 | 44.0 | 4.95/10 | $0.00013/item |
| TubeText ($0.0025/video) | johnvc/YoutubeTranscripts | 5,676 | 194,368 | 34.2 | 4.78/11 | $0.0025/video + $0.003 metadata |
| | starvibe/youtube-video-transcript | 3,833 | 401,311 | 104.7 | 5.0/23 | $0.005/item |
| | pintostudio/youtube-transcript-scraper | 2,768 | 535,252 | 193.4 | 3.72/49 | $0.01/item |
| Trends ($0.001/result) | apify/google-trends-scraper | 3,187 | 27,090 | 8.5 | 3.68/32 | $0.001/item |
| | data_xplorer/google-trends-fast-scraper | 873 | 49,953 | 57.2 | 4.88/4 | $0.001/item + $0.025/start |
| | agenscrape/google-trends-scraper | 369 | 6,652 | 18.0 | none | $0.025/item + $0.025/start |
| Ads Transparency ($0.0012/ad, $0.002/detail) | scrapesage/google-ads-transparency-scraper | 1,528 | 35,584 | 23.3 | 5.0/1 | $0.002/ad, $0.003/detail |
| | solidcode/ads-transparency-scraper | 665 | 259,741 | 390.6 | 1.93/4 | $0.001/item + $0.001/start |
| | s-r/google-ads-transparency | 182 | 46,103 | 253.3 | none | $0.002/item |
| Screenshot/PDF ($0.001) | apify/screenshot-url | 1,969 | 141,423 | 71.8 | 3.88/20 | free (platform usage only) |
| | cheapapi/website-screenshot-api | 265 | 8,233 | 31.1 | 5.0/1 | $0.00083 |
| | moonweil/url-screenshot-api | 150 | 10,410 | 69.4 | none | $0.004 + $0.001/start |
| Web Fetch ($0.001/page) | apify/web-fetch | 27,742 | 1,967,217 | 70.9 | 5.0/4 | $0.0015/fetch |
| | rixin/fast-html-fetcher | 52 | 10,823 | 208.1 | none | $0.0002 total |
| | shelvick/smart-page-fetcher | 25 | 1,369 | 54.8 | none | $0.000475 to $0.0095 |
| Google News ($0.0015 + $0.0005 resolved URL) | data_xplorer/google-news-scraper-fast | 652 | 31,291 | 48.0 | 4.9/5 | $0.004/item |
| | lhotanova/google-news-scraper | 302 | 105,084 | 348.0 | 4.59/13 | $0.002 + $0.001 resolved + $0.005/start |
| | automation-lab/google-news-scraper | 197 | 14,550 | 73.9 | none | $0.002 + $0.005/start |
| TikTok ($0.001/video) | clockworks/tiktok-transcript-extractor | 481 | 8,163 | 17.0 | 5.0/11 | $0.003 + $0.041/min AI |
| | scrape-creators/best-tiktok-transcripts-scraper | 358 | 12,678 | 35.4 | 4.78/7 | $0.001/item |
| | sian.agency/best-tiktok-ai-transcript-extractor | 173 | 23,089 | 133.5 | 5.0/6 | $0.012 + $0.005/start |
| Medium/Substack ($0.002/article) | automation-lab/substack-scraper | 186 | 2,367 | 12.7 | none | $0.002/post + $0.005/start |
| | brilliant_gum/substack-insights-scraper | 54 | 143 | 2.6 | none | $0.015/item + $0.01/start |
| | fatihtahta/substack-scraper | 47 | 688 | 14.6 | none | $0.00199/item |
| Google Jobs (no price) | johnvc/Google-Jobs-Scraper | 585 | 23,817 | 40.7 | 4.55/13 | $0.045/page |
| | epctex/google-jobs-scraper | 131 | 2,457 | 18.8 | 2.91/13 | $0.0045/item |
| | gio21/google-jobs-scraper | 109 | 929 | 8.5 | 2.44/4 | $0.006/job |

Price check: every one of our prices is equal to or below the top 3 rivals, except Screenshot (cheapapi $0.00083 and Apify's free Actor). The Screenshot gap is $0.00017 per capture. Cutting it would not move users, because Apify's own free Actor has 1,969 u30. Keep all prices.

## Exact changes per Actor
Titles: Store search ranks by relevance, and the leaders put the exact searched phrase first. SEO titles should stay at 60 characters or fewer.

| Actor | Title now → new | SEO title new | Description, first sentence new | README sections to add | Example input / trial size | Price |
|---|---|---|---|---|---|---|
| App Reviews | "App Store & Google Play Reviews Scraper" → "App Store & Google Play Reviews Scraper, $0.10/1K" | "App Store and Google Play Reviews Scraper API" | "Get App Store and Google Play reviews in one run and one schema for $0.10 per 1,000 reviews." | Use cases (ASO, sentiment, competitor tracking), AI agent/MCP, free-credit math ($5 = 50,000 reviews), Python + JS code. Drop "Changelog" to the end | Set `exampleRunInput` to the prefill (Spotify on both stores, 50 per app). Trial is 100 reviews = $0.01. Keep | Keep $0.0001 |
| TubeText | "TubeText YouTube Transcript Scraper" → "YouTube Transcript & Subtitles Scraper API" | "YouTube Transcript Scraper API" (keep) | "Get YouTube transcripts and subtitles as text or timed segments for $2.50 per 1,000 videos." | Use cases (RAG, summaries, research), AI agent/MCP, bulk channel and playlist example, free-credit math ($5 = 2,000 videos) | Set `exampleRunInput` to the 2 prefill URLs | Keep $0.0025 |
| Trends | "Google Trends Scraper (fast, no browser)" → "Google Trends Scraper API, Fast" | "Google Trends Scraper API" | "Interest over time, by region and related queries, $1 per 1,000 results, no start fee." | Use cases, AI agent/MCP, free-credit math | Set `exampleRunInput` to "coffee, tea", US | Keep $0.001. The no-start-fee line is the hook (data_xplorer and agenscrape charge $0.025 per start) |
| Ads Transparency | keep title, add "& API" | "Google Ads Transparency Center Scraper API" | Keep, put "$1.20 per 1,000 ads" in sentence 1 | Use cases (competitor ad research), AI agent/MCP, free-credit math | Set `exampleRunInput` to nike.com, US, 20 ads | Keep. We are below scrapesage ($0.002) |
| Screenshot/PDF | "Website Screenshot & PDF API for AI agents" → "Website Screenshot API: URL to PNG and PDF" | keep | "Turn any URL into a full-page PNG, JPEG or PDF for $1 per 1,000 captures." | Use cases, FAQ. Remove "Local development" and "Files" | Set `exampleRunInput` to the 2 prefill URLs | Keep $0.001 |
| Web Fetch (private) | keep | "Web Fetch to Markdown with Browser Fallback" (54 chars, fine) | keep | Use cases, FAQ | Set `exampleRunInput` | Keep $0.001 |
| Google News (private) | keep (matches "google news scraper") | keep | Put "real publisher URLs" and "$2 per 1,000 articles with resolved URLs" first | Use cases, AI agent/MCP, free-credit math | Set `exampleRunInput` to a query, 25 articles | Keep |
| TikTok (private) | "TikTok Transcripts and Captions" → "TikTok Transcript Scraper" | "TikTok Transcript Scraper API" | "Get TikTok transcripts and captions as text and timed segments for $1 per 1,000 videos." | Use cases, FAQ, AI agent/MCP | Set `exampleRunInput` to the tedtoks URL | Keep $0.001 (= scrape-creators) |
| Medium/Substack (private) | "Medium and Substack Articles Scraper" → "Substack & Medium Scraper" | "Substack and Medium Articles Scraper" | Lead with Substack | Use cases, FAQ, AI agent/MCP | Set `exampleRunInput` to one Substack publication, 10 articles | Keep $0.002 |
| Google Jobs (private) | keep | add "Google Jobs Scraper API" (none set) | keep | FAQ, use cases, free-credit math | Set `exampleRunInput` | Add pay-per-event $0.003/job (ESTIMATE, below epctex $0.0045). Add categories (none set) |

Trial size: Apify's free plan gives users credit; FREE-plan usage is not paid out to us (wave-1 fact). The prefill inputs already cost a new user $0.001 to $0.05 per run. Do not raise them. Do state in each README what $5 of credit buys, because 11 of 30 rival READMEs do.

## Money: next 30 days (ESTIMATE)
Formula: users × runs per user × $ per run × paid share × 0.8.
- users = top-3 rival u30 (FETCHED) × capture share. Capture share is 0.2% low, 1% mid, 3% high (ESTIMATE). For Web Fetch, apify/web-fetch is left out of the base.
- runs per user: 2 low, 5 mid, 15 high (ESTIMATE). Rival medians are 8.5 to 390 (FETCHED), but new users try a few runs first.
- $ per run = our event price (FETCHED) × events per run from our input prefill (FETCHED).
- paid share: 30% low, 50% mid, 70% high (ESTIMATE). Usage on the FREE plan is not paid out.
- 0.8 = after Apify's 20% margin (FETCHED `apifyMarginPercentage` 0.2).
- All of this assumes the Store search problem is fixed early in the 30 days. If it is not fixed, every row is about $0.

| Actor | Top-3 u30 | $ per run | Users L / M / H | Net $ L / M / H |
|---|---|---|---|---|
| App Reviews | 1,608 | 0.010 | 3 / 16 / 48 | 0.02 / 0.32 / 4.05 |
| TubeText | 12,277 | 0.005 | 25 / 123 / 368 | 0.06 / 1.23 / 15.47 |
| Trends | 4,429 | 0.002 | 9 / 44 / 133 | 0.01 / 0.18 / 2.23 |
| Ads Transparency | 2,375 | 0.024 | 5 / 24 / 71 | 0.06 / 1.14 / 14.35 |
| Screenshot/PDF | 2,384 | 0.002 | 5 / 24 / 72 | 0.00 / 0.10 / 1.20 |
| Web Fetch | 77 | 0.002 | 0 / 1 / 2 | 0.00 / 0.00 / 0.04 |
| Google News | 1,151 | 0.050 | 2 / 12 / 35 | 0.06 / 1.15 / 14.49 |
| TikTok | 1,012 | 0.001 | 2 / 10 / 30 | 0.00 / 0.02 / 0.26 |
| Medium/Substack | 287 | 0.020 | 1 / 3 / 9 | 0.01 / 0.12 / 1.44 |
| Google Jobs | 825 | 0 (no price) | 2 / 8 / 25 | 0 / 0 / 0 |
| Total | | | 53 / 264 / 793 | 0.22 / 4.26 / 53.53 |

What this means: a $0.001 to $0.05 run earns almost nothing until a user automates it. Rivals with real money have high runs per user (pintostudio 193, solidcode 391, lhotanova 348). Those are API, schedule and agent users. That is why README action 4 leads with code, MCP and schedule examples, not with more trial volume.

## Visitors → users: what can and cannot be measured
- Store page views are not in the public API. Our own Actor stats show `totalUsers30Days` = 1 on each public Actor (FETCHED `/v2/acts/zovo-one~<name>`), which is the Apify auto-test or our own run. Our console's Actor analytics page may show page views; that needs the owner's login (not done).
- Our README length is not the problem: our median is 1,850 words vs 2,203 for rivals (FETCHED from `https://apify.com/<user>/<actor>.md`, README body only). The gap is the content mix (action 4).

## Notes and limits
- The Apify search API returned at most 840 items per query. "Not listed" means not in those items. The exact-title searches and the `username` filter confirm that our Actors are filtered, not just ranked low.
- The cause is UNVERIFIED. Our account is on the FREE plan, `isPaying` false, created 2025-11-13, profile complete (name, picture, website, readme). No Actor has a notice or is deprecated. One untested idea: publishing 5 Actors in one day tripped a filter. If so, the 4 Actors that go public at 21:10 tonight may be hidden too. The coordinator may want support's answer first.
- Web sources: https://apify.com/changeable_peddler/store-indexing-control-actor.md (same symptom, other publisher; now listed with 25 items), https://docs.apify.com/platform/actors/publishing/actor-status ("Under maintenance" lowers rank; deprecated Actors are not searchable).

## Summary
1. Free channels bring few paying users. All 6 Apify actions together give about 7.4 paying users for 3 owner hours (ESTIMATE). At about $0.25 each in month 1, that is about $2 a month. They are worth doing for first users, reviews and bug reports, not for money.
2. The best paying-user channel is one post in the Apify & Crawlee Discord (23,978 members, FETCHED). The next three are the r/webscraping monthly thread (105,406 subs), a dev.to TubeText tutorial and an r/PPC how-to for Ads Transparency. Drafts are in out/I6D-drafts/.
3. MCP registries and awesome lists bring almost nothing. Of 24 Actors created in 2026 and listed in the MCP Registry or awesome-remote-mcp-servers, 20 have 4 or fewer users ever (FETCHED). Most big awesome lists have stopped merging (0 or 1 of the last 30 closed PRs merged).
4. Store search is the real traffic source, and we are invisible there. For 10 of 11 main keywords, none of our Actors is in the top 100 results. The top 10 for "youtube transcript" have 15,238 users in 30 days (FETCHED). This is the I6A/B6A work.
5. Context Drift is free, so its channels score 0 paying users. For installs, Show HN is best (about 57 installs for 2 h, ESTIMATE). Cursor channels wait for Open VSX, because the extension is not there yet (FETCHED 404).

## Ranked actions

Score = expected paying users / owner hours. Paying user means an outside Apify user who runs one of our pay-per-event Actors at least once. Ties and all Context Drift rows are ordered by installs per hour. F = FETCHED, E = ESTIMATE.

| Rank | Action | Product | Store | Expected effect | Hours | Score | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Post once in the Apify & Crawlee Discord, after 21:10 (draft 01) | All 9 Actors | Apify | 50 visitors, 2.0 paying users | 0.25 | 8.0 | F 23,978 members, 1,722 online. E 50 = 1,722 x 3%; 4% run. Rules need login, UNVERIFIED |
| 2 | Comment in the r/webscraping monthly self-promotion thread (draft 02) | TubeText, Trends, Ads, Reviews | Apify | 30 visitors, 1.2 paying | 0.25 | 4.8 | F 105,406 subs. Mirror rule says commercial posts go only in the monthly thread. E 1,000 views x 3%; 4% run |
| 3 | dev.to tutorial, YouTube transcripts for RAG (draft 03) | TubeText | Apify | 60 visitors in month 1, 1.8 paying | 0.5 | 3.6 | F niche tags median 0 reactions in top 7 days; Apify playbook recommends dev.to. E 2 a day from search; 3% run |
| 4 | r/PPC how-to post with disclosure (draft 04) | Ads Transparency | Apify | 60 visitors, 1.2 paying | 0.5 | 2.4 | F 290,151 subs. Promo rule not found, UNVERIFIED. E 2,000 views x 3%; 2% run |
| 5 | r/mcp showcase, one MCP URL for 9 Actors (draft 05) | All 9 Actors | Apify | 50 visitors, 1.0 paying | 0.5 | 2.0 | F 127,776 subs. E 1,500 views x 3%; 2% run (needs Apify token) |
| 6 | Official MCP Registry remote entry + awesome-remote-mcp-servers PR | All 9 Actors | Apify | 10 visitors, 0.2 paying | 1.0 | 0.2 | F 20 of 24 comparable listed Actors have 4 or fewer users ever; list needs a Glama connector (owner account) |
| 7 | Show HN for Context Drift (draft 06, bonus) | Context Drift | VS Code | 380 visitors, 57 installs, 0 paying | 2.0 | 0 (28.5 installs/h) | F 3.7% of Show HN reach 30+ points, median 2; on CLAUDE.md/AGENTS.md topics 26-30% reach 10+. E 7% x 5,000 + 93% x 30 |
| 8 | r/ClaudeAI post, Built with Claude flair | Context Drift | VS Code | 60 visitors, 9 installs | 0.5 | 0 (18 installs/h) | F 1,253,699 subs. Mirror rule needs 50+ karma and saying how Claude helped |
| 9 | r/ClaudeCode post | Context Drift | VS Code | 60 visitors, 9 installs | 0.5 | 0 (18 installs/h) | F 483,233 subs. Rules not found |
| 10 | r/cursor weekly showcase comment, after Open VSX | Context Drift | Open VSX | 20 visitors, 3 installs | 0.25 | 0 (12 installs/h) | F 160,768 subs. Blocked: not on Open VSX |
| 11 | awesome-claude-code issue form, from 2026-11-19 | Context Drift | VS Code | 15 visitors a month, 2 installs | 0.25 | 0 (8.8 installs/h) | F 57,329 stars, 30 of last 30 closed PRs merged. Needs repo age 14 days or 100 stars; repo created 2026-11-05 |
| 12 | Add GitHub topics to theluckystrike/context-drift | Context Drift | GitHub | 5 visitors a month | 0.1 | 0 (8 installs/h) | F 0 topics, 0 stars |
| 13 | Product Hunt launch | Context Drift | VS Code | 200 visitors, 30 installs | 4.0 | 0 (7.5 installs/h) | Audience not fetched. Apify playbook claims "hundreds of users". Needs owner PH account |
| 14 | forum.cursor.com Built for Cursor post, after Open VSX | Context Drift | Open VSX | 8 visitors, 1 install | 0.25 | 0 (4.8 installs/h) | F 134,017 users, 7,581 active in 30 days; last 30 showcase topics median 27 views |
| 15 | Atlassian Community posts | 19 Forge apps | Atlassian | 0 until listed | 0.5 | 0 | Blocked until the owner adds payment details and lists the apps |

Funnel rates are ESTIMATES with no measured basis yet. Visitor to first run is 4% for Apify and scraping audiences, 3% for search traffic, 2% for MCP and marketing audiences. Context Drift visitor to install is 15%. Lanes I6A and I6B should replace these with measured numbers. Revenue math for the 7.4 Apify users: if each runs about 100 events at about $0.0025 (TubeText price), that is 7.4 x $0.25 = $1.85 in month 1 (ESTIMATE).

## Channels checked and skipped

| Channel | Why skipped | Evidence |
|---|---|---|
| punkpeye/awesome-mcp-servers | 4,335 open PRs, 1 of last 30 closed PRs merged. It is for installable servers, ours are remote | F gh api, CONTRIBUTING.md |
| viatsko/awesome-vscode | 0 of last 30 closed PRs merged, 58 open, last push 2026-06-21 | F gh api |
| PatrickJS/awesome-cursorrules | 0 of last 30 merged, 104 open | F gh api |
| ComposioHQ and travisvn awesome-claude-skills | 0 of last 30 merged, 1,679 and 866 open | F gh api |
| e2b-dev/awesome-ai-agents | 0 of last 30 merged, 1,101 open | F gh api |
| lorien/awesome-web-scraping | Alive (7 of 30 merged) but lists libraries, not hosted services | F README sections |
| r/SEO | Tool mentions removed as shilling (third-party guide) | snippet, UNVERIFIED |
| Show HN for Actors | HN asks for no signup barriers; Actors need an Apify account | F showhn.html |
| Apify blog | No guest-post path found | UNVERIFIED |
| LinkedIn | Forbidden by owner rules | CLAUDE.md |

## Key fetched facts

- Our Store search positions (api.apify.com/v2/store?search=, limit 100). Not in the top 100 for "youtube transcript", "google trends", "app store reviews", "google play reviews", "google ads transparency", "website screenshot", "google news", "tiktok transcript", "web fetch". Position 51 for "screenshot pdf". The 4 private Actors are not public yet, so their misses are expected. The Apify MCP `search-actors` tool most likely uses the same search, so agents will not find us either (INFERENCE).
- Top-10 users in 30 days per keyword: youtube transcript 15,238; web fetch 27,756; google trends 5,027; google ads transparency 2,700; website screenshot 2,483; google news 1,380; tiktok transcript 1,325; google play reviews 1,200; app store reviews 1,172.
- MCP registry (registry.modelcontextprotocol.io). 191 entries match "apify". I checked 24 Actors created in 2026 that are listed there (17) or in awesome-remote-mcp-servers (7). 20 have 1 to 4 users ever, which is about what ours have (our account plus the Apify auto-test). The other 4 have 22 to 87 users ever, and they sit in niches with Store search demand (contact extraction, bulk HTTP, Threads, keyword volume). The listing alone does not explain their users.
- Reddit. reddit.com JSON returns 403 from this host. Subscriber counts come from GummySearch page-data JSON (2026-11-05). Rules come from mirrors and must be checked in the live sidebar before posting.
- Hacker News (hn.algolia.com). Last 45 days of Show HN, sample of 1,000: median 2 points, 7.4% reach 10, 3.7% reach 30, 1.8% reach 100.
- Context Drift. VS Code gallery downloadCount 24 for 0.1.4 (FETCHED 2026-11-06; COMMON.md says 43 downloads, so the counters differ). Not on Open VSX (404). GitHub 0 stars, 0 topics.

## Owner steps
1. After 21:10 today, check the 9 Store links, then post draft 01 in Discord and draft 02 in r/webscraping. 30 minutes.
2. This week, post draft 03 on dev.to and draft 05 on r/mcp. Post draft 04 only if the r/PPC sidebar allows it.
3. For Context Drift, wait for the 0.1.5 README (B6C) and Open VSX (I6B), then post draft 06 on Show HN and the Reddit posts. Submit to awesome-claude-code on or after 2026-11-19.
4. Spend more time on Store search position (I6A, B6A) than on any channel above. That is where the 15,238 monthly transcript users are.

Raw data is in out/I6D-raw/. The scoring script is out/I6D-scripts/score.py (run `python3 -I out/I6D-scripts/score.py out`).

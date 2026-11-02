# ❓ What's It On?

> Pick your teams or sports and see every way to watch: free TV, cable and streaming. A fully automated schedule for 40+ U.S. leagues, running on free tools.

[![Netlify Status](https://api.netlify.com/api/v1/badges/333b1a77-f554-45a9-b620-395e12ceb86e/deploy-status)](https://app.netlify.com/sites/higgins-sports-schedule/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Live Site:** [https://higgins-sports-schedule.netlify.app/](https://higgins-sports-schedule.netlify.app/)

> Formerly **Sports On TV**, a local broadcast-only schedule. It now covers any major U.S. sporting event and shows every network, paid or free.

---

## 📋 Table of Contents

- [About](#about)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Security & Privacy](#security--privacy)
- [Automation](#automation)
- [Usage](#usage)
- [Run Your Own](#run-your-own)
- [API Limits](#api-limits)
- [Known Limitations](#known-limitations)
- [Future Enhancements](#future-enhancements)
- [License](#license)

---

## 🎯 About

**What's It On?** answers one question: *where can I watch this game?* Pick the teams, leagues and sports you follow and the page shows every upcoming game with **all** the ways to watch it, whether that is a free over-the-air channel, cable, or a streaming service.

Game data is fetched automatically from ESPN's public scoreboard API (plus a few other free sources), cleaned up by a Google Apps Script, and stored in a Google Sheet that the static website reads directly.

### Key Highlights

- **Every way to watch**: free TV, cable/satellite, streaming and local/regional channels, color-coded
- **Pick what you follow**: sports, leagues and teams, saved on your device and shareable by link
- **40+ leagues**: NFL, college football and basketball, NBA, WNBA, NHL, MLB, soccer (Premier League, MLS, Champions League and more), F1, IndyCar, NASCAR, UFC, golf, tennis and others
- **Automated**: full refresh daily, lighter refreshes every 6 hours, no manual updates
- **No accounts, no backend server**: static site + Google Sheet
- **Free to run**: Apps Script, Sheets and Netlify free tiers

---

## ✨ Features

### Core Functionality

- 📺 **All networks, color-coded**: green = free over-the-air, blue = cable/satellite, purple = streaming, dashed = local/regional
- ⭐ **Pick your teams, sports and leagues**: search a team, league or sport, or tap a sport chip; picks are saved in your browser
- 🔗 **Shareable links**: your picks and filters live in the URL (`?sport=NHL&team=Tampa+Bay+Lightning`); **Copy link** to open them on another device
- 🆓 **Free TV only** toggle, plus network and day filters
- ♻️ **Reset all** clears every pick and filter in one click
- 🕒 **Your timezone by default** (switchable), with exact start times including daylight saving
- 📅 **Add to calendar**: `.ics` download and Google Calendar link for any game
- 🟢 **Live badge** and automatic hiding of games that have ended
- 🌗 **Dark and light themes** (light is a cream-and-raspberry "bakery" palette)
- 📱 **Responsive** from phone to desktop

### Extra Game Details

- Betting lines (NFL, NBA, NHL, college football and basketball, UFC) from public sportsbooks, shown as information only
- Weather for outdoor NFL, college football and NASCAR games within the 5-day forecast window
- UFC fight cards with moneylines, tennis day-sheets, golf round-by-round rows, F1 qualifying and race sessions
- "Time TBA" for games whose start time is not set yet, and "usually on" labels where a league's network isn't announced

### Optional Build Step

`build.js` pre-renders the page for search engines and generates per-sport and per-league landing pages (`/nfl/`, `/soccer/premier-league/`), a sitemap, and subscribable calendar feeds per sport and per team. See [Run Your Own](#run-your-own).

---

## 🛠️ Technology Stack

### Frontend

- **HTML5 / CSS3 / vanilla JavaScript** (no frameworks), a single `index.html`
- **Intl APIs** for timezone handling, **localStorage** for saved picks, theme and timezone

### Backend & Data

- **Google Apps Script**: serverless data fetching and cleaning (`apps-script/Code.gs`)
- **Google Sheets**: data store, publicly readable (view-only)
- **ESPN public scoreboard API**: schedules and broadcasters (undocumented, unofficial)
- **NASCAR public API** (`cf.nascar.com`), **The Odds API**, **OpenWeather**
- **Netlify**: static hosting and CI/CD from this repo

### DevOps

- **Git/GitHub**: version control
- **Netlify**: automatic deploys on push; optional `node build.js` build (Node 18+, no dependencies)
- **Security headers** configured in `netlify.toml`

---

## 🏗️ Architecture

### Data Flow

```
ESPN API ─┐
NASCAR API├─► Google Apps Script ─► Google Sheet ─► Website (fetches CSV)
Odds API ─┤        ▲                    │
Weather ──┘        │                    └─► optional Netlify build ─► pre-rendered pages,
manual_games tab ──┘                         landing pages, calendar feeds
```

### Components

1. **Data Fetcher (Google Apps Script)**: runs on a schedule, fetches ~40 leagues in parallel batches, normalizes networks, merges manual entries, adds odds and weather, then writes the sheet. It never overwrites the sheet with an empty or collapsed result, keeps the last known rows for any source that fails, and emails you about problems.
2. **Data Store (Google Sheet)**: one row per game.

   | Column | Content |
   |---|---|
   | A-C | Date, time, matchup |
   | D | Primary network |
   | E | Sport (what people pick) |
   | F | Details (venue, rankings, weather, odds) |
   | G | Start time (ISO with Eastern offset; date-only for all-day/TBA rows) |
   | H | Odds (cached between light refreshes) |
   | I | "Updated" timestamp (row 2) |
   | J | Networks as JSON: every way to watch, tagged TV/streaming, local, "usually" |
   | K-L | League, kind (`team` or `event`) |

3. **`manual_games` tab**: hand-entered games (e.g. a regional team's local broadcasts) merged into the feed; several networks per cell (`ESPN | The Spot (local)`).
4. **Frontend (static site)**: fetches the sheet, filters client-side, refreshes every 5 minutes.

### Why This Architecture?

- **Simple**: no database or server to run
- **Free**: Apps Script, Sheets and Netlify free tiers
- **Fast and scalable**: static files on a CDN
- **Resilient**: every layer has fallbacks (retries, last-known rows, write guard)

---

## 🔒 Security & Privacy

### Security Headers (`netlify.toml`)

- ✅ **X-Frame-Options: DENY**: prevents clickjacking
- ✅ **X-Content-Type-Options: nosniff**: stops MIME sniffing
- ✅ **X-XSS-Protection**: legacy browser XSS filter
- ✅ **Strict-Transport-Security (HSTS)**: forces HTTPS for a year
- ✅ **Referrer-Policy: strict-origin-when-cross-origin**
- ✅ **Permissions-Policy**: disables location, camera, microphone and other unused features
- ⏳ **Content-Security-Policy**: temporarily removed to keep Google Sheets access working; adding a proper allowlist back is on the to-do list

Test it yourself: [SecurityHeaders.com scan](https://securityheaders.com/?q=https://higgins-sports-schedule.netlify.app/)

### Privacy

- No accounts, logins or personal data collected by the site
- Saved picks, theme and timezone live only in your browser (`localStorage`)
- Google Analytics is included for anonymous usage statistics and sets its own cookies; remove the `gtag` snippet from `index.html` to run without it
- All page text from the data source is HTML-escaped before display

### Secrets

- **Never commit API keys.** The copy of `Code.gs` in this repo has the key fields blank; add your own inside the Apps Script editor only. Without keys the script simply skips odds and weather.

---

## 🤖 Automation

### Schedule

| Run | When | What it does |
|---|---|---|
| `updateSchedule` | Daily, about 4:00 AM Eastern | Full refresh, including odds |
| `refreshSchedule` | Every 6 hours | Light refresh; reuses stored odds so no odds credits are spent |
| Website | Every 5 minutes (per visitor) | Re-reads the sheet |

### How It Works

1. **Probe** each league's calendar, then fetch only days that can have games (all in parallel batches)
2. **Collect networks**: every broadcaster ESPN lists, tagged national/local and TV/streaming; some leagues fall back to their usual U.S. home (marked "usually")
3. **Merge** manual entries with ESPN data (union of networks, no duplicate games)
4. **Enrich** with odds and weather (cached, capped per run)
5. **Write** to the sheet in place, only if the result looks healthy; otherwise keep the previous data and send an alert

### Sports Coverage

- **Football**: NFL, college football
- **Basketball**: NBA, WNBA, men's and women's college
- **Hockey**: NHL, college hockey
- **Baseball/softball**: MLB, college baseball and softball
- **Soccer**: Premier League, MLS, NWSL, Champions/Europa/Conference League, La Liga, Bundesliga, Serie A, Ligue 1, Liga MX, FA Cup, Carabao Cup, EFL Championship and more
- **Motorsports**: Formula 1, IndyCar, NASCAR
- **Combat/Other**: UFC, PFL, golf (PGA, LPGA, LIV, DP World), tennis (ATP, WTA), college volleyball, lacrosse

Leagues are listed in the `LEAGUES` array at the top of `apps-script/Code.gs`; add or remove entries freely.

---

## 🎮 Usage

### For Users

1. **Visit**: [https://higgins-sports-schedule.netlify.app/](https://higgins-sports-schedule.netlify.app/)
2. **Pick** your sports, leagues or teams in the box at the top (collapse it with the arrow)
3. **Narrow** the list with day and network filters, or **Free TV only**
4. **Tap a game** to see every place to watch, follow its teams, or add it to your calendar
5. **Come back anytime**: your picks are saved on your device; **Copy link** to use them elsewhere
6. **Reset all** to start over

### For Developers

A compact example of:
- A framework-free single-page app with client-side filtering and URL state
- Serverless data pipelines on Google Apps Script
- Working with undocumented public APIs defensively (batching, retries, fallbacks)
- A zero-dependency static build step for SEO and calendar feeds

---

## 🚀 Run Your Own

1. **Sheet**: create a Google Sheet with a tab named `schedule_template` (and optionally `manual_games`, see `apps-script/manual_games.csv`). Share it as view-only.
2. **Script**: open *Extensions → Apps Script*, paste `apps-script/Code.gs`, set `SHEET_ID`, set the project time zone to America/New_York (see `apps-script/appsscript.json`), optionally add free Odds API / OpenWeather keys.
3. **Run** `updateSchedule` once and approve permissions, then run `createTriggers`.
4. **Site**: set `SHEET_ID` in `index.html`, push this repo, and connect it to Netlify.
5. **Optional build**: to enable pre-rendering, landing pages and calendar feeds, uncomment the `[build]` block in `netlify.toml`, add a Netlify *build hook*, and paste its URL into `NETLIFY_BUILD_HOOK` in `Code.gs` so every sheet update rebuilds the site. If your domain differs, set the `SITE_URL` environment variable in Netlify.

More detail is in [`apps-script/README.md`](apps-script/README.md).

---

## 📏 API Limits

Everything here runs on free tiers. Current usage is well inside each limit.

| Service | Limit | This project |
|---|---|---|
| **ESPN scoreboard API** | None published (undocumented, can change or block anytime) | ~900 requests per run, batched, with one retry on 429/5xx |
| **Apps Script** | 20,000 URL fetches/day, 6 min per run, 90 min of trigger time/day (consumer account) | ~4 runs/day: ~3,800 fetches, ~7 minutes |
| **The Odds API** (free) | 500 credits/month (1 per market per region) | ~17 per daily run; a backup key is supported |
| **OpenWeather** (free forecast) | 60 calls/minute, 1,000,000/month | Capped at 50 per run; forecasts are cached |

---

## ⚠️ Known Limitations

- **Networks come from ESPN.** Leagues like the Premier League often have no channel listed until match day, so a "usually on" guess is shown (dotted, italic) until it's confirmed. Always check your TV provider's guide.
- **Local and regional channels** depend on where you live; the site can't know your market and shows them as "local".
- **Subscriptions and providers** determine what you can actually watch.
- ESPN has no data for boxing, MotoGP, rugby or cricket; add those in the `manual_games` tab.
- Picks live in your browser. They don't sync across devices except by sharing the link.

---

## 🔮 Future Enhancements

### Done

- [x] MLB, MLS and soccer coverage
- [x] College basketball
- [x] Favorite teams, sports and leagues (saved locally)
- [x] Calendar export (`.ics`) and subscribable feeds
- [x] Dark/light themes
- [x] Timezone support (auto-detected)
- [x] Odds, weather and an "Updated" stamp

### Ideas

- [ ] Accounts or sync so picks follow you across devices
- [ ] Per-team landing pages for search
- [ ] Content-Security-Policy with a Google Sheets allowlist
- [ ] Service Worker / PWA for offline use
- [ ] Notifications for followed teams
- [ ] Team logos and live scores
- [ ] Automated tests in CI
- [ ] A real source for far-ahead soccer broadcast listings (no free source found yet)

---

## 📊 Project Stats

- **Frontend**: one file, ~1,350 lines (HTML, CSS, JS)
- **Apps Script**: ~1,150 lines
- **Build script**: ~350 lines, no dependencies
- **Leagues tracked**: 40+
- **Games at any time**: ~2,700 across 15 sports
- **Updates**: daily full run plus refreshes every 6 hours

---

## 🤝 Contributing

This is a personal portfolio project, but feedback and suggestions are always welcome!

If you have ideas for improvements:
1. Open an issue describing your suggestion
2. Include use cases and benefits
3. Be specific about implementation if possible

---

## 📄 License

MIT License

Copyright (c) 2026 Ben Higgins

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 👨‍💻 Author

**Ben Higgins**

- Senior Systems Administrator at Air Force Institute of Technology (AFIT)
- Specializing in automation, infrastructure, and secure web applications

---

## 🙏 Acknowledgments

- **ESPN**: for the public scoreboard API this project is built on
- **The Odds API** and **OpenWeather**: for generous free tiers
- **Netlify**: for static hosting and CI/CD
- **Google**: for Apps Script and Sheets
- **Security Headers Project**: for security best practices guidance

---

## 🔗 Links

- **Live Site**: [https://higgins-sports-schedule.netlify.app/](https://higgins-sports-schedule.netlify.app/)
- **Security Test**: [SecurityHeaders.com Result](https://securityheaders.com/?q=https://higgins-sports-schedule.netlify.app/)
- **GitHub Repository**: [This Repo]

---

**Built without ADs by Ben Higgins**

*Last Updated: November 2026*

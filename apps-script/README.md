# Apps Script (data pipeline)

`Code.gs` is the whole backend: it fetches schedules, normalizes networks, merges manual games, adds odds and weather, and writes the Google Sheet the website reads.

| File | Purpose |
|---|---|
| `Code.gs` | The script. Paste into *Extensions → Apps Script*. API keys are blank here; add yours in the editor, never in a public repo. |
| `appsscript.json` | Manifest: sets the project time zone to America/New_York. |
| `manual_games.csv` | Example data for the `manual_games` tab (a regional team's local broadcasts). |

## Setup

1. Create the sheet tabs `schedule_template` (leave empty) and optionally `manual_games`.
2. Set `SHEET_ID` at the top of `Code.gs`.
3. Project Settings → time zone **America/New_York** (or paste `appsscript.json`).
4. Optional keys (leave blank to skip): `ODDS_API_KEY_PRIMARY` / `ODDS_API_KEY_BACKUP` ([the-odds-api.com](https://the-odds-api.com/), free tier 500 credits/month) and `OPENWEATHER_API_KEY` ([openweathermap.org](https://openweathermap.org/api), free).
5. Run `updateSchedule` (approve permissions), check the log, then run `createTriggers`.

Entry points: `updateSchedule` (full, daily ~4 AM ET), `refreshSchedule` (light, every 6 hours), `createTriggers` (installs both).

## What to tune (top of `Code.gs`)

- `LEAGUES`: what is tracked. Each entry has a `sport` (what users pick), `league`, ESPN `path`, `kind` (`team`, `golf`, `racing`, `tennis`, `mma`), optional `days`/`query`/odds settings.
- `DEFAULT_NETWORKS`: usual U.S. home for leagues where ESPN lists no channel yet (shown as "usually"). Options: `sure`, `always`, `implied`.
- `DAYS_AHEAD`, `SHOW_TBD_TIMES`, `MIN_ROWS_RATIO` (write guard), `WEATHER_MAX_CALLS_PER_RUN`, `ALERT_EMAIL`.
- `NETLIFY_BUILD_HOOK`: optional URL pinged after each successful write so Netlify rebuilds the pre-rendered pages and calendar feeds.

## Sheet format

| Column | Content |
|---|---|
| A-C | Date, time, matchup |
| D | Primary network |
| E | Sport |
| F | Details |
| G | Start (ISO with Eastern offset; date-only for all-day/TBA) |
| H | Odds cache |
| I | Updated timestamp (row 2) |
| J | Networks (JSON: `{n, t:'tv'|'stream', l:1 local, u:1 usually}`) |
| K | League |
| L | Kind (`team` / `event`) |

## `manual_games` tab

Columns: `start_et | matchup | network | sport | additional_info | league | kind`.
`start_et` is Eastern wall-clock `yyyy-MM-dd HH:mm`. `network` takes several values and tags: `ESPN | The Spot (local) | Peacock (usually)`. Format column A as plain text (or untick "convert text to dates" when importing).

## Quotas

Apps Script (consumer): 20,000 URL fetches/day, 6 min per run, 90 min trigger time/day. A run makes ~900 ESPN requests and ~1 minute of runtime. See the main README's *API Limits* section.

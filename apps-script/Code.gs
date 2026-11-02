// ========================================
// WHAT'S IT ON? - SCHEDULE UPDATER v7.0
//
// v7.0 - "where to watch ANY major U.S. sporting event":
//  * No network whitelist. Every broadcaster ESPN lists is kept -
//    free over-the-air, cable and streaming - national AND local, each
//    tagged (tv/stream, local). A game can have many.
//  * Premier League & other soccer, WNBA, college hockey/volleyball/
//    baseball/softball, IndyCar, DP World/LIV golf, PFL, lacrosse added to
//    the NFL/NBA/NHL/MLB/college/golf/F1/tennis/UFC/NASCAR set.
//  * Leagues ESPN gives no network for (e.g. Premier League) fall back to
//    the league's usual home in DEFAULT_NETWORKS, marked "usually".
//  * One batched pipeline: a calendar probe per league, then only the days
//    that have games, fetched in parallel.
//  * Sheet columns: A date | B time | C matchup | D primary network |
//    E sport | F details | G start ISO | H odds | I updated (row 2) |
//    J networks (JSON) | K league | L kind (team/event)
//  * The sheet tab "manual_games" now takes optional league and kind
//    columns and several networks in one cell ("ESPN | Peacock").
//
// Entry points:
//   updateSchedule()   full run incl. Odds API (daily trigger, 4 AM ET)
//   refreshSchedule()  light run, reuses stored odds (every 6 hours)
//   createTriggers()   run once to install both triggers
// ========================================

// ---------- CONFIG ----------
const SHEET_ID = '1gs8pwsOGR7yepLg1bTTthYmZ_NNprgP6-1Znu4ieRXM';   // your Google Sheet's ID (from its URL)
const SHEET_NAME = 'schedule_template';
const MANUAL_SHEET_NAME = 'manual_games';

const TZ = 'America/New_York';
const DAYS_AHEAD = 30;
const SHOW_TBD_TIMES = true;        // list games ESPN hasn't set a start time for as "Time TBA" (false = hide them)
const MIN_ROWS_RATIO = 0.4;         // refuse to write if rows fall below 40% of previous
const BATCH_SIZE = 100;             // parallel requests per UrlFetchApp.fetchAll
const ALERT_EMAIL = '';             // blank = email the script owner
const NETLIFY_BUILD_HOOK = '';      // optional: Netlify build-hook URL, pinged after each successful write

// API KEYS: all optional. Leave blank to skip odds / weather. Never commit real keys to a public repo.
//   The Odds API (free, 500 credits/month): https://the-odds-api.com/
//   OpenWeather (free, 60 calls/minute):    https://openweathermap.org/api
const OPENWEATHER_API_KEY = '';
const ODDS_API_KEY_PRIMARY = '';
const ODDS_API_KEY_BACKUP = '';

// No Odds API key configured = odds are skipped quietly (no error emails).
const HAVE_ODDS_KEY = !!(ODDS_API_KEY_PRIMARY || ODDS_API_KEY_BACKUP);

const ESPN_BASE_URL = 'https://site.web.api.espn.com/apis/site/v2/sports';
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/'
};

// ---------- WHAT WE TRACK ----------
// sport  = what people pick ("NFL", "Soccer", ...);  league = the competition
// kind   = 'team' (A vs B) | 'golf' | 'racing' | 'tennis' | 'mma'
// days   = horizon override (long-tail college sports are limited to a week)
// query  = extra ESPN query string (full D1 slate for basketball)
// odds/markets = Odds API sport key and markets; weather = 'nfl' | 'city'
const LEAGUES = [
  // --- U.S. pro & college team sports
  { id: 'nfl',    sport: 'NFL',                league: 'NFL',                path: 'football/nfl',                          kind: 'team', odds: 'americanfootball_nfl',   markets: 'h2h,spreads,totals', weather: 'nfl' },
  { id: 'ncaaf',  sport: 'College Football',   league: 'College Football',   path: 'football/college-football',             kind: 'team', college: true, odds: 'americanfootball_ncaaf', markets: 'h2h,spreads,totals', weather: 'city' },
  { id: 'nba',    sport: 'NBA',                league: 'NBA',                path: 'basketball/nba',                        kind: 'team', odds: 'basketball_nba',         markets: 'h2h,spreads,totals' },
  { id: 'wnba',   sport: 'WNBA',               league: 'WNBA',               path: 'basketball/wnba',                       kind: 'team' },
  { id: 'ncaam',  sport: "Men's College Basketball",   league: "Men's College Basketball",   path: 'basketball/mens-college-basketball',   kind: 'team', college: true, query: 'groups=50&limit=400', days: 7, odds: 'basketball_ncaab', markets: 'h2h,spreads,totals' },
  { id: 'ncaaw',  sport: "Women's College Basketball", league: "Women's College Basketball", path: 'basketball/womens-college-basketball', kind: 'team', college: true, query: 'groups=50&limit=400', days: 7 },
  { id: 'nhl',    sport: 'NHL',                league: 'NHL',                path: 'hockey/nhl',                            kind: 'team', odds: 'icehockey_nhl',          markets: 'h2h,totals' },
  { id: 'ncaah',  sport: 'College Hockey',     league: 'College Hockey',     path: 'hockey/mens-college-hockey',            kind: 'team', college: true, days: 7 },
  { id: 'mlb',    sport: 'MLB',                league: 'MLB',                path: 'baseball/mlb',                          kind: 'team', odds: 'baseball_mlb',           markets: 'h2h,totals' },
  { id: 'ncaabb', sport: 'College Baseball',   league: 'College Baseball',   path: 'baseball/college-baseball',             kind: 'team', college: true, days: 14 },
  { id: 'ncaasb', sport: 'College Softball',   league: 'College Softball',   path: 'baseball/college-softball',             kind: 'team', college: true, days: 14 },
  { id: 'ncaavb', sport: 'College Volleyball', league: 'College Volleyball', path: 'volleyball/womens-college-volleyball',  kind: 'team', college: true, days: 7 },
  { id: 'pll',    sport: 'Lacrosse',           league: 'Premier Lacrosse League', path: 'lacrosse/pll',                     kind: 'team' },

  // --- Soccer
  { id: 'epl',    sport: 'Soccer', league: 'Premier League',     path: 'soccer/eng.1',            kind: 'team' },
  { id: 'mls',    sport: 'Soccer', league: 'MLS',                path: 'soccer/usa.1',            kind: 'team' },
  { id: 'nwsl',   sport: 'Soccer', league: 'NWSL',               path: 'soccer/usa.nwsl',         kind: 'team' },
  { id: 'ucl',    sport: 'Soccer', league: 'Champions League',   path: 'soccer/uefa.champions',   kind: 'team' },
  { id: 'uel',    sport: 'Soccer', league: 'Europa League',      path: 'soccer/uefa.europa',      kind: 'team' },
  { id: 'uecl',   sport: 'Soccer', league: 'Conference League',  path: 'soccer/uefa.europa.conf', kind: 'team' },
  { id: 'laliga', sport: 'Soccer', league: 'La Liga',            path: 'soccer/esp.1',            kind: 'team' },
  { id: 'bund',   sport: 'Soccer', league: 'Bundesliga',         path: 'soccer/ger.1',            kind: 'team' },
  { id: 'seriea', sport: 'Soccer', league: 'Serie A',            path: 'soccer/ita.1',            kind: 'team' },
  { id: 'ligue1', sport: 'Soccer', league: 'Ligue 1',            path: 'soccer/fra.1',            kind: 'team' },
  { id: 'ligamx', sport: 'Soccer', league: 'Liga MX',            path: 'soccer/mex.1',            kind: 'team' },
  { id: 'facup',  sport: 'Soccer', league: 'FA Cup',             path: 'soccer/eng.fa',           kind: 'team' },
  { id: 'efl',    sport: 'Soccer', league: 'Carabao Cup',        path: 'soccer/eng.league_cup',   kind: 'team' },
  { id: 'champ',  sport: 'Soccer', league: 'EFL Championship',   path: 'soccer/eng.2',            kind: 'team' },
  { id: 'ccc',    sport: 'Soccer', league: 'Concacaf Champions Cup', path: 'soccer/concacaf.champions', kind: 'team' },
  { id: 'usopen', sport: 'Soccer', league: 'U.S. Open Cup',      path: 'soccer/usa.open',         kind: 'team' },
  { id: 'libert', sport: 'Soccer', league: 'Copa Libertadores',  path: 'soccer/conmebol.libertadores', kind: 'team' },
  { id: 'intl',   sport: 'Soccer', league: 'International Friendly', path: 'soccer/fifa.friendly', kind: 'team' },
  { id: 'nations', sport: 'Soccer', league: 'Nations League',    path: 'soccer/uefa.nations',     kind: 'team' },

  // --- Events
  { id: 'ufc',    sport: 'UFC',   league: 'UFC',                 path: 'mma/ufc', kind: 'mma' },
  { id: 'pfl',    sport: 'MMA',   league: 'PFL',                 path: 'mma/pfl', kind: 'mma' },
  { id: 'f1',     sport: 'F1',    league: 'Formula 1',           path: 'racing/f1',  kind: 'racing' },
  { id: 'indy',   sport: 'IndyCar', league: 'IndyCar',           path: 'racing/irl', kind: 'racing' },
  { id: 'pga',    sport: 'Golf',  league: 'PGA Tour',            path: 'golf/pga',   kind: 'golf' },
  { id: 'lpga',   sport: 'Golf',  league: 'LPGA Tour',           path: 'golf/lpga',  kind: 'golf' },
  { id: 'liv',    sport: 'Golf',  league: 'LIV Golf',            path: 'golf/liv',   kind: 'golf' },
  { id: 'dpwt',   sport: 'Golf',  league: 'DP World Tour',       path: 'golf/eur',   kind: 'golf' },
  { id: 'atp',    sport: 'Tennis', league: 'ATP',                path: 'tennis/atp', kind: 'tennis' },
  { id: 'wta',    sport: 'Tennis', league: 'WTA',                path: 'tennis/wta', kind: 'tennis' }
];

// Odds for non-team events (matched separately). NASCAR is not offered by
// The Odds API, so it has no odds.
const UFC_ODDS = { sport: 'UFC', odds: 'mma_mixed_martial_arts', markets: 'h2h' };

// ESPN lists no broadcaster for some leagues far ahead (Premier League, ...).
// These are the leagues' usual U.S. homes, shown as "usually". Options per league:
//   nets    networks to show when ESPN lists none
//   sure    true = confirmed (no "usually" caveat)
//   always  true = add these to EVERY game even when ESPN lists channels
//   implied { 'ESPN name': ['also on'] }  extra networks when ESPN lists that one
// Edit as rights change.
const DEFAULT_NETWORKS = {
  'UFC':               { nets: ['Paramount+'], sure: true },
  // NBC's rights: games air on NBC (simulcast on Peacock), USA Network (cable login, NOT on
  // Peacock) or are Peacock-only, so until ESPN confirms a channel we list all three as usual.
  // To label every match Peacock regardless: { nets: ['Peacock'], sure: true, always: true }
  'Premier League':    { nets: ['Peacock', 'USA Network', 'NBC'], implied: { 'NBC': ['Peacock'] } },
  'La Liga':           { nets: ['ESPN+'] },
  'Bundesliga':        { nets: ['ESPN+'] },
  'Serie A':           { nets: ['Paramount+'] },
  'Ligue 1':           { nets: ['beIN Sports'] },
  'Champions League':  { nets: ['Paramount+'] },
  'Europa League':     { nets: ['Paramount+'] },
  'Conference League': { nets: ['Paramount+'] },
  'ATP':               { nets: ['Tennis Channel'] },
  'WTA':               { nets: ['Tennis Channel'] }
};

// OpenWeather's free forecast API allows 60 calls/minute. A run makes its weather calls
// back-to-back, so cap them (cached forecasts don't count); NFL goes first, so college
// football takes the cut on a busy week.
const WEATHER_MAX_CALLS_PER_RUN = 50;
let weatherCalls_ = 0;

const GOLF_MAX_DAYS = 8;
const TENNIS_MAX_LISTED = 20;   // matches listed in a day's detail

// ---------- NETWORKS ----------
// ESPN abbreviates; map them to what people call the channel. Anything not
// listed is kept exactly as ESPN gives it (nothing is dropped).
const NETWORK_ALIASES = {
  'FOX': 'FOX', 'NFL NET': 'NFL Network', 'ESPN UNLMTD': 'ESPN Unlimited', 'FOX SPORTS 1': 'FS1', 'FOXSPORTS1': 'FS1',
  'FOX SPORTS 2': 'FS2', 'FOXSPORTS2': 'FS2', 'FOX SPORTS': 'FOX', 'USA': 'USA Network', 'USA NET': 'USA Network',
  'TNT SPORTS': 'TNT', 'TRUTV': 'truTV', 'AMAZON PRIME VIDEO': 'Prime Video', 'AMAZON': 'Prime Video', 'PRIME': 'Prime Video',
  'NBC SPORTS': 'NBC Sports', 'CW': 'The CW', 'THE CW': 'The CW', 'PARAMOUNT': 'Paramount+',
  'GOLF CHNL': 'Golf Channel', 'GOLF': 'Golf Channel', 'TENNIS CHNL': 'Tennis Channel',
  'SECN': 'SEC Network', 'SECN+': 'SEC Network+', 'ACCN': 'ACC Network', 'ACCNX': 'ACC Network Extra',
  'BTN': 'Big Ten Network', 'B1G+': 'Big Ten+', 'CBSSN': 'CBS Sports Network', 'ESPNEWS': 'ESPNews',
  'APPLE TV+': 'Apple TV'
};
function displayNetwork_(raw) {
  const t = String(raw || '').trim();
  return t ? (NETWORK_ALIASES[t.toUpperCase()] || t) : '';
}
const STREAMING_RE = /(peacock|prime video|apple tv|espn\+|espn unlimited|paramount\+|netflix|\bmax\b|fubo|youtube|dazn|victory\+|season pass|nfl\+|league pass|big ten\+|secn\+|\bapp\b|\.com|\+$)/i;
const inferType_ = name => (STREAMING_RE.test(name) ? 'stream' : 'tv');

// Every way to watch one competition: [{n, t:'tv'|'stream', l:1 (local), u:1 (usually)}]
function collectNetworks_(comp, league) {
  const geoType = {};
  (comp.geoBroadcasts || []).forEach(g => {
    const nm = g.media && g.media.shortName;
    if (nm) geoType[String(nm).toLowerCase()] = /stream/i.test((g.type && g.type.shortName) || '') ? 'stream' : 'tv';
  });
  const out = [], seen = {};
  const add = (raw, local) => {
    const name = displayNetwork_(raw);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen[key] !== undefined) { if (!local) delete out[seen[key]].l; return; }   // a national listing beats a local one
    seen[key] = out.length;
    const n = { n: name, t: geoType[String(raw).toLowerCase()] || inferType_(name) };
    if (local) n.l = 1;
    out.push(n);
  };
  (comp.broadcasts || []).forEach(b => {
    const local = !!b.market && String(b.market).toLowerCase() !== 'national';
    (b.names || []).forEach(raw => add(raw, local));
  });
  if (!out.length && comp.broadcast) String(comp.broadcast).split(',').forEach(raw => add(raw, false));

  const d = league && DEFAULT_NETWORKS[league.league];
  const addTagged = (name, usual) => { const before = out.length; add(name, false); if (usual && out.length > before) out[out.length - 1].u = 1; };
  if (d && d.implied) out.slice().forEach(x => (d.implied[x.n] || []).forEach(n => addTagged(n, false)));   // e.g. NBC => also Peacock
  if (d && d.always) d.nets.forEach(n => addTagged(n, !d.sure));
  if (!out.length) return defaultNetworks_(league);
  return sortNetworks_(out);
}

function defaultNetworks_(league) {
  const d = league && DEFAULT_NETWORKS[league.league];
  if (!d) return [];
  return d.nets.map(n => (d.sure ? { n: n, t: inferType_(n) } : { n: n, t: inferType_(n), u: 1 }));
}

// national first (TV, then streaming), then local, then "usually" guesses
function sortNetworks_(list) {
  const rank = x => (x.u ? 4 : 0) + (x.l ? 2 : 0) + (x.t === 'stream' ? 1 : 0);
  return list.map((x, i) => ({ x: x, i: i })).sort((a, b) => (rank(a.x) - rank(b.x)) || (a.i - b.i)).map(o => o.x);
}

// "ESPN | The Spot (local) | Peacock (usually)"  ->  tags: (local) = regional channel, (usually) = unconfirmed
function parseNetworkText_(text) {
  return String(text || '').split(/\s*[|;,]\s*/).map(s => s.trim()).filter(Boolean).map(s => {
    const local = /\(local\)\s*$/i.test(s), usual = /\(usually\)\s*$/i.test(s);
    const n = displayNetwork_(s.replace(/\s*\((local|usually)\)\s*$/i, ''));
    const o = { n: n, t: inferType_(n) };
    if (local) o.l = 1;
    if (usual) o.u = 1;
    return o;
  });
}

// ---------- STADIUMS / TRACKS (weather) ----------
const NFL_STADIUMS = {
  'Buffalo Bills': { lat: 42.7738, lon: -78.7870, outdoor: true },
  'Miami Dolphins': { lat: 25.9580, lon: -80.2389, outdoor: false },
  'New England Patriots': { lat: 42.0909, lon: -71.2643, outdoor: true },
  'New York Jets': { lat: 40.8135, lon: -74.0745, outdoor: false },
  'Baltimore Ravens': { lat: 39.2780, lon: -76.6227, outdoor: true },
  'Cincinnati Bengals': { lat: 39.0954, lon: -84.5160, outdoor: true },
  'Cleveland Browns': { lat: 41.5061, lon: -81.6995, outdoor: true },
  'Pittsburgh Steelers': { lat: 40.4468, lon: -80.0158, outdoor: true },
  'Houston Texans': { lat: 29.6847, lon: -95.4107, outdoor: false },
  'Indianapolis Colts': { lat: 39.7601, lon: -86.1639, outdoor: false },
  'Jacksonville Jaguars': { lat: 30.3239, lon: -81.6373, outdoor: true },
  'Tennessee Titans': { lat: 36.1665, lon: -86.7713, outdoor: true },
  'Denver Broncos': { lat: 39.7439, lon: -105.0201, outdoor: true },
  'Kansas City Chiefs': { lat: 39.0489, lon: -94.4839, outdoor: true },
  'Las Vegas Raiders': { lat: 36.0908, lon: -115.1833, outdoor: false },
  'Los Angeles Chargers': { lat: 33.9534, lon: -118.3390, outdoor: true },
  'Dallas Cowboys': { lat: 32.7473, lon: -97.0945, outdoor: false },
  'New York Giants': { lat: 40.8135, lon: -74.0745, outdoor: false },
  'Philadelphia Eagles': { lat: 39.9008, lon: -75.1675, outdoor: true },
  'Washington Commanders': { lat: 38.9076, lon: -76.8645, outdoor: true },
  'Chicago Bears': { lat: 41.8623, lon: -87.6167, outdoor: true },
  'Detroit Lions': { lat: 42.3400, lon: -83.0456, outdoor: false },
  'Green Bay Packers': { lat: 44.5013, lon: -88.0622, outdoor: true },
  'Minnesota Vikings': { lat: 44.9738, lon: -93.2577, outdoor: false },
  'Atlanta Falcons': { lat: 33.7553, lon: -84.4009, outdoor: false },
  'Carolina Panthers': { lat: 35.2258, lon: -80.8528, outdoor: true },
  'New Orleans Saints': { lat: 29.9511, lon: -90.0812, outdoor: false },
  'Tampa Bay Buccaneers': { lat: 27.9759, lon: -82.5033, outdoor: true },
  'Arizona Cardinals': { lat: 33.5276, lon: -112.2626, outdoor: false },
  'Los Angeles Rams': { lat: 33.9534, lon: -118.3390, outdoor: true },
  'San Francisco 49ers': { lat: 37.4032, lon: -121.9700, outdoor: true },
  'Seattle Seahawks': { lat: 47.5952, lon: -122.3316, outdoor: true }
};


const NASCAR_TRACKS = {
  'Daytona International Speedway': { lat: 29.1853, lon: -81.0697 },
  'Phoenix Raceway': { lat: 33.3750, lon: -112.3110 },
  'Las Vegas Motor Speedway': { lat: 36.2725, lon: -115.0108 },
  'Homestead-Miami Speedway': { lat: 25.4500, lon: -80.4090 },
  'Circuit of the Americas': { lat: 30.1328, lon: -97.6411 },
  'Richmond Raceway': { lat: 37.5928, lon: -77.4197 },
  'Martinsville Speedway': { lat: 36.6342, lon: -79.8514 },
  'Texas Motor Speedway': { lat: 33.0372, lon: -97.2814 },
  'Talladega Superspeedway': { lat: 33.5678, lon: -86.0667 },
  'Kansas Speedway': { lat: 39.1158, lon: -94.8300 },
  'Charlotte Motor Speedway': { lat: 35.3506, lon: -80.6828 },
  'World Wide Technology Raceway': { lat: 38.6504, lon: -90.1356 },
  'Nashville Superspeedway': { lat: 35.7706, lon: -86.4364 },
  'Dover Motor Speedway': { lat: 39.1897, lon: -75.5283 },
  'Iowa Speedway': { lat: 41.6936, lon: -93.0581 },
  'New Hampshire Motor Speedway': { lat: 43.3622, lon: -71.4628 },
  'New Hampshire': { lat: 43.3622, lon: -71.4628 },
  'Pocono Raceway': { lat: 41.0561, lon: -75.5133 },
  'Indianapolis Motor Speedway': { lat: 39.7950, lon: -86.2347 },
  'Michigan International Speedway': { lat: 42.0656, lon: -84.2433 },
  'Sonoma Raceway': { lat: 38.1614, lon: -122.4544 },
  'Chicagoland Speedway': { lat: 41.4747, lon: -88.0556 },
  'Atlanta Motor Speedway': { lat: 33.3869, lon: -84.3164 },
  'Watkins Glen International': { lat: 42.3369, lon: -76.9272 },
  'Darlington Raceway': { lat: 34.2956, lon: -79.9067 },
  'North Wilkesboro Speedway': { lat: 36.1614, lon: -80.9011 },
  'Bristol Motor Speedway': { lat: 36.5161, lon: -82.2569 },
  'Rockingham Speedway': { lat: 34.9342, lon: -79.5867 },
  'Coronado Street Course': { lat: 32.6909, lon: -117.1789 },
  'Naval Base Coronado': { lat: 32.6909, lon: -117.1789 },
  'Bowman Gray Stadium': { lat: 36.1042, lon: -80.2356 },
  'Lime Rock Park': { lat: 41.9281, lon: -73.3858 },
  'Berlin Raceway': { lat: 42.9311, lon: -85.4408 },
  'Elko Speedway': { lat: 44.7894, lon: -93.3242 },
  'Illinois State Fairgrounds': { lat: 39.7872, lon: -89.6440 },
  'Madison International Speedway': { lat: 42.8347, lon: -89.3406 },
  'DuQuoin State Fairgrounds': { lat: 37.9978, lon: -89.2362 },
  'Salem Speedway': { lat: 38.6206, lon: -86.0997 },
  'Toledo Speedway': { lat: 41.6011, lon: -83.6736 },
  'Indianapolis Raceway Park': { lat: 39.7903, lon: -86.3433 }
};

// ========================================
// ENTRY POINTS
// ========================================

function updateSchedule() { runUpdate_({ fetchOdds: true }); }
function refreshSchedule() { runUpdate_({ fetchOdds: false }); }

function runUpdate_(opts) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Another run is in progress - skipping.'); return; }
  const problems = [];
  try {
    Logger.log(`=== Schedule update (odds fetch: ${opts.fetchOdds}) ===`);
    weatherCalls_ = 0;
    const win = windowBounds_();
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const prev = loadPrevious_(sheet);

    // ---- collect, each source isolated so one failure can't kill the run
    const collected = [];
    const failedLeagues = new Set();
    const source = (name, leagueNames, fn) => {
      try {
        const g = fn();
        g.forEach(x => collected.push(x));
        if (g.length) Logger.log(`${name}: ${g.length}`);
      } catch (e) {
        problems.push(`${name}: ${e && e.message ? e.message : e}`);
        leagueNames.forEach(s => failedLeagues.add(s));
        Logger.log(`${name} FAILED: ${e}`);
      }
    };

    let espn = null;
    try { espn = fetchAllLeagueEvents_(LEAGUES, win); } catch (e) { problems.push(`ESPN: ${e.message || e}`); }
    LEAGUES.forEach(l => source(l.league, [l.league], () => {
      if (!espn) throw new Error('ESPN unavailable');
      const r = espn[l.id];
      if (r.failed) throw new Error(`all ${r.total} ESPN requests failed`);
      return gamesForLeague_(l, r.events, win);
    }));
    source('NASCAR', ['Cup Series', "O'Reilly Auto Parts Series", 'Craftsman Truck Series'], () => fetchNASCAREvents_(win));
    source('manual_games', [], () => readManualGames_(win, problems));

    // ---- last-known rows stand in for any source that failed outright
    prev.rows.forEach(g => {
      if (failedLeagues.has(g.league) && g.dateTime >= win.start && g.dateTime <= win.end) collected.push(g);
    });

    // ---- merge, odds, finalize
    const games = mergeGames_(collected);
    attachOdds_(games, opts, prev, problems);
    games.forEach(g => {
      if (g.source !== 'carried') g.additionalInfo = composeInfo_(g);
    });
    games.sort((a, b) => a.dateTime - b.dateTime);
    Logger.log(`Final: ${games.length} games (weather calls: ${weatherCalls_}/${WEATHER_MAX_CALLS_PER_RUN})`);

    writeToSheet_(sheet, games, prev.count);
    triggerSiteRebuild_();
    Logger.log('=== Update complete ===');
  } catch (e) {
    problems.push(`FATAL: ${e && e.message ? e.message : e}`);
    Logger.log('FATAL: ' + e);
    throw e;
  } finally {
    lock.releaseLock();
    if (problems.length) notify_('What\'s It On? update: ' + problems.length + ' problem(s)', problems.join('\n'));
  }
}

function triggerSiteRebuild_() {
  if (!NETLIFY_BUILD_HOOK) return;
  try {
    const r = UrlFetchApp.fetch(NETLIFY_BUILD_HOOK, { method: 'post', muteHttpExceptions: true });
    Logger.log(`Netlify rebuild requested (HTTP ${r.getResponseCode()})`);
  } catch (e) {
    Logger.log('Netlify rebuild hook failed: ' + e);   // never fail the update over this
  }
}

function notify_(subject, body) {
  try {
    MailApp.sendEmail(ALERT_EMAIL || Session.getEffectiveUser().getEmail(), subject, body);
  } catch (e) {
    Logger.log('Could not send alert email: ' + e);
  }
}

// ========================================
// DATE / TIME HELPERS (always America/New_York)
// ========================================

function fmtDate_(d) { return Utilities.formatDate(d, TZ, 'EEEE, MMMM d'); }
function fmtTime_(d) { return Utilities.formatDate(d, TZ, 'h:mm a'); }
function fmtYmd_(d) { return Utilities.formatDate(d, TZ, 'yyyyMMdd'); }
function fmtIso_(d) { return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
// Sheet column G: full ISO for timed games, date-only for all-day rows.
function isoOf_(g) { return g.allDay ? Utilities.formatDate(g.dateTime, TZ, 'yyyy-MM-dd') : fmtIso_(g.dateTime); }
function tzAbbr_(d) { return Utilities.formatDate(d, TZ, 'z'); }

// 'yyyy-MM-dd HH:mm' (Eastern wall-clock) -> Date, or null
function parseET_(s) {
  try {
    const d = Utilities.parseDate(String(s).trim(), TZ, 'yyyy-MM-dd HH:mm');
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
}

function windowBounds_() {
  const now = new Date();
  const start = parseET_(Utilities.formatDate(now, TZ, 'yyyy-MM-dd') + ' 00:00'); // today 00:00 ET
  return { now: now, start: start, end: new Date(now.getTime() + DAYS_AHEAD * 86400000) };
}

// yyyyMMdd strings for the days of a league's horizon; anchored at noon ET so
// DST changes can neither skip nor repeat a day.
function leagueDays_(win, days) {
  const out = [];
  for (let i = 0; i <= days; i++) out.push(fmtYmd_(new Date(win.start.getTime() + i * 86400000 + 12 * 3600000)));
  return out.filter((d, i) => out.indexOf(d) === i);
}

const inWindow_ = (g, win) => g.dateTime >= win.start && g.dateTime <= win.end;

// ========================================
// ESPN FETCHING
// ========================================

// Parallel GETs (in batches) with one retry for 429/5xx. Parsed JSON or null per url.
function fetchJsonAll_(urls) {
  const out = new Array(urls.length);
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const slice = urls.slice(i, i + BATCH_SIZE);
    const reqs = slice.map(u => ({ url: u, muteHttpExceptions: true, headers: ESPN_HEADERS }));
    const res = UrlFetchApp.fetchAll(reqs);
    const retry = [];
    res.forEach((r, k) => { const c = r.getResponseCode(); if (c === 429 || c >= 500) retry.push(k); });
    if (retry.length) {
      Utilities.sleep(1500);
      const again = UrlFetchApp.fetchAll(retry.map(k => reqs[k]));
      retry.forEach((k, j) => { res[k] = again[j]; });
    }
    res.forEach((r, k) => {
      let data = null;
      if (r.getResponseCode() === 200) { try { data = JSON.parse(r.getContentText()); } catch (e) { data = null; } }
      else Logger.log(`HTTP ${r.getResponseCode()} for ${slice[k]}`);
      out[i + k] = data;
    });
  }
  return out;
}

// One calendar probe per league, then only the days that can have games.
// Returns { [league.id]: { events, failed, total } }.
function fetchAllLeagueEvents_(leagues, win) {
  const probes = fetchJsonAll_(leagues.map(l => `${ESPN_BASE_URL}/${l.path}/scoreboard`));
  const jobs = [];   // { lg, url }
  leagues.forEach((l, i) => {
    let days = leagueDays_(win, l.days || DAYS_AHEAD);
    const cal = probes[i] && probes[i].leagues && probes[i].leagues[0];
    if (cal && cal.calendarType === 'day' && Array.isArray(cal.calendar) && cal.calendar.length) {
      const have = new Set(cal.calendar.map(s => String(s).slice(0, 10).replace(/-/g, '')));
      days = days.filter((d, k) => have.has(d) || k < 3);   // always check the next few days
    }
    days.forEach(d => jobs.push({ lg: l, url: `${ESPN_BASE_URL}/${l.path}/scoreboard?dates=${d}${l.query ? '&' + l.query : ''}` }));
  });
  const results = fetchJsonAll_(jobs.map(j => j.url));

  const out = {};
  leagues.forEach(l => { out[l.id] = { events: [], seen: new Set(), failed: 0, total: 0 }; });
  results.forEach((data, i) => {
    const r = out[jobs[i].lg.id];
    r.total++;
    if (data === null) { r.failed++; return; }
    (data.events || []).forEach(ev => {
      const id = ev.id || ev.uid || ev.name + ev.date;
      if (!r.seen.has(id)) { r.seen.add(id); r.events.push(ev); }
    });
  });
  leagues.forEach(l => {
    const r = out[l.id];
    r.failed = r.total > 0 && r.failed === r.total;   // true only when EVERY request failed
    delete r.seen;
  });
  return out;
}

function gamesForLeague_(lg, events, win) {
  switch (lg.kind) {
    case 'team':   return teamRowsFromEvents_(lg, events, win);
    case 'golf':   return golfRowsFromEvents_(events, lg, win);
    case 'racing': return racingRowsFromEvents_(events, lg, win);
    case 'tennis': return tennisRowsFromEvents_(events, lg, win);
    case 'mma':    return mmaRowsFromEvents_(events, lg, win);
    default: return [];
  }
}

// ========================================
// TEAM SPORTS (incl. soccer)
// ========================================

function teamRowsFromEvents_(lg, events, win) {
  const games = [];
  let tbd = 0;
  events.forEach(ev => {
    const g = parseTeamEvent_(ev, lg);
    if (!g || !inWindow_(g, win)) return;
    if (g.tbdTime) {
      if (!SHOW_TBD_TIMES) { tbd++; return; }
      // date known, time not: an all-day style row labelled "TBA"
      g.dateTime = parseET_(Utilities.formatDate(g.dateTime, TZ, 'yyyy-MM-dd') + ' 00:00');
      g.allDay = true; g.time = 'TBA'; g.date = fmtDate_(g.dateTime);
    }
    g.additionalInfo = buildAdditionalInfo_(ev, g._comp, lg, g._home, g._away);
    delete g._comp; delete g._home; delete g._away;
    games.push(g);
  });
  if (tbd) Logger.log(`${lg.league}: hid ${tbd} games with unconfirmed start times`);
  return games;
}

function parseTeamEvent_(event, lg) {
  try {
    const comp = event.competitions[0];
    const teams = comp.competitors || [];
    const home = teams.find(c => c.homeAway === 'home') || teams[1];
    const away = teams.find(c => c.homeAway === 'away') || teams[0];
    if (!home || !away || home === away || !home.team || !away.team) return null;
    const d = new Date(event.date);
    if (isNaN(d.getTime())) return null;
    const networks = collectNetworks_(comp, lg);
    return {
      source: 'espn', date: fmtDate_(d), time: fmtTime_(d),
      matchup: `${away.team.displayName} vs ${home.team.displayName}`,
      network: networks.length ? networks[0].n : 'TBD', networks: networks,
      sport: lg.sport, league: lg.league, kind: 'team',
      additionalInfo: '', dateTime: d, tbdTime: comp.timeValid === false,
      _comp: comp, _home: home, _away: away
    };
  } catch (e) {
    Logger.log('Error parsing event: ' + e);
    return null;
  }
}

function buildAdditionalInfo_(event, competition, lg, homeTeam, awayTeam) {
  const info = [];
  if (event.name && event.name !== 'TBD') info.push(event.name);
  if (lg.league !== lg.sport && lg.sport === 'Soccer') info.push(lg.league);

  if (lg.college) {
    const rank = t => { const r = t.curatedRank && t.curatedRank.current; return r && r < 26 ? r : null; };
    const hr = rank(homeTeam), ar = rank(awayTeam);
    if (hr || ar) {
      const label = (t, r) => (r ? `#${r} ` : '') + t.team.displayName;
      info.push(`Rankings: ${label(awayTeam, ar)} vs ${label(homeTeam, hr)}`);
    }
  }

  // College football: no stadium table, so look the forecast up by the venue's city.
  if (lg.weather === 'city') {
    const v = competition.venue;
    if (v && v.indoor !== true && v.address && v.address.city) {
      const wx = getWeather_({ city: v.address.city, state: v.address.state }, new Date(event.date));
      if (wx) info.push(wx);
    }
  }

  if (lg.weather === 'nfl') {
    if (competition.weather) {
      const w = competition.weather, parts = [];
      if (w.displayValue) parts.push(w.displayValue);
      if (w.temperature) parts.push(`${w.temperature}°F`);
      if (parts.length) info.push(`Weather: ${parts.join(', ')}`);
    } else {
      const st = NFL_STADIUMS[homeTeam.team.displayName];
      const wx = st && st.outdoor ? getWeather_({ lat: st.lat, lon: st.lon }, new Date(event.date)) : null;
      if (wx) info.push(wx);
    }
  }

  (competition.notes || []).forEach(n => { if (n.headline) info.push(n.headline); });

  const venue = competition.venue;
  if (venue && venue.fullName) {
    info.push(`Venue: ${venue.fullName}`);
    const a = venue.address;
    if (a && a.city) info.push(`Location: ${[a.city, a.state || a.country].filter(Boolean).join(', ')}`);
  }
  return info.join('\n');
}

// ========================================
// MMA (UFC, PFL)
// ========================================

function mmaRowsFromEvents_(events, lg, win) {
  const out = [];
  events.forEach(ev => {
    const g = parseESPNMMAEvent_(ev, lg);
    if (g && inWindow_(g, win)) out.push(g);
  });
  return out;
}

function parseESPNMMAEvent_(event, lg) {
  try {
    if (!event.competitions || !event.competitions.length) return null;
    const eventName = event.name || event.shortName;
    const byTime = {};
    event.competitions.forEach(c => { (byTime[c.startDate] = byTime[c.startDate] || []).push(c); });
    const times = Object.keys(byTime).sort();
    const mainTime = new Date(times[times.length - 1]);
    const prelimTime = times.length >= 2 ? new Date(times[times.length - 2]) : null;
    const earlyTime = times.length >= 3 ? new Date(times[0]) : null;
    const hoursBefore = t => Math.round((mainTime - t) / 3600000);
    const fights = key => formatFights_(byTime[key].slice().reverse());

    let card = '';
    if (prelimTime) {
      card += buildStartTimes_(earlyTime, prelimTime, mainTime);
      card += '\n\nMain Card\n--------------------\n' + fights(times[times.length - 1]);
      card += `\n\nPrelims (${hoursBefore(prelimTime)} hrs before Main)\n--------------------\n` + fights(times[times.length - 2]);
      if (earlyTime) card += `\n\nEarly Prelims (${hoursBefore(earlyTime)} hrs before Main)\n--------------------\n` + fights(times[0]);
    } else {
      card += formatFights_(event.competitions.slice().reverse());
    }
    const link = (event.links || []).find(l => l.rel && l.rel.indexOf('event') !== -1);
    if (link) card += `\n\n🥊 ${eventName} Event Page\n${link.href}`;

    const mainComp = byTime[times[times.length - 1]][0];
    const networks = collectNetworks_(mainComp, lg);
    return {
      source: 'espn', date: fmtDate_(mainTime), time: fmtTime_(mainTime), matchup: eventName,
      network: networks.length ? networks[0].n : 'TBD', networks: networks,
      sport: lg.sport, league: lg.league, kind: 'event', additionalInfo: card, dateTime: mainTime
    };
  } catch (e) {
    Logger.log('Error parsing MMA event: ' + e);
    return null;
  }
}

function formatFights_(competitions) {
  return competitions.map(comp => {
    try {
      const [f1, f2] = comp.competitors || [];
      if (!f1 || !f2 || !f1.athlete || !f2.athlete) return null;
      const rec = f => (f.records && f.records[0] ? f.records[0].summary : '');
      const champ = f => (f.athlete.accolades && f.athlete.accolades.length ? ' (C)' : '');
      const wc = comp.type && comp.type.abbreviation ? comp.type.abbreviation : 'N/A';
      return `• ${f1.athlete.displayName || 'TBD'} (${rec(f1)})${champ(f1)} vs. ${f2.athlete.displayName || 'TBD'} (${rec(f2)})${champ(f2)} @ ${wc}`;
    } catch (e) {
      return null;
    }
  }).filter(Boolean).join('\n');
}

function buildStartTimes_(early, prelims, main) {
  const z = tzAbbr_(main);
  let s = '⏰ EVENT START TIMES (Eastern)\n' + '─'.repeat(20) + '\n';
  if (early) s += `Early Prelims: ${fmtTime_(early)} ${z}\n`;
  if (prelims) s += `Prelims: ${fmtTime_(prelims)} ${z}\n`;
  return s + `Main Card: ${fmtTime_(main)} ${z}`;
}

// ========================================
// GOLF (ESPN lists one event per tournament, with no tee times)
// -> one all-day "Round N" row per day of the tournament.
// ========================================

function golfRowsFromEvents_(events, lg, win) {
  const out = [];
  events.forEach(ev => {
    const comp = (ev.competitions || [])[0];
    if (!comp) return;
    const networks = collectNetworks_(comp, lg);
    const firstStr = Utilities.formatDate(new Date(ev.date), TZ, 'yyyy-MM-dd');
    const lastStr = Utilities.formatDate(new Date(ev.endDate || ev.date), TZ, 'yyyy-MM-dd');
    const days = [];
    for (let i = 0; i < GOLF_MAX_DAYS; i++) {   // noon anchor keeps DST from skipping a day
      const d = Utilities.formatDate(new Date(parseET_(firstStr + ' 12:00').getTime() + i * 86400000), TZ, 'yyyy-MM-dd');
      if (d > lastStr) break;
      days.push(d);
    }
    days.forEach((dayStr, i) => {
      const d = parseET_(dayStr + ' 00:00');
      const label = (i === days.length - 1 && days.length > 1) ? 'Final Round' : `Round ${i + 1}`;
      const g = {
        source: 'espn', allDay: true, date: fmtDate_(d), time: 'All day',
        matchup: `${ev.name}: ${label}`, network: networks.length ? networks[0].n : 'TBD', networks: networks,
        sport: lg.sport, league: lg.league, kind: 'event',
        additionalInfo: `${lg.league}\nBroadcast: ${networks.map(n => n.n).join(', ') || 'to be announced'}\nCheck your listings for exact tee times.`,
        dateTime: d
      };
      if (inWindow_(g, win)) out.push(g);
    });
  });
  return out;
}

// ========================================
// RACING (F1, IndyCar): Qualifying / Sprint / Race; practice skipped
// ========================================

function racingSessionLabel_(abbr) {
  const a = String(abbr || '').toLowerCase();
  if (a === 'race') return 'Race';
  if (a === 'qual' || a === 'q') return 'Qualifying';
  if (a === 'sq' || (a.indexOf('sprint') !== -1 && a.indexOf('qual') !== -1)) return 'Sprint Qualifying';
  if (a === 'ss' || a.indexOf('sprint') !== -1) return 'Sprint';
  return null;
}

function racingRowsFromEvents_(events, lg, win) {
  const out = [];
  events.forEach(ev => {
    const comps = ev.competitions || [];
    let sessions = comps.map(c => ({ c: c, label: racingSessionLabel_(c.type && c.type.abbreviation) })).filter(x => x.label);
    if (!sessions.length && comps.length === 1) sessions = [{ c: comps[0], label: 'Race' }];   // single-race events
    sessions.forEach(({ c, label }) => {
      if (c.timeValid === false) return;
      const d = new Date(c.startDate || c.date);
      if (isNaN(d.getTime())) return;
      const networks = collectNetworks_(c, lg);
      const g = {
        source: 'espn', date: fmtDate_(d), time: fmtTime_(d), matchup: `${ev.name}: ${label}`,
        network: networks.length ? networks[0].n : 'TBD', networks: networks,
        sport: lg.sport, league: lg.league, kind: 'event', additionalInfo: ev.name, dateTime: d
      };
      if (inWindow_(g, win)) out.push(g);
    });
  });
  return out;
}

// ========================================
// TENNIS (ESPN lists hundreds of matches per tournament day)
// -> one row per tournament per day; the day's matches (with their own
//    networks) are listed in the details.
// ========================================

function tennisRowsFromEvents_(events, lg, win) {
  const out = [];
  const nm = x => (x.athlete && x.athlete.displayName) || (x.team && x.team.displayName) || x.displayName || 'TBD';
  events.forEach(ev => {
    const byDay = {};
    (ev.groupings || []).forEach(gr => (gr.competitions || []).forEach(c => {
      if (c.timeValid === false) return;
      const d = new Date(c.startDate || c.date);
      if (isNaN(d.getTime())) return;
      const day = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
      (byDay[day] = byDay[day] || []).push({
        d: d, nets: collectNetworks_(c, lg),
        who: (c.competitors || []).map(nm).join(' vs. '),
        round: (c.round && c.round.displayName) || ''
      });
    }));
    Object.keys(byDay).forEach(day => {
      const list = byDay[day].sort((a, b) => a.d - b.d);
      const union = [], seen = {};
      list.forEach(m => m.nets.forEach(n => { if (!seen[n.n]) { seen[n.n] = 1; union.push(n); } }));
      const networks = sortNetworks_(union);
      const lines = list.slice(0, TENNIS_MAX_LISTED).map(m =>
        `• ${fmtTime_(m.d)} ${m.nets.length ? m.nets.map(n => n.n).join('/') : 'TBA'} - ${m.who}${m.round ? ` (${m.round})` : ''}`);
      if (list.length > TENNIS_MAX_LISTED) lines.push(`+ ${list.length - TENNIS_MAX_LISTED} more matches`);
      const g = {
        source: 'espn', date: fmtDate_(list[0].d), time: fmtTime_(list[0].d),
        matchup: `${ev.name} (${lg.league}): ${list.length} ${list.length === 1 ? 'match' : 'matches'}`,
        network: networks.length ? networks[0].n : 'TBD', networks: networks,
        sport: lg.sport, league: lg.league, kind: 'event',
        additionalInfo: `${ev.name} - ${lg.league}\n\nMatches (Eastern)\n--------------------\n${lines.join('\n')}`,
        dateTime: list[0].d
      };
      if (inWindow_(g, win)) out.push(g);
    });
  });
  return out;
}

// ========================================
// NASCAR (cf.nascar.com public API)
// ========================================

function fetchNASCAREvents_(win) {
  const year = Utilities.formatDate(new Date(), TZ, 'yyyy');
  const res = UrlFetchApp.fetch(`https://cf.nascar.com/cacher/${year}/race_list_basic.json`, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`NASCAR API returned ${res.getResponseCode()}`);
  const data = JSON.parse(res.getContentText());
  const series = [['series_1', 'Cup Series'], ['series_2', "O'Reilly Auto Parts Series"], ['series_3', 'Craftsman Truck Series']];
  const events = [];
  series.forEach(([key, name]) => {
    (Array.isArray(data[key]) ? data[key] : []).forEach(race => {
      const g = parseNASCARRace_(race, name);
      if (g && inWindow_(g, win)) events.push(g);
    });
  });
  // weather only for the races we are keeping
  events.forEach(g => {
    const t = NASCAR_TRACKS[g._track];
    const wx = t ? getWeather_({ lat: t.lat, lon: t.lon }, g.dateTime) : null;
    if (wx) g.additionalInfo += '\n' + wx;
    delete g._track;
  });
  return events;
}

function parseNASCARRace_(race, seriesName) {
  try {
    if (!race.race_date) return null;
    const s = String(race.race_date);
    // The API gives Eastern wall-clock times without an offset.
    const d = /(Z|[+-]\d\d:?\d\d)$/.test(s) ? new Date(s) : parseET_(s.replace('T', ' ').slice(0, 16));
    if (!d || isNaN(d.getTime())) return null;
    const track = race.track_name || 'TBD';
    const raceName = race.race_name || track;
    const raw = String(race.television_broadcaster || '').trim();
    const networks = /^(unknown|tbd)?$/i.test(raw) ? [] : parseNetworkText_(raw.replace(/\//g, ','));
    return {
      source: 'espn', date: fmtDate_(d), time: fmtTime_(d),
      matchup: `${seriesName}: ${raceName} at ${track}`,
      network: networks.length ? networks[0].n : 'TBD', networks: networks,
      sport: 'NASCAR', league: seriesName, kind: 'event',
      additionalInfo: raceName, dateTime: d, _track: track
    };
  } catch (e) {
    Logger.log('Error parsing NASCAR race: ' + e);
    return null;
  }
}

// ========================================
// MANUAL GAMES  (sheet tab "manual_games")
// Columns: start_et | matchup | network | sport | additional_info | league | kind
// start_et = 'yyyy-MM-dd HH:mm' Eastern wall-clock, e.g. 2026-11-03 19:00
// network  = one or several: "ESPN | The Spot (local) | Peacock (usually)"
// league (optional, defaults to sport); kind (optional: team|event)
// ========================================

function readManualGames_(win, problems) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(MANUAL_SHEET_NAME);
  if (!sheet) { Logger.log(`No "${MANUAL_SHEET_NAME}" tab - skipping manual games.`); return []; }
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const ssTz = ss.getSpreadsheetTimeZone();
  const out = [];
  let bad = 0;
  sheet.getRange(2, 1, last - 1, 7).getValues().forEach((r, i) => {
    if (!r[0] && !r[1]) return;
    // A cell Sheets auto-converted to a date still works.
    const start = r[0] instanceof Date ? Utilities.formatDate(r[0], ssTz, 'yyyy-MM-dd HH:mm') : r[0];
    const d = parseET_(start);
    if (!d || !r[1]) { bad++; Logger.log(`manual_games row ${i + 2}: unreadable start "${r[0]}"`); return; }
    if (!inWindow_({ dateTime: d }, win)) return;
    const matchup = String(r[1]).trim();
    const sport = String(r[3] || '').trim();
    const networks = parseNetworkText_(r[2]);
    out.push({
      source: 'manual', date: fmtDate_(d), time: fmtTime_(d), matchup: matchup,
      network: networks.length ? networks[0].n : 'TBD', networks: networks,
      sport: sport, league: String(r[5] || '').trim() || sport,
      kind: String(r[6] || '').trim() || (/\s+vs\.?\s+/i.test(matchup) ? 'team' : 'event'),
      additionalInfo: String(r[4] || '').trim(), dateTime: d
    });
  });
  if (bad) problems.push(`manual_games: ${bad} row(s) with an unreadable start time (expected yyyy-MM-dd HH:mm)`);
  return out;
}

// ========================================
// MERGE / DEDUPE
// ========================================

function teamKey_(matchup) {
  return String(matchup).split(/\s+vs\.?\s+|\s+@\s+/i).map(s => s.trim().toLowerCase()).sort().join('|');
}

function mergeNetworks_(a, b) {
  const out = (a || []).slice(), have = {};
  out.forEach(n => { have[n.n.toLowerCase()] = 1; });
  (b || []).forEach(n => { if (!have[n.n.toLowerCase()]) { have[n.n.toLowerCase()] = 1; out.push(n); } });
  return sortNetworks_(out);
}

// Manual entries win (their time/primary network are curated); ESPN adds
// details and any extra networks. Carried-over rows only survive if nothing
// fresh matches. Two games between the same teams on one day (doubleheader)
// stay apart because their start times differ by > 3 hours.
function mergeGames_(games) {
  const rank = { manual: 0, espn: 1, carried: 2 };
  const ordered = games.slice().sort((a, b) => rank[a.source] - rank[b.source]);
  const buckets = new Map();
  const out = [];
  ordered.forEach(g => {
    const key = `${g.sport}|${teamKey_(g.matchup)}|${fmtYmd_(g.dateTime)}`;
    const list = buckets.get(key) || [];
    const twin = list.find(x => Math.abs(x.dateTime - g.dateTime) < 3 * 3600000);
    if (twin) {
      if (g.source !== 'carried') {
        if (!twin.additionalInfo && g.additionalInfo) twin.additionalInfo = g.additionalInfo;
        twin.networks = mergeNetworks_(twin.networks, g.networks);
        if (twin.networks.length && twin.network === 'TBD') twin.network = twin.networks[0].n;
      }
      return;
    }
    list.push(g);
    buckets.set(key, list);
    out.push(g);
  });
  return out;
}

// ========================================
// ODDS
// ========================================

const oddsKey_ = g => `${g.sport}|${teamKey_(g.matchup)}|${fmtYmd_(g.dateTime)}`;

function attachOdds_(games, opts, prev, problems) {
  LEAGUES.filter(l => l.odds).forEach(league => {
    const mine = games.filter(g => g.league === league.league && g.source !== 'carried');
    if (!mine.length) return;
    let data = null;
    if (opts.fetchOdds && HAVE_ODDS_KEY) {
      try { data = fetchOddsData_(league); } catch (e) { problems.push(`Odds ${league.sport}: ${e.message || e}`); }
    }
    mine.forEach(g => {
      let text = '';
      if (data) {
        const o = findOdds_(data, g);
        if (o) text = buildOddsText_(o);
      }
      g.odds = text || prev.oddsMap.get(oddsKey_(g)) || '';
    });
  });

  // UFC: moneyline per fight, matched to the card's fighters
  const ufc = games.filter(g => g.league === 'UFC' && g.source !== 'carried');
  if (ufc.length) {
    let data = null;
    if (opts.fetchOdds && HAVE_ODDS_KEY) {
      try { data = fetchOddsData_(UFC_ODDS); } catch (e) { problems.push(`Odds UFC: ${e.message || e}`); }
    }
    ufc.forEach(g => {
      const text = data ? ufcOddsText_(g, data) : '';
      g.odds = text || prev.oddsMap.get(oddsKey_(g)) || '';
    });
  }
}

const normName_ = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const lastName_ = s => normName_(s).split(' ').pop();

// "• A (rec) vs. B (rec) @ Weight" lines of the card -> [{a, b}]
function parseFightLines_(info) {
  const out = [];
  String(info || '').split('\n').forEach(line => {
    const m = line.match(/^• (.+?) \([^)]*\)(?: \(C\))? vs\. (.+?) \([^)]*\)/);
    if (m) out.push({ a: m[1], b: m[2] });
  });
  return out;
}

function ufcOddsText_(game, data) {
  const t = game.dateTime.getTime();
  const lines = [];
  parseFightLines_(game.additionalInfo).forEach(f => {
    const ev = data.find(o => {
      if (Math.abs(new Date(o.commence_time).getTime() - t) > 36 * 3600000) return false;
      const h = normName_(o.home_team), a = normName_(o.away_team);
      const fa = normName_(f.a), fb = normName_(f.b);
      return (h === fa && a === fb) || (h === fb && a === fa) ||
             (lastName_(o.home_team) === lastName_(f.a) && lastName_(o.away_team) === lastName_(f.b)) ||
             (lastName_(o.home_team) === lastName_(f.b) && lastName_(o.away_team) === lastName_(f.a));
    });
    if (!ev) return;
    const book = (ev.bookmakers || []).find(b => (b.markets || []).some(m => m.key === 'h2h'));
    if (!book) return;
    const ml = book.markets.find(m => m.key === 'h2h');
    const price = fighter => {
      const o = ml.outcomes.find(x => normName_(x.name) === normName_(fighter) || lastName_(x.name) === lastName_(fighter));
      return o ? signed_(o.price) : null;
    };
    const pa = price(f.a), pb = price(f.b);
    if (pa && pb) lines.push(`• ${short_(f.a)} ${pa} vs. ${short_(f.b)} ${pb}`);
  });
  return lines.length ? 'Moneyline Odds\n--------------------\n' + lines.join('\n') : '';
}

// Odds go after the details; for UFC they sit above the event-page link.
function composeInfo_(g) {
  const base = g.additionalInfo || '', odds = g.odds || '';
  if (!odds) return base;
  const link = base.indexOf('\n\n🥊');
  if (g.sport === 'UFC' && link !== -1) return base.slice(0, link) + '\n\n' + odds + base.slice(link);
  return [base, odds].filter(Boolean).join('\n');
}

function fetchOddsData_(league) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `odds_v2_${league.sport}`;
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const base = `https://api.the-odds-api.com/v4/sports/${league.odds}/odds?regions=us&markets=${league.markets}&oddsFormat=american&bookmakers=draftkings,fanduel&apiKey=`;
  const keys = [ODDS_API_KEY_PRIMARY, ODDS_API_KEY_BACKUP].filter(Boolean);
  for (let i = 0; i < keys.length; i++) {
    const res = UrlFetchApp.fetch(base + keys[i], { muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(res.getContentText());
      try { cache.put(cacheKey, JSON.stringify(data), 21600); } catch (e) { /* payload over cache limit - fine */ }
      return data;
    }
    if (code === 401 || code === 402 || code === 429) {   // bad key / out of credits / rate-limited
      Logger.log(`Odds API ${code} for ${league.sport} (key #${i + 1}); trying next key`);
      continue;
    }
    throw new Error(`Odds API ${code} for ${league.sport}`);
  }
  throw new Error(`Odds API: all keys rejected for ${league.sport}`);
}

function findOdds_(data, game) {
  const t = game.dateTime.getTime();
  return data.find(o =>
    Math.abs(new Date(o.commence_time).getTime() - t) < 4 * 3600000 &&
    game.matchup.indexOf(o.home_team) !== -1 && game.matchup.indexOf(o.away_team) !== -1);
}

const signed_ = n => (n > 0 ? '+' : '') + n;
const short_ = name => String(name).split(' ').pop();

function buildOddsText_(event) {
  const book = (event.bookmakers || []).find(b => b.markets && b.markets.length);
  if (!book) return '';
  const market = k => book.markets.find(m => m.key === k);
  const spreads = market('spreads'), totals = market('totals'), ml = market('h2h');
  const mlOf = name => { const o = ml && ml.outcomes.find(x => x.name === name); return o ? ` ${signed_(o.price)}` : ''; };
  const parts = [];
  if (spreads && spreads.outcomes.length === 2) {
    const [a, b] = spreads.outcomes;
    parts.push(`${short_(a.name)} ${signed_(a.point)}${mlOf(a.name)}, ${short_(b.name)} ${signed_(b.point)}${mlOf(b.name)}`);
  } else if (ml && ml.outcomes.length === 2) {
    parts.push(ml.outcomes.map(o => `${short_(o.name)} ${signed_(o.price)}`).join(', '));
  }
  if (totals && totals.outcomes.length) parts.push(`O/U: ${totals.outcomes[0].point}`);
  return parts.join(' | ');
}

// ========================================
// WEATHER (OpenWeather 5-day forecast, cached per location)
// ========================================

const WEATHER_EMOJI = {
  clear: '☀️', clouds: '☁️', rain: '🌧️', drizzle: '🌧️',
  thunderstorm: '⛈️', snow: '❄️', mist: '🌫️', fog: '🌫️', haze: '🌫️'
};

// loc is { lat, lon } or { city, state } (US).
function getForecast_(loc) {
  const cache = CacheService.getScriptCache();
  const key = loc.city
    ? `wx_${String(loc.city).replace(/[^A-Za-z0-9]/g, '_')}_${loc.state || ''}`
    : `wx_${loc.lat.toFixed(2)}_${loc.lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  if (weatherCalls_ >= WEATHER_MAX_CALLS_PER_RUN) return null;   // stay under the free tier's per-minute limit
  weatherCalls_++;
  const where = loc.city ? `q=${encodeURIComponent(loc.city + ',' + (loc.state || '') + ',US')}` : `lat=${loc.lat}&lon=${loc.lon}`;
  const res = UrlFetchApp.fetch(`https://api.openweathermap.org/data/2.5/forecast?${where}&appid=${OPENWEATHER_API_KEY}&units=imperial`, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { Logger.log(`OpenWeather ${res.getResponseCode()} for ${where}`); return null; }
  const data = JSON.parse(res.getContentText());
  try { cache.put(key, JSON.stringify({ list: data.list }), 10800); } catch (e) { /* too large - skip cache */ }
  return data;
}

function getWeather_(loc, when) {
  if (!OPENWEATHER_API_KEY) return null;
  const ts = Math.floor(when.getTime() / 1000);
  const nowS = Date.now() / 1000;
  if (ts > nowS + 5 * 86400 || ts < nowS - 3 * 3600) return null;   // outside the forecast horizon
  try {
    const data = getForecast_(loc);
    if (!data || !data.list || !data.list.length) return null;
    let best = data.list[0];
    data.list.forEach(f => { if (Math.abs(f.dt - ts) < Math.abs(best.dt - ts)) best = f; });
    if (Math.abs(best.dt - ts) > 3 * 3600) return null;              // no forecast near kickoff
    const emoji = WEATHER_EMOJI[best.weather[0].main.toLowerCase()] || '🌤️';
    return `Weather: ${emoji} ${best.weather[0].description}, 🌡️ ${Math.round(best.main.temp)}°F, 💨 ${Math.round(best.wind.speed)} mph`;
  } catch (e) {
    Logger.log(`Weather error: ${e}`);
    return null;
  }
}

// ========================================
// SHEET I/O
// A date | B time | C matchup | D primary network | E sport | F details |
// G start (ISO) | H odds (cache) | I updated (row 2) | J networks (JSON) |
// K league | L kind
// ========================================

const SHEET_COLS = 12;

function loadPrevious_(sheet) {
  const out = { rows: [], oddsMap: new Map(), count: 0 };
  const last = sheet.getLastRow();
  if (last < 2) return out;
  out.count = last - 1;
  sheet.getRange(2, 1, last - 1, SHEET_COLS).getDisplayValues().forEach(r => {
    if (!r[2] || !r[6]) return;
    const allDay = /^\d{4}-\d\d-\d\d$/.test(r[6]);
    const d = allDay ? parseET_(r[6] + ' 00:00') : new Date(r[6]);
    if (!d || isNaN(d.getTime())) return;
    let networks = [];
    try { networks = r[9] ? JSON.parse(r[9]) : []; } catch (e) { networks = []; }
    const g = {
      source: 'carried', allDay: allDay, date: r[0], time: r[1], matchup: r[2], network: r[3], networks: networks,
      sport: r[4], league: r[10] || r[4], kind: r[11] || 'event', additionalInfo: r[5], dateTime: d, odds: r[7]
    };
    out.rows.push(g);
    if (r[7]) out.oddsMap.set(oddsKey_(g), r[7]);
  });
  return out;
}

function writeToSheet_(sheet, games, prevCount) {
  if (games.length === 0 || (prevCount >= 20 && games.length < prevCount * MIN_ROWS_RATIO)) {
    throw new Error(`Refusing to overwrite ${prevCount} existing rows with ${games.length} - sheet left unchanged.`);
  }
  const stamp = fmtIso_(new Date());   // "Updated" time shown on the site (cell I2)
  const rows = games.map((g, i) => [
    g.date, g.time, g.matchup, g.network || 'TBD', g.sport, g.additionalInfo || '', isoOf_(g), g.odds || '',
    i === 0 ? stamp : '', JSON.stringify(g.networks || []), g.league || g.sport, g.kind || 'event'
  ]);
  const span = Math.max(rows.length, prevCount);

  // Force text so Sheets never reinterprets "7:00 PM", the ISO string or the JSON.
  sheet.getRange(1, 7, 1, 6).setValues([['StartISO', 'Odds', 'Updated', 'Networks', 'League', 'Kind']]);
  sheet.getRange(2, 1, span, 2).setNumberFormat('@');
  sheet.getRange(2, 7, span, 6).setNumberFormat('@');
  sheet.getRange(2, 1, rows.length, SHEET_COLS).setValues(rows);
  if (prevCount > rows.length) sheet.getRange(rows.length + 2, 1, prevCount - rows.length, SHEET_COLS).clearContent();
  Logger.log(`Wrote ${rows.length} games (previously ${prevCount})`);
}

// ========================================
// TRIGGERS  (run createTriggers once)
// ========================================

function createTriggers() {
  const mine = ['updateSchedule', 'refreshSchedule'];
  ScriptApp.getProjectTriggers()
    .filter(t => mine.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updateSchedule').timeBased().atHour(4).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('refreshSchedule').timeBased().everyHours(6).create();
  Logger.log('Triggers created: updateSchedule daily ~4 AM ET, refreshSchedule every 6 hours.');
}

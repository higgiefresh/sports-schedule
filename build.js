#!/usr/bin/env node
/*
 * Static build for What's It On?  (Node 18+, no dependencies)
 *
 *   node build.js                 build from the live Google Sheet
 *   node build.js --csv file.csv  build from a local CSV (testing)
 *
 * Reads the schedule sheet and writes ./dist:
 *   index.html                 index.html with the next few days pre-rendered
 *                              (crawlers see real games, not "Loading...") and
 *                              BroadcastEvent/SportsEvent JSON-LD
 *   <sport>/index.html         one landing page per sport ("Where to watch the NFL")
 *   <sport>/<league>/index.html  and per league for sports with several (Soccer)
 *   calendar/<sport>.ics       subscribable calendar feeds per sport
 *   calendar/teams/<team>.ics  ...and per team
 *   sitemap.xml, robots.txt
 *
 * The browser still loads fresh data from the sheet on every visit and
 * replaces the pre-rendered markup, so this only needs to be re-run to keep
 * the search-engine view, landing pages and calendar feeds current. The Apps
 * Script can do that automatically via NETLIFY_BUILD_HOOK (see README).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE_NAME = "What's It On?";
const SITE_URL = (process.env.SITE_URL || 'https://higgins-sports-schedule.netlify.app').replace(/\/$/, '');
const SHEET_ID = '1gs8pwsOGR7yepLg1bTTthYmZ_NNprgP6-1Znu4ieRXM';
const SHEET_NAME = 'schedule_template';
const ET = 'America/New_York';
const SRC = path.join(__dirname, 'index.html');
const OUT = path.join(__dirname, 'dist');
const HOME_DAYS = 3;            // days pre-rendered on the home page
const HOME_ROWS = 150;          // cap on pre-rendered games (home)
const PAGE_ROWS = 250;          // cap on pre-rendered games (sport / league pages)
const LD_MAX = 80;              // max events in JSON-LD per page
const LONG_TAIL = new Set(["Men's College Basketball", "Women's College Basketball", 'College Hockey', 'College Volleyball', 'College Baseball', 'College Softball', 'Lacrosse']);
const DURATION_MIN = { NFL: 210, 'College Football': 210, NBA: 150, "Men's College Basketball": 130, "Women's College Basketball": 120, WNBA: 130, NHL: 150, MLB: 190, Soccer: 120, UFC: 300, NASCAR: 180, F1: 120, IndyCar: 180, Tennis: 360 };

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugify = s => fold(s).replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');   // keep in sync with index.html
const sportClass = s => 's-' + s.toLowerCase().replace(/[^a-z0-9]/g, '');
const teamsOf = g => g.kind === 'team' ? g.matchup.split(/\s+vs\.?\s+/i).map(t => t.trim()).filter(Boolean) : [];

const fmt = {};
const dtf = (key, opts, locale) => fmt[key] || (fmt[key] = new Intl.DateTimeFormat(locale || 'en-US', Object.assign({ timeZone: ET }, opts)));
const etKey = d => dtf('key', { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(d);
const etLabel = d => dtf('label', { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
const etTime = d => dtf('time', { hour: 'numeric', minute: '2-digit' }).format(d).replace(/[\u202f\u00a0]/g, ' ');
const etTz = d => (dtf('tz', { timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName') || {}).value || 'ET';
function etOffsetMs(date) {
  const p = {};
  dtf('off', { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).forEach(x => { p[x.type] = +x.value; });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}
function etMidnight(y, m, d) { const w = Date.UTC(y, m, d); let t = w - etOffsetMs(new Date(w)); t = w - etOffsetMs(new Date(t)); return new Date(t); }
const isoET = d => {
  const o = etOffsetMs(d) / 60000;
  const p = {}; dtf('iso', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }, 'en-CA')
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  const sign = o < 0 ? '-' : '+';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')}:${String(Math.abs(o) % 60).padStart(2, '0')}`;
};

function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') { if (q && n === '"') { field += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !q) { if (c === '\r' && n === '\n') i++; row.push(field); if (row.some(f => f.trim())) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
  return rows;
}

// ---------- networks (same rules as index.html) ----------
const OTA = new Set(['abc', 'cbs', 'nbc', 'fox', 'the cw', 'cw', 'telemundo', 'univision', 'unimas', 'pbs', 'ion', 'mynetworktv']);
const STREAM_RE = /(peacock|prime video|apple tv|espn\+|espn unlimited|paramount\+|netflix|\bmax\b|fubo|youtube|dazn|victory\+|season pass|nfl\+|league pass|big ten\+|sec network\+|acc network extra|\bapp\b|\.com|\+$)/i;
const TYPE_LABEL = { free: 'Free over-the-air TV', cable: 'Cable / satellite', stream: 'Streaming' };
function netType(n) {
  if (n.t === 'stream' || STREAM_RE.test(n.n)) return 'stream';
  if (!n.l && OTA.has(fold(n.n))) return 'free';
  return 'cable';
}
function parseNets(json, primary) {
  let a = [];
  try { a = json ? JSON.parse(json) : []; } catch (e) { a = []; }
  if (!a.length && primary && primary !== 'TBD') a = [{ n: primary, t: 'tv' }];
  return a.filter(x => x && x.n).map(x => { const n = { n: String(x.n), t: x.t || 'tv', l: !!x.l, u: !!x.u }; n.type = netType(n); return n; });
}
function netTag(n) {
  const cls = ['net', n.type, n.l ? 'local' : '', n.u ? 'usual' : ''].filter(Boolean).join(' ');
  const tip = n.l ? 'Local or regional: depends on where you live' : n.u ? 'Usually shown here: confirm in your guide' : TYPE_LABEL[n.type];
  return `<span class="${cls}" title="${esc(tip)}">${esc(n.n)}</span>`;
}
function netsHtml(nets) {
  const national = nets.filter(n => !n.l), locals = nets.filter(n => n.l);
  const parts = national.map(netTag).concat(locals.slice(0, 2).map(netTag));
  if (locals.length > 2) parts.push(`<span class="net local more">+${locals.length - 2} local</span>`);
  if (!parts.length) parts.push('<span class="net none">Network TBA</span>');
  return `<div class="nets">${parts.join('')}</div>`;
}
const natNames = g => g.nets.filter(n => !n.l).map(n => n.n);

// ---------- data ----------
async function loadRows() {
  const i = process.argv.indexOf('--csv');
  if (i !== -1) return parseCSV(fs.readFileSync(process.argv[i + 1], 'utf8'));
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
  return parseCSV(await res.text());
}

function toGames(rows) {
  const games = [];
  let updated = null;
  rows.slice(1).filter(r => r.length >= 7).forEach(r => {
    const iso = (r[6] || '').trim();
    const allDay = /^\d{4}-\d\d-\d\d$/.test(iso);
    let start;
    if (allDay) { const [y, m, d] = iso.split('-').map(Number); start = etMidnight(y, m - 1, d); }
    else { start = new Date(iso); }
    if (!start || isNaN(start.getTime())) return;
    if (!updated && r[8]) { const u = new Date(r[8].trim()); if (!isNaN(u.getTime())) updated = u; }
    const matchup = (r[2] || '').trim(), sport = (r[4] || '').trim();
    games.push({
      start, allDay, isoDate: allDay ? iso : '', timeLabel: allDay ? ((r[1] || '').trim() || 'All day') : '', key: allDay ? iso : etKey(start),
      matchup, sport, league: (r[10] || '').trim() || sport,
      kind: (r[11] || '').trim() || (/\s+vs\.?\s+/i.test(matchup) ? 'team' : 'event'),
      nets: parseNets(r[9], (r[3] || '').trim()), info: (r[5] || '').trim()
    });
  });
  games.sort((a, b) => a.start - b.start);
  return { games, updated };
}

const gameEnd = g => g.start.getTime() + (DURATION_MIN[g.sport] || 150) * 60000;
const isFinished = g => !g.allDay && g.sport !== 'Tennis' && Date.now() > gameEnd(g) + 30 * 60000;
const slot = g => (g.timeLabel === 'TBA' ? 2 : g.allDay ? 0 : 1);

// ---------- HTML pieces ----------
function renderDays(games, cap, tiered) {
  const tier = g => (tiered && LONG_TAIL.has(g.sport) ? 1 : 0);
  const byDay = new Map();
  games.forEach(g => { if (!byDay.has(g.key)) byDay.set(g.key, []); byDay.get(g.key).push(g); });
  const todayKey = etKey(new Date());
  let html = '', shown = 0;
  for (const [key, list] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (shown >= cap) break;
    list.sort((a, b) => (tier(a) - tier(b)) || (slot(a) - slot(b)) || (a.start - b.start));
    const label = list[0].allDay
      ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(key + 'T12:00:00Z'))
      : etLabel(list[0].start);
    const [weekday, monthDay] = label.split(', ');
    html += `<section class="day"><div class="day-head"><h2 class="day-name">${esc(weekday)}</h2><span class="day-date">${esc(monthDay)}</span>` +
      `${key === todayKey ? '<span class="today-tag">Today</span>' : ''}<span class="day-count">${list.length} ${list.length === 1 ? 'game' : 'games'}</span></div>`;
    list.forEach(g => {
      const time = g.allDay ? g.timeLabel : etTime(g.start);
      const lbl = g.league !== g.sport ? `${g.sport} · ${g.league}` : g.sport;
      html += `<div class="game ${sportClass(g.sport)}"><div class="time${g.allDay ? ' allday' : ''}"><b>${esc(time)}</b><small>${g.allDay ? '' : esc(etTz(g.start))}</small></div>` +
        `<div><div class="sport">${esc(lbl)}</div><div class="matchup">${esc(g.matchup)}</div></div>${netsHtml(g.nets)}</div>`;
    });
    html += '</section>';
    shown += list.length;
  }
  return html || '<div class="empty"><strong>No games scheduled.</strong>Check back soon.</div>';
}

function jsonLd(games, pageUrl, pageName) {
  const venue = info => {
    const v = (info.match(/^Venue: (.+)$/m) || [])[1], l = (info.match(/^Location: (.+)$/m) || [])[1];
    return v ? { '@type': 'Place', name: v, address: l ? l.replace(/,\s*$/, '') : v } : null;
  };
  const items = games.slice(0, LD_MAX).map(g => {
    const startDate = g.allDay ? g.isoDate : isoET(g.start);
    const ev = { '@type': 'SportsEvent', name: g.matchup, startDate, sport: g.sport };
    const t = teamsOf(g);
    if (t.length === 2) { ev.awayTeam = { '@type': 'SportsTeam', name: t[0] }; ev.homeTeam = { '@type': 'SportsTeam', name: t[1] }; }
    const loc = venue(g.info); if (loc) ev.location = loc;
    const nat = natNames(g);
    const item = { '@type': 'BroadcastEvent', name: `${g.matchup}${nat.length ? ' on ' + nat.slice(0, 3).join(', ') : ''}`, startDate, isLiveBroadcast: true, broadcastOfEvent: ev };
    if (nat.length) item.publishedOn = nat.map(n => ({ '@type': 'BroadcastService', name: n }));
    return item;
  });
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL + '/' },
      { '@type': 'WebPage', name: pageName, url: pageUrl, inLanguage: 'en-US' },
      ...items
    ]
  }).replace(/</g, '\\u003c');
}

function seoBlock({ title, description, url, games }) {
  return `<title>${esc(title)}</title>\n<meta name="description" content="${esc(description)}">\n<link rel="canonical" href="${url}">\n<meta name="calendar-feeds" content="1">\n` +
    `<meta property="og:type" content="website">\n<meta property="og:site_name" content="${esc(SITE_NAME)}">\n<meta property="og:title" content="${esc(title)}">\n` +
    `<meta property="og:description" content="${esc(description)}">\n<meta property="og:url" content="${url}">\n<meta name="twitter:card" content="summary">\n` +
    `<script type="application/ld+json">${jsonLd(games, url, title)}</script>`;
}

function footerNav(sports, leaguePages) {
  const host = SITE_URL.replace(/^https?:\/\//, '');
  const links = sports.map(s => `<a href="/${slugify(s)}/">${esc(s)}</a>`).join('');
  const lg = leaguePages.map(([s, l]) => `<a href="/${slugify(s)}/${slugify(l)}/">${esc(l)}</a>`).join('');
  const feeds = sports.map(s => `<a href="webcal://${host}/calendar/${slugify(s)}.ics">${esc(s)}</a>`).join('');
  return `<span class="nav-label">Where to watch</span><a href="/">Everything</a>${links}` +
    (lg ? `<br><span class="nav-label">Soccer &amp; more leagues</span>${lg}` : '') +
    `<br><span class="nav-label">Calendar feeds</span>${feeds}`;
}

function buildPage(template, { title, description, url, h1, intro, sport, league, games, prerender, nav }) {
  let html = template;
  const need = (re, what) => { if (!re.test(html)) throw new Error(`index.html is missing ${what}`); };
  need(/<title>.*?<\/title>/s, '<title>'); need(/<meta name="description"[^>]*>/, 'meta description');
  need(/<!--SEO-->/, '<!--SEO--> marker'); need(/<!--PRERENDER:START-->[\s\S]*?<!--PRERENDER:END-->/, 'PRERENDER markers');
  need(/<!--NAV:START-->[\s\S]*?<!--NAV:END-->/, 'NAV markers'); need(/<h1 id="pageTitle">[\s\S]*?<\/h1>/, 'h1#pageTitle'); need(/<p id="pageIntro">[\s\S]*?<\/p>/, 'p#pageIntro');
  html = html.replace(/<title>.*?<\/title>\s*/s, '').replace(/<meta name="description"[^>]*>\s*/, '');
  html = html.replace('<!--SEO-->', () => seoBlock({ title, description, url, games }));
  html = html.replace(/<!--PRERENDER:START-->[\s\S]*?<!--PRERENDER:END-->/, () => `<!--PRERENDER:START-->${prerender}<!--PRERENDER:END-->`);
  html = html.replace(/<!--NAV:START-->[\s\S]*?<!--NAV:END-->/, () => `<!--NAV:START-->${nav}<!--NAV:END-->`);
  html = html.replace(/<h1 id="pageTitle">[\s\S]*?<\/h1>/, () => `<h1 id="pageTitle">${h1}</h1>`);
  html = html.replace(/<p id="pageIntro">[\s\S]*?<\/p>/, () => `<p id="pageIntro">${esc(intro)}</p>`);
  if (sport) html = html.replace('<body>', () => `<body data-sport="${esc(sport)}"${league ? ` data-league="${esc(league)}"` : ''}>`);
  return html;
}

// ---------- calendar feeds ----------
function fold75(line) {
  let out = '', cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 74) { out += cur + '\r\n '; cur = ch; bytes = 1 + b; } else { cur += ch; bytes += b; }
  }
  return out + cur;
}
const icsEsc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function buildIcs(games, calName) {
  const stamp = utc(new Date());
  const host = SITE_URL.replace(/^https?:\/\//, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${SITE_NAME}//Schedule//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEsc(calName)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  games.forEach(g => {
    const uid = crypto.createHash('sha1').update(`${g.sport}|${g.matchup}|${g.start.toISOString()}`).digest('hex').slice(0, 20) + '@' + host;
    const nat = natNames(g);
    const where = g.nets.length ? 'Where to watch: ' + g.nets.map(n => n.n + (n.l ? ' (local)' : '') + (n.u ? ' (usually)' : '')).join(', ') : 'Network not announced yet';
    const desc = (where + (g.info ? '\n\n' + g.info.replace(/\n+\uD83E\uDD4A[^\n]*\nhttps?:\/\/\S+/g, '').trim() : '')).slice(0, 800);
    L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`);
    if (g.allDay) {
      const next = new Date(g.isoDate + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
      L.push(`DTSTART;VALUE=DATE:${g.isoDate.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`);
    } else {
      L.push(`DTSTART:${utc(g.start)}`, `DTEND:${utc(new Date(g.start.getTime() + (DURATION_MIN[g.sport] || 150) * 60000))}`);
    }
    L.push(`SUMMARY:${icsEsc(`${g.matchup}${nat.length ? ' (' + nat.slice(0, 3).join(', ') + ')' : ''}`)}`, `DESCRIPTION:${icsEsc(desc)}`, 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold75).join('\r\n') + '\r\n';
}

// ---------- main ----------
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

(async () => {
  const template = fs.readFileSync(SRC, 'utf8');
  const { games: all, updated } = toGames(await loadRows());
  if (!all.length) throw new Error('No games with an ISO start time (column G) found in the sheet - refusing to build.');

  const todayKey = etKey(new Date());
  const games = all.filter(g => g.key >= todayKey && !isFinished(g));
  const dayDiff = k => (Date.UTC(...k.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) - Date.UTC(...todayKey.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))) / 86400000;
  const homeGames = games.filter(g => dayDiff(g.key) < HOME_DAYS);
  const rank = ['NFL', 'College Football', 'NBA', "Men's College Basketball", "Women's College Basketball", 'WNBA', 'NHL', 'College Hockey', 'MLB', 'Soccer', 'F1', 'NASCAR', 'IndyCar', 'UFC', 'MMA', 'Golf', 'Tennis'];
  const sportsPresent = [...new Set(games.map(g => g.sport))].sort((a, b) => ((rank.indexOf(a) + 1 || 999) - (rank.indexOf(b) + 1 || 999)) || a.localeCompare(b));
  const leaguePages = [];                       // [sport, league] for sports with several leagues
  sportsPresent.forEach(s => {
    const ls = [...new Set(games.filter(g => g.sport === s).map(g => g.league))].sort();
    if (ls.length > 1) ls.forEach(l => leaguePages.push([s, l]));
  });
  const nav = footerNav(sportsPresent, leaguePages);

  fs.rmSync(OUT, { recursive: true, force: true });

  // home
  const todayCount = games.filter(g => g.key === todayKey).length;
  write('index.html', buildPage(template, {
    title: `${SITE_NAME} Where to Watch Every Game - Free TV, Cable & Streaming`,
    description: `Find where to watch any game in the U.S.: ${todayCount.toLocaleString()} on today. NFL, NBA, NHL, MLB, college sports, Premier League and MLS soccer, F1, UFC, golf and more, with every channel and streaming option.`,
    url: SITE_URL + '/', h1: "What's it<br>on?",
    intro: 'Pick your teams or sports and see every way to watch: free TV, cable and streaming.',
    games: homeGames, prerender: renderDays(homeGames, HOME_ROWS, true), nav
  }));

  // sport pages
  sportsPresent.forEach(sport => {
    const sg = games.filter(g => g.sport === sport), slug = slugify(sport), url = `${SITE_URL}/${slug}/`;
    write(`${slug}/index.html`, buildPage(template, {
      title: `Where to Watch ${sport}: TV Channels & Streaming | ${SITE_NAME}`,
      description: `Where to watch ${sport} on TV and streaming: start times and every channel for ${sg.length.toLocaleString()} upcoming games in the next 30 days, free TV included.`,
      url, h1: `Where to watch<br>${esc(sport)}`,
      intro: `Every channel and streaming option for upcoming ${sport} games.`,
      sport, games: sg, prerender: renderDays(sg, PAGE_ROWS, false), nav
    }));
    write(`calendar/${slug}.ics`, buildIcs(sg, `${SITE_NAME} - ${sport}`));
  });

  // league pages (e.g. Soccer > Premier League)
  leaguePages.forEach(([sport, league]) => {
    const lg = games.filter(g => g.sport === sport && g.league === league), url = `${SITE_URL}/${slugify(sport)}/${slugify(league)}/`;
    write(`${slugify(sport)}/${slugify(league)}/index.html`, buildPage(template, {
      title: `Where to Watch ${league}: TV Channels & Streaming | ${SITE_NAME}`,
      description: `Where to watch ${league} in the U.S.: ${lg.length.toLocaleString()} upcoming matches with start times and every TV and streaming option.`,
      url, h1: `Where to watch<br>${esc(league)}`,
      intro: `Every channel and streaming option for upcoming ${league} games.`,
      sport, league, games: lg, prerender: renderDays(lg, PAGE_ROWS, false), nav
    }));
  });

  // team calendar feeds
  const byTeam = new Map();
  games.forEach(g => teamsOf(g).forEach(t => {
    const slug = slugify(t); if (!slug) return;
    if (!byTeam.has(slug)) byTeam.set(slug, { name: t, games: [] });
    byTeam.get(slug).games.push(g);
  }));
  byTeam.forEach((v, slug) => write(`calendar/teams/${slug}.ics`, buildIcs(v.games, `${v.name} - ${SITE_NAME}`)));

  // sitemap + robots
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = ['/', ...sportsPresent.map(s => `/${slugify(s)}/`), ...leaguePages.map(([s, l]) => `/${slugify(s)}/${slugify(l)}/`)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq></url>`).join('\n') + `\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  console.log(`Built ${1 + sportsPresent.length + leaguePages.length} pages, ${sportsPresent.length} sport feeds + ${byTeam.size} team feeds from ${games.length} games` +
    (updated ? ` (sheet updated ${updated.toISOString()})` : ''));
  console.log('Sports:', sportsPresent.map(s => `${slugify(s)} (${games.filter(g => g.sport === s).length})`).join(', '));
})().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });

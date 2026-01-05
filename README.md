# 🏆 Sports On TV

> A fully automated sports schedule aggregator with Grade A security, displaying upcoming NFL, NBA, NHL, and NCAAF games from major broadcast networks.

[![Security Headers](https://img.shields.io/badge/Security%20Headers-A-brightgreen)](https://securityheaders.com/)
[![Netlify Status](https://api.netlify.com/api/v1/badges/333b1a77-f554-45a9-b620-395e12ceb86e/deploy-status)](https://app.netlify.com/sites/higgins-sports-schedule/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Live Site:** [https://higgins-sports-schedule.netlify.app/](https://higgins-sports-schedule.netlify.app/)

---

## 📋 Table of Contents

- [About](#about)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Security](#security)
- [Automation](#automation)
- [Usage](#usage)
- [Performance](#performance)
- [Screenshots](#screenshots)
- [Future Enhancements](#future-enhancements)
- [License](#license)

---

## 🎯 About

**Sports On TV** is a modern, automated sports schedule aggregator that helps sports fans find upcoming games across major broadcast networks. The project eliminates the need for manual schedule updates by automatically fetching game data from ESPN's public API and presenting it in a clean, filterable interface.

### Key Highlights

- **100% Automated**: Daily updates at 4:00 AM EST with zero manual intervention
- **Grade A Security**: Professional security headers implementation
- **Privacy-First**: No tracking, no cookies, no user data collection
- **Multi-Sport**: NFL, NBA, NHL, and NCAA Football coverage
- **Network Filtering**: Shows only free/widely-available broadcast games (CBS, FOX, NBC, ESPN, ABC, TNT, etc.)

---

## ✨ Features

### Core Functionality

- 🏈 **Multi-Sport Coverage**: NFL, NBA, NHL, NCAA Football
- 📺 **Network Filtering**: Displays games on major broadcast networks (excludes subscription-only services)
- 🔍 **Advanced Search**: Filter by team name, sport, network, or date
- 📅 **30-Day Rolling Window**: Shows upcoming games for the next month
- ⚡ **Real-Time Updates**: Schedule refreshes automatically every 5 minutes
- 📱 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- 🌙 **Modern UI**: Clean, dark-themed interface with intuitive navigation

### User Experience

- **Search by Team**: Find games for your favorite teams instantly
- **Filter by Sport**: View only NFL, NBA, NHL, or NCAAF games
- **Filter by Network**: See games on specific networks (CBS, FOX, NBC, etc.)
- **Filter by Day**: Jump to games on specific dates
- **Live Game Indicators**: Visual highlighting of currently live games
- **Timezone Support**: Automatic EST/EDT timezone handling

---

## 🛠️ Technology Stack

### Frontend

- **HTML5**: Semantic markup
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **Vanilla JavaScript**: No frameworks, pure ES6+
- **Responsive Design**: Mobile-first approach

### Backend & Data

- **Google Apps Script**: Serverless automation for data fetching
- **Google Sheets API**: Data storage and retrieval
- **ESPN API**: Public API for sports schedule data
- **Netlify**: Static site hosting with global CDN

### DevOps & Security

- **Git/GitHub**: Version control and collaboration
- **Netlify CI/CD**: Automatic deployments on git push
- **Security Headers**: CSP, HSTS, X-Frame-Options, and more
- **HTTPS**: SSL/TLS encryption via Let's Encrypt

---

## 🏗️ Architecture

### Data Flow

```
ESPN Public API → Google Apps Script → Google Sheets → Website (JavaScript Fetch)
                      ↓
                Daily Trigger (4:00 AM EST)
```

### Components

1. **Data Fetcher (Google Apps Script)**
   - Runs daily at 4:00 AM EST
   - Fetches data from ESPN API for all sports
   - Processes and filters games
   - Stores in Google Sheets

2. **Data Store (Google Sheets)**
   - Acts as a lightweight database
   - Publicly readable (view-only)
   - Structured data format: Date, Time, Matchup, Network, Sport

3. **Frontend (Static Site)**
   - Fetches data from Google Sheets
   - Client-side filtering and search
   - Responsive UI with real-time updates
   - No backend server required

### Why This Architecture?

- **Simplicity**: No complex backend or database setup
- **Cost**: Completely free (Google Apps Script, Sheets, Netlify)
- **Scalability**: CDN distribution handles high traffic
- **Security**: Static site = minimal attack surface
- **Reliability**: Multiple layers (ESPN → Google → Netlify)

---

## 🔒 Security

This project achieves **Grade A** on [Security Headers](https://securityheaders.com/) through comprehensive security header implementation.

### Security Features

#### Headers Implemented

- ✅ **Content-Security-Policy (CSP)**: Prevents XSS attacks
- ✅ **X-Frame-Options**: Prevents clickjacking
- ✅ **X-Content-Type-Options**: Stops MIME sniffing attacks
- ✅ **Strict-Transport-Security (HSTS)**: Forces HTTPS connections
- ✅ **Referrer-Policy**: Controls referrer information leakage
- ✅ **Permissions-Policy**: Restricts browser feature access

#### Privacy Features

- 🔒 **No User Tracking**: Zero analytics or tracking scripts
- 🔒 **No Cookies**: No session or tracking cookies
- 🔒 **No Personal Data**: No user accounts or data collection
- 🔒 **GDPR/CCPA Compliant**: Privacy-friendly by design
- 🔒 **No Third-Party Scripts**: Only essential resources loaded

#### Best Practices

- HTTPS everywhere (enforced via HSTS)
- Subresource Integrity (SRI) for external resources
- Minimal external dependencies
- Read-only data access from Google Sheets
- No inline scripts or eval() usage

**Test the security yourself**: [SecurityHeaders.com Scan](https://securityheaders.com/?q=https://higgins-sports-schedule.netlify.app/)

---

## 🤖 Automation

### Daily Updates

The schedule automatically updates **every day at 4:00 AM EST** with:

- Latest game schedules from ESPN API
- Automatic filtering to 30-day window
- Network information for each game
- Bowl game names for NCAA Football
- Team matchups and game times

### How It Works

1. **Trigger Execution**: Google Apps Script trigger fires at 4 AM
2. **API Calls**: Script fetches data from ESPN's public API
3. **Data Processing**: 
   - Filters games to next 30 days
   - Extracts team names, networks, times
   - Removes subscription-only games
   - Deduplicates overlapping data
4. **Sheet Update**: Writes processed data to Google Sheets
5. **Website Sync**: Frontend automatically pulls new data within 5 minutes

### Sports Coverage

- **NFL**: All regular season and playoff games on broadcast networks
- **NBA**: Games on NBC, ESPN, ABC, Prime Video
- **NHL**: National games (TNT, ESPN, ABC) + regional Tampa Bay Lightning coverage
- **NCAA Football**: Bowl games and major matchups

### Network Filtering Logic

**Included Networks:**
- CBS, FOX, NBC, ABC (free over-the-air)
- ESPN, ESPN2, ESPNews, ESPNU
- TNT, TBS
- Peacock, Prime Video (widely available streaming)
- NFL Network, NHL Network

**Excluded Networks:**
- ESPN+ (subscription required)
- MAX, Hulu (subscription required)
- Apple TV+ (subscription required)
- Other pay services

---

## 🎮 Usage

### For Users

1. **Visit the Site**: [https://higgins-sports-schedule.netlify.app/](https://higgins-sports-schedule.netlify.app/)
2. **Browse Games**: Scroll through upcoming games
3. **Use Filters**:
   - Search for specific teams
   - Filter by sport (NFL, NBA, NHL, NCAAF)
   - Filter by network (CBS, FOX, NBC, etc.)
   - Filter by specific date
4. **Clear Filters**: Reset to view all games

### For Developers

This project is a great example of:
- Building with vanilla JavaScript (no framework overhead)
- Implementing serverless automation with Google Apps Script
- Working with public APIs (ESPN)
- Creating secure static sites
- Achieving Grade A security
- Modern CSS techniques (Grid, Flexbox)
- Client-side data processing and filtering

---

## ⚡ Performance

### Metrics

- **Load Time**: < 1 second (static site on CDN)
- **Lighthouse Score**: 95+ (Performance, Accessibility, Best Practices)
- **Bundle Size**: Minimal (no frameworks or large dependencies)
- **API Calls**: 1 fetch per 5 minutes (efficient caching)

### Optimizations

- Static site generation (no server processing)
- CDN distribution via Netlify
- Client-side filtering (no backend queries)
- Lazy loading of game data
- Efficient DOM manipulation
- Debounced search input

---

## 📸 Screenshots

### Main Interface
![Sports On TV - Main Interface](https://github.com/user-attachments/assets/b430c4bf-cc4c-4607-b1b6-d0552d796a53)

*Clean, modern UI with all upcoming games sorted chronologically*

### Search & Filter
![Sports On TV - Search and Filter](https://github.com/user-attachments/assets/3d610cc7-4c55-48fd-b64a-85c86fe6ff4d)

*Powerful filtering capabilities allow users to search by team name, filter by sport (NFL, NBA, NHL, NCAAF), network (CBS, FOX, NBC, etc.), or specific date*

### Mobile View
![Sports On TV - Mobile Responsive Design](https://github.com/user-attachments/assets/7266e248-7575-4944-9057-93e2639858a5)

*Fully responsive design ensures perfect viewing on any device - all features work seamlessly on mobile, tablet, and desktop*

---

## 🚀 Future Enhancements

### Potential Features

- [ ] MLB (Major League Baseball) coverage
- [ ] MLS (Major League Soccer) coverage
- [ ] College Basketball support
- [ ] Favorite teams (localStorage)
- [ ] Calendar export (.ics file generation)
- [ ] Push notifications for favorite teams
- [ ] Historical game scores
- [ ] Team logos and colors
- [ ] Dark/light theme toggle
- [ ] Multiple timezone support

### Technical Improvements

- [ ] Service Worker for offline support
- [ ] Progressive Web App (PWA) functionality
- [ ] GraphQL API layer
- [ ] TypeScript migration
- [ ] Automated testing suite
- [ ] Performance monitoring
- [ ] Error tracking

---

## 📊 Project Stats

- **Lines of Code**: ~800 (HTML, CSS, JS)
- **Automation Scripts**: ~500 lines (Google Apps Script)
- **API Calls**: 4 per day (ESPN API)
- **Data Points**: ~100-150 games at any time
- **Update Frequency**: Daily at 4:00 AM EST
- **Uptime**: 99.9% (Netlify SLA)

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

- **ESPN**: For providing a robust public API for sports data
- **Netlify**: For excellent static site hosting and CI/CD
- **Google**: For Apps Script and Sheets API
- **Security Headers Project**: For security best practices guidance

---

## 🔗 Links

- **Live Site**: [https://higgins-sports-schedule.netlify.app/](https://higgins-sports-schedule.netlify.app/)
- **Security Test**: [SecurityHeaders.com Result](https://securityheaders.com/?q=https://higgins-sports-schedule.netlify.app/)
- **GitHub Repository**: [This Repo]

---

**Built without ADs by Ben Higgins**

*Last Updated: January 2026*

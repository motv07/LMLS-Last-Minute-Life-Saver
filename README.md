<div align="center">

<!-- BANNER -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=7c3aed&height=200&section=header&text=Last-Minute%20Life%20Saver&fontSize=42&fontColor=ffffff&fontAlignY=38&desc=⚡%20AI-Powered%20Productivity%20Companion&descSize=18&descAlignY=60&animation=twinkling" width="100%"/>

<br/>

<!-- BADGES -->
[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-Vercel-7c3aed?style=for-the-badge&logo=vercel&logoColor=white)](https://last-minute-life-saver-seven.vercel.app)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5cb85c?style=for-the-badge&logo=pwa&logoColor=white)](https://last-minute-life-saver-seven.vercel.app)
[![Gemini Powered](https://img.shields.io/badge/Gemini%202.0%20Flash-Powered-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com)
[![Zero Install](https://img.shields.io/badge/Zero-Install-ff6b6b?style=for-the-badge&logoColor=white)](https://last-minute-life-saver-seven.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)

<br/>

> **LMLS** is a state-of-the-art, client-side, zero-install AI productivity dashboard — engineered to demolish missed deadlines and rescue you from your worst last-minute spirals. No servers. No sign-up friction. Just open and go.

<br/>

[🌐 Open Live App](https://last-minute-life-saver-seven.vercel.app) or [Live App](https://last-minute-life-saver-834131243632.asia-southeast1.run.app/) · [📖 Read the Docs](#-table-of-contents) · [🐛 Report a Bug](https://github.com/motv07/LMLS-Last-Minute-Life-Saver/issues) · [✨ Request Feature](https://github.com/motv07/LMLS-Last-Minute-Life-Saver/issues)

</div>

---

## 📚 Table of Contents

- [Overview](#-overview)
- [Live Demo](#-live-demo)
- [Features at a Glance](#-features-at-a-glance)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Option A — Open in Browser (Recommended)](#option-a--open-in-browser-recommended)
  - [Option B — Install as PWA](#option-b--install-as-pwa)
  - [Option C — Clone & Run Locally](#option-c--clone--run-locally)
- [Configuration — Gemini API Key](#-configuration--gemini-api-key)
- [Feature Walkthrough](#-feature-walkthrough)
  - [Authentication & Multi-Profile System](#1-authentication--multi-profile-system)
  - [Task & Category Manager](#2-task--category-manager)
  - [Drag-and-Drop Schedule Builder](#3-drag-and-drop-schedule-builder)
  - [Manual Calendar Sync](#4-manual-calendar-sync)
  - [Habits & 90-Day Heatmap](#5-habits--90-day-heatmap)
  - [Crisis Alert & Pulse-Ring HUD](#6-crisis-alert--pulse-ring-hud)
  - [Pomodoro Focus Mode](#7-pomodoro-focus-mode)
  - [Multi-Turn AI Coach](#8-multi-turn-ai-coach)
  - [Voice Assistant](#9-voice-assistant)
  - [Gamification System](#10-gamification-system)
  - [Analytics Dashboard](#11-analytics-dashboard)
  - [Offline Mode (Service Worker)](#12-offline-mode-service-worker)
- [Project Structure](#-project-structure)
- [Design Philosophy](#-design-philosophy)
- [Screenshots](#-screenshots)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**LMLS — Last-Minute Life Saver** is a **serverless, glassmorphic Progressive Web App** built to be your AI-powered co-pilot when the deadline clock is ticking. It integrates Google Gemini 2.0 Flash to stream real-time recovery plans, intelligently prioritize your tasks, and coach you through crunch time with full voice interaction support.

Every feature is engineered around one mission: **get you through the finish line.**

| | Key Highlights |
|---|---|
| ⚡ | Zero-server architecture — 100% client-side |
| 🔐 | Isolated multi-profile accounts via localStorage |
| 🤖 | Gemini 2.0 Flash multi-turn AI coaching |
| 🎙️ | Full voice command + speech synthesis |
| 📲 | Installable PWA with offline support |
| 🎨 | Glassmorphism 2.0 with aurora backgrounds |
| 🎮 | XP, levelling, and badge gamification engine |

---

## 🚀 Live Demo

The app is deployed and ready to use at:

**[https://last-minute-life-saver-seven.vercel.app](https://last-minute-life-saver-seven.vercel.app)**
 **[https://last-minute-life-saver-834131243632.asia-southeast1.run.app/](https://last-minute-life-saver-834131243632.asia-southeast1.run.app/)**

> **Judge / Evaluator?** On the login page, click **🎁 Load Demo Story** to instantly sign in as `judge@lmls.org` with a pre-populated student scenario — no setup needed.

---

## ✨ Features at a Glance

| Feature | Description |
|---|---|
| 🗂️ **Task Manager** | Tasks with priorities, subtasks, deadlines, dependencies, categories |
| 📅 **Calendar Sync** | Manual monthly calendar — sync any task with one click |
| 📆 **Schedule Builder** | Drag tasks onto a time-blocked daily grid |
| 🔥 **Habit Tracker** | Daily habits with streaks & 90-day contribution heatmap |
| 🚨 **Crisis Alerts** | Auto-detects critical deadlines within 2 hours, triggers AI recovery |
| 🍅 **Focus HUD** | Pomodoro timer with motivational quotes and immersive overlay |
| 🤖 **AI Coach** | Multi-turn Gemini chat with 10-message context window |
| 🎙️ **Voice Assistant** | Speech recognition commands + speech synthesis responses |
| 🏆 **Gamification** | XP rewards, level-up milestones, unlockable achievement badges |
| 📊 **Analytics** | Chart.js-powered category & productivity breakdowns |
| 📲 **PWA** | Installable on desktop and mobile, works offline |
| 🔐 **Multi-Profile** | Isolated per-user accounts via secure email-keyed localStorage |

---

## 🛠 Tech Stack

```
Frontend Core     →  HTML5 · Vanilla CSS3 (Variables, Flexbox, Grid) · ES6+ JavaScript
AI Engine         →  Google Gemini 2.0 Flash (REST API, streaming)
Speech            →  Web Speech API (SpeechRecognition + SpeechSynthesis)
Charts            →  Chart.js
Offline / PWA     →  Service Worker API (Stale-While-Revalidate strategy)
Data Layer        →  localStorage (email-keyed, multi-profile isolated)
Hosting           →  Vercel (static)
```

No frameworks. No npm. No build tools. Pure web standards — deployable anywhere.

---

## 🏁 Getting Started

### Option A — Open in Browser (Recommended)

The fastest path: simply open the live deployment in any modern desktop browser.

```
https://last-minute-life-saver-seven.vercel.app
```

Supported browsers: **Chrome 90+**, **Edge 90+**, **Safari 15+**

> ⚠️ Voice features (Speech Recognition + Synthesis) require Chrome or Edge. Safari has limited support.

---

### Option B — Install as PWA

1. Open the live URL in **Chrome** or **Edge**.
2. Look for the **Install** icon (⊕) in the browser's address bar.
3. Click **Install** — LMLS will appear as a standalone desktop/mobile app.
4. Launch it from your taskbar, dock, or home screen like any native app.

---

### Option C — Clone & Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/motv07/Last-Minute-Life-Saver.git

# 2. Navigate into the project
cd Last-Minute-Life-Saver
```

**Windows** — double-click `start_lmls.bat`, which launches a local server automatically.

**Mac / Linux** — run a simple HTTP server:

```bash
# Python 3
python3 -m http.server 8080

# Node.js (if you have npx)
npx serve .
```

3. Open your browser at `http://localhost:8080`.

> ⚠️ **Do not open `index.html` directly as a `file://` URL.** Service Workers and certain browser APIs require an HTTP context. Always use a local server.

---

## 🔑 Configuration — Gemini API Key

LMLS requires a Google Gemini API key to power the AI Coach, Crisis Recovery, and Voice AI features.

**Step 1:** Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) — it takes under 60 seconds.

**Step 2:** In the LMLS app, open the **left sidebar** → click **⚙️ Settings**.

**Step 3:** Paste your key into the **Gemini API Key** field and click **Save API Key**.

**Step 4:** The companion will immediately verify the connection and confirm readiness.

> 🔒 Your API key is stored only in your browser's `localStorage` and never sent to any third-party server.

---

## 🧩 Feature Walkthrough

### 1. Authentication & Multi-Profile System

LMLS ships with a full-featured client-side auth system, giving each user a completely isolated environment.

- **Create Account** — enter your email, password, display name, and choose a **productivity work style** (Sprinter, Deep Worker, Balanced, etc.) to personalize your onboarding.
- **Login** — returns you directly to your last-active dashboard state.
- **Data Isolation** — all tasks, habits, settings, and calendar events are stored under a secure, email-suffixed `localStorage` key, guaranteeing zero cross-profile data leakage.
- **Judge Demo Mode** — on the login screen, press **🎁 Load Demo Story** to log in instantly as `judge@lmls.org` with a fully pre-populated student scenario (assignments, habits, an incoming crisis alert) — perfect for evaluation without any setup.
- **Logout** — clears the session but preserves all data for the next login.

---

### 2. Task & Category Manager

The heart of LMLS — a powerful, visually rich task engine.

**Creating Tasks:**
- Click **+ New Task** to open the task creation modal.
- Fill in: **Title**, **Time Estimate** (minutes), **Priority** (Low / Medium / High / Critical), **Deadline**, and optional **Notes**.
- Add a **Subtask Checklist** — each subtask is individually checkable and tracks completion percentage.
- Assign a **Category** from the dropdown (or create a new one inline).
- Set **Task Dependencies** — link tasks that must be completed before this one can start.

**Categories:**
- Click **+ Add Category** to open the category creator with a built-in **emoji picker**.
- Each category auto-generates a dynamic HSL color that propagates through task cards, filter chips, and analytics charts — no manual color picking required.

**Grouping:**
- Click **+ Add Heading** to insert visual sprint block dividers between tasks — great for organizing daily vs. next-day work.

**Dependency Locks:**
- Tasks with unfinished prerequisites display a 🔒 padlock indicator and block completion — preventing accidental progress on blocked work.

**Filtering & Sorting:**
- Filter tasks by category chip, priority level, or completion status using the top filter bar.

---

### 3. Drag-and-Drop Schedule Builder

Transform your task list into an actionable daily timeline.

- Open the **Schedule** view from the sidebar.
- A time-blocked grid appears showing your full day in hourly slots.
- **Drag** any pending task card from the left panel onto a time slot to schedule it.
- Scheduled blocks display the task's title, priority color, and estimated duration.
- Rearrange blocks by dragging them between slots.

---

### 4. Manual Calendar Sync

A full monthly calendar view — no Google Calendar integration required.

- Navigate to the **Calendar** view from the sidebar.
- Browse months with the ← / → arrows.
- **Add Events** — click any date cell to log a custom event with a title and time.
- **Task → Calendar Export** — on any task card, click the 📅 icon to instantly push it to the calendar as a priority-color-coded event block. Click the icon again to toggle it off.
- Events are color-coded by priority (green → Low, amber → Medium, orange → High, red → Critical).

---

### 5. Habits & 90-Day Heatmap

Build consistency with a streak-powered habit tracker.

- Click **+ Add Habit** to create a habit with a name, emoji icon, and daily target count.
- Tap the **+** or check button on a habit card each time you complete a repetition.
- **Streak Counter** — the app parses your completion log using UTC-normalized date math to compute your exact **current streak** and **best streak** accurately, even across timezones.
- **90-Day Contribution Heatmap** — a GitHub-style heatmap renders below each habit, showing completion density over the last 90 days. Darker cells = higher completions.
- **Backfill Mode** — click any heatmap cell to retroactively toggle a completion entry for past dates.
- **Self-Healing Streaks** — streak calculations re-derive from raw completion data, so they remain accurate even if you log completions out of order.

---

### 6. Crisis Alert & Pulse-Ring HUD

Proactive deadline defense — LMLS watches your tasks so you don't have to.

- LMLS continuously checks whether any **Critical** priority task has a deadline within the next **2 hours**.
- When triggered:
  - The dashboard overlays a **red pulsing ring border** around the screen.
  - A **Crisis Banner** appears at the top identifying the at-risk task.
  - Gemini AI is automatically called to **stream a custom recovery plan** — a step-by-step triage strategy tailored to your specific task.
- Dismiss the alert once the situation is resolved, or let the AI guide you through it.

---

### 7. Pomodoro Focus Mode

Eliminate distractions and enter deep work state.

- Click the **🍅 Start Focus** button on any task card, or via the AI Coach.
- The screen transitions to a minimal **Focus HUD** overlay:
  - A large countdown timer (default: 25-minute Pomodoro).
  - Animated pulsing rings synchronized to the timer.
  - A rotating set of motivational quotes to sustain momentum.
  - Controls: **Pause**, **Resume**, **Skip**, and **End Session**.
- Upon session completion, LMLS rewards XP, shows a confetti burst, and prompts a short break.
- Break timer (5 min / 15 min for long break) follows automatically.

---

### 8. Multi-Turn AI Coach

Your personal AI companion, always in context.

- Access the **🤖 AI Coach** panel from the sidebar.
- Chat naturally — ask for a daily plan, get prioritization advice, request time estimates, or ask the AI to create tasks on your behalf.
- **Persistent Context** — the companion retains the last **10 conversation turns**, enabling coherent multi-step reasoning without repetition.
- **Contextual Awareness** — the system prompt is pre-loaded with your current task list, deadlines, habits, and work style so Gemini can give hyper-relevant advice.
- **Streaming Responses** — AI replies stream token-by-token for a real-time, responsive feel.

**Example prompts:**
```
"What should I tackle first today?"
"Break my thesis into 4 subtasks."
"I have 90 minutes. What can I realistically finish?"
"Remind me why I started this project."
```

---

### 9. Voice Assistant

Hands-free control — because sometimes you can't type.

**Activating Voice Input:**
- Click the 🎤 microphone button in the chat input field or the top navigation bar.
- Speak your command. LMLS uses the **Web Speech API SpeechRecognition** engine to transcribe it.

**Supported Voice Commands:**
```
"Add task Submit Assignment by 5pm"      → Creates a new task
"Start focus mode"                        → Launches the Pomodoro HUD
"Go to settings"                          → Navigates to Settings view
"Go to habits"                            → Opens Habits view
"What should I do now?"                   → Queries Gemini, then reads
                                            the response aloud via Speech Synthesis
"Mark [task name] as complete"            → Completes the matching task
```

**Speech Synthesis (AI reads back to you):**
- When you ask open-ended coaching questions via voice, the AI response is also spoken aloud using the Web Speech API SpeechSynthesis engine.
- Voice rate and pitch adapt to your system's default voice settings.

> ⚠️ Voice features require a Chromium-based browser (Chrome or Edge).

---

### 10. Gamification System

Progress that feels good — LMLS makes productivity rewarding.

- **XP Points** — earn XP for completing tasks, finishing Pomodoro sessions, logging habits, and chatting with the AI coach.
- **Levelling** — accumulate XP to level up. Each level unlocks a new title (Rookie → Hustler → Grinder → Machine → Legend).
- **Achievement Badges** — unlock special badges for milestones like:
  - First task completed
  - 7-day habit streak
  - 5 Pomodoros in one day
  - Crisis mode survived
  - 100 tasks completed
- **Progress Bar** — a persistent XP bar in the sidebar shows your current progress to the next level.
- **Confetti Explosions** — particle animations fire on task completions and level-ups for satisfying visual feedback.

---

### 11. Analytics Dashboard

Data-driven insights into your productivity patterns.

- Navigate to the **📊 Analytics** view from the sidebar.
- **Category Breakdown** — a Chart.js pie/doughnut chart shows the distribution of your tasks across categories.
- **Completion Rate** — a bar chart tracks daily task completions over the past 7 days.
- **Focus Time** — cumulative Pomodoro minutes logged per day.
- **Habit Consistency** — average daily habit completion rate as a percentage.
- All charts update in real-time as you complete tasks and log habits.

---

### 12. Offline Mode (Service Worker)

LMLS works without internet — because deadlines don't wait for WiFi.

- A **Service Worker** (`sw.js`) pre-caches all app assets (HTML, CSS, JS, icons) on first load.
- Subsequent visits load instantly from cache — even with no network.
- The caching strategy is **Stale-While-Revalidate**: the app loads immediately from cache and updates assets in the background.
- AI Coach features gracefully degrade when offline, showing a clear "No connection — AI unavailable" indicator.

---

## 📁 Project Structure

```
Last-Minute-Life-Saver/
│
├── index.html              # Main dashboard: layout, view containers, modal markups
├── auth.html               # Login, registration, and onboarding UI
├── manifest.json           # PWA configuration (name, icons, display, theme)
├── sw.js                   # Service Worker — offline caching & background sync
├── patch_app.js            # Runtime patches for core app state
├── patch_gemini.js         # Gemini API client patches / streaming fixes
├── start_lmls.bat          # Windows one-click local server launcher
│
├── styles/
│   └── main.css            # All styling: variables, animations, glassmorphism, layout
│
├── scripts/
│   ├── app.js              # Root controller: view routing, state management, modals
│   ├── tasks.js            # Task CRUD, subtasks, dependency locks, drag-and-drop
│   ├── calendar.js         # Monthly calendar grid, event management, task export
│   ├── habits.js           # Habit engine: streaks, heatmap, backfill, UTC normalization
│   ├── analytics.js        # Chart.js productivity charts and data aggregation
│   ├── gemini.js           # Gemini 2.0 Flash client, system prompts, multi-turn buffer
│   ├── voice.js            # SpeechRecognition command parser + SpeechSynthesis TTS
│   ├── gamification.js     # XP engine, level thresholds, badge unlock logic
│   ├── animations.js       # Confetti particle system, 3D tilt card effects
│   └── scheduler.js        # Hourly time-block grid rendering and drag handlers
│
└── assets/
    ├── icon-192.png        # PWA icon (192×192)
    └── icon-512.png        # PWA icon (512×512)
```

---

## 🎨 Design Philosophy

LMLS is built around the principle that **beautiful tools get used**. Every visual decision is intentional:

**Aurora Animated Backgrounds** — Ambient gradient blobs drift and scale across the background using CSS keyframe animations, creating a living, breathing canvas that feels alive without being distracting.

**Glassmorphism 2.0** — Cards use CSS `backdrop-filter: blur()`, semi-transparent backgrounds, custom borders, and inner highlight reflections to achieve layered depth without any image assets.

**Fluid Typography** — All heading and stat sizes use CSS `clamp()` to scale continuously from mobile to ultrawide displays, eliminating all hard breakpoints for text.

**Micro-Animations** — Every interaction has a reaction: spring-elastic modals, hover lifts on cards, ripple clicks, and smooth state transitions make the UI feel polished and responsive.

**Confetti System** — Canvas-based particle explosions fire on task completions and level-ups — a deliberate dopamine hit designed to reinforce productive behavior.

**Color System** — A CSS variable-driven palette with a violet/purple primary (`#7c3aed`), semantic priority colors, and dynamic HSL hues generated per category, ensuring visual consistency at any scale.

---

## 📸 Screenshots

| Dashboard | Task Manager | AI Coach |
|:---------:|:------------:|:--------:|
| *(Aurora glassmorphic dashboard)* | *(Task cards with priority chips)* | *(Streaming Gemini chat panel)* |

| Focus HUD | Habits Heatmap | Analytics |
|:---------:|:--------------:|:---------:|
| *(Pomodoro pulsing ring overlay)* | *(90-day contribution grid)* | *(Chart.js productivity charts)* |

> 📷 To add live screenshots: replace the placeholder cells with your own images using `![alt](./assets/screenshot-name.png)`.

---

## 🗺 Roadmap

- [ ] **Google Calendar OAuth Sync** — two-way sync with real Google Calendar events
- [ ] **Team Collaboration** — shared task boards with real-time multiplayer via WebSockets
- [ ] **AI Auto-Scheduling** — Gemini-powered automatic time-block scheduling based on deadlines and energy levels
- [ ] **Recurring Tasks** — daily, weekly, and custom recurrence rules
- [ ] **Dark / Light / Custom Themes** — user-selectable theme presets
- [ ] **Mobile-First Responsive Layout** — optimized touch interactions for iOS/Android PWA
- [ ] **Export to PDF** — one-click productivity report generation
- [ ] **Slack / Discord Notifications** — deadline reminders pushed to messaging platforms

---

## 🤝 Contributing

Contributions are welcome and appreciated.

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/Last-Minute-Life-Saver.git

# 3. Create a feature branch
git checkout -b feature/your-feature-name

# 4. Make your changes

# 5. Commit with a clear message
git commit -m "feat: add recurring task support"

# 6. Push to your fork
git push origin feature/your-feature-name

# 7. Open a Pull Request on GitHub
```

Please keep PRs focused — one feature or fix per PR. For major changes, open an issue first to discuss the approach.

---

---

<div align="center">

Built with ⚡ during a hackathon. Fuelled by coffee, deadlines, and Gemini 2.0 Flash.

**[⬆ Back to Top](#-lmls--last-minute-life-saver--ai-productivity-companion)**

<img src="https://capsule-render.vercel.app/api?type=waving&color=7c3aed&height=100&section=footer" width="100%"/>

</div>

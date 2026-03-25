# Ernit — Feature & UX Improvement Plan

## Overview
A prioritized plan to improve user experience across the app's key screens, based on a thorough audit of the current product.

---

## 🏋️ Goal Card Experience

### Weekly Celebrations
Right now, every session completion looks the same — same confetti, same modal. We want to make each **week** feel like an achievement:
- **Week 1**: "First week done!" — standard celebration
- **Week 2**: "Two weeks strong!" — bigger celebration
- **Week 3+**: Escalating animations and badges
- **Final week**: Premium celebration before the reward screen

### Timer Improvements
- **Haptic buzz + toast** when the timer hits your target duration ("Time's up! Hold to finish")
- **Sticky notification** while timer is running so you can leave the app and still see progress (Android)
- Push notification already exists at completion — no change needed

### Smarter "Already Logged Today" Message
Currently shows "Come back tomorrow" with no context. Replacing with:
- "**2 more sessions this week** — see you tomorrow! 💪"
- "**Week complete!** Next week starts Monday. Enjoy the rest! 🎉"
- "**Only 3 sessions to your reward!**" (when close to finishing)

### Goal Editing
Currently locked once created. New approach:
- **Self-created goals**: Edit freely (adjust weeks, sessions/week)
- **Gifted goals**: "Request Edit" sends notification to the giver for approval (extends the existing approval flow)
- Guardrails: can't reduce below already-completed progress

### Share Sessions to Social Media
After completing a session, alongside "Share to Feed" we add **"Share to Social"**:
- Generates a branded card with goal title, progress %, session photo, streak info
- Share to Instagram Stories, WhatsApp, etc.
- If user captured a photo during the session → included in the card

---

## 📋 Goals Screen

### Sort by Newest
Active goals currently appear in random order. Switching to newest-first so the most recent goal is always on top.

### Streak Banner from Day 1
Currently only appears after 3 sessions. Changing to show from the very first session:
- **1 session**: Small flame + "1 day streak — keep it going!"
- **2 sessions**: "2 days strong!"
- **3+**: Current full animated banner (unchanged)

### Weekly Summary in Streak Banner
Adding a subtle line below the streak: **"This week: 4/9 sessions across 3 goals"**
Integrated into the existing banner — no extra screen clutter.

### Deadline Urgency Warnings
On each goal card, show warnings when the user risks missing their weekly target:
- 🟡 "2 sessions left, 1 day remaining"
- 🔴 "Can't finish this week unless you go today!"

---

## 🗺️ Journey Screen

### Session Statistics
Currently just a list of past sessions with no summary. Adding:
- **Total sessions** completed
- **Average duration** per session
- **Longest session**
- **Total time invested**
Displayed as a compact stat row at the top.

### Milestone Markers
Insert celebration markers between sessions in the timeline:
- "📅 Week 2 Complete!" between the last session of week 1 and first of week 2
- "🔥 7-Day Streak!" when hitting streak milestones
- "🎯 10 Sessions!" at session count milestones

### Hint Timing Context
Hints currently show a date but no relation to sessions. Adding: **"Sent 2 hours before Session 5"** so users see how their giver's hints relate to their journey.

### Goal Retrospective
When a goal is completed, show a **"Your Journey" summary**:
- Total time invested, sessions completed, dates (start → end)
- Longest streak, motivations received
- Photo gallery from all sessions
- "Share Your Journey" button

### Social Sharing
Enhance the existing share card with stats and add per-session sharing too.

---

## 📰 Feed Screen

### Post Type Filtering
Add filter pills: **All | Goals | Sessions | Completed**
Lets users focus on what interests them most.

### Session Privacy (Strava-style)
Replace "Share to Feed" / "Skip" with a **privacy toggle**:
- 🌐 **Friends** (default) — session appears in friends' feeds
- 🔒 **Private** — session logged but not shared

Remembers your last choice. Private sessions show a lock icon in your Journey timeline.

---

## 👤 Friend Profile Screen

### "Gift This" on Wishlist Items
Currently, wishlist items only show details. Adding a visible **"Gift This 🎁"** button directly on each item so the empower/gifting flow is obvious.

### Achievement Deadline Countdown
Achievements currently don't show when they expire. Adding:
- "Expires in 14 days" (subtle)
- "⚠️ 3 days left!" (warning)
- "🔴 Expires tomorrow!" (urgent)

### "Friends Since" Date
Show **"Friends since March 2025"** on friend profiles — a small but nice personal touch.

---

## 🤝 Friend vs Follower System

### Recommendation: Keep Friends
After reviewing the architecture, **friends are the right model** for Ernit. Here's why:
- The app is about **personal accountability** — friends feel more intimate
- Empowering/motivating someone's goal is a *personal* action
- Gift-giving requires trust
- "Together" challenges require mutual commitment
- Small user base benefits from tight connections

### Optional Hybrid (Future)
If we want follower-like features later:
- Add "Public Profile" toggle — anyone can view goals/achievements (read-only)
- "Follow" as a lightweight action — see feed posts but can't empower/motivate/gift
- Friends unlock the full interaction set

---

## ⚡ Priority Phases

### Phase 1 — Quick Wins (1-2 days)
- Sort goals by date
- Streak banner from day 1
- Smarter "already logged" text
- Timer haptic at target
- Achievement countdown
- "Friends since" date

### Phase 2 — Core Features (3-5 days)
- Feed post filtering
- Session statistics
- Hint timing context
- Weekly celebration tiers
- Deadline warnings on goal cards
- Weekly summary in streak banner

### Phase 3 — Social & Sharing (5-7 days)
- Milestone markers in timeline
- Share session to social media
- Goal retrospective
- Session privacy toggle (Strava-style)
- "Gift This" on wishlist
- Enhanced journey sharing

### Phase 4 — Complex Features (1-2 weeks)
- Goal editing system (with approval flow)
- Sticky timer notification

# Ernit — Gift Flow Implementation Spec

> This document captures all design decisions, UX flow, and prototype code from a claude.ai conversation. Use this as the reference when implementing in the React Native Ernit app.

---

## Context

Ernit has two core narratives:
1. **Self-gifting ("For Myself")**: User sets a personal goal, locks an experience as their reward, and unlocks it when they succeed.
2. **Gifting ("For a Loved One")**: User gifts someone an experience tied to a goal. The gifter only pays when the recipient achieves the goal (pay-only-if-successful model).

Both narratives live on **one landing page** with a **toggle switch** — not two separate pages.

---

## Landing Page Hero Section

### Toggle Behavior
- A toggle sits directly below the Ernit logo, above the hero content
- Two options: **"For myself"** (default, active) | **"For a loved one"**
- Toggle has a sliding pill indicator that animates between positions
- Color: teal (#2ECDA7) for "For myself", amber (#F4A83D) for "For a loved one"

### Content that changes on toggle:

| Element | "For Myself" (default) | "For a Loved One" |
|---|---|---|
| Badge | `SELF CHALLENGE` (teal bg) | `GIFT A CHALLENGE` (amber bg) |
| Headline | I'm going **workout** to earn a **diving baptism** | Gift your son a **surfing lesson** when he **passes his exams** |
| Accent color | Teal (#2ECDA7) | Amber (#F4A83D) |
| Subtext | Commit to your challenge. Unlock the reward you promised yourself | Empower your loved ones. You only pay when they achieve their goal |
| Card labels | Your goal / Your reward | Their goal / Their reward |
| CTA button | "Start My Challenge ›" (teal gradient) | "Gift an Experience ›" (amber gradient) |
| Footer text | Make yourself accountable. Invite friends. | Pay only if they succeed. Zero risk for you. |

### Transition animation
- Content fades out (opacity 0, translateY 6px) over 300ms
- Content swaps
- Content fades in (opacity 1, translateY 0) over 300ms

---

## Gift Flow (5 Steps)

When user clicks "Gift an Experience ›", they enter a 5-step flow.

### Navigation
- Back button (top-left)
- Step dots indicator (top-center): filled dot = current, green dot = completed, empty = upcoming
- Step label (top-right): "Step X of 5"

---

### Step 1: Who's Taking the Challenge?

**Headline:** Who's taking on **the challenge?**
**Subtext:** Choose how your loved one will work towards their goal

**Two option cards:**

1. **"Just them"**
   - Icon: single person (amber background)
   - Description: "Your loved one works on the goal. You're the one gifting the reward when they succeed."

2. **"Together"**
   - Icon: two people (teal background)
   - Description: "You both commit to the same goal. You do it side by side — and the reward unlocks for both of you."

**Behavior:**
- Selecting a card highlights it (amber border)
- "Continue" button enables only after selection
- Selection affects pronoun copy in later steps:
  - "Just them" → "What will they be working towards?" / "Should they know what they're working towards?"
  - "Together" → "What will you both be working towards?" / "Should they know what you're both working towards?"

---

### Step 2: Goal Details

**Headline:** What's **the goal?**
**Subtext:** Dynamic based on Step 1 selection (see above)

**Fields (all required before Continue enables):**

1. **Goal name** — text input
   - Placeholder: "e.g. Pass final exams, Run a 5K..."

2. **Total duration** — chip selector (single select)
   - Options: `2 weeks` | `1 month` | `3 months` | `6 months`

3. **Sessions per week** — chip selector (single select)
   - Options: `2x` | `3x` | `5x` | `Daily`

4. **Time per session** — chip selector (single select)
   - Options: `15 min` | `30 min` | `1 hour` | `2 hours`

**Chip behavior:** Tap to select, only one active per group, selected state = amber border + amber text + darker background.

---

### Step 3: Pick the Reward (Experience)

**Headline:** Pick **the reward**
**Subtext:** Choose an experience to unlock when the goal is achieved

**Design decision:** Users pick the actual experience (not just a category). Categories serve as filters at the top. This is better for gifting because:
- The price shows upfront → feeds into "you only pay €X when they succeed" trust message
- Gifters want to feel like they're choosing something meaningful
- No separate budget step needed

**Layout:**
- Search input at top
- Category filter chips: `All` (default selected) | `Adventure` | `Wellness` | `Food` (+ more as needed)
- Experience cards in a vertical list

**Experience card structure:**
- Left: colored icon/image thumbnail (56x56px, rounded)
- Right: Experience name (14px bold), short description (11px muted), price (12px amber)

**Behavior:**
- Tap to select (amber border highlight)
- Only one selectable at a time
- Continue enables after selection

**Sample experiences (replace with real data):**
- Surfing lesson — 2-hour group lesson with gear — €65
- Spa day — Full-day access with massage — €120
- Cooking class — Italian cuisine workshop — €85
- Go-kart race day — 10-lap race with group booking — €45

---

### Step 4: Revealed vs Secret Mode

**Headline:** How should **the reward** be revealed?
**Subtext:** Dynamic based on Step 1 selection

**Two mode cards (centered layout):**

1. **Revealed**
   - Icon: eye symbol (amber)
   - Description: "They know the reward from day one. Full motivation to earn it."

2. **Secret**
   - Icon: lock symbol (teal)
   - Description: "The reward stays hidden. Ernit drops hints every time they log a session."
   - Extra tag: "Surprise factor" (amber pill badge)

**This is a key differentiator feature.** The hint-dropping mechanic in Secret mode makes the journey gamified and engaging.

**Behavior:** Same as Step 1 — tap to select, one at a time, enables Continue.

---

### Step 5: Summary & Confirmation

**Headline:** Ready to **commit?**
**Subtext:** Review your challenge gift before sending

**Summary card with rows:**
| Label | Value |
|---|---|
| Type | "Just them" or "Together" |
| Goal | User's typed goal name |
| Duration | Selected chip value |
| Frequency | Selected chip value |
| Session time | Selected chip value |
| Reward | Experience name (amber colored) |
| Mode | "Revealed" or "Secret (with hints)" |

**Trust banner below summary:**
- Green checkmark icon
- Text: "You only pay **€XX** when they achieve their goal" (price from selected experience, in amber)

**CTA:** "Send Challenge Gift" (amber gradient)

**On tap:** Button text changes to "Sent!", color changes to teal gradient, button disables.

---

## Design Tokens

### Colors
```
Dark background:     #0F1824
Card background:     #1A2436
Card border:         #2A3450
Card border hover:   #F4A83D (gift) / #2ECDA7 (self)
Teal primary:        #2ECDA7
Teal gradient:       linear-gradient(135deg, #2ECDA7, #5DDCBB)
Amber primary:       #F4A83D
Amber gradient:      linear-gradient(135deg, #E89B2D, #F4C05A)
Text primary:        #FFFFFF
Text secondary:      #7E8796
Text muted:          #5A6275
Text placeholder:    #3D4756
Chip background:     #1A2436
Chip border:         #2A3450
Chip selected bg:    #1E2A40
Phone body:          #0D1520
```

### Typography
```
Font family:         'Helvetica Neue', Helvetica, Arial, sans-serif
Headline:            22px, weight 700
Card title:          15px, weight 600
Body/subtitle:       13px, weight 400
Chip text:           13px
Small text/badge:    11px, weight 600
CTA button:          15px, weight 700
```

### Spacing & Radii
```
Card border-radius:  16px
Chip border-radius:  20px
Button border-radius: 24px
Input border-radius: 12px
Phone border-radius: 40px
Screen border-radius: 30px
Card padding:        20px
Content padding:     0 22px 28px
Gap between cards:   12px
```

### Animation
```
Fade transition:     opacity .3s ease, transform .3s ease
Card hover:          border-color .2s
Toggle slide:        transform .35s cubic-bezier(.4,0,.2,1)
Step entrance:       fadeUp .35s ease (opacity 0→1, translateY 10px→0)
```

---

## Implementation Notes for React Native

1. **State management:** A single state object tracks all selections across steps:
   ```js
   {
     type: 'solo' | 'shared',
     goal: string,
     duration: string,
     frequency: string,
     sessionTime: string,
     experienceId: number,
     experienceName: string,
     experiencePrice: string,
     mode: 'revealed' | 'secret'
   }
   ```

2. **Navigation:** Use a step counter (1-5) with animated transitions. Back button decrements, Continue increments. Each step validates before enabling Continue.

3. **The toggle on the landing page** should persist state — if someone toggles to "For a Loved One", goes through some steps, then comes back, the toggle should still be on "For a Loved One."

4. **Dynamic copy:** Steps 2 and 4 change their subtext based on the Step 1 "solo" vs "shared" selection (they/them vs you both).

5. **Experience data:** Step 3 experiences should come from your backend/database. The prototype uses hardcoded samples. Category filtering should happen client-side for speed.

6. **The "Together" path** follows the exact same 5 steps. The difference is just copy/framing — both participants are tracked in the app.

7. **After "Send Challenge Gift":** The recipient should receive a notification/invite to join Ernit and start their challenge. If "Secret" mode, they see the goal but NOT the reward — just hints as they log sessions.

---

## File References (Existing Codebase)

Based on the current React Native project at `d:\ErnitAppWeb_Test`, relevant files likely include:
- `GoalService.ts` — goal creation logic
- `EmpowerChoiceModal.tsx` — may be adaptable for the type selection (Step 1)
- `CategorySelectionScreen.tsx` — category/experience browsing (Step 3)
- `FeedPost.tsx` — social feed integration for gifted challenges
- `FreeGoalNotification.tsx` — notification patterns for gift invites
- `JourneyScreen.tsx` — journey tracking (where hints would appear in Secret mode)
- `FeedService.ts` — feed updates when goals are achieved
- Cloud functions in `index.ts` — payment trigger on goal completion

---

## Prototype HTML

The full working HTML prototype is included below. Open it in a browser to click through all 5 steps interactively.

```html
<!-- Save as ernit-gift-flow-prototype.html and open in browser -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ernit Gift Flow Prototype</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;display:flex;justify-content:center;padding:40px 20px;min-height:100vh}
.phone{width:340px;background:#0D1520;border-radius:40px;padding:12px;border:3px solid #2a2a2a}
.screen{border-radius:30px;overflow:hidden;background:#0F1824;min-height:640px;position:relative}
.notch{width:120px;height:28px;background:#0D1520;border-radius:0 0 16px 16px;margin:0 auto}
.content{padding:0 22px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#fff}
.top-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 0 16px}
.back-btn{background:none;border:none;color:#7E8796;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;font-family:inherit}
.back-btn svg{width:16px;height:16px}
.step-dots{display:flex;gap:5px}
.dot{width:6px;height:6px;border-radius:50%;background:#1A2436}
.dot.active{background:#F4A83D}
.dot.done{background:#2ECDA7}
.step-label{font-size:11px;color:#5A6275}
.step{display:none;animation:fadeUp .35s ease}
.step.visible{display:block}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
h2{font-size:22px;font-weight:700;line-height:1.25;margin-bottom:8px}
h2 .hl{color:#F4A83D}
.sub{font-size:13px;color:#7E8796;line-height:1.5;margin-bottom:24px}
.option-card{background:#1A2436;border:1.5px solid #2A3450;border-radius:16px;padding:20px;margin-bottom:12px;cursor:pointer;transition:border-color .2s,background .2s}
.option-card:hover{border-color:#F4A83D;background:#1E2A40}
.option-card.selected{border-color:#F4A83D;background:#1E2A40}
.option-card .opt-title{font-size:15px;font-weight:600;margin-bottom:4px}
.option-card .opt-sub{font-size:12px;color:#7E8796;line-height:1.4}
.option-card .opt-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.input-group{margin-bottom:16px}
.input-group label{display:block;font-size:12px;color:#7E8796;margin-bottom:6px;font-weight:500}
.text-input{width:100%;background:#1A2436;border:1px solid #2A3450;border-radius:12px;padding:12px 14px;color:#fff;font-size:14px;font-family:inherit;outline:none;transition:border-color .2s}
.text-input:focus{border-color:#F4A83D}
.text-input::placeholder{color:#3D4756}
.chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.chip{padding:8px 16px;border-radius:20px;background:#1A2436;border:1px solid #2A3450;font-size:13px;color:#8E95A3;cursor:pointer;transition:all .2s;font-family:inherit}
.chip:hover,.chip.selected{border-color:#F4A83D;color:#F4A83D;background:#1E2A40}
.exp-card{background:#1A2436;border:1.5px solid #2A3450;border-radius:14px;padding:14px;display:flex;gap:12px;margin-bottom:10px;cursor:pointer;transition:border-color .2s}
.exp-card:hover,.exp-card.selected{border-color:#F4A83D}
.exp-card .exp-img{width:56px;height:56px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px}
.exp-card .exp-info{flex:1}
.exp-card .exp-name{font-size:14px;font-weight:600;margin-bottom:2px}
.exp-card .exp-price{font-size:12px;color:#F4A83D;font-weight:500}
.exp-card .exp-desc{font-size:11px;color:#7E8796;margin-top:2px}
.mode-card{background:#1A2436;border:1.5px solid #2A3450;border-radius:16px;padding:20px;margin-bottom:12px;cursor:pointer;transition:border-color .2s,background .2s;text-align:center}
.mode-card:hover,.mode-card.selected{border-color:#F4A83D;background:#1E2A40}
.mode-card .mode-title{font-size:15px;font-weight:600;margin-bottom:4px}
.mode-card .mode-sub{font-size:12px;color:#7E8796;line-height:1.4}
.mode-card .mode-tag{display:inline-block;font-size:10px;font-weight:600;padding:3px 8px;border-radius:8px;margin-top:8px;background:rgba(244,168,61,.12);color:#F4A83D}
.next-btn{width:100%;padding:14px;border:none;border-radius:24px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#E89B2D,#F4C05A);color:#0D1520;margin-top:16px;transition:opacity .2s}
.next-btn:disabled{opacity:.3;cursor:default}
.summary-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1A2436;font-size:13px}
.summary-row .sr-label{color:#7E8796}
.summary-row .sr-value{font-weight:600;text-align:right;max-width:55%}
.summary-row .sr-value.amber{color:#F4A83D}
</style>
</head>
<body>
<div class="phone"><div class="screen"><div class="notch"></div><div class="content">
<div class="top-bar">
<button class="back-btn" onclick="goBack()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg> Back</button>
<div class="step-dots" id="dots"></div>
<span class="step-label" id="step-label"></span>
</div>
<div class="step" id="step-1">
<h2>Who's taking on <span class="hl">the challenge?</span></h2>
<p class="sub">Choose how your loved one will work towards their goal</p>
<div class="option-card" onclick="selectType('solo')" id="opt-solo">
<div class="opt-icon" style="background:rgba(244,168,61,.12)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F4A83D" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg></div>
<div class="opt-title">Just them</div>
<div class="opt-sub">Your loved one works on the goal. You're the one gifting the reward when they succeed.</div>
</div>
<div class="option-card" onclick="selectType('shared')" id="opt-shared">
<div class="opt-icon" style="background:rgba(46,205,167,.12)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2ECDA7" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><circle cx="16" cy="8" r="3.5"/><path d="M3 21v-2a4 4 0 014-4h3"/><path d="M14 15h4a4 4 0 014 4v2"/></svg></div>
<div class="opt-title">Together</div>
<div class="opt-sub">You both commit to the same goal. You do it side by side — and the reward unlocks for both of you.</div>
</div>
<button class="next-btn" id="next-1" disabled onclick="goTo(2)">Continue</button>
</div>
<div class="step" id="step-2">
<h2>What's <span class="hl">the goal?</span></h2>
<p class="sub" id="goal-sub">What will they be working towards?</p>
<div class="input-group"><label>Goal name</label><input class="text-input" id="goal-input" placeholder="e.g. Pass final exams, Run a 5K..." oninput="validateGoal()"></div>
<div class="input-group"><label>Total duration</label><div class="chip-row" id="duration-chips"><span class="chip" onclick="pickChip(this,'dur')">2 weeks</span><span class="chip" onclick="pickChip(this,'dur')">1 month</span><span class="chip" onclick="pickChip(this,'dur')">3 months</span><span class="chip" onclick="pickChip(this,'dur')">6 months</span></div></div>
<div class="input-group"><label>Sessions per week</label><div class="chip-row" id="freq-chips"><span class="chip" onclick="pickChip(this,'freq')">2x</span><span class="chip" onclick="pickChip(this,'freq')">3x</span><span class="chip" onclick="pickChip(this,'freq')">5x</span><span class="chip" onclick="pickChip(this,'freq')">Daily</span></div></div>
<div class="input-group"><label>Time per session</label><div class="chip-row" id="time-chips"><span class="chip" onclick="pickChip(this,'time')">15 min</span><span class="chip" onclick="pickChip(this,'time')">30 min</span><span class="chip" onclick="pickChip(this,'time')">1 hour</span><span class="chip" onclick="pickChip(this,'time')">2 hours</span></div></div>
<button class="next-btn" id="next-2" disabled onclick="goTo(3)">Continue</button>
</div>
<div class="step" id="step-3">
<h2>Pick <span class="hl">the reward</span></h2>
<p class="sub">Choose an experience to unlock when the goal is achieved</p>
<div class="input-group"><input class="text-input" placeholder="Search experiences..." style="margin-bottom:12px"></div>
<div class="chip-row" style="margin-bottom:14px"><span class="chip selected" onclick="filterCat(this)">All</span><span class="chip" onclick="filterCat(this)">Adventure</span><span class="chip" onclick="filterCat(this)">Wellness</span><span class="chip" onclick="filterCat(this)">Food</span></div>
<div id="exp-list">
<div class="exp-card" onclick="pickExp(this,0)"><div class="exp-img" style="background:linear-gradient(135deg,#0f3a4a,#1a5060)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5DDCBB" stroke-width="1.8"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="#5DDCBB"/><circle cx="15" cy="10" r="1" fill="#5DDCBB"/></svg></div><div class="exp-info"><div class="exp-name">Surfing lesson</div><div class="exp-desc">2-hour group lesson with gear</div><div class="exp-price">€65</div></div></div>
<div class="exp-card" onclick="pickExp(this,1)"><div class="exp-img" style="background:linear-gradient(135deg,#2a1a3a,#3a2050)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#AFA9EC" stroke-width="1.8"><path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z"/><path d="M12 6v6l4 2"/></svg></div><div class="exp-info"><div class="exp-name">Spa day</div><div class="exp-desc">Full-day access with massage</div><div class="exp-price">€120</div></div></div>
<div class="exp-card" onclick="pickExp(this,2)"><div class="exp-img" style="background:linear-gradient(135deg,#1a2a1a,#2a3a20)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#97C459" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div><div class="exp-info"><div class="exp-name">Cooking class</div><div class="exp-desc">Italian cuisine workshop</div><div class="exp-price">€85</div></div></div>
<div class="exp-card" onclick="pickExp(this,3)"><div class="exp-img" style="background:linear-gradient(135deg,#3a2a1a,#4a3020)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F0997B" stroke-width="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div><div class="exp-info"><div class="exp-name">Go-kart race day</div><div class="exp-desc">10-lap race with group booking</div><div class="exp-price">€45</div></div></div>
</div>
<button class="next-btn" id="next-3" disabled onclick="goTo(4)">Continue</button>
</div>
<div class="step" id="step-4">
<h2>How should <span class="hl">the reward</span> be revealed?</h2>
<p class="sub" id="mode-sub">Should they know what they're working towards?</p>
<div class="mode-card" onclick="pickMode('revealed')" id="mode-revealed">
<div style="margin-bottom:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F4A83D" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg></div>
<div class="mode-title">Revealed</div>
<div class="mode-sub">They know the reward from day one. Full motivation to earn it.</div>
</div>
<div class="mode-card" onclick="pickMode('secret')" id="mode-secret">
<div style="margin-bottom:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2ECDA7" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1" fill="#2ECDA7"/></svg></div>
<div class="mode-title">Secret</div>
<div class="mode-sub">The reward stays hidden. Ernit drops hints every time they log a session.</div>
<div class="mode-tag">Surprise factor</div>
</div>
<button class="next-btn" id="next-4" disabled onclick="goTo(5)">Continue</button>
</div>
<div class="step" id="step-5">
<h2>Ready to <span class="hl">commit?</span></h2>
<p class="sub">Review your challenge gift before sending</p>
<div style="background:#1A2436;border-radius:16px;padding:16px;margin-bottom:16px">
<div class="summary-row"><span class="sr-label">Type</span><span class="sr-value" id="sum-type">—</span></div>
<div class="summary-row"><span class="sr-label">Goal</span><span class="sr-value" id="sum-goal">—</span></div>
<div class="summary-row"><span class="sr-label">Duration</span><span class="sr-value" id="sum-dur">—</span></div>
<div class="summary-row"><span class="sr-label">Frequency</span><span class="sr-value" id="sum-freq">—</span></div>
<div class="summary-row"><span class="sr-label">Session time</span><span class="sr-value" id="sum-time">—</span></div>
<div class="summary-row"><span class="sr-label">Reward</span><span class="sr-value amber" id="sum-exp">—</span></div>
<div class="summary-row" style="border:none"><span class="sr-label">Mode</span><span class="sr-value" id="sum-mode">—</span></div>
</div>
<div style="background:#1E2A40;border-radius:12px;padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ECDA7" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
<span style="font-size:13px;color:#8E95A3;line-height:1.4">You only pay <span style="color:#F4A83D;font-weight:600" id="sum-price">€0</span> when they achieve their goal</span>
</div>
<button class="next-btn" onclick="sendChallenge(this)">Send Challenge Gift</button>
</div>
</div></div></div>
<script>
const TOTAL_STEPS=5;let currentStep=1;
let data={type:'',goal:'',dur:'',freq:'',time:'',exp:-1,expName:'',expPrice:'',mode:''};
const expData=[{n:'Surfing lesson',p:'€65'},{n:'Spa day',p:'€120'},{n:'Cooking class',p:'€85'},{n:'Go-kart race day',p:'€45'}];
function renderDots(){const d=document.getElementById('dots');d.innerHTML='';for(let i=1;i<=TOTAL_STEPS;i++){const dot=document.createElement('span');dot.className='dot'+(i===currentStep?' active':'')+(i<currentStep?' done':'');d.appendChild(dot);}document.getElementById('step-label').textContent='Step '+currentStep+' of '+TOTAL_STEPS;}
function showStep(n){document.querySelectorAll('.step').forEach(s=>s.classList.remove('visible'));document.getElementById('step-'+n).classList.add('visible');currentStep=n;renderDots();}
function goTo(n){if(n===5)buildSummary();showStep(n);}
function goBack(){if(currentStep>1)showStep(currentStep-1);}
function selectType(t){data.type=t;document.getElementById('opt-solo').classList.toggle('selected',t==='solo');document.getElementById('opt-shared').classList.toggle('selected',t==='shared');document.getElementById('next-1').disabled=false;document.getElementById('goal-sub').textContent=t==='shared'?'What will you both be working towards?':'What will they be working towards?';document.getElementById('mode-sub').textContent=t==='shared'?"Should they know what you're both working towards?":'Should they know what they\'re working towards?';}
let chips={dur:null,freq:null,time:null};
function pickChip(el,group){if(chips[group])chips[group].classList.remove('selected');el.classList.add('selected');chips[group]=el;data[group]=el.textContent;validateGoal();}
function validateGoal(){const ok=document.getElementById('goal-input').value.trim()&&chips.dur&&chips.freq&&chips.time;data.goal=document.getElementById('goal-input').value.trim();document.getElementById('next-2').disabled=!ok;}
function filterCat(el){el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));el.classList.add('selected');}
function pickExp(el,i){document.querySelectorAll('.exp-card').forEach(c=>c.classList.remove('selected'));el.classList.add('selected');data.exp=i;data.expName=expData[i].n;data.expPrice=expData[i].p;document.getElementById('next-3').disabled=false;}
function pickMode(m){data.mode=m;document.getElementById('mode-revealed').classList.toggle('selected',m==='revealed');document.getElementById('mode-secret').classList.toggle('selected',m==='secret');document.getElementById('next-4').disabled=false;}
function buildSummary(){document.getElementById('sum-type').textContent=data.type==='shared'?'Together':'Just them';document.getElementById('sum-goal').textContent=data.goal||'—';document.getElementById('sum-dur').textContent=data.dur||'—';document.getElementById('sum-freq').textContent=data.freq||'—';document.getElementById('sum-time').textContent=data.time||'—';document.getElementById('sum-exp').textContent=data.expName||'—';document.getElementById('sum-mode').textContent=data.mode==='revealed'?'Revealed':'Secret (with hints)';document.getElementById('sum-price').textContent=data.expPrice||'€0';}
function sendChallenge(btn){btn.textContent='Sent!';btn.style.background='linear-gradient(135deg,#2ECDA7,#5DDCBB)';btn.disabled=true;}
showStep(1);
</script>
</body>
</html>
```

---

## How to Use This Doc in Claude Code

Start a Claude Code session and say:

> Read `docs/ERNIT-GIFT-FLOW-SPEC.md` — it contains the full UX spec and working HTML prototype for the gifting flow. Implement this as React Native screens in the existing Ernit app codebase. Start with Step 1 (solo vs together selection) as a new screen component.

Then iterate step by step through each screen.

# Client portal, real timelines, and a calendar that protects the mornings

Captured 2026-09-30, from Santi, immediately after the first real end-to-end payment
(`SAL-QTN-2026-00005` → `PROJ-0003`). Nothing here is built. It is written down in his own
terms so the decisions survive the session they were made in.

The governing instruction, in his words: **hold the client's hand, step by step. More steps
is better than fewer steps and confusion — but not so many that the steps themselves
overwhelm.**

---

## 1. Commercial rules (decided, not yet implemented anywhere)

These are business rules, not features. Every feature below has to respect them.

| Rule | Figure | Applies when |
|---|---|---|
| Rush fee | **+20%** | The client wants it faster than the realistic timeline allows — "I needed it yesterday" |
| Planning discount | **−10%** | The client gives more time than the timeline needs. Better planning is rewarded |
| Out-of-scope work | **R850 / hour** | Anything added that was not discussed before the quote |
| Retainer rate | **R500 / hour** | Retainers are the preferred arrangement, so they cost less |
| Retainer cap | **open question** | Santi: "we do have a cap depending on how much work it is" — the cap is undecided |

A client adding a task in their portal must be told, at the moment they add it: if this was
not in the original scope it either moves to a later phase, or it is billed hourly at the
rate above. No silent scope creep, no surprise invoice.

## 2. Capacity rules — the calendar exists to protect the work

Santi's constraint, stated plainly: *"the big challenge is for my calendar to not be
overwhelmed."* These are hard limits the scheduler must never plan past.

- **3 tasks per day**, regardless of how big they are.
- **2 tasks per day** on a day that has a meeting.
- **Meetings only on Tuesdays and Thursdays.**
- **Meetings only in the afternoon, maximum 2 per afternoon.** Mornings are for work and
  are never bookable.
- **No weekends. No public holidays.** (South African public holidays — source to be
  decided; ERPNext already has a Holiday List from `erpnext/setup/07_holiday_list.py`.)

Consequence worth stating out loud: these limits are what make a promised date honest. A
timeline that ignores them is a wish.

## 3. Per-service boards and AI-planned timelines

Today every client gets the same nine-step `Client Onboarding` board with every step due on
the project start date. Instead:

- **A board per service** — website, brand guide, application, AEO, retainer — each with the
  steps that belong to that work. Chosen from the item actually sold, which requires the
  Sales Order to record the real quote lines first (phase 2 item 1 in
  `paperclip/goals.md`).
- **The plan is generated from what the client told us**: the service bought, the deadline
  they gave in the brief ("Any date you are working towards?"), and the capacity rules in
  §2. Dates are spread across real working days, not stacked on day one.
- **Realism is enforced, and said out loud.** A website plus a brand guide in one day is not
  possible, and the system says so rather than agreeing and failing. Where the client's date
  is tighter than the plan allows, offer the rush fee (§1); where it is looser, apply the
  planning discount.
- **The client can amend dates to their own calendar, not ours.** Their availability governs
  their steps; our capacity rules govern ours. Moving a client step moves what follows it —
  the same rule the `/start` page already promises in prose: the dates hold while we are
  working, and move when we are waiting.

## 4. `/start` becomes a guided flow, not a scroll

- **Steps, not one long page.** One thing at a time, with clear progress. Today it is four
  stacked blocks and a lot of scrolling.
- **Confetti when a step is completed** — a real moment of "that's done", rising from the
  bottom of the screen.
- **A timeline toggle** on "What happens next": switch between the list and a calendar view
  showing the project across real dates, with weekends and holidays greyed out.
- **Completed steps show as completed** — ticked, not merely absent. Today only open tasks
  are shown, so a client cannot see what has already been achieved.
- **"Book a meeting"**, so nobody feels handed to a robot. When a meeting is booked,
  everything the client has entered so far is emailed to us with it, so the call starts
  informed. Slots obey §2: Tuesday or Thursday afternoon, two per afternoon, never a morning.

## 5. Writing help in the brief

Each brief answer gets an **"improve this text"** control. The client writes roughly, presses
it, and gets a cleaner version of their own words back. They keep what they like. This is
help with copy, never a replacement for what they meant — the original must remain
recoverable.

## 6. Client accounts

The biggest piece, and the one that changes the shape of everything else. Today a client's
access is a 90-day token in an email.

An account gives them a durable way back in, and a place to hold:

- **their calendar** — the plan from §3, amendable where it is theirs to amend;
- **their brief and everything they have sent us**;
- **a Kanban board** of the project, with expectations — including, in their own words from
  the brief, what they said a win would be;
- **the ability to add a task**, subject to the scope warning in §1.

Open decision: ERPNext's own portal users versus an account system on santi.co.za backed by
the pipeline. The first is less code and puts the client inside ERPNext; the second keeps the
client in the brand and keeps ERPNext private. Not yet decided.

## 7. Done on 2026-09-30, in response to the same review

- Receipt, quote and final-invoice emails now use one branded HTML shell, with a header band,
  a real button, and more of what happens next. n8n's "This email was sent automatically
  with n8n" footer is off on all three — it was going out on live client mail.
- `/paid` is centred and now says: you are booked, your receipt carries the private link,
  here are the four things that happen next, and a human reads every reply.
- All nine onboarding steps carry a description saying what the step is and **who is holding
  it** (US / YOU / BOTH), on the template and backfilled onto the live project. The agent
  answering "what is on PROJ-0003" now has something to read, and so does the client.

## 8. Order worth building in

1. Sales Order records the real quote lines (already phase 2 item 1 — everything about
   per-service boards depends on it).
2. Per-service templates with day offsets, and the capacity rules as code.
3. Completed steps visible, plus the waiting-on-you flag already specified in phase 2.
4. The step-based `/start` flow, with the timeline toggle and confetti.
5. Book a meeting, with the slot rules.
6. "Improve this text" in the brief.
7. Client accounts, once the decision in §6 is made.

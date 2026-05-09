# Pilot Terms — What Day 31 Looks Like, and What We Mean by "Free"

> **Audience.** A pilot partner deciding whether to commit to a 30-day trial. Goal: clarity on what happens after day 30, what "free" means in practice, and what stays true regardless of what we figure out commercially.

---

## 1. The 30 days

| Day | What happens |
| --- | --- |
| 1 | Onboarding kickoff (see `PILOT_ONBOARDING.md`). Account created, zone registered, first signed observation lands. |
| 2–28 | You operate the zone normally. We monitor for chain integrity issues and give you a heads-up if anything looks wrong. No scheduled check-ins unless you ask. |
| 14 | Mid-pilot async update — we send you the count of signed observations, the aggregate roots, and any anomalies. ~5-minute read. |
| 28 | We send a draft "pilot summary" — what the chain accumulated, what the verification looks like, what worked, what didn't. Async. |
| 30 | 30-minute review call. Three forks (see §2). |

The pilot is **30 calendar days from your first signed observation**, not from kickoff. If onboarding takes a week, day 30 is 37 calendar days from "we said yes". This avoids penalizing you for our setup time.

---

## 2. Day 31 — three forks

We commit, in writing, to one of these three outcomes by day 30. No ghosting, no soft "let's stay in touch."

### Fork A — Continue as a research partner (default if no commercial product exists yet)

If, at day 30, we have not landed on a paid commercial offering — which is the most likely outcome, honestly — the pilot graduates to a **research partnership**:

- You keep the same access at the same zero cost
- We continue to ingest your observations into the chain
- Your zone stays publicly listed on `/gaia-prime`
- In exchange, we ask you to do one of: (a) provide a one-paragraph pull-quote for the homepage, (b) introduce us to one other potential pilot partner you respect, (c) be a reference call for prospective partners or investors. Pick whichever is least friction.

This is the most likely outcome. Plan for it.

### Fork B — Graduate to a paid customer (only if the commercial offering exists)

If we have a paid offering by day 30, you get the **pilot partner discount**:

- First 12 months at the published price minus 50%, or
- First zone free in perpetuity (whichever you prefer)
- 90-day notice of any pricing change after the discount window
- Your historical data is grandfathered onto the discounted rate

We will not surprise-invoice you. If we land on a commercial offering during your pilot, we tell you the day we launch it; you're not auto-converted.

### Fork C — End gracefully

If neither of the above fits, or if the pilot revealed that the platform isn't the right fit for your work:

- Your account stays read-only for 90 days so you can export anything you want
- Your signed observations stay in the chain (you can't *un-sign* a record without breaking the chain — that's the whole point of the chain), but we'll mark the zone as `pilot_concluded` so it's clear in the public listing that the partnership ended
- We send you a written one-pager on what we learned from your pilot, attributed if you want, anonymized if you don't
- We part as friends. Your contact stays in our network for future intros, and we'll be a reference for *you* with anyone you ask us to talk to

---

## 3. What "free" means

The pilot is free in cash terms. The only things you put in:

- **Your time.** Onboarding kickoff (~1 hr), mid-pilot async response (~5 min), day-30 review (~30 min). Total ≈ 2 hours over 30 days.
- **Your data.** Zone polygon, sensor readings or camera-trap images, biome classification. See `DATA_HANDLING.md` for what we do with it.
- **Your honest feedback.** The point of a pilot is to learn — sugar-coating it wastes both our time.

We do not ask for: equity, IP rights, exclusivity, future commitments, or testimonial rights without your explicit per-instance approval.

---

## 4. Pricing intent (advance notice, not a commitment)

We don't have a published price as of 2026-05-09, and saying "we'll never charge" would be both untrue and disrespectful — building a real product takes a real business model. So here's the *intent*:

- **Most likely model:** per-zone-per-month, with a generous free tier. First zone free in perpetuity for pilot partners. Rough internal target is **$50–200 per zone per month** depending on observation volume, but this is unconfirmed.
- **Possible alternative:** per-signed-observation, priced cheaply (~$0.01–0.05 each) so high-volume operators pay more and small projects effectively stay free. Less likely but on the table.
- **Definitely not:** equity, revenue share, take-rate on conservation credits, or token / "EcoCoin"-flavored anything. We will not be the platform that paywalls your evidence-of-impact behind a token.
- **For non-profits and academic research:** likely a perpetual reduced rate — exact terms TBD, but we expect the institutional research path to be cheaper than commercial.

If you'd like input into pricing — what your org would actually pay, what models would and wouldn't work — say so at kickoff. Pilot partners shape this.

---

## 5. What stays true regardless of model

These commitments do not depend on what commercial path we take:

1. **Your data is portable.** You can export every observation, signature, and zone definition as JSON or CSV at any time. We don't put export behind a paywall, ever.
2. **Open verification.** The verification primitives (Ed25519, JWK at `/.well-known/keys.json`, the verify endpoint, the auditor walkthrough script) stay public and free. No one needs an account or an invoice to verify a claim made by your zone.
3. **Methodology stays open.** `METHODOLOGY_v0.1.md` and its successors stay public. Other operators and reviewers can read them, critique them, and adopt the primitives without paying us.
4. **Existing observations stay verifiable.** If we sunset your account, change pricing, change methodology versions, get acquired, or shut down — the observations you generated during the pilot remain cryptographically verifiable using the public key you can save today. The chain is append-only. Your record cannot disappear without your permission.

These are the load-bearing commitments. If we ever break one of them, this paragraph and your saved copy of the public key are evidence we did so.

---

## 6. Termination, both directions

Either side can end the pilot at any time before day 30 by sending one email saying so. There is no notice period, penalty, or claw-back. The only thing that persists is the data already written to the chain (which can't be retroactively unsigned, by design).

If we end it: we owe you the export of your data within 7 days and a written reason within 7 days.

If you end it: we'd appreciate one paragraph on why, but we don't require it.

---

*Last updated: 2026-05-09.*

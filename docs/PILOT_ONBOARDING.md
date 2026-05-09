# Pilot Partner Onboarding

> **Audience.** A pilot partner — NGO, university field station, individual landowner, forester — who has agreed to a 30-day trial. Goal: from "we said yes" to "first signed observation in the chain" in **under one hour**.
>
> **Companion docs.** Read `OUTREACH.md` for the offer, `PILOT_TERMS.md` for what happens at day 31, `DATA_HANDLING.md` for what we collect and what stays public.

---

## What you'll have when this is done

- A user account with `field_operator` role on the platform
- One **zone** registered with a polygon covering your restoration site
- At least one **observation source** flowing — typically a camera trap submitting images, which the platform classifies, signs with Ed25519, and chains
- Your zone listed on `/gaia-prime` with a live aggregate root that any third party can verify

Time: ~45 minutes if you have your zone polygon ready and one camera-trap image to submit.

---

## Step 0 — Pre-flight (before the call)

You'll save 20 minutes if you bring these to the kickoff:

1. **Zone polygon.** Either GeoJSON or a list of (lat, lon) corners. ~5–500 hectares is the right scale for v0.1; smaller is fine.
2. **Biome classification** of the zone. One of: `tropical_forest`, `temperate_forest`, `grassland`, `wetland`, `coastal`, `montane`, `arid`, `riparian`, `mangrove`, `boreal`, or `other`. Affects how the species classifier weights its priors.
3. **One observation source.** Easiest is a camera-trap image you already have on disk. Drone footage works too. If you only have sensor readings (soil moisture, etc.), flag this in advance — see *Limitations* below.
4. **A point of contact** at your org who can spot-check that what we recorded matches what actually happened on the ground.

---

## Step 1 — Account creation

We'll create your account. You'll get an email with a temporary password. On first login at `/login`, change it.

By default, new accounts have role `viewer` (read-only). For pilot partners, we promote to `field_operator` so you can create zones and submit observations. Admin promotion happens server-side; you'll know it worked when the dashboard sidebar shows "Drones" and "Zones" as writable.

```bash
# Verify your role from a logged-in browser (devtools → console):
fetch("/api/auth/me", { credentials: "include" })
  .then(r => r.json())
  .then(u => console.log(u.role))
```

If `role` prints `field_operator` or `admin`, you're set. If it prints `viewer`, ping us — promotion didn't propagate.

---

## Step 2 — Register your zone

From the **Zone Management** page in the dashboard:

1. Click **+ Add Zone**.
2. Paste your polygon as a GeoJSON `coordinates` array, or click points on the map.
3. Pick the biome from the dropdown.
4. Set priority — `low` / `medium` / `high`. Defaults to `medium`. Affects how the patrol scheduler weights this zone if you later add drones.
5. Save.

Verify the zone appears on the **Ecosystem Map** with the right polygon.

---

## Step 3 — First signed observation

The fastest path to a signed observation is a **camera-trap image upload**. The platform classifies the species, signs the result, writes it to the chain, and surfaces it on `/gaia-prime` immediately.

From the **Species Identification** page:

1. Click **Upload Image**.
2. Select your camera-trap image (PNG/JPEG).
3. Pick the zone you just created from the dropdown.
4. Submit.

Within a few seconds you should see:

- A **species classification** (top-1 + confidence) on the same page
- A new entry on the **Provenance** tab of the zone with `source_type: species_identification`
- The zone's aggregate root on `/gaia-prime` updates to include the new observation

To verify the chain end-to-end, follow `AUDITOR_WALKTHROUGH.md` — fetch `/api/observations?zone_id=<your-zone>&limit=5`, pick the most recent, fetch `/api/observations/{id}`, and confirm `verification.valid == true`.

---

## Step 4 — Recurring submission cadence

Pilots vary; pick one of:

- **Manual cadence (default).** Operator submits camera-trap images / sightings on whatever schedule fits the project. One a week is fine; one a day is better.
- **Bulk import.** If you have a backlog of historical images, ping us — we'll wire a one-shot import script that signs each in chronological order. Important: the platform timestamps observations at *upload time*, not at the original capture time, unless you pass `observed_at` explicitly.

We do not yet support **automated camera-trap forwarding** (e.g., Reconyx → us). That's on the v0.2 list. For now, manual or bulk works.

---

## Limitations to be honest about (v0.1)

These are gaps the platform doesn't yet fill. If your pilot depends on one of these, raise it before kickoff so we can either build it together or set expectations.

1. **No external sensor ingestion.** A soil-moisture probe or temperature sensor cannot push readings via API today. Workaround: submit periodic readings as JSON-formatted "intervention" payloads, manually. v0.2 will add `POST /api/observations/sensor-reading` with HMAC-authenticated device tokens.
2. **Species classifier is `deterministic-v1` by default.** The output is a curated 25-species biome taxonomy with content-hash variation, not a real vision model — so for now treat species output as a *placeholder* for chain wiring, not as ground truth. Real BioCLIP is plumbed and can be enabled per-deployment (`SPECIES_IDENTIFIER=bioclip` env). If species accuracy matters for your pilot, ask us to flip that switch.
3. **No satellite cross-witness.** We don't pull Sentinel-2 or Planet Labs imagery against your zone yet. v0.2 candidate.
4. **No private/redacted mode.** Every signed observation is publicly verifiable by design — that's the whole product. If your camera-trap images are sensitive (e.g., poaching-relevant geographic data), see `DATA_HANDLING.md` §3 — we have a `fuzz_geo` flag in design but not shipped.
5. **No partner-specific custom intervention verbs.** The platform's intervention vocabulary is fixed at `drop_seed_pod`, `deploy_predator_deterrent`, `deploy_water_sampler`. If your project's interventions don't map onto these, we can extend the registry — but it's a code change on our end, not a configuration on yours.

---

## Day-1 success criterion

By end of kickoff, you should be able to send this URL to anyone — your board, a regulator, a friendly skeptic — and have them independently verify your zone's chain in 10 minutes:

```
https://[your-domain]/gaia-prime
→ scroll to "Zone attestation roots"
→ find your zone
→ "Open attestation JSON" link
```

If they can't, we haven't onboarded successfully.

---

*Last updated: 2026-05-09.*

# Tamper-Evident Audit Trail for AI Agent Decisions — Pilot Offer

*One-page offer for a Compliance / Model-Risk lead. Edit the bracketed bits per prospect, then send.*

---

**To:** [Name], [Head of Compliance / Model Risk], [Firm]
**From:** Theophilus Ogieva, ThePlus-Tech
**Re:** Proving what your AI agents decided — and that the record wasn't edited afterwards

---

## The problem you already have

You've put LLM/agent automation into [workflow — e.g. credit decisioning / KYC triage / claims adjudication]. Your audit trail for those decisions lives in application logs (CloudWatch / Datadog / a Postgres table). Those logs are **mutable**. When internal audit or a regulator asks *"show us what the model decided on 14 March, and prove this record wasn't changed after the incident"* — you can't, because anyone with database access could have rewritten it.

Under the EU AI Act's record-keeping and traceability obligations for higher-risk systems, and PRA model-risk expectations (SS1/23), "we have logs" is increasingly not the same as "we have an auditable record." *(Your compliance team owns the exact obligation that applies — we provide the technical control that satisfies it.)*

## What we deliver

A **tamper-evident decision ledger**: every decision your agent makes is cryptographically signed (Ed25519) and hash-chained the moment it happens, then **externally anchored** so its timestamp can't be backdated — not even by us.

The part that matters to an auditor: **they can verify it without trusting your infrastructure or ours.** We hand them a ~30-line script and a published public key; they re-compute the hash, check the signature, and confirm the external time-anchor — offline. If our servers vanished tomorrow, the proofs still verify.

This is not observability tooling (Datadog/Splunk log; they don't prove tamper-evidence) and not a policy-register product (Credo/Holistic/Fairnow score risk; they don't sign decisions). It's the cryptographic record layer underneath both.

## The pilot

| | |
|---|---|
| **Scope** | Instrument **one** of your existing AI-agent workflows. Every decision → signed, hash-chained, externally anchored audit entry. |
| **Deliverables** | (1) the ingestion + ledger running against your workflow; (2) an independent offline-verification tool + auditor walkthrough doc; (3) one tabletop session with your internal audit/compliance to validate it against your record-keeping requirement. |
| **Timeline** | 6–8 weeks. |
| **Price** | £[25k–40k], fixed. |
| **Success criterion (you sign it off)** | Your internal audit/compliance confirms the ledger meets your record-keeping requirement **and** your team independently verifies a decision offline, without our servers. Binary — no vanity metrics. |

## Explicitly out of scope (so we both stay honest)

- We are **not** selling an agent that *executes* approved actions — this pilot is the **record** of decisions, not the actor.
- Single dedicated instance for your workflow — not multi-tenant SaaS (that comes later).
- Nothing touches trading, capital, or your production decision logic — we sit beside it and record.

## Why paid, why a pilot

A free trial would prove nothing — and "they liked it, it was free" is a worthless reference. A fixed-fee pilot proves the budget line is real and gives you a deliverable your auditors can actually use. If it doesn't meet the success criterion above, you've spent £[25–40k] to learn that cheaply, with working code in hand either way.

## After the pilot

Annual licence for the ledger across additional workflows, priced per workflow. Optional upsell: a multi-agent **review-and-approval board** (independent agents vote on a decision, votes recorded immutably in the same ledger) once you want recorded human-in-the-loop sign-off, not just recorded decisions.

## Next step

A 30-minute call to pick the one workflow and confirm your record-keeping requirement. [Calendar link.]

---

*The verification claim is not marketing: the public-key endpoint and offline-verify tool exist and work today against a live signed-observation chain in another deployment. The pilot adapts that proven layer to your decisions and adds external time-anchoring. Reference walkthrough available on request.*

# Telos — Test Strategy (Senior SQE)

**Date:** 2026-06-25
**System under test:** Telos — local-first CLI + TypeScript libraries (`@telos/*`) + a local Fastify
server + a React/Vite web UI. **No auth, no cloud, no multi-tenant, no network egress** (binds
`127.0.0.1`). That shape decides which test types apply and which are honestly N/A.

## Purpose-anchored acceptance criteria (what "working" means)

Telos exists to make agent workflows **token-efficient** via three pillars. Every test ladders to one:

1. **Graph-as-memory** — a small brief replaces reading the repo cold. *Acceptance:* `measure` shows a
   real, honestly-baselined reduction.
2. **Harness orchestration** — each prompt routes to the *right* agents, or **stays silent**. *Acceptance:*
   the routing battery is correct AND never injects garbage/over-dispatches (token-negative behavior).
3. **Map + live monitoring** — scan yields an accurate graph; overlays ingest real signals additively.
   *Acceptance:* known-fixture node/edge counts; demo OTel/process ingest lights the right nodes.

## SDLC test levels — coverage map

| Level | Applies? | Current | Gap to close |
|---|---|---|---|
| **Unit** | ✅ core | 377 tests across 8 packages | Strong; keep per-feature |
| **Integration** | ✅ core | server-routes over real sqlite GraphService; harness→cli hook | Add scan→context→route→activity cross-package flow |
| **System / E2E** | ✅ | manual smoke (scan/serve/SPA); tarball install smoke | Automate a headless scan→serve→API system test |
| **Acceptance** | ✅ vital | routing battery; `measure` | Honest measure baseline; map/live purpose checks |

## Test types — applicability (honest)

| Type | Applies to Telos? | Plan |
|---|---|---|
| **Functional** | ✅ vital | every command/endpoint produces correct output (have; extend map/live) |
| **Regression** | ✅ vital | full serialized suite + the routing battery as a guard |
| **Non-functional: performance/latency** | ✅ **vital** | the hook runs on **every prompt** — benchmark `planWorkflow`+`renderPlan` and guard a budget |
| **Performance: scan throughput** | ✅ | scan time/nodes on a known fixture (smoke + loose budget) |
| **Stress / large-repo** | ⚠️ partial | synthetic large graph for aggregator/measure; full 10k-file scan deferred |
| **Concurrency / multi-user** | ⚠️ limited | single-user local tool; relevant bit = native-module parallel load (already mitigated via `--workspace-concurrency=1`) + concurrent read-only API requests |
| **Cross-OS** | ✅ | path handling (discover/roster/productContext) must be win+posix safe — unit-test path resolution; process collector branches per-OS |
| **Disaster recovery / robustness** | ✅ **vital for local-first** | missing/corrupt `graph.db`, missing plugins manifest, missing grammars, malformed cache → **graceful, no crash** |
| **Security** | ✅ scoped | path-traversal confinement on `/api/source` (have); server is read-only + loopback-bound; hook parses untrusted stdin JSON safely; **no secrets in repo** |
| **Acceptance / purpose** | ✅ vital | the three pillars above |
| Usability / a11y | ⚠️ later | web UI a11y (roles/Esc/focus) partly covered by Panel tests |
| Compatibility (Node ≥20) | ✅ | engines pin + CI matrix (future) |
| Localization / i18n | ❌ N/A | single-locale dev tool |
| Penetration / network | ❌ N/A | no remote surface, loopback only |

## Execution priority (risk-ranked)

1. **Honest `measure` baseline** (acceptance) — defends the headline token claim. *(user #1)*
2. **Hook latency benchmark + budget** (non-functional) — per-prompt path; the user's explicit latency worry.
3. **System/integration flow** — scan→context→measure→route→activity, automated.
4. **Robustness / disaster-recovery** — corrupt/missing graph.db, plugins, grammars.
5. **Map-accuracy** functional test on a known fixture (audit #2).
6. **Live-ingest** integration test for OTel + processes (audit #3).
7. **Routing precision** — testing/QA prompts must not misclassify as feature-build (regression);
   document keyword-routing's substring imprecision as a known limitation the LLM phase addresses.
8. **Cross-OS path** unit tests for discover/roster/productContext.

## Out of scope (honest N/A)

i18n/localization; external pen-testing/network security (loopback, read-only); true multi-OS CI
matrix (path-level unit tests stand in); 10k-file live stress (synthetic-graph stress stands in).

## Deliverables

Each priority item ships as committed tests (+ any fix it surfaces), green in the serialized sweep.
This document is the living index of what is verified vs. deferred.

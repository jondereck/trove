# Cloud-first Auth Gate Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Gate Sign up behind Cloud; keep Sign in for returning users; prompt guests to create/sign in after Cloud purchase/restore.

**Architecture:** `lib/authGate.ts` helpers; UI updates on Welcome, Account, Upgrade, Signup; shared post-Cloud account prompt via Alert (no new modal unless needed).

**Tech Stack:** Expo Router, existing RevenueCat entitlements, StyleSheet + theme tokens.

**Spec:** `docs/superpowers/specs/2026-07-12-cloud-first-auth-design.md`

---

### Task 1: `lib/authGate.ts`
- [x] Done

### Task 2: Welcome + Account UI
- [x] Done

### Task 3: Upgrade post-Cloud prompt
- [x] Done

### Task 4: Signup gate + logged-in soft nudge
- [x] Done

### Task 5: DEVLOG
- [x] Done

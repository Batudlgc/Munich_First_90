<p align="center">
  <img src="assets/images/icon.png" width="96" height="96" alt="" />
</p>

<h1 align="center">Munich First 90</h1>

<p align="center">
  The first 90 days of German bureaucracy for international students in Munich, in the right order.<br/>
  <a href="https://munichfirst90.com"><b>munichfirst90.com</b></a> · English · Deutsch · Türkçe
</p>

---

## What it is

New international students in Munich have to deal with Anmeldung, a bank account, health
insurance, the residence permit, the broadcasting fee and more, all in the same few weeks.
Most of these steps depend on each other, and the real bottleneck is finding an appointment.

Munich First 90 puts it in order:

- **17 sourced steps in 4 phases** — before arrival (2), first two weeks (5), first 90 days (4)
  and "if it applies" (6). 11 are mandatory and drive the progress bar.
- **Prerequisites are enforced:** a step that needs another one first is shown as locked.
- **Appointment layer:** for every step, how booking works — portal, phone line and hours,
  when new slots are released, whether walk-ins are possible. Missing facts stay `null`
  with a reason instead of being guessed.
- **Every claim links to an official source.** Official German terms (forms, offices,
  documents) are never translated; only the explanation layer is.
- **Ask:** a question-answering screen that only rephrases the step content and always shows
  which step the answer came from. It is gated behind an explicit consent screen.
- **No account.** Progress and preferences stay on the device (SQLite on iOS, `localStorage`
  on the web).

It is a private, non-commercial project and not an official service of the City of Munich.

## Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────────┐
│ Expo app (iOS + static web)│        │ Cloudflare Worker  (proxy/)      │
│  · step content as JSON    │  HTTPS │  · scope guard (same code as app)│
│  · progress on device      ├───────►│  · step matching, no LLM         │
│  · scope guard runs first  │        │  · per-IP daily limit + token    │
└────────────────────────────┘        │    budget (Durable Object)       │
        static export on Vercel       │  · nothing stored or logged      │
                                      └───────────────┬──────────────────┘
                                                      │ EU endpoint
                                                      ▼
                                             Mistral Small (EU)
```

- **Client:** Expo SDK 57, React Native 0.86, expo-router, TypeScript. The web build is a
  static export with a strict Content-Security-Policy that the build itself checks
  (`scripts/check-csp.mjs`).
- **Content:** `src/data/steps/*.json`, validated against `src/data/steps.schema.json` by
  `scripts/validate-steps.mjs` (every field either filled with a source or `null` with a reason).
- **The only server component** is the Worker in `proxy/`. The API key lives only in a
  Cloudflare secret. Question text is forwarded to the model and not stored. Rate limits and
  a daily token budget are enforced in the Worker itself, not only in the provider console.
- **Measurement without cookies:** the Worker counts daily visitors from a salted, daily-rotating
  hash of the IP. Nothing is written to the device for measurement, so no consent banner is needed.

## Legal scope

The app describes procedures; it does not give individual legal advice (German Legal Services
Act, RDG). Interface and model output use neutral, procedural language ("this step usually
requires…"), never "in your case you should…". Tax returns and individual immigration-law
questions are out of scope; the residence permit is covered only at the administrative
level (where to book, which documents are usually requested, legal deadlines).

## Quality checks

| Check | Command |
|---|---|
| Types | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Content schema + sources | `npm run validate-steps` |
| Unit tests (app) | `npm test` |
| Unit tests (Worker) | `cd proxy && npm test` |
| Web build + CSP check | `npm run build:web` |
| UI matrix (routes × languages × themes × widths) | `node scripts/sweep.mjs` |
| User flows (language, completing a step, consent) | `node scripts/sweep.mjs flows` |
| Link check on all sources | `node scripts/check-links.mjs` |

CI runs types, lint, content validation and both test suites on every push.

## Running it

```bash
npm ci
npx expo start            # iOS simulator / Expo Go / web
npm run build:web         # static web export into dist-web/
```

The Ask screen needs `EXPO_PUBLIC_ASK_URL` pointing to a deployed Worker; without it the
screen says it is not connected and sends nothing.

## Repository notes

This repository is a cleaned snapshot of the private working repository. Planning notes,
design reviews and research files are not included, so some code comments refer to
documents (`APP.md`, `docs/…`) that are not part of this snapshot. Most code comments are in
Turkish.

## License

Copyright © 2026 Batu Dallıağaç. All rights reserved — see [LICENSE](LICENSE). The source is
published for reading and review; it is not licensed for reuse.

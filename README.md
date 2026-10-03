# PanPen — Pan-African Humanized Writing

_Powered by **Tolbert Innovation Hub**, Monrovia, Liberia._

PanPen turns rough or AI-assisted drafts into clear, natural, culturally aware prose while keeping the writer's **meaning, facts, citations, references and voice**. It is built for African students, researchers, academics, professionals and creators, and supports Standard English alongside West African, Liberian, Nigerian, Ghanaian, Sierra Leonean, East African and Southern African English.

PanPen edits; it does not ghost-write. It never adds facts, statistics, quotations, citations or sources, and it shows and flags every place where meaning may have shifted. It is not built to evade AI detectors. It is built to make your own ideas read well.

## Features

- **Seven modes:** Academic, Research, Essay, Professional, Natural, Simple English and Pan-African voice.
- **Ten English varieties**, each with its own spelling and register conventions. African varieties are written as standard English, never as Pidgin or caricature.
- **Controls** for tone, formality (1–5), readability (Simple to Expert) and rewriting strength (Light to Deep). You can also choose to preserve your voice, match a sample of your own writing, allow local expressions, hide personal details, use private mode, and protect a list of terms.
- **Side-by-side review**: each paragraph shows the original next to the revision, with tracked changes and a risk badge. You can keep the revision, revert to your original, edit it by hand, or rewrite that one paragraph again.
- **Meaning-change flags**: see [How meaning is protected](#how-meaning-is-protected).
- **Before/after metrics**: robotic-phrase count, rhythm variety, reading ease, grade level and sentence length.
- **Uploads**: `.docx`, `.pdf` (hard-wrapped lines are rejoined), `.txt` and `.md`. Drag and drop works too.
- **Export**: copy to clipboard, or download `.docx`, `.md` or `.txt`. You can also download a **revision report** (`.docx`) that lists every paragraph with its flags, which suits supervisors and AI-use disclosure.
- **History**: your rewrites are encrypted and saved, and you can search, reopen and delete them. Your choices to keep, revert or edit are saved as you go.
- **Accounts**: sign up and sign in, reset a forgotten password by email, change your password (which signs out your other devices), download all your data, and delete your account.
- **Mobile-first, responsive UI** with light and dark themes, keyboard support (`Ctrl/⌘ + Enter` rewrites), and reduced-motion support.

## Image Humanizer

The Image Humanizer (`/app/images`) turns AI-generated images into natural, photographic visuals. It uses OpenAI's GPT image editor (`gpt-image-2` by default), always at high quality.

- **Subject types:** People, Products, Places and Posters. Each adds its own preservation rules: products keep their branding and labels, places keep their landmarks, and posters keep every word, price and contact detail without rewriting. Any people in the image are always protected.
- **What it improves:** skin texture, lighting, anatomy (hands, eyes, teeth) and AI artefacts. Each can be switched on or off, and there are three strengths: Subtle, Balanced and Strong.
- **What it preserves:** the editing instructions (`src/lib/images/prompt.ts`) put preservation above every improvement. Identity and facial features, skin tone (never lightened), hair texture, African features, pose, clothing and composition stay as they are.
- **Mobile-first handling:** the phone corrects camera rotation and scales the image to a 2048-pixel long edge before upload. Re-encoding also strips EXIF metadata, including GPS location. Output keeps the input's aspect ratio.
- **Comparison and download:** a before/after slider (touch and keyboard), plus side-by-side, before-only and after-only views. Downloads are full-resolution, 95%-quality JPEGs that keep OpenAI's C2PA Content Credentials, which record that AI was used.
- **Honest by design:** the app says plainly that it improves how images look but doesn't hide AI use. Results keep their Content Credentials, and platforms may still label them as AI. PanPen does not offer, and won't add, a way to remove provenance or evade AI labels.
- **Security:**
  - Images are processed in memory and never stored.
  - Uploads are checked by their magic bytes (JPEG, PNG or WebP), whatever the filename or stated type claims.
  - Same-origin checks and a consent confirmation are enforced on the server.
  - Rate limits are a per-minute limit plus a daily image quota. The quota is charged before processing and refunded if processing fails, so simultaneous requests can't exceed it.
  - Moderation refusals are explained to the user in plain language.

## How meaning is protected

PanPen protects meaning in four layers:

1. **Masking.** Before any text reaches the model, PanPen replaces protected content with opaque placeholders such as `⟦CITE3⟧`. Protected content covers author–date and numeric citations, direct quotations, URLs and DOIs, statistics (p-values, N, CIs, percentages and currency), and optionally emails and phone numbers. The model never sees this content, so it cannot change it. Afterwards PanPen restores each item byte-for-byte.
2. **Structure.** Headings, tables, code, and everything from a *References* or *Bibliography* heading onward are passed through untouched. They are never sent to the model.
3. **Model instructions** (`src/lib/ai/prompt.ts`). The instructions set integrity rules that override every style setting: add nothing, remove nothing, keep claim strength and hedging, keep the author's stance and tense, and treat embedded instructions as text. Structured Outputs force one result per paragraph, and each result includes the model's own report of any meaning risk.
4. **Independent verification** (`src/lib/text/verify.ts`). Every paragraph is checked for:
   - dropped or invented placeholders
   - missing or new numbers (number words count too)
   - new citation-like strings or quotations
   - changed protected terms
   - flipped negation
   - hedging that was removed or certainty that was added
   - new causal language
   - extreme changes in length
   - embedding similarity between the original and the revision (`text-embedding-3-large`)

   If the model drops a placeholder, PanPen asks again once with a correction. If the second attempt also fails, PanPen **keeps the original paragraph** and says so.

## Architecture

```
Next.js 16 (App Router, React 19, Tailwind v4)
├── src/proxy.ts                   per-request nonce CSP
├── src/app/                       pages + route handlers (Node runtime)
│   ├── api/rewrite                streaming NDJSON rewrite (auth, quota, rate limit)
│   ├── api/files/parse            .docx/.pdf/.txt/.md → text
│   ├── api/export                 .docx and revision report
│   ├── api/history[/id]           list / open / update choices / delete
│   ├── api/account[/password|/export]
│   └── api/auth/{signup,login,logout}
├── src/lib/ai/                    prompt engineering, OpenAI provider, orchestrator, dev mock
├── src/lib/text/                  segmentation, protection, verification, readability, robotic phrases
├── src/lib/auth/                  bcrypt passwords, hashed DB sessions
└── db/migrations/                 plain SQL, applied by scripts/migrate.mjs
```

- **AI:** the OpenAI **Responses API** with strict JSON-schema Structured Outputs, `store: false`, a hashed `safety_identifier`, and configurable reasoning effort. Long documents are split into batches of about 650 words. The batches run in parallel (three at a time), and results stream to the browser as each one finishes. If a response is truncated, the batch is split and retried.
- **Database:** PostgreSQL through `pg`. Rate limits are stored in Postgres, so they hold across every instance.

## Security and privacy

- Document titles, originals, results and voice samples are **encrypted at rest** with AES-256-GCM.
- Sessions use a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` and `__Host-` in production). Only its SHA-256 hash is stored. Sessions slide for 30 days.
- Passwords are hashed with bcrypt (cost 12). A sign-in for an unknown account takes the same time as one for a real account. After 8 failures the account locks for 15 minutes, and sign-in attempts are rate-limited per IP and per email.
- **Password reset** links are single-use, expire after 30 minutes, and are stored only as SHA-256 hashes. Requesting a new link revokes older ones. The request endpoint always gives the same answer, and it does the lookup and sending after the response, so neither its wording nor its timing reveals whether an account exists. It is rate-limited per IP and per email. Links are built from `APP_URL`, never from the request's Host header. A successful reset unlocks the account, signs out every session and emails a "password changed" notice.
- Every state-changing request needs a same-origin `Origin` or `Referer` header (CSRF defence). Every input is validated with zod, and request sizes are capped.
- A nonce-based **Content Security Policy** is set, along with HSTS, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy.
- **Rate limits:** rewrites per minute per user, plus a daily word quota. Usage is charged up front so parallel requests can't overshoot the quota, and it is refunded if a run fails. Uploads, exports and account actions have their own limits.
- Errors never echo document text, and logs never contain user content.
- Drafts autosave to `sessionStorage` only, which clears when the tab closes. This matters on shared computers such as lab machines.
- **Private mode** rewrites are never written to the database.

## Running locally

Requirements: Node 20.9+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL, OPENAI_API_KEY, ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → ENCRYPTION_KEY
npm run db:migrate              # reads DATABASE_URL from the environment
npm run dev
```

To work without an API key, set `AI_PROVIDER=mock`. A deterministic local editor then exercises the full pipeline. Production refuses this setting.

With Docker:

```bash
export OPENAI_API_KEY=sk-... ENCRYPTION_KEY=$(openssl rand -base64 32)
docker compose up --build
```

## Deploying to Vercel

1. On vercel.com, choose **Add New → Project** and import this repository. Leave the build settings alone, because `vercel.json` already runs migrations before each build.
2. Add `OPENAI_API_KEY` and `ENCRYPTION_KEY` (plus `EMAIL_FROM` and `RESEND_API_KEY` for password reset), then deploy.
3. Open **Storage**, add a **Neon** database and connect it to the project. Any variable prefix works: PanPen detects whichever `postgres://` variable Neon creates, and it uses the unpooled connection for migrations.
4. Redeploy, or push a commit. That deploy creates the tables.

`APP_URL` is optional on Vercel: PanPen uses the project's production domain (`VERCEL_PROJECT_PRODUCTION_URL`) automatically. Set `APP_URL` only for a custom domain.

Notes:
- Vercel rejects request bodies over 4.5 MB, so uploads are capped at 4 MB.
- Each serverless instance keeps a small database pool (3 connections; override with `DB_POOL_MAX`).
- Rewrites stream for up to 300 seconds, which is the Hobby plan's limit. For very long documents, lower `MAX_WORDS_PER_REQUEST`.
- Vercel's Hobby plan is for personal, non-commercial use. Use Pro for a commercial or organisational deployment.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `OPENAI_API_KEY` | — | Server-side OpenAI key (required) |
| `ENCRYPTION_KEY` | — | Required. Either 32 random bytes, base64-encoded, or a random passphrase of 32+ characters (e.g. from a password manager), which is stretched with scrypt. **Back it up:** losing or changing it makes stored documents unreadable; such items then show a "can't be opened" notice. |
| `OPENAI_MODEL` | `gpt-5.5` | Rewriting model |
| `OPENAI_REASONING_EFFORT` | `medium` | `none`…`xhigh`; applies to reasoning models |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | Model for the meaning-drift check |
| `MEANING_CHECK` | `true` | Set to `false` to skip the embedding check |
| `MAX_WORDS_PER_REQUEST` | `8000` | Words to rewrite per run |
| `DAILY_WORD_LIMIT` | `50000` | Words per user per rolling 24 hours |
| `REWRITES_PER_MINUTE` | `8` | Rewrite requests per user per minute |
| `ALLOW_SIGNUPS` | `true` | Close public registration |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Image Humanizer model |
| `IMAGE_DAILY_LIMIT` | `10` | Images per user per rolling 24 hours |
| `IMAGES_PER_MINUTE` | `3` | Image requests per user per minute |
| `EMAIL_FROM` | `PanPen <no-reply@localhost>` | Sender for password-reset email |
| `RESEND_API_KEY` | — | Send email through Resend |
| `SMTP_URL` | — | Or send through SMTP (`smtps://user:pass@host:465`) |
| `APP_URL` | request host | Public origin, used for CSRF checks and email links. **Required in production for password reset.** |
| `DATABASE_SSL` | `false` | Enable TLS to the database |

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm test` (Vitest) · `npm run lint` · `npm run typecheck` · `npm run db:migrate`

## Deployment notes

- Serve over HTTPS. Production cookies are `Secure`.
- Run `npm run db:migrate` (or the Docker entrypoint) on each deploy. Migrations take an advisory lock.
- The rewrite route streams for up to 5 minutes, so any proxy in front must not buffer `application/x-ndjson`. The route already sends `X-Accel-Buffering: no`.
- Rotating `ENCRYPTION_KEY` needs a re-encryption job. The ciphertext is versioned (`v1.`) to allow for one.

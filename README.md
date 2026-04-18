# Exam Prep AI (ExamOS)

ExamOS is a Next.js study workspace for exam prep with:

- Source upload and parsing for past papers
- Source-grounded AI chat and generation
- Real account authentication (email/password + Google sign-in)
- Tool windows for answer key, grading, marking rules, topic prediction, and timed practice

## 1. Prerequisites

- Node.js 20+
- npm

## 2. Environment Setup

1. Create a local environment file:

```bash
cp .env.example .env.local
```

2. Fill these values in `.env.local`:

- `NEXTAUTH_SECRET` (long random string)
- `NEXTAUTH_URL` (use `http://localhost:3000` for local dev)
- `GOOGLE_CLIENT_ID` (for Google OAuth sign-in)
- `GOOGLE_CLIENT_SECRET` (for Google OAuth sign-in)
- `DATABASE_URL` (PostgreSQL connection string from Neon/Supabase/Railway)
- `OPENROUTER_API_KEY`
- `LLAMACLOUD_API_KEY` (or `LLAMAPARSE_API_KEY`)
- `LLAMAPARSE_VENDOR_MULTIMODAL_MODEL_NAME` (optional, default `openrouter/auto`)

## 3. Install and Initialize

Install packages:

```bash
npm install
```

Generate Prisma client:

```bash
npx prisma generate
```

Create/update the local database:

```bash
npx prisma db push
```

## 4. Run Locally

```bash
npm run dev
```

Open http://localhost:3000

## 5. Auth Flow (Real Accounts)

- Use the sign-in screen in the app.
- If you do not have an account, switch to Create account mode.
- Accounts are stored in the configured Prisma database.

## 6. Quality Checks

Run lint:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

## 7. Git Safety

- Do not commit `.env.local`
- `.gitignore` already excludes environment files, build artifacts, and dependencies
- Commit `.env.example` only

## 8. Suggested Git Workflow

1. Create a feature branch
2. Commit focused changes
3. Push branch
4. Open a pull request into `main`

## 9. First Push Checklist

1. `npm run lint` passes
2. `npm run build` passes
3. `.env.local` is not staged
4. Commit message is clear

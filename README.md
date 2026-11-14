# 🎓 ScholarHub — Backend API & Data Pipeline

Backend of **ScholarHub**, a platform that centralises scholarships for African students. Its core is a **daily data pipeline** that collects scholarship offers from the web, extracts structured data with LLMs, deduplicates it and serves it through a REST API to a Flutter mobile app and a Next.js admin dashboard.

🔗 **Website:** [scholarhubsite.netlify.app](https://scholarhubsite.netlify.app/)

## Data pipeline

```
 Sources (5 specialised sites)  ┐
 + web discovery (Custom Search)┘──► link collection & normalisation
                                          │
                                          ▼
                              page fetch & text cleaning
                                          │
                                          ▼
                     LLM extraction → structured scholarship record
                     (multi-provider with fallback & rate-limit backoff)
                                          │
                                          ▼
                        deduplication → PostgreSQL (Prisma)
                                          │
                                          ▼
                    admin review → REST API → apps & notifications
```

- **Scheduled** with `node-cron`: scraping every night, plus deadline reminders and new-scholarship notifications
- **Controlled throughput**: bounded concurrency and a per-run cap to stay within free-tier API limits
- **Resilient**: per-source error isolation and automatic switch between LLM providers

## Features

- JWT authentication, email verification, password reset
- Scholarships: search, featured, personalised recommendations, saves, application tracking
- AI chat assistant for academic and administrative questions
- Push (FCM) and email notifications
- Admin: approve or reject scraped offers, user and role management, stats, support tickets

## Stack

Node.js · Express · PostgreSQL · Prisma · node-cron · Cheerio · Axios · LLM APIs (OpenAI-compatible) · Firebase Admin · Winston · Helmet · express-rate-limit

## Structure

```
src/
├── modules/      # auth, users, scholarships, scraper, chat, notifications, admin, support
├── jobs/         # scheduled tasks (scraping, reminders)
├── middlewares/  # auth, error handling
├── utils/        # LLM client, logger, mailer, push
└── config/
prisma/           # schema & seed
```

## Getting started

```bash
npm install
cp .env.example .env      # fill in database URL, JWT secret, API keys
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed       # optional
npm run dev
```

## Related repositories

- [ScholarHub_frontend](https://github.com/Solangeilinga/ScholarHub_frontend): Flutter mobile app
- [ScholarHub_admin](https://github.com/Solangeilinga/ScholarHub_admin): Next.js admin dashboard

---

**Solange Ilinga** · [LinkedIn](https://linkedin.com/in/solange-ilinga)

# SkillSwap — Community Skill Exchange Platform

A full MERN-stack (MongoDB, Express, React, Node.js) platform where community members teach what they know and learn what they want, paying with time-based credits or swapping skills directly.

## Quick start

Requirements: Node.js 18+ and MongoDB 6+ (local, Atlas, or `docker compose up mongo`).

```bash
npm install              # root helpers (concurrently, cross-env)
npm run install:all      # server + client dependencies
cp server/.env.example server/.env    # then edit secrets / MONGO_URI
npm run seed             # demo data
npm run dev              # API on :5000, React app on :5173
```

Open http://localhost:5173. Every demo account uses the password `password123`:

| Email | Role |
|---|---|
| admin@skillswap.dev | admin |
| mod@skillswap.dev | moderator |
| priya@skillswap.dev | member (mentor with history) |
| arjun@skillswap.dev, lucia@skillswap.dev, ken@skillswap.dev, sara@skillswap.dev | members |

Production: `npm start` builds the client and serves it from Express on port 5000. Or `docker compose up --build`.

## Testing

```bash
npm test                         # everything
npm --prefix server test         # 80 API integration tests (Jest + Supertest + socket.io-client)
npm --prefix client test         # 9 component tests (Vitest + Testing Library)
```

Server tests need a MongoDB server: they use `MONGO_URI_TEST` (default `mongodb://127.0.0.1:27017`, a fresh database per test file, dropped afterwards). Set `USE_MEMORY_SERVER=true` to use an in-memory MongoDB instead.

## Modules

| # | Module | Highlights |
|---|---|---|
| 1 | Authentication & access control | JWT access + rotating refresh tokens, logout revocation, email verification, forgot/reset/change password, roles (user/moderator/admin), suspensions that auto-expire, bans, rate limiting, input validation |
| 2 | Profile & skill portfolio | Bio, headline, languages, skills wanted, interests, weekly availability, avatar upload, portfolio CRUD, endorsements, public profile with reviews/certificates/badges |
| 3 | Skill marketplace & discovery | Listings with category, level, mode, rate, tags; search, filters, sorting, pagination; bookmarks; related skills; view counts; mutual swap matching; verification requests |
| 4 | Exchange requests & session booking | Credit or swap requests, accept/decline/cancel, credit escrow, session scheduling with hour caps and double-booking detection, reschedule/cancel, two-party confirmation releases credits, refunds, reviews & ratings |
| 5 | Real-time communication & collaboration | Socket.io chat, typing indicators, online presence, read receipts, file attachments, live notifications, live shared session notes, resource sharing |
| 6 | AI learning assistant & recommendations | Explainable skill and people recommendations, assistant chat, learning-path generator (saves as a goal). Uses Claude when `ANTHROPIC_API_KEY` is set, rule-based fallback otherwise |
| 7 | Credits, rewards & gamification | Wallet & full ledger, peer transfers, signup bonus, points, 8 levels, 9 auto-awarded badges, daily login streaks, leaderboards |
| 8 | Assessments, certifications & progress | MCQ assessment builder, moderator review, hidden answer keys, timed attempts, attempt limits, graded review, certificates with public verification codes, revocation, learning goals with milestones and hours |
| 9 | Community forum | Posts by category, tags, search, threaded replies, upvotes, accepted answers, pin/lock, announcements |
| 10 | Admin panel, verification & moderation | Member management, warn/suspend/ban, role changes, credit adjustments, report queue with actions, skill verification queue, assessment review, announcements, audit log |
| 11 | Reports, dashboards & analytics | Personal dashboard (credits flow, sessions, ratings, skill performance), platform analytics (growth, status breakdowns, top skills, categories), CSV exports |

## How credits work

1. A learner requests a skill priced at *N* credits/hour for *H* hours.
2. When the mentor accepts, `ceil(N × H)` credits move from the learner's balance into escrow.
3. Each session is complete only after **both** people confirm it happened; the session's share of credits then goes to the mentor.
4. Cancelling, or completing the exchange early, refunds whatever is still in escrow.
5. Skill swaps move no credits.

Balance checks use conditional atomic updates, so a member can never overspend even with concurrent requests.

## Project structure

```
server/
  src/
    app.js, server.js, seed.js
    config/       db connection, constants (categories, points, badges)
    models/       User, Skill, Exchange, Review, Chat, Notification, CreditTransaction,
                  Assessment/Attempt/Certificate/Goal, Forum, Moderation
    controllers/  one per module
    routes/       all REST routes with validation and role guards
    services/     credits (escrow), gamification, notifications, AI, audit
    socket/       Socket.io auth, chat, typing, presence, live notes
  tests/          10 suites, 80 tests
client/
  src/
    api/          axios client with automatic token refresh
    context/      auth, socket, toasts
    components/   layout, UI primitives, SVG charts
    pages/        auth, dashboard, marketplace, skills, profile, exchanges,
                  messages, assistant, rewards, learn, forum, admin
```

## API overview

All routes are under `/api`. Authenticated routes need `Authorization: Bearer <accessToken>`.

- Auth: `POST /auth/register|login|refresh|logout|forgot-password|reset-password/:token|change-password`, `GET /auth/me`, `GET /auth/verify-email/:token`
- Users: `PUT /users/me`, `POST|PUT|DELETE /users/me/portfolio[/:id]`, `GET|POST /users/me/bookmarks[/:skillId]`, `GET /users/:id`, `POST /users/:id/endorse`
- Skills: `GET /skills`, `GET /skills/:id`, `POST /skills`, `PUT|DELETE /skills/:id`, `POST /skills/:id/verification`, `GET /skills/mine|meta|categories|swap-matches`
- Exchanges: `GET|POST /exchanges`, `GET /exchanges/upcoming`, `POST /exchanges/:id/respond|cancel|complete|review|resources`, `PUT /exchanges/:id/notes`, `POST /exchanges/:id/sessions`, `PUT /exchanges/:id/sessions/:sid`, `POST /exchanges/:id/sessions/:sid/confirm`
- Chat: `GET|POST /conversations`, `GET|POST /conversations/:id/messages`, `POST /conversations/:id/read`, `POST /uploads`
- Notifications: `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `DELETE /notifications/:id`
- AI: `GET /ai/recommendations`, `POST /ai/chat`, `POST /ai/learning-path`
- Rewards: `GET /rewards/wallet|progress|leaderboard`, `POST /rewards/transfer`
- Learning: `GET|POST /assessments`, `GET|PUT /assessments/:id`, `POST /assessments/:id/attempts`, `POST /assessments/attempts/:id/submit`, `GET /assessments/attempts/mine`, `GET /certificates/mine`, `GET /certificates/verify/:code`, `GET|POST /goals`, `PUT|DELETE /goals/:id`
- Forum: `GET|POST /forum/posts`, `GET|PUT|DELETE /forum/posts/:id`, `POST /forum/posts/:id/upvote|comments|accept`, `POST /forum/comments/:id/upvote`, `DELETE /forum/comments/:id`, `GET /forum/tags`
- Moderation: `POST /reports`, `GET /announcements`, `/admin/users`, `/admin/users/:id/moderate|role|credits`, `/admin/verifications`, `/admin/reports`, `/admin/assessments`, `/admin/certificates/:id/revoke`, `/admin/audit`, `/admin/announcements`
- Analytics: `GET /analytics/me`, `GET /analytics/platform`, `GET /analytics/export/:type`

Socket.io events: `message:send`, `message:new`, `message:read`, `typing`, `presence`, `presence:list`, `notification`, `notes:edit`, `notes:update`.

## Production notes

- Set strong `JWT_SECRET` / `JWT_REFRESH_SECRET` and `CLIENT_URL`.
- In development, verification and reset tokens are returned in API responses so you can test without email. In production (`NODE_ENV=production`) they are not; wire `authController.register` and `forgotPassword` to an email provider.
- Uploads are stored on local disk in `server/uploads`; switch to S3 or similar for multi-instance deployments.

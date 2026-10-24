# OSCL Tracker

Stats site for **Old Siege: Challengers League (OSCL)**, a Rainbow Six Siege community league: matches, player ratings and MMR, teams, tournaments, transfers and moderation.

## Tech Stack

- Next.js App Router with TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- NextAuth with Discord OAuth
- Zod validation
- Netlify deployment support

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in:

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
BOT_API_KEY=
ANTHROPIC_API_KEY=
```

For Netlify, add the same variables in Site configuration -> Environment variables.

## Discord OAuth

Create or open your Discord application, add an OAuth2 redirect URL, and use your client ID/secret.

Local callback:

```text
http://localhost:3000/api/auth/callback/discord
```

Netlify callback:

```text
https://your-site.netlify.app/api/auth/callback/discord
```

Set `NEXTAUTH_URL` to the public site URL in production and `http://localhost:3000` locally.

## Database

Generate the Prisma client:

```bash
npm run db:generate
```

Create a migration:

```bash
npm run db:migrate
```

Deploy migrations on Netlify or production:

```bash
npm run db:deploy
```

Seed fake test data:

```bash
npm run db:seed
```

The seed includes fake players, fake teams, sample matches, sample map stats, and a sample tournament named `OSCL Invitational`.

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Admin Access

Admin routes are protected server-side. A Discord user becomes an admin if either:

- Their Discord ID is in the `AdminUser` table.
- Their `User.role` is set to `ADMIN`.

The easiest first admin path is to insert your Discord user ID into `AdminUser` with Prisma Studio:

```bash
npm run db:studio
```

Then sign in through Discord and open `/admin`.

## Admin Match Entry

`/admin/matches` takes a whole match in one form. Any map name is accepted.

Maps, one per line:

```text
Bank | 7 | 5 | A
```

Player stats, one per line (rating and rounds optional; `# MapName` or `# Map 2` starts a block for multi-map matches):

```text
Fancy | 12 | 6 | 3 | 5 | 1.42
Swerve2k | 9 | 8 | 2 | 4
```

Key moments (shown on the match page and the player profile):

```text
Fancy | Successful 1v4 clutch
```

Operator bans, one per line: `Thermite`, `A: Thermite` or `Kanine APEXIS bans Thermite`. Map names to icons in `/admin/settings`; icons live in `public/operator-icons/`.

Unknown player names are skipped and listed in the save notice. Players not picked for a side are placed automatically when their current team is Team A or Team B.

Calculated fields come from `PlayerMapStats`: K/D, KD +/-, HS% and maps played. An entered rating always wins; otherwise rating is derived from kills, deaths and assists per round. Older rows that carry KOST/entry data keep their original rating formula.

MMR starts at 1100: +125 per map win, +175 for a 1.90+ rating, +75 for 10+ kills, and -95 (loss) or -35 (win) when deaths exceed kills. Ranks: Copper 1100, Bronze 1600, Silver 2100, Gold 2600, Platinum 3200, Emerald 4100, Diamond 4500, Champions 5000.

## Site Settings

`/admin/settings` holds:

- **Discord webhook** for stat announcements (with a test button). Mentions are always disabled.
- **Player of the Week**, shown on the homepage and the player's profile.
- **Player avatars**. Discord links expire, so photos are copied to `public/player-avatars/` when the server can write files, or into the `PlayerAvatarImage` table (served from `/api/player-avatars/<id>`) on read-only hosts like Netlify. Players also refresh their own avatar on sign-in.
- **Operator icons**.

To store every avatar as a file in the repo, run this locally (needs `DATABASE_URL`; `DISCORD_BOT_TOKEN` lets it recover expired links), then deploy:

```bash
npm run avatars:cache
```

Add `-- --refresh` to re-fetch everyone from their Discord ID, or `-- --dry-run` to preview.

## AI Match Helper

Admins can open `/admin/ai-helper` to turn a plain-English match recap into a reviewed draft. The helper uses Anthropic server-side, so add `ANTHROPIC_API_KEY` in Netlify environment variables. Do not set `ANTHROPIC_MODEL` on Netlify unless you truly need to force a specific model; Netlify may treat model names as secrets during build scanning. When `ANTHROPIC_MODEL` is blank, the app checks Anthropic's model list for your API key and prefers Haiku first, then Sonnet, then Opus.

The AI helper does not save automatically. It drafts the match, maps, rosters, and stat rows first, then an approved admin reviews and clicks save. Player names must already exist in the Players admin page so the helper can map them to database player IDs.

## Discord Bot API

Future bot integrations can call admin endpoints with:

```http
Authorization: Bearer YOUR_BOT_API_KEY
```

Available routes:

- `POST /api/admin/players`
- `PATCH /api/admin/players/:id`
- `POST /api/admin/teams`
- `POST /api/admin/tournaments`
- `POST /api/admin/matches`
- `POST /api/admin/stats`

Authenticated approved admins can also use the same routes from a browser session.

## Logged-in Viewer Features

Public visitors can browse without signing in. Discord login adds an account page with Discord avatar/name and lets viewers save favorite players and tournaments to a personal watchlist.

## Deploying to Netlify

This project includes `netlify.toml` and `@netlify/plugin-nextjs`.

Use:

```bash
npm run build
```

Netlify should run the same build command. Make sure PostgreSQL is reachable from Netlify and all environment variables are configured.

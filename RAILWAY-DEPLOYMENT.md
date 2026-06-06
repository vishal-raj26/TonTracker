# Railway Deployment

## Services

Create three Railway services in one project:

1. **TonTrack API**
   - Source: this repo
   - Start command: `npm start`
   - Runs the web app and API.

2. **PostgreSQL**
   - Railway PostgreSQL plugin/service.
   - Exposes `DATABASE_URL`.

3. **Gift Snapshot Cron**
   - Source: this repo
   - Start command: `npm run worker:gift-snapshots:once`
   - Cron schedule: `0 * * * *`
   - Runs once every hour UTC and exits.

## Required Variables

Set these on the API service and cron service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
TONAPI_KEY=your_tonapi_key
PORT=5177
```

Railway injects `PORT` automatically for the API, so setting it manually is optional.

## Snapshot Storage

When `DATABASE_URL` exists, gift floor snapshots are stored in Postgres.

The tables are auto-created by the app, but the schema is also available here:

```text
data/gift-floor-snapshots.schema.sql
```

## Commands

API:

```bash
npm start
```

Hourly gift snapshot job:

```bash
npm run worker:gift-snapshots:once
```

Local long-running worker:

```bash
npm run worker:gift-snapshots
```

## Expected Result

- Users do not trigger gift history building.
- The cron job stores one fresh floor snapshot per gift collection every hour.
- Gift detail pages read already-stored graph history instantly.


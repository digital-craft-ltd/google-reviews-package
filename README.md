# Google Reviews for Astro

Reusable Google Reviews components, helpers, and API handler for Astro projects. Combine the exported widgets with the server handler to render ratings client-side while keeping Google Places API calls on the server with KV caching.

## Project Layout

```
/
├── docs/                       # Integration notes + QA checklist
├── src/
│   ├── components/google-reviews/  # Widget, badge, inline bootstrapper
│   ├── lib/                        # Client + server helpers
│   ├── server/                     # API handler export
│   ├── styles/                     # Shared CSS bundle
│   └── index.ts                    # Package entry point
└── package.json
```

## Scripts

| Command         | Description                           |
| --------------- | ------------------------------------- |
| `npm run build` | Produces the distributable in `dist/` |
| `npm test`      | Runs vitest suite for utilities       |
| `npm run typecheck` | Type-checks the package with TypeScript |

> `npm run build` copies components/styles into `dist/` alongside transpiled JS and type declarations so the published package is ready for direct consumption.

## Using the Package

```bash
npm install dc-google-reviews
```

Supports Astro 5, 6, and 7. Each major is built and rendered against in CI.

```astro
---
import {
  GoogleReviewInlineScript,
  GoogleReviewsWidget,
  GoogleReviewsBadge,
} from 'dc-google-reviews';
import 'dc-google-reviews/styles.css';
---

<GoogleReviewInlineScript />

<GoogleReviewsWidget
  placeId="YOUR_GOOGLE_PLACE_ID"
  businessName="Your Business"
  fallbackRating={4.9}
  fallbackReviewCount={237}
/><!-- ... -->

<GoogleReviewsBadge
  placeId="YOUR_GOOGLE_PLACE_ID"
  businessName="Your Business"
  fallbackRating={4.9}
/>
```

- Multiple locations: render multiple `<GoogleReviewsWidget>` instances, each with its own `placeId` (often sourced from `import.meta.env` per site).
- Customise CTA copy via the `ctaText` prop (`{count}` and `{label}` tokens supported).
- Bundle the shared stylesheet once per project (see import above) to receive the default Google styling.

### API Route

Create `src/pages/api/google-reviews.ts` in your Astro site:

```ts
import { googleReviewsHandler } from 'dc-google-reviews';

export const prerender = false;
export const GET = googleReviewsHandler;
```

### Environment & Infra Checklist

- Create a **server-side** Google Places API key with the Places API (New) enabled. Lock it down to your hosting IP/compute provider with Google Cloud restrictions.
- Set `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_DEFAULT_PLACE_ID`, `GOOGLE_REVIEWS_CACHE_TTL`, and `CRON_SECRET` in `.env` (and mirror them in your hosting platform, e.g. Vercel). Never embed the API key in client bundles.
- Attach [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted) so cached payloads persist across deployments. On Vercel, the Upstash marketplace integration populates the `KV_REST_API_*` variables for you.
- Schedule a Vercel cron hitting `https://<deploy-domain>/api/google-reviews?placeId=<ID>&force=true` with `Authorization: Bearer <CRON_SECRET>` for daily refreshes.
- Provide `fallbackRating`/`fallbackReviewCount` values during builds to avoid UI flicker on first paint.

Detailed architecture, prop docs, and QA steps live in [`docs/google-reviews.md`](docs/google-reviews.md). CI and release expectations live in [`docs/ci-cd.md`](docs/ci-cd.md).

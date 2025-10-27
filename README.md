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

> Add linting, tests, or examples as your packaging workflow evolves.

## Using the Package

```bash
npm install @your-scope/google-reviews
```

```astro
---
import {
  GoogleReviewInlineScript,
  GoogleReviewsWidget,
  GoogleReviewsBadge,
} from '@your-scope/google-reviews';
---

<GoogleReviewInlineScript />

<GoogleReviewsWidget
  placeId="YOUR_GOOGLE_PLACE_ID"
  businessName="Your Business"
  fallbackRating={4.9}
  fallbackReviewCount={237}
/>

<GoogleReviewsBadge
  placeId="YOUR_GOOGLE_PLACE_ID"
  businessName="Your Business"
  fallbackRating={4.9}
/>
```

- Multiple locations: render multiple `<GoogleReviewsWidget>` instances, each with its own `placeId` (often sourced from `import.meta.env` per site).
- Customise CTA copy via the `ctaText` prop (`{count}` and `{label}` tokens supported).

### API Route

Create `src/pages/api/google-reviews.ts` in your Astro site:

```ts
import { googleReviewsHandler } from '@your-scope/google-reviews';

export const prerender = false;
export const GET = googleReviewsHandler;
```

### Environment & Infra Checklist

- Set `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_DEFAULT_PLACE_ID`, `GOOGLE_PLACES_DEFAULT_NAME`, `GOOGLE_REVIEWS_CACHE_TTL`, and `CRON_SECRET` in `.env` (and mirror them in your hosting platform, e.g. Vercel).
- Attach [Vercel KV](https://vercel.com/docs/storage/vercel-kv/quickstart) so cached payloads persist across deployments.
- Schedule a Vercel cron hitting `https://<deploy-domain>/api/google-reviews?placeId=<ID>&force=true` with `Authorization: Bearer <CRON_SECRET>` for daily refreshes.
- Provide `fallbackRating`/`fallbackReviewCount` values during builds to avoid UI flicker on first paint.

Detailed architecture, prop docs, and QA steps live in [`docs/google-reviews.md`](docs/google-reviews.md).

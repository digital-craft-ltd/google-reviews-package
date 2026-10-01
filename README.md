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

Supports Astro 5, 6, and 7 - each major is built and rendered against in CI. Note that Astro itself requires Node >=22.12.0 from 6.1.0 onward, so Astro 6 and 7 consumers need Node 22.12 or newer.

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
- Components use Tailwind utility classes for layout and typography. The package CSS covers shared review-specific styling; projects without Tailwind should provide equivalent layout and typography styles.

### API Route

Create `src/pages/api/google-reviews.ts` in your Astro site:

```ts
import { googleReviewsHandler } from 'dc-google-reviews';

export const prerender = false;
export const GET = googleReviewsHandler;
```

This is an on-demand server route and requires an [Astro server adapter](https://docs.astro.build/en/guides/on-demand-rendering/) appropriate to your deployment platform.

### Environment & Infra Checklist

- Set the required server-side `GOOGLE_PLACES_API_KEY`; never embed it in client bundles. Supply a place ID with each component's `placeId` prop or use the optional `GOOGLE_PLACES_DEFAULT_PLACE_ID` environment variable.
- Cache TTL, Redis credentials, and `CRON_SECRET` are optional. Normal widget requests refresh stale cache automatically, so scheduled refresh is only needed if you want proactive updates. See the [technical documentation](https://github.com/digital-craft-ltd/google-reviews-package/blob/main/docs/google-reviews.md) for cache behavior.
- Provide `fallbackRating`/`fallbackReviewCount` values to avoid UI flicker while live data loads.

For optional scheduled refresh, send one authenticated request per place ID:

```http
GET /api/google-reviews?placeId=<PLACE_ID>&force=true
Authorization: Bearer <CRON_SECRET>
```

Detailed architecture, prop docs, and QA steps live in the [technical documentation](https://github.com/digital-craft-ltd/google-reviews-package/blob/main/docs/google-reviews.md).

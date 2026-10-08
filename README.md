# Google Reviews for Astro

`dc-google-reviews` provides an Astro badge, a larger review widget, a browser lifecycle client, and a server handler for Google Places ratings. API credentials stay on the server. The components can show an immediate fallback and then refresh themselves from an Astro endpoint.

## Requirements

- Astro 5, 6, or 7.
- A Node version supported by your Astro release. Astro 6.1 and Astro 7 require Node 22.12 or newer.
- An Astro server adapter that can serve an on-demand API route in production.
- A Google Places API (New) key for live data.

The page containing a badge or widget may still be prerendered. Its `/api/google-reviews` route must run on demand.

## Install

```bash
npm install dc-google-reviews
```

## Add the shared client once

Import the stylesheet and render exactly one `GoogleReviewInlineScript` in the shared layout used by pages with review components:

```astro
---
// src/layouts/BaseLayout.astro
import { GoogleReviewInlineScript } from 'dc-google-reviews';
import 'dc-google-reviews/styles.css';
---

<html lang="en">
  <head>
    <slot name="head" />
  </head>
  <body>
    <slot />
    <GoogleReviewInlineScript />
  </body>
</html>
```

The package stylesheet supplies the review-specific baseline: star shapes and fill, link colours, the refresh transition, and root font and colour defaults. The component markup uses Tailwind utilities for flex layout, spacing, borders, backgrounds, shadows, and typography. Tailwind ignores package files under `node_modules` unless the package is registered as a source.

### Tailwind CSS v4

Register the published components relative to the consuming stylesheet. For the common `src/styles/global.css` location:

```css
/* src/styles/global.css */
@import "tailwindcss";
@import "dc-google-reviews/styles.css";
@source "../../node_modules/dc-google-reviews/dist/components";
```

Import that stylesheet from the layout instead of importing `dc-google-reviews/styles.css` there a second time:

```astro
---
import '../styles/global.css';
---
```

Adjust the `@source` path if the consuming stylesheet lives elsewhere; Tailwind v4 resolves it relative to that stylesheet.

### Tailwind CSS v3

Add the published Astro components to the `content` array in `tailwind.config.mjs`:

```js
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './node_modules/dc-google-reviews/dist/components/**/*.astro',
  ],
};
```

Keep the `dc-google-reviews/styles.css` import shown in the layout. Projects without Tailwind must provide equivalent layout and typography rules for the utility classes while still importing the package stylesheet for the review-specific baseline.

## Render a badge or widget

Pass `placeId` explicitly when possible. Fallback values are optional, but they give visitors useful content before the endpoint responds or when it is unavailable.

```astro
---
import { GoogleReviewsBadge, GoogleReviewsWidget } from 'dc-google-reviews';
---

<GoogleReviewsBadge
  placeId="YOUR_GOOGLE_PLACE_ID"
  businessName="Example Storage"
  fallbackRating={4.9}
  fallbackReviewCount={237}
  ctaText="Read our {count} {label}"
/>

<GoogleReviewsWidget
  placeId="YOUR_GOOGLE_PLACE_ID"
  businessName="Example Storage"
  fallbackRating={4.9}
  fallbackReviewCount={237}
  heading="Customer rating"
  subheading="Based on Google Reviews"
  ctaText="Read our {count} {label}"
  endpoint="/api/google-reviews"
/>
```

Both components support these props:

| Prop | Default | Purpose |
| --- | --- | --- |
| `placeId` | `GOOGLE_PLACES_DEFAULT_PLACE_ID` | Google Place ID. The component throws during rendering if neither value exists. |
| `businessName` | empty | Optional fallback name sent to the endpoint. Google's returned display name takes precedence. |
| `languageCode` | `en` | Places response language. |
| `reviewUrl` | derived from `placeId` | Initial CTA destination before a live response supplies its review URL. |
| `fallbackRating` | none | Initial rating while live data loads. |
| `fallbackReviewCount` | none | Initial review count. Used when a fallback rating is present. |
| `ctaText` | component default | CTA template. `{count}` and `{label}` are replaced after data loads. |
| `endpoint` | `/api/google-reviews` | On-demand endpoint used by the browser client. |
| `class` | empty | Additional root classes. |

`GoogleReviewsWidget` also accepts `heading` and `subheading`.

### Multiple badges or locations

Render any number of components while keeping a single `GoogleReviewInlineScript` in the layout:

```astro
<GoogleReviewsBadge placeId="PLACE_ID_LONDON" fallbackRating={4.8} fallbackReviewCount={120} />
<GoogleReviewsBadge placeId="PLACE_ID_LONDON" fallbackRating={4.8} fallbackReviewCount={120} />
<GoogleReviewsBadge placeId="PLACE_ID_BRISTOL" fallbackRating={4.7} fallbackReviewCount={86} />
```

The two London badges share one concurrent browser request. Bristol uses a separate request because it has a different canonical URL. Endpoint, place ID, language, business name, and existing endpoint query parameters all contribute to that URL.

## Add the server endpoint

Create this file in the consuming Astro site:

```ts
// src/pages/api/google-reviews.ts
import { googleReviewsHandler } from 'dc-google-reviews';

export const prerender = false;
export const GET = googleReviewsHandler;
```

Configure an Astro server adapter for the deployment target. A fully static deployment without an on-demand runtime cannot serve this route.

The normal request shape is:

```http
GET /api/google-reviews?placeId=YOUR_GOOGLE_PLACE_ID
```

The client adds `languageCode` for non-English components. The handler returns `placeId`, `rating`, `reviewCount`, `reviewsUrl`, `languageCode`, `updatedAt`, `source`, optional `businessName`, and cache metadata. A custom endpoint must return the same public fields and valid HTTP or HTTPS `reviewsUrl` values for the package client to apply it.

## Environment variables

Never prefix `GOOGLE_PLACES_API_KEY` with `PUBLIC_` or expose it through client code.

### Required for live data

| Variable | Purpose |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Server-only Google Places API (New) key. |

A place ID is also required. Prefer the component's `placeId` prop; use the optional default below only for a single-location site.

### Optional package settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_PLACES_DEFAULT_PLACE_ID` | none | Used when a component omits `placeId`. |
| `GOOGLE_REVIEWS_CACHE_TTL` | `86400` | Freshness lifetime in seconds for server-side cached data. |
| `CRON_SECRET` | none | Bearer token that enables authenticated `force=true` refreshes. |

### Optional persistent cache credentials

No external cache is required. If all three variables in one supported group are present, the server helper uses the Upstash Redis REST client so cached data can survive process restarts and be shared across instances.

| Preferred names | Alternate Upstash names |
| --- | --- |
| `KV_REST_API_URL` | `UPSTASH_REDIS_REST_URL` |
| `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |
| `KV_REST_API_READ_ONLY_TOKEN` | `UPSTASH_REDIS_REST_READ_ONLY_TOKEN` |

The `KV_REST_API_*` group takes precedence when both groups are configured. These variables are provider-specific and optional.

## Browser lifecycle

Each component exposes `data-google-reviews-state` on its root:

| State | Meaning |
| --- | --- |
| `fallback` | Valid server-rendered fallback values or a stale server fallback are visible. |
| `unavailable` | No fallback rating is available yet. |
| `loading` | The browser is waiting for the endpoint. Existing visible content remains in place. |
| `ready` | A validated live or cached response was applied. |
| `error` | The request failed, timed out, or returned invalid data. Existing fallback or neutral content remains in place. |

The client applies rating text, star fill, CTA text, link destination, data attributes, lifecycle state, and ARIA attributes together. A successful response can therefore move a neutral badge to `ready` without consumer JavaScript.

Concurrent requests with the same canonical URL share one promise. Each request has a five-second timeout. Completed and failed requests leave the shared registry, so a later visibility refresh can try again. Ratings outside 0–5, negative or fractional review counts, invalid timestamps, incomplete payloads, and non-HTTP review URLs are rejected before the DOM changes.

After a successful fallback or endpoint update, the client emits `google-reviews:update` on `window`. Its `detail` contains `placeId`, `businessName`, `state`, and `data`.

## Caching and refreshes

The package has three separate caching boundaries:

1. **Process-local data cache.** Always available and requires no setup. It is lost when the server process restarts and is not shared between instances.
2. **Optional persistent data cache.** Enabled only when one complete credential group from the table above is present.
3. **HTTP or CDN response caching.** The supplied handler returns `Cache-Control: no-store`. A consuming site may wrap the handler and set headers that fit its host and freshness policy.

For example, a site that intentionally uses shared HTTP caching can own that policy in its route:

```ts
import type { APIRoute } from 'astro';
import { googleReviewsHandler } from 'dc-google-reviews';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const response = await googleReviewsHandler(context);
  if (response.ok) {
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  }
  return response;
};
```

Ordinary component requests refresh stale server data automatically. A scheduler is optional. If a site needs proactive refreshes, configure any HTTP scheduler to send one authenticated request per place ID:

```http
GET https://example.com/api/google-reviews?placeId=YOUR_GOOGLE_PLACE_ID&force=true
Authorization: Bearer YOUR_CRON_SECRET
```

Set `CRON_SECRET` to the bearer token. Without it, forced refresh requests return 401 while ordinary requests continue to work.

## Customization and accessibility

- Use the `class` prop for root layout changes and target `.google-review-badge`, `.google-review-widget`, or `[data-google-reviews-state]` for state-specific presentation.
- Use `ctaText`, `reviewUrl`, and `endpoint` for supported content and routing changes.
- The rating's live label, star group label, and `aria-hidden` state update with the visible rating. Individual decorative stars remain hidden from assistive technology.
- Failed refreshes do not erase a useful server-rendered rating or replace it with partial response data.
- Advanced integrations can import `initGoogleReviews` and its exported types from the package root, but the shared inline component is sufficient for normal Astro use.

## Troubleshooting

### `GoogleReviewsBadge requires a placeId` or the equivalent widget error

Pass `placeId` to every component, or set `GOOGLE_PLACES_DEFAULT_PLACE_ID` in the server/build environment.

### The endpoint reports that `GOOGLE_PLACES_API_KEY` is not set

Set the server-only key in the runtime environment used by the Astro adapter. Restart the development server after changing local environment files. Do not expose the value through a public environment variable.

### The endpoint is 404, returns HTML, or works only during development

Confirm that `src/pages/api/google-reviews.ts` exists, exports `prerender = false`, and that the production build uses a server adapter capable of on-demand routes. Confirm any custom `endpoint` prop matches the deployed path.

### The component remains in `fallback` or changes to `error`

Inspect the endpoint response. Stale cache may be served as `source: "fallback"` when Google cannot be reached. An invalid response, request timeout, or network failure preserves the existing UI. Check the API key, Places API access, place ID, response fields, and server logs. Persistent cache and scheduled refresh are optional and are not required to recover on the next successful request.

## Package development

```bash
npm test
npm run typecheck
npm run build
npm run verify:dist
```

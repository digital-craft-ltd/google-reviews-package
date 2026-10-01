# Google Reviews Module Technical Documentation

## Overview

This module provides a reusable client/server stack for rendering Google Places rating widgets inside any Astro project. It consists of:

- A server handler (`googleReviewsHandler`) you wire into `/api/google-reviews` within your Astro project.
- A shared server helper (`src/lib/server/googleReviews.ts`) and data client (`src/lib/client/googleReviewsClient.ts`).
- Two prebuilt UI components:
  - `GoogleReviewsWidget.astro`: stacked card with score, logo, stars, and CTA.
  - `GoogleReviewsBadge.astro`: compact inline badge with logo, score, and stars.
- A global bootstrap script (`<GoogleReviewInlineScript />`) you add once (typically in your layout) that initialises every widget detected on the page.

The components expose their configuration via a `data-google-reviews-options` attribute; the layout script reads those options and calls `initGoogleReviews` from the shared client helper, which handles fetching the server endpoint, rendering fallback values, and dispatching `google-reviews:update` events.

## Installation

```bash
npm install dc-google-reviews
```

```astro
---
import {
  GoogleReviewInlineScript,
  GoogleReviewsWidget,
  GoogleReviewsBadge,
} from 'dc-google-reviews';
import 'dc-google-reviews/styles.css';
---
```

The `/api/google-reviews` route is rendered on demand and requires an [Astro server adapter](https://docs.astro.build/en/guides/on-demand-rendering/) appropriate to your deployment platform. The components use Tailwind utility classes for layout and typography; the package CSS covers shared review-specific styling, so projects without Tailwind must provide equivalent layout and typography styles.

## Data Flow

1. Component renders with fallback rating/count (optional) and embeds options in a data attribute.
2. `<GoogleReviewInlineScript />` (added to the layout) loads once, scans for `[data-google-reviews-options]`, and initialises each instance with `initGoogleReviews`.
3. Client helper fetches `/api/google-reviews` with the provided place ID when the page becomes interactive (and again if the tab becomes visible while showing fallback data).
   - For the default English feed, the client omits `languageCode=en` so host apps do not split edge caches across semantically equivalent URL variants.
4. Your `/api/google-reviews` route (powered by `googleReviewsHandler`) calls `getGoogleReviewSnapshot`:
   - Returns fresh cached data for 24h by default; after that, a normal request attempts to refresh it.
   - If the refresh fails, returns the cached value as stale fallback while the cache entry remains available, for up to another 24h by default.
   - Uses in-memory cache local to the server process unless Redis is configured; Redis cache persists across instances and deployments.
   - Returns JSON payload with rating, review count, source, and metadata.
5. Client helper updates DOM fields and dispatches a `google-reviews:update` event (contains `placeId`, `businessName`, and `data`).

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | ✅ | Server-side API key with access to the Places API (New). |
| `GOOGLE_PLACES_DEFAULT_PLACE_ID` | ⛔️ | Optional fallback place ID used when components omit `placeId`. |
| `GOOGLE_REVIEWS_CACHE_TTL` | ⛔️ | Optional cache freshness lifetime in seconds (default 86400 / 24h). Entries are retained for twice this duration for stale fallback. |
| `CRON_SECRET` | ⛔️ | Optional secret required for forced refresh requests. Passed via `Authorization: Bearer <CRON_SECRET>`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` | ⛔️ | Optional Redis credentials for persistent caching. All three must be set to enable Redis. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_READ_ONLY_TOKEN` | ⛔️ | Optional fallback names, read only when the `KV_REST_API_*` equivalents are unset. |

`GOOGLE_PLACES_API_KEY` is required. Set environment values in the local environment and hosting platform as appropriate. The `.env.example` file lists the supported variables.

> ⚠️ Keep the Google Places API key server-side. Never expose it in a client bundle or commit it to source control.

## Server Endpoint

The `/api/google-reviews` route accepts query params:

| Parameter | Required | Description |
| --- | --- | --- |
| `placeId` | ✅ | The Google Place ID to fetch. Requests missing this param return HTTP 400. |
| `languageCode` | ⛔️ | ISO language code (default `en`). |
| `businessName` | ⛔️ | Optional name used by UI components. |
| `force` | ⛔️ | When `true`, forces a refresh (requires `Authorization: Bearer <CRON_SECRET>` header). |

Response fields:

```
{
  "placeId": "<string>",
  "rating": 4.9,
  "reviewCount": 237,
  "businessName": "Your Business",
  "reviewsUrl": "https://...",
  "languageCode": "en",
  "updatedAt": "2025-02-17T10:04:21.000Z",
  "source": "fresh" | "cache" | "fallback",
  "meta": {
    "cacheTtlSeconds": 86400,
    "fetchError": null
  }
}
```

## Shared Client Helper

`src/lib/client/googleReviewsClient.ts` exports `initGoogleReviews(options: GoogleReviewsClientOptions)` where:

```
interface GoogleReviewsClientOptions {
  id: string;                   // DOM id of the root widget element
  selectors?: Partial<Selector>; // Override CSS selectors for DOM targets
  strings?: Partial<Strings>;    // Override aria-label text templates
  ctaTemplate?: string;         // Optional CTA template ("Read our {count} reviews")
  disableVisibilityRefresh?: boolean; // Skip refetching when tab becomes visible
}
```

Key features:
- Reads fallback JSON from `template[data-fallback]` when provided.
- Formats rating and counts, updates aria attributes, and gracefully handles missing data.
- Emits `window.dispatchEvent(new CustomEvent('google-reviews:update', { detail }))` for schema updates or QA instrumentation.

### Formatting Utilities

Common presentation helpers (rating display, fallback payloads, Google review URL builder) live in `src/lib/utils/reviewFormatting.ts`. Both review components import these utilities to stay DRY and ensure consistent behaviour.

## Components

### `GoogleReviewsWidget.astro`
A stacked card with score, Google mark, 5 stars, optional heading/subheading, and CTA.

Props:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `placeId` | `string` | `import.meta.env.GOOGLE_PLACES_DEFAULT_PLACE_ID` | Google place ID. Pass explicitly for multi-location sites; otherwise the component falls back to the env var. Missing both prop and env var results in a build-time error. |
| `businessName` | `string` | `''` | Optional display name. When omitted, the Places API display name from the server response is used for events/analytics. |
| `languageCode` | `string` | `en` | Language passed to the API. |
| `reviewUrl` | `string` | Google reviews URL derived from place ID | CTA link target. |
| `class` | `string` | `''` | Extra class names for wrapper. |
| `fallbackRating` | `number` | undefined | Optional rating displayed until API resolves. |
| `fallbackReviewCount` | `number` | undefined | Optional count displayed until API resolves. |
| `heading` | `string` | undefined | Optional upper label. |
| `subheading` | `string` | undefined | Optional lower label. |
| `ctaText` | `string` | `'Read our {count} reviews'` | CTA template. Supports `{count}` and `{label}` tokens. |
| `endpoint` | `string` | `/api/google-reviews` | Override endpoint path. |

> **Note:** If you operate multiple locations, provide unique `placeId` props per widget (e.g. `<GoogleReviewsWidget placeId={import.meta.env.GOOGLE_PLACE_ID_EAST} />`). For single-location sites, you can rely on `GOOGLE_PLACES_DEFAULT_PLACE_ID` without passing the prop explicitly.
> When the API responds, the client updates `data-business-name` with the Google-supplied display name. Pass the `businessName` prop only if you need to override that value.
### `GoogleReviewsBadge.astro`
A one-line badge showing Google logo, score, and stars; ideal for inline placements.

Props mirror the widget but omit layout-specific fields:

| Prop | Type | Default |
| --- | --- | --- |
| `placeId`, `businessName`, `languageCode`, `reviewUrl`, `class`, `fallbackRating`, `fallbackReviewCount`, `ctaText`, `endpoint` | Same semantics as the widget. If you omit `businessName`, the Places API display name is used; provide `ctaText` to customise the inline link copy. |

### Usage Example

```astro
<GoogleReviewsWidget
  placeId="ChIJOfzNQB0fdkgRz0Dae133mXc"
  businessName="Redpath Storage"
  fallbackRating={4.9}
  fallbackReviewCount={237}
  heading="Customer rating"
  subheading="Based on Google Reviews"
/>

<GoogleReviewsBadge fallbackRating={4.9} />
```

### Customisation

- Both components expose `class` to customize container styles. Their markup uses Tailwind utility classes for layout and typography; the package CSS covers shared review-specific styling. Projects without Tailwind should provide equivalent styles.
- Inject custom strings by overriding `ctaText` (widget) or by providing `strings` via `data-google-reviews-options` if building your own element.

## Optional Scheduled Refresh

Normal widget requests refresh stale cache automatically, so a scheduler is optional. To proactively refresh data, send one authenticated request per place ID:

```http
GET /api/google-reviews?placeId=<PLACE_ID>&force=true
Authorization: Bearer <CRON_SECRET>
```

## Cache and Failure Behavior

The current rendered value stays unchanged when a client request fails, but that value is not persisted by the browser across reloads. On reload, the widget uses server cache when available or its component fallback values. By default, cached data is fresh for 24h and is retained for up to another 24h for stale fallback if the upstream API fails. In-memory cache is local to a server process; configured Redis persists across instances and deployments.

## QA Checklist

- Confirm `.env` contains a valid Google API key and place ID; Redis credentials are needed only when persistent caching is enabled.
- Run `npm run dev` and verify both components render fallback values instantly, then hydrate with live data (check Network tab for `/api/google-reviews`).
- Inspect the widget DOM to ensure `aria-label` text updates when rating changes (`google-reviews:update` event visible in Console when logging).
- Trigger the forced refresh endpoint manually:

  ```bash
  curl "http://localhost:4321/api/google-reviews?placeId=<ID>&force=true" \
    -H "Authorization: Bearer <CRON_SECRET>"
  ```
- Run `npm run build` for production parity.
- Confirm no 404s for `/lib/client/…` scripts and no inline script errors in the console.

import { kv } from '@vercel/kv';

const env = import.meta.env;

if (!process.env.GOOGLE_PLACES_API_KEY && env.GOOGLE_PLACES_API_KEY) {
	process.env.GOOGLE_PLACES_API_KEY = env.GOOGLE_PLACES_API_KEY;
}
if (!process.env.GOOGLE_PLACES_DEFAULT_PLACE_ID && env.GOOGLE_PLACES_DEFAULT_PLACE_ID) {
	process.env.GOOGLE_PLACES_DEFAULT_PLACE_ID = env.GOOGLE_PLACES_DEFAULT_PLACE_ID;
}
if (!process.env.KV_REST_API_URL && env.KV_REST_API_URL) {
	process.env.KV_REST_API_URL = env.KV_REST_API_URL;
}
if (!process.env.KV_REST_API_TOKEN && env.KV_REST_API_TOKEN) {
	process.env.KV_REST_API_TOKEN = env.KV_REST_API_TOKEN;
}
if (!process.env.KV_REST_API_READ_ONLY_TOKEN && env.KV_REST_API_READ_ONLY_TOKEN) {
	process.env.KV_REST_API_READ_ONLY_TOKEN = env.KV_REST_API_READ_ONLY_TOKEN;
}
const CACHE_PREFIX = 'google-reviews:';
const DEFAULT_TTL_SECONDS =
	Number.parseInt(env.GOOGLE_REVIEWS_CACHE_TTL ?? process.env.GOOGLE_REVIEWS_CACHE_TTL ?? '', 10) ||
	60 * 60 * 24; // 24h
const CACHE_EXPIRY_BUFFER = DEFAULT_TTL_SECONDS * 2;
const GOOGLE_API_BASE = 'https://places.googleapis.com/v1';
const FIELD_MASK = 'rating,userRatingCount,displayName,googleMapsUri';
const isKvConfigured = Boolean(
	(env.KV_REST_API_URL || process.env.KV_REST_API_URL) &&
		(env.KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN) &&
		(env.KV_REST_API_READ_ONLY_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN),
);

type CachePayload = {
	placeId: string;
	businessName?: string;
	languageCode: string;
	rating: number;
	reviewCount: number;
	reviewsUrl: string;
	updatedAt: string;
};

export type GoogleReviewSnapshot = CachePayload & {
	source: 'fresh' | 'cache' | 'fallback';
};

declare global {
	// eslint-disable-next-line no-var
	var __GOOGLE_REVIEWS_CACHE__: Map<string, CachePayload> | undefined;
}

const inMemoryCache =
	globalThis.__GOOGLE_REVIEWS_CACHE__ ?? (globalThis.__GOOGLE_REVIEWS_CACHE__ = new Map<string, CachePayload>());

const getCacheKey = (placeId: string) => `${CACHE_PREFIX}${placeId}`;

async function readCache(placeId: string): Promise<CachePayload | null> {
	const key = getCacheKey(placeId);

	if (isKvConfigured) {
		const value = await kv.get<CachePayload>(key);
		return value ?? null;
	}

	return inMemoryCache.get(key) ?? null;
}

async function writeCache(placeId: string, payload: CachePayload): Promise<void> {
	const key = getCacheKey(placeId);

	if (isKvConfigured) {
		await kv.set(key, payload, { ex: CACHE_EXPIRY_BUFFER });
		return;
	}

	inMemoryCache.set(key, payload);
}

type FetchOptions = {
	placeId: string;
	languageCode: string;
	businessName?: string;
};

async function fetchFromGoogle({ placeId, languageCode, businessName }: FetchOptions): Promise<CachePayload> {
	const apiKey = env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;

	if (!apiKey) {
		throw new Error('GOOGLE_PLACES_API_KEY is not set');
	}

	if (!placeId) {
		throw new Error('A Google placeId is required');
	}

	const url = new URL(`${GOOGLE_API_BASE}/places/${placeId}`);
	url.searchParams.set('languageCode', languageCode);

	const response = await fetch(url, {
		headers: {
			'X-Goog-Api-Key': apiKey,
			'X-Goog-FieldMask': FIELD_MASK,
		},
	});

	const responseText = await response.text();
	if (!response.ok) {
		let errorDetail = response.statusText;

		try {
			const parsed = JSON.parse(responseText);
			errorDetail = parsed.error?.message ?? response.statusText;
		} catch {
			// Keep default message
		}

		throw new Error(`Google Places API error (${response.status}): ${errorDetail}`);
	}

	const data = JSON.parse(responseText);
	const rating = typeof data.rating === 'number' ? data.rating : 0;
	const reviewCount = typeof data.userRatingCount === 'number' ? data.userRatingCount : 0;
	const displayName = data.displayName?.text as string | undefined;
	const googleMapsUri = typeof data.googleMapsUri === 'string' ? data.googleMapsUri : undefined;
	const normalizedDisplayName = displayName?.trim().length ? displayName.trim() : undefined;
	const normalizedInputName = businessName?.trim().length ? businessName.trim() : undefined;
	const resolvedBusinessName = normalizedDisplayName ?? normalizedInputName;

	return {
		placeId,
		businessName: resolvedBusinessName,
		languageCode,
		rating,
		reviewCount,
		reviewsUrl: googleMapsUri ?? buildReviewsUrl(placeId),
		updatedAt: new Date().toISOString(),
	};
}

const buildReviewsUrl = (placeId: string) =>
	`https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`;

type SnapshotOptions = {
	languageCode?: string;
	businessName?: string;
	forceRefresh?: boolean;
};

export async function getGoogleReviewSnapshot(
	placeId: string,
	options: SnapshotOptions = {},
): Promise<{ data: GoogleReviewSnapshot; error?: string }> {
	const languageCode = options.languageCode ?? 'en';
	const cached = await readCache(placeId);
	const now = Date.now();
	const staleThreshold = DEFAULT_TTL_SECONDS * 1000;
	const isCachedFresh = cached ? now - new Date(cached.updatedAt).getTime() <= staleThreshold : false;

	if (!options.forceRefresh && cached && isCachedFresh) {
		return {
			data: {
				...cached,
				source: 'cache',
			},
		};
	}

	try {
		const fresh = await fetchFromGoogle({
			placeId,
			languageCode,
			businessName: options.businessName ?? cached?.businessName,
		});

		await writeCache(placeId, fresh);

		return {
			data: {
				...fresh,
				source: 'fresh',
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error talking to Google Places API';

		if (cached) {
			return {
				data: {
					...cached,
					source: 'fallback',
				},
				error: message,
			};
		}

		throw error instanceof Error ? error : new Error(message);
	}
}

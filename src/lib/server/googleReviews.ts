import { Redis } from '@upstash/redis';

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
if (!process.env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_URL) {
	process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
}
if (!process.env.UPSTASH_REDIS_REST_TOKEN && env.UPSTASH_REDIS_REST_TOKEN) {
	process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
}
if (!process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN && env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN) {
	process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN = env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN;
}
const CACHE_PREFIX = 'google-reviews:';
const DEFAULT_TTL_SECONDS =
	Number.parseInt(env.GOOGLE_REVIEWS_CACHE_TTL ?? process.env.GOOGLE_REVIEWS_CACHE_TTL ?? '', 10) ||
	60 * 60 * 24; // 24h
const CACHE_EXPIRY_BUFFER = DEFAULT_TTL_SECONDS * 2;
const GOOGLE_API_BASE = 'https://places.googleapis.com/v1';
const FIELD_MASK = 'rating,userRatingCount,displayName';
// KV_REST_API_* is the contract this package shipped with, so it stays authoritative.
// UPSTASH_REDIS_REST_* is accepted as a fallback for consumers provisioning Upstash directly.
// Property access on `env` is kept static so Vite/Astro can substitute values at build time.
const kvUrl =
	env.KV_REST_API_URL ||
	process.env.KV_REST_API_URL ||
	env.UPSTASH_REDIS_REST_URL ||
	process.env.UPSTASH_REDIS_REST_URL;
const kvToken =
	env.KV_REST_API_TOKEN ||
	process.env.KV_REST_API_TOKEN ||
	env.UPSTASH_REDIS_REST_TOKEN ||
	process.env.UPSTASH_REDIS_REST_TOKEN;
const kvReadOnlyToken =
	env.KV_REST_API_READ_ONLY_TOKEN ||
	process.env.KV_REST_API_READ_ONLY_TOKEN ||
	env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN ||
	process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN;

const isKvConfigured = Boolean(kvUrl && kvToken && kvReadOnlyToken);

// Constructed on first use only: the module must import cleanly with no credentials present.
let redisClient: Redis | undefined;

const getRedisClient = (): Redis => {
	if (!redisClient) {
		redisClient = new Redis({ url: kvUrl as string, token: kvToken as string });
	}

	return redisClient;
};

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

type InMemoryCacheEntry = {
	payload: CachePayload;
	expiresAt: number;
};

declare global {
	// eslint-disable-next-line no-var
	var __GOOGLE_REVIEWS_CACHE__: Map<string, InMemoryCacheEntry> | undefined;
}

const inMemoryCache =
	globalThis.__GOOGLE_REVIEWS_CACHE__ ??
	(globalThis.__GOOGLE_REVIEWS_CACHE__ = new Map<string, InMemoryCacheEntry>());

const normalizeLanguageCode = (languageCode?: string) => {
	const normalized = languageCode?.trim().toLowerCase();
	return normalized?.length ? normalized : 'en';
};
const getCacheKey = (placeId: string, languageCode?: string) =>
	`${CACHE_PREFIX}${placeId}:${normalizeLanguageCode(languageCode)}`;

async function readCache(placeId: string, languageCode?: string): Promise<CachePayload | null> {
	const key = getCacheKey(placeId, languageCode);

	if (isKvConfigured) {
		const value = await getRedisClient().get<CachePayload>(key);
		return value ?? null;
	}

	const entry = inMemoryCache.get(key);
	if (!entry) {
		return null;
	}

	if (entry.expiresAt <= Date.now()) {
		inMemoryCache.delete(key);
		return null;
	}

	return entry.payload;
}

async function writeCache(placeId: string, payload: CachePayload): Promise<void> {
	const key = getCacheKey(placeId, payload.languageCode);

	if (isKvConfigured) {
		await getRedisClient().set(key, payload, { ex: CACHE_EXPIRY_BUFFER });
		return;
	}

	inMemoryCache.set(key, {
		payload,
		expiresAt: Date.now() + CACHE_EXPIRY_BUFFER * 1000,
	});
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
			// Keep the HTTP status text when Google returns a non-JSON error body.
		}

		throw new Error(`Google Places API error (${response.status}): ${errorDetail}`);
	}

	const data = JSON.parse(responseText);
	const rating = typeof data.rating === 'number' ? data.rating : 0;
	const reviewCount = typeof data.userRatingCount === 'number' ? data.userRatingCount : 0;
	const displayName = data.displayName?.text as string | undefined;
	const normalizedDisplayName = displayName?.trim().length ? displayName.trim() : undefined;
	const normalizedInputName = businessName?.trim().length ? businessName.trim() : undefined;
	const resolvedBusinessName = normalizedDisplayName ?? normalizedInputName;

	return {
		placeId,
		businessName: resolvedBusinessName,
		languageCode,
		rating,
		reviewCount,
		reviewsUrl: buildReviewsUrl(placeId),
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
	const languageCode = normalizeLanguageCode(options.languageCode);
	const cached = await readCache(placeId, languageCode);
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => {
	const get = vi.fn();
	const set = vi.fn();
	const constructorCalls: Array<Record<string, unknown>> = [];

	class Redis {
		get = get;
		set = set;

		constructor(config: Record<string, unknown>) {
			constructorCalls.push(config);
		}
	}

	return { Redis, get, set, constructorCalls };
});

vi.mock('@upstash/redis', () => ({ Redis: redisMock.Redis }));

const KV_CREDENTIALS = {
	KV_REST_API_URL: 'https://kv.example.upstash.io',
	KV_REST_API_TOKEN: 'kv-token',
	KV_REST_API_READ_ONLY_TOKEN: 'kv-read-only-token',
} as const;

const UPSTASH_CREDENTIALS = {
	UPSTASH_REDIS_REST_URL: 'https://upstash.example.upstash.io',
	UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
	UPSTASH_REDIS_REST_READ_ONLY_TOKEN: 'upstash-read-only-token',
} as const;

const CREDENTIAL_KEYS = [...Object.keys(KV_CREDENTIALS), ...Object.keys(UPSTASH_CREDENTIALS)];

const makePlacesResponse = (payload: Record<string, unknown>, init: ResponseInit = {}) =>
	new Response(JSON.stringify(payload), {
		status: init.status ?? 200,
		statusText: init.statusText,
		headers: {
			'Content-Type': 'application/json',
			...(init.headers ?? {}),
		},
	});

const loadGoogleReviewsModule = async () => {
	vi.resetModules();
	return import('./googleReviews');
};

beforeEach(() => {
	globalThis.__GOOGLE_REVIEWS_CACHE__?.clear();
	process.env.GOOGLE_PLACES_API_KEY = 'test-api-key';
	delete process.env.GOOGLE_REVIEWS_CACHE_TTL;
	for (const key of CREDENTIAL_KEYS) {
		delete process.env[key];
	}
	redisMock.get.mockReset();
	redisMock.set.mockReset();
	redisMock.constructorCalls.length = 0;
	vi.unstubAllGlobals();
});

afterEach(() => {
	delete process.env.GOOGLE_REVIEWS_CACHE_TTL;
	for (const key of CREDENTIAL_KEYS) {
		delete process.env[key];
	}
	vi.unstubAllGlobals();
});

describe('googleReviews server cache', () => {
	it('shares the default english cache entry with explicit en requests', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			makePlacesResponse({
				rating: 4.8,
				userRatingCount: 123,
				displayName: { text: 'English Bistro' },
				googleMapsUri: 'https://maps.example/en',
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();

		const freshSnapshot = await getGoogleReviewSnapshot('place-123');
		expect(freshSnapshot).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'fresh',
				businessName: 'English Bistro',
			},
		});

		const cachedSnapshot = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		expect(cachedSnapshot).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'cache',
				businessName: 'English Bistro',
			},
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('always returns the place-id reviews page url even when Google returns a maps uri', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			makePlacesResponse({
				rating: 4.8,
				userRatingCount: 123,
				displayName: { text: 'English Bistro' },
				googleMapsUri: 'https://maps.example/en',
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		const snapshot = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });

		expect(snapshot).toMatchObject({
			data: {
				reviewsUrl: 'https://search.google.com/local/reviews?placeid=place-123',
				source: 'fresh',
			},
		});
	});

	it('keeps locale-specific cache entries isolated across languages', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				makePlacesResponse({
					rating: 4.8,
					userRatingCount: 123,
					displayName: { text: 'English Bistro' },
					googleMapsUri: 'https://maps.example/en',
				}),
			)
			.mockResolvedValueOnce(
				makePlacesResponse({
					rating: 4.8,
					userRatingCount: 123,
					displayName: { text: 'Bistrot Francais' },
					googleMapsUri: 'https://maps.example/fr',
				}),
			);
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();

		const englishFresh = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		const frenchFresh = await getGoogleReviewSnapshot('place-123', { languageCode: 'fr' });
		const englishCached = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		const frenchCached = await getGoogleReviewSnapshot('place-123', { languageCode: 'fr' });

		expect(englishFresh).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'fresh',
				businessName: 'English Bistro',
			},
		});
		expect(frenchFresh).toMatchObject({
			data: {
				languageCode: 'fr',
				source: 'fresh',
				businessName: 'Bistrot Francais',
			},
		});
		expect(englishCached).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'cache',
				businessName: 'English Bistro',
			},
		});
		expect(frenchCached).toMatchObject({
			data: {
				languageCode: 'fr',
				source: 'cache',
				businessName: 'Bistrot Francais',
			},
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not fall back to another locale cache after a failed locale refresh', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				makePlacesResponse({
					rating: 4.8,
					userRatingCount: 123,
					displayName: { text: 'English Bistro' },
					googleMapsUri: 'https://maps.example/en',
				}),
			)
			.mockResolvedValueOnce(
				makePlacesResponse(
					{
						error: {
							message: 'French snapshot unavailable',
						},
					},
					{
						status: 503,
						statusText: 'Service Unavailable',
					},
				),
			);
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();

		const englishFresh = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		expect(englishFresh).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'fresh',
			},
		});

		await expect(
			getGoogleReviewSnapshot('place-123', { languageCode: 'fr', forceRefresh: true }),
		).rejects.toThrow('Google Places API error (503): French snapshot unavailable');

		const englishCached = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		expect(englishCached).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'cache',
			},
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('evicts stale in-memory cache entries after the TTL buffer', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-02T03:04:05.000Z'));
		process.env.GOOGLE_REVIEWS_CACHE_TTL = '1';

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				makePlacesResponse({
					rating: 4.8,
					userRatingCount: 123,
					displayName: { text: 'English Bistro' },
					googleMapsUri: 'https://maps.example/en',
				}),
			)
			.mockResolvedValueOnce(
				makePlacesResponse(
					{
						error: {
							message: 'Fresh snapshot unavailable',
						},
					},
					{
						status: 503,
						statusText: 'Service Unavailable',
					},
				),
			)
			.mockResolvedValueOnce(
				makePlacesResponse(
					{
						error: {
							message: 'Fresh snapshot unavailable',
						},
					},
					{
						status: 503,
						statusText: 'Service Unavailable',
					},
				),
			);
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();

		const freshSnapshot = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		expect(freshSnapshot).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'fresh',
			},
		});

		await vi.advanceTimersByTimeAsync(1500);

		const fallbackSnapshot = await getGoogleReviewSnapshot('place-123', { languageCode: 'en' });
		expect(fallbackSnapshot).toMatchObject({
			data: {
				languageCode: 'en',
				source: 'fallback',
			},
			error: 'Google Places API error (503): Fresh snapshot unavailable',
		});

		await vi.advanceTimersByTimeAsync(1000);

		await expect(getGoogleReviewSnapshot('place-123', { languageCode: 'en' })).rejects.toThrow(
			'Google Places API error (503): Fresh snapshot unavailable',
		);
		expect(fetchMock).toHaveBeenCalledTimes(3);

		vi.useRealTimers();
	});
});

describe('googleReviews redis client wiring', () => {
	const placesResponse = () =>
		makePlacesResponse({
			rating: 4.8,
			userRatingCount: 123,
			displayName: { text: 'English Bistro' },
		});

	const setEnv = (values: Record<string, string>) => {
		for (const [key, value] of Object.entries(values)) {
			process.env[key] = value;
		}
	};

	it('never constructs a redis client when no credentials are present', async () => {
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => placesResponse()));

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		const snapshot = await getGoogleReviewSnapshot('place-123');

		expect(snapshot.data.source).toBe('fresh');
		expect(redisMock.constructorCalls).toHaveLength(0);
		expect(redisMock.get).not.toHaveBeenCalled();
		expect(redisMock.set).not.toHaveBeenCalled();
	});

	it('constructs the client from the KV_REST_API_* contract and defers construction to first use', async () => {
		setEnv(KV_CREDENTIALS);
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => placesResponse()));

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		expect(redisMock.constructorCalls).toHaveLength(0);

		await getGoogleReviewSnapshot('place-123');

		expect(redisMock.constructorCalls).toEqual([
			{ url: KV_CREDENTIALS.KV_REST_API_URL, token: KV_CREDENTIALS.KV_REST_API_TOKEN },
		]);
	});

	it('reuses a single client across calls', async () => {
		setEnv(KV_CREDENTIALS);
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => placesResponse()));

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		await getGoogleReviewSnapshot('place-123');
		await getGoogleReviewSnapshot('place-456');

		expect(redisMock.constructorCalls).toHaveLength(1);
	});

	it('falls back to the UPSTASH_REDIS_REST_* names when the KV names are unset', async () => {
		setEnv(UPSTASH_CREDENTIALS);
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => placesResponse()));

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		await getGoogleReviewSnapshot('place-123');

		expect(redisMock.constructorCalls).toEqual([
			{
				url: UPSTASH_CREDENTIALS.UPSTASH_REDIS_REST_URL,
				token: UPSTASH_CREDENTIALS.UPSTASH_REDIS_REST_TOKEN,
			},
		]);
	});

	it('prefers the KV_REST_API_* names when both sets are present', async () => {
		setEnv({ ...UPSTASH_CREDENTIALS, ...KV_CREDENTIALS });
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => placesResponse()));

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		await getGoogleReviewSnapshot('place-123');

		expect(redisMock.constructorCalls).toEqual([
			{ url: KV_CREDENTIALS.KV_REST_API_URL, token: KV_CREDENTIALS.KV_REST_API_TOKEN },
		]);
	});

	it('stays on the in-memory cache when the read-only token is missing', async () => {
		setEnv({
			KV_REST_API_URL: KV_CREDENTIALS.KV_REST_API_URL,
			KV_REST_API_TOKEN: KV_CREDENTIALS.KV_REST_API_TOKEN,
		});
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => placesResponse()));

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		await getGoogleReviewSnapshot('place-123');

		expect(redisMock.constructorCalls).toHaveLength(0);
	});

	it('reads and writes the same key shape and TTL option as before', async () => {
		setEnv(KV_CREDENTIALS);
		redisMock.get.mockResolvedValue(null);
		const fetchMock = vi.fn().mockImplementation(async () => placesResponse());
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		const snapshot = await getGoogleReviewSnapshot('place-123', { languageCode: 'FR ' });

		expect(redisMock.get).toHaveBeenCalledWith('google-reviews:place-123:fr');
		expect(redisMock.set).toHaveBeenCalledWith(
			'google-reviews:place-123:fr',
			expect.objectContaining({
				placeId: 'place-123',
				languageCode: 'fr',
				rating: 4.8,
				reviewCount: 123,
				reviewsUrl: 'https://search.google.com/local/reviews?placeid=place-123',
			}),
			{ ex: 60 * 60 * 24 * 2 },
		);
		expect(snapshot.data.source).toBe('fresh');
	});

	it('serves a fresh redis hit without calling google', async () => {
		setEnv(KV_CREDENTIALS);
		redisMock.get.mockResolvedValue({
			placeId: 'place-123',
			businessName: 'Cached Bistro',
			languageCode: 'en',
			rating: 4.5,
			reviewCount: 99,
			reviewsUrl: 'https://search.google.com/local/reviews?placeid=place-123',
			updatedAt: new Date().toISOString(),
		});
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		const snapshot = await getGoogleReviewSnapshot('place-123');

		expect(snapshot).toMatchObject({
			data: { source: 'cache', businessName: 'Cached Bistro', rating: 4.5 },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(redisMock.set).not.toHaveBeenCalled();
	});

	it('falls back to a stale redis payload when google fails', async () => {
		setEnv(KV_CREDENTIALS);
		redisMock.get.mockResolvedValue({
			placeId: 'place-123',
			businessName: 'Stale Bistro',
			languageCode: 'en',
			rating: 4.1,
			reviewCount: 12,
			reviewsUrl: 'https://search.google.com/local/reviews?placeid=place-123',
			updatedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				makePlacesResponse(
					{ error: { message: 'Fresh snapshot unavailable' } },
					{ status: 503, statusText: 'Service Unavailable' },
				),
			),
		);

		const { getGoogleReviewSnapshot } = await loadGoogleReviewsModule();
		const snapshot = await getGoogleReviewSnapshot('place-123');

		expect(snapshot).toMatchObject({
			data: { source: 'fallback', businessName: 'Stale Bistro' },
			error: 'Google Places API error (503): Fresh snapshot unavailable',
		});
		expect(redisMock.set).not.toHaveBeenCalled();
	});
});

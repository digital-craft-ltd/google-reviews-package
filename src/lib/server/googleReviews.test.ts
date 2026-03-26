import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
	delete process.env.KV_REST_API_URL;
	delete process.env.KV_REST_API_TOKEN;
	delete process.env.KV_REST_API_READ_ONLY_TOKEN;
	vi.unstubAllGlobals();
});

afterEach(() => {
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
});

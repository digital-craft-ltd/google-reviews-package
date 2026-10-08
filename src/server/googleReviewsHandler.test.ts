vi.mock('../lib/server/googleReviews', () => ({
	getGoogleReviewSnapshot: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoogleReviewSnapshot } from '../lib/server/googleReviews';
import { googleReviewsHandler } from './googleReviewsHandler';

const mockGetGoogleReviewSnapshot = vi.mocked(getGoogleReviewSnapshot);

beforeEach(() => {
	mockGetGoogleReviewSnapshot.mockReset();
	process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
	delete process.env.CRON_SECRET;
});

describe('googleReviewsHandler', () => {
	it('trims placeId and languageCode before calling the snapshot helper', async () => {
		mockGetGoogleReviewSnapshot.mockResolvedValue({
			data: {
				placeId: 'abc123',
				rating: 4.9,
				reviewCount: 42,
				businessName: 'Demo Co',
				reviewsUrl: 'https://maps.example/demo',
				languageCode: 'fr',
				updatedAt: '2024-01-02T03:04:05.000Z',
				source: 'cache',
			},
		});

		const request = new Request(
			'https://example.com/api/google-reviews?placeId=%20abc123%20&languageCode=%20fr%20&businessName=%20Demo%20Co%20',
		);

		const response = await googleReviewsHandler({ request } as never);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			placeId: 'abc123',
			languageCode: 'fr',
			businessName: 'Demo Co',
		});
		expect(mockGetGoogleReviewSnapshot).toHaveBeenCalledWith('abc123', {
			languageCode: 'fr',
			businessName: 'Demo Co',
			forceRefresh: false,
		});
	});

	it('authorizes forced refreshes with CRON_SECRET', async () => {
		mockGetGoogleReviewSnapshot.mockResolvedValue({
			data: {
				placeId: 'abc123',
				rating: 4.9,
				reviewCount: 42,
				reviewsUrl: 'https://search.google.com/local/reviews?placeid=abc123',
				languageCode: 'en',
				updatedAt: '2024-01-02T03:04:05.000Z',
				source: 'fresh',
			},
		});

		const request = new Request('https://example.com/api/google-reviews?placeId=abc123&force=true', {
			headers: { Authorization: 'Bearer test-secret' },
		});
		const response = await googleReviewsHandler({ request } as never);

		expect(response.status).toBe(200);
		expect(mockGetGoogleReviewSnapshot).toHaveBeenCalledWith('abc123', {
			languageCode: 'en',
			businessName: undefined,
			forceRefresh: true,
		});
	});
});

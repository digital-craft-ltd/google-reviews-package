import { describe, expect, it, vi } from 'vitest';
import {
	buildGoogleReviewsRequestUrl,
	buildReviewsUrl,
	createFallbackData,
	formatRatingDisplay,
	resolveReviewsUrl,
} from './reviewFormatting';

describe('reviewFormatting utilities', () => {
	it('formats rating display with one decimal', () => {
		expect(formatRatingDisplay(4.876)).toBe('4.9');
		expect(formatRatingDisplay(5)).toBe('5.0');
	});

	it('returns dash when rating is missing', () => {
		expect(formatRatingDisplay(undefined)).toBe('—');
		expect(formatRatingDisplay(null)).toBe('—');
	});

	it('blends string input without formatting', () => {
		expect(formatRatingDisplay('4.9')).toBe('4.9');
	});

	it('builds a google reviews url from place id', () => {
		expect(buildReviewsUrl('abc 123')).toBe(
			'https://search.google.com/local/reviews?placeid=abc%20123',
		);
	});

	it('returns undefined when place id not provided', () => {
		expect(buildReviewsUrl(undefined)).toBeUndefined();
	});

	it('prefers explicit url when resolving', () => {
		expect(resolveReviewsUrl('abc', 'https://example.com')).toBe('https://example.com');
	});

	it('falls back to derived url when explicit url missing', () => {
		expect(resolveReviewsUrl('xyz')).toMatch('placeid=xyz');
	});

	it('omits the default english languageCode from api request urls', () => {
		expect(
			buildGoogleReviewsRequestUrl({
				endpoint: '/api/google-reviews',
				origin: 'https://example.com',
				placeId: 'abc123',
				languageCode: 'en',
			}),
		).toBe('https://example.com/api/google-reviews?placeId=abc123');
	});

	it('includes non-default languageCode values in api request urls', () => {
		expect(
			buildGoogleReviewsRequestUrl({
				endpoint: '/api/google-reviews',
				origin: 'https://example.com',
				placeId: 'abc123',
				languageCode: 'fr',
			}),
		).toBe('https://example.com/api/google-reviews?languageCode=fr&placeId=abc123');
	});

	it('treats case and spacing variants of english as the default request shape', () => {
		expect(
			buildGoogleReviewsRequestUrl({
				endpoint: '/api/google-reviews/',
				origin: 'https://example.com',
				placeId: ' abc123 ',
				languageCode: ' EN ',
				businessName: ' Demo Co ',
			}),
		).toBe('https://example.com/api/google-reviews/?businessName=Demo+Co&placeId=abc123');
	});

	it('normalizes language case and query ordering into one canonical request url', () => {
		const first = buildGoogleReviewsRequestUrl({
			endpoint: '/api/google-reviews?source=badge',
			origin: 'https://example.com',
			placeId: 'abc123',
			languageCode: ' FR ',
		});
		const second = buildGoogleReviewsRequestUrl({
			endpoint: '/api/google-reviews?source=badge',
			origin: 'https://example.com',
			placeId: ' abc123 ',
			languageCode: 'fr',
		});

		expect(first).toBe(second);
		expect(first).toBe(
			'https://example.com/api/google-reviews?languageCode=fr&placeId=abc123&source=badge',
		);
	});

	it('preserves existing endpoint query params while canonicalizing default english requests', () => {
		const requestUrl = buildGoogleReviewsRequestUrl({
			endpoint: '/api/google-reviews?source=widget',
			origin: 'https://example.com',
			placeId: 'abc123',
			languageCode: 'en',
		});

		const parsed = new URL(requestUrl);
		expect(parsed.origin + parsed.pathname).toBe('https://example.com/api/google-reviews');
		expect(parsed.searchParams.get('source')).toBe('widget');
		expect(parsed.searchParams.get('placeId')).toBe('abc123');
		expect(parsed.searchParams.has('languageCode')).toBe(false);
	});

	it('creates fallback data when rating provided', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-02T03:04:05.000Z'));
		const fallback = createFallbackData({ fallbackRating: 4.8, fallbackReviewCount: 120 });
		expect(fallback).toMatchObject({
			rating: 4.8,
			reviewCount: 120,
			source: 'fallback',
		});
		expect(fallback?.updatedAt).toBe('2024-01-02T03:04:05.000Z');
		vi.useRealTimers();
	});

	it('returns null fallback when rating missing', () => {
		expect(createFallbackData({})).toBeNull();
	});

	it('clears review count when not a number', () => {
		expect(createFallbackData({ fallbackRating: 4.7, fallbackReviewCount: Number.NaN })).toMatchObject({
			rating: 4.7,
			reviewCount: null,
		});
	});
});

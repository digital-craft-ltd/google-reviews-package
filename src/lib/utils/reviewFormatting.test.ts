import { describe, expect, it, vi } from 'vitest';
import {
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

// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initGoogleReviews, { type GoogleReviewPayload } from './googleReviewsClient';

const selectors = { starsContainer: '.badge-stars' };
const inlineComponent = readFileSync(
	resolve('src/components/google-reviews/GoogleReviewInlineScript.astro'),
	'utf8',
);
const inlineClientSource = inlineComponent
	.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]
	.replace('Boolean(import.meta.env?.DEV)', 'false');

if (!inlineClientSource) {
	throw new Error('Unable to read the GoogleReviewInlineScript browser source');
}

const makePayload = (overrides: Partial<GoogleReviewPayload> = {}): GoogleReviewPayload => ({
	placeId: 'place-123',
	rating: 4.8,
	reviewCount: 123,
	reviewsUrl: 'https://search.google.com/local/reviews?placeid=place-123',
	languageCode: 'en',
	updatedAt: '2026-01-02T03:04:05.000Z',
	source: 'fresh',
	...overrides,
});

const makeResponse = (payload: unknown) =>
	Promise.resolve({
		ok: true,
		status: 200,
		json: () => Promise.resolve(payload),
	} as Response);

const addBadge = ({
	id,
	placeId = 'place-123',
	fallback,
}: {
	id: string;
	placeId?: string;
	fallback?: { rating: number; reviewCount: number };
}) => {
	const root = document.createElement('section');
	root.id = id;
	root.dataset.placeId = placeId;
	root.dataset.language = 'en';
	root.dataset.endpoint = '/api/google-reviews';
	root.dataset.ctaTemplate = 'Read our {count} {label}';
	root.dataset.googleReviewsState = fallback ? 'fallback' : 'unavailable';
	root.innerHTML = `
		<p data-rating aria-label="${fallback ? `Google rating ${fallback.rating.toFixed(1)} out of 5 stars` : 'Google rating not available yet'}">${fallback ? fallback.rating.toFixed(1) : '—'}</p>
		<div class="badge-stars" role="img" aria-hidden="${fallback ? 'false' : 'true'}">
			${Array.from({ length: 5 }, (_, index) => `<span data-star="${index}"></span>`).join('')}
		</div>
		<a data-review-link href="https://search.google.com/local/reviews?placeid=${placeId}">
			<span data-cta-text>${fallback ? `Read our ${fallback.reviewCount} reviews` : 'Read our reviews'}</span>
		</a>
		<span data-review-count>${fallback ? `${fallback.reviewCount} reviews` : 'No reviews yet'}</span>
		<template data-fallback>${fallback ? JSON.stringify({ ...fallback, source: 'fallback', updatedAt: '2026-01-01T00:00:00.000Z' }) : ''}</template>
	`;
	document.body.append(root);
	return root;
};

const initialise = (id: string) =>
	initGoogleReviews({
		id,
		selectors,
		strings: {
			ratingAvailable: 'Google rating {rating} out of 5 stars',
			starsAvailable: 'Google rating {rating} out of 5 stars',
		},
	});

beforeEach(() => {
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	document.querySelectorAll('[data-google-reviews-state]').forEach((root) => {
		root.dispatchEvent(new Event('astro:unmount'));
	});
	document.body.innerHTML = '';
	delete (window as Window & { __googleReviewsBootstrapped?: boolean }).__googleReviewsBootstrapped;
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('GoogleReviewInlineScript', () => {
	it('uses the same stateful shared-request lifecycle as the exported client', async () => {
		const first = addBadge({ id: 'inline-first' });
		const second = addBadge({ id: 'inline-second' });
		for (const root of [first, second]) {
			root.dataset.googleReviewsOptions = JSON.stringify({ id: root.id, selectors });
		}
		const fetchMock = vi.fn(() => makeResponse(makePayload()));
		vi.stubGlobal('fetch', fetchMock);

		new Function(inlineClientSource)();
		document.dispatchEvent(new Event('DOMContentLoaded'));

		await vi.waitFor(() => {
			expect(first.dataset.googleReviewsState).toBe('ready');
			expect(second.dataset.googleReviewsState).toBe('ready');
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first.querySelector('[data-rating]')?.textContent).toBe('4.8');
		expect(first.querySelector('.badge-stars')?.getAttribute('aria-hidden')).toBe('false');
	});
});

describe('googleReviewsClient lifecycle', () => {
	it('recovers a neutral badge and synchronizes visible and accessible state', async () => {
		const root = addBadge({ id: 'badge-neutral' });
		vi.stubGlobal('fetch', vi.fn(() => makeResponse(makePayload())));

		initialise(root.id);

		await vi.waitFor(() => expect(root.dataset.googleReviewsState).toBe('ready'));
		expect(root.querySelector('[data-rating]')?.textContent).toBe('4.8');
		expect(root.querySelector('[data-rating]')?.getAttribute('aria-label')).toBe(
			'Google rating 4.8 out of 5 stars',
		);
		expect(root.querySelector('.badge-stars')?.getAttribute('aria-hidden')).toBe('false');
		expect(root.querySelector('.badge-stars')?.getAttribute('aria-label')).toBe(
			'Google rating 4.8 out of 5 stars',
		);
		expect((root.querySelector('[data-review-link]') as HTMLAnchorElement).href).toBe(
			'https://search.google.com/local/reviews?placeid=place-123',
		);
	});

	it('shares identical in-flight requests and removes completed requests', async () => {
		const first = addBadge({ id: 'badge-first' });
		const second = addBadge({ id: 'badge-second' });
		const fetchMock = vi.fn(() => makeResponse(makePayload()));
		vi.stubGlobal('fetch', fetchMock);

		initialise(first.id);
		initialise(second.id);

		await vi.waitFor(() => {
			expect(first.dataset.googleReviewsState).toBe('ready');
			expect(second.dataset.googleReviewsState).toBe('ready');
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const third = addBadge({ id: 'badge-third' });
		initialise(third.id);
		await vi.waitFor(() => expect(third.dataset.googleReviewsState).toBe('ready'));
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('keeps requests for different places independent', async () => {
		const first = addBadge({ id: 'badge-first', placeId: 'place-123' });
		const second = addBadge({ id: 'badge-second', placeId: 'place-456' });
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const placeId = new URL(String(input)).searchParams.get('placeId') ?? '';
			return makeResponse(
				makePayload({
					placeId,
					reviewsUrl: `https://search.google.com/local/reviews?placeid=${placeId}`,
				}),
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		initialise(first.id);
		initialise(second.id);

		await vi.waitFor(() => {
			expect(first.dataset.googleReviewsState).toBe('ready');
			expect(second.dataset.googleReviewsState).toBe('ready');
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('preserves fallback content when the refresh fails', async () => {
		const root = addBadge({
			id: 'badge-fallback',
			fallback: { rating: 4.7, reviewCount: 88 },
		});
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

		initialise(root.id);

		await vi.waitFor(() => expect(root.dataset.googleReviewsState).toBe('error'));
		expect(root.querySelector('[data-rating]')?.textContent).toBe('4.7');
		expect(root.querySelector('[data-rating]')?.getAttribute('aria-label')).toBe(
			'Google rating 4.7 out of 5 stars',
		);
		expect(root.querySelector('.badge-stars')?.getAttribute('aria-hidden')).toBe('false');
		expect(root.querySelector('[data-cta-text]')?.textContent).toBe('Read our 88 reviews');
	});

	it.each([
		['rating above five', { rating: 5.1 }],
		['negative review count', { reviewCount: -1 }],
		['fractional review count', { reviewCount: 4.5 }],
		['non-http review url', { reviewsUrl: 'javascript:alert(1)' }],
		['invalid timestamp', { updatedAt: 'not-a-date' }],
		['missing language code', { languageCode: undefined }],
	] as const)('rejects an invalid payload with %s', async (_label, override) => {
		const root = addBadge({
			id: 'badge-invalid',
			fallback: { rating: 4.7, reviewCount: 88 },
		});
		vi.stubGlobal('fetch', vi.fn(() => makeResponse(makePayload(override))));

		initialise(root.id);

		await vi.waitFor(() => expect(root.dataset.googleReviewsState).toBe('error'));
		expect(root.querySelector('[data-rating]')?.textContent).toBe('4.7');
		expect(root.querySelector('[data-cta-text]')?.textContent).toBe('Read our 88 reviews');
	});

	it('times out a request and removes it from the shared registry', async () => {
		vi.useFakeTimers();
		const root = addBadge({ id: 'badge-timeout' });
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		initialise(root.id);
		expect(root.dataset.googleReviewsState).toBe('loading');
		await vi.advanceTimersByTimeAsync(5000);
		await Promise.resolve();
		expect(root.dataset.googleReviewsState).toBe('error');

		document.dispatchEvent(new Event('visibilitychange'));
		expect(fetchMock).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(5000);
		await Promise.resolve();
	});
});

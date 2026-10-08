import { buildGoogleReviewsRequestUrl } from '../utils/reviewFormatting';

interface SelectorConfig {
	rating: string;
	star: string;
	starsContainer: string;
	reviewLink: string;
	ctaText: string;
	reviewCount: string;
	updatedAt: string;
	fallback: string;
}

interface StringTemplates {
	ratingAvailable: string;
	ratingPending: string;
	starsAvailable: string;
	starsPending: string;
	noReviewsText: string;
	noReviewsCtaText: string;
}

export interface GoogleReviewsClientOptions {
	id: string;
	selectors?: Partial<SelectorConfig>;
	strings?: Partial<StringTemplates>;
	ctaTemplate?: string;
	disableVisibilityRefresh?: boolean;
}

export type GoogleReviewsState = 'fallback' | 'loading' | 'ready' | 'unavailable' | 'error';

export type GoogleReviewPayload = {
	rating: number;
	reviewCount: number;
	reviewsUrl: string;
	updatedAt: string;
	placeId: string;
	languageCode: string;
	businessName?: string;
	source: 'fresh' | 'cache' | 'fallback';
};

type RenderableReviewPayload = Partial<GoogleReviewPayload> & {
	rating?: number;
	reviewCount?: number | null;
};

const REQUEST_TIMEOUT_MS = 5000;
const inFlightRequests = new Map<string, Promise<GoogleReviewPayload>>();

const defaultSelectors: SelectorConfig = {
	rating: '[data-rating]',
	star: '[data-star]',
	starsContainer: '.star-rating',
	reviewLink: '[data-review-link]',
	ctaText: '[data-cta-text]',
	reviewCount: '[data-review-count]',
	updatedAt: '[data-updated-at]',
	fallback: 'template[data-fallback]',
};

const defaultStrings: StringTemplates = {
	ratingAvailable: 'Our Google Reviews rating is {rating}',
	ratingPending: 'Awaiting Google Reviews rating',
	starsAvailable: '{rating} out of 5 stars',
	starsPending: 'Rating not available yet',
	noReviewsText: 'No reviews yet',
	noReviewsCtaText: 'Read our reviews',
};

const formatCount = (value: number) =>
	Intl.NumberFormat(undefined, {
		notation: value >= 1000 ? 'compact' : 'standard',
		maximumFractionDigits: 1,
	}).format(value);

const formatRating = (value: number) => value.toFixed(1);

const template = (input: string, values: Record<string, string>) =>
	input.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

const isRating = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5;

const isReviewCount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isHttpUrl = (value: unknown): value is string => {
	if (typeof value !== 'string') return false;

	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
};

const isGoogleReviewPayload = (value: unknown): value is GoogleReviewPayload => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

	const payload = value as Record<string, unknown>;
	const validSource =
		payload.source === 'fresh' || payload.source === 'cache' || payload.source === 'fallback';
	const validUpdatedAt =
		typeof payload.updatedAt === 'string' && !Number.isNaN(Date.parse(payload.updatedAt));

	return (
		isRating(payload.rating) &&
		isReviewCount(payload.reviewCount) &&
		isHttpUrl(payload.reviewsUrl) &&
		typeof payload.placeId === 'string' &&
		payload.placeId.trim().length > 0 &&
		validUpdatedAt &&
		validSource &&
		typeof payload.languageCode === 'string' &&
		payload.languageCode.trim().length > 0 &&
		(payload.businessName === undefined || typeof payload.businessName === 'string')
	);
};

const parseFallbackData = (value: string): RenderableReviewPayload | null => {
	try {
		const payload = JSON.parse(value) as Record<string, unknown>;
		if (!isRating(payload.rating)) return null;
		if (payload.reviewCount !== null && !isReviewCount(payload.reviewCount)) return null;

		return payload as RenderableReviewPayload;
	} catch {
		return null;
	}
};

const requestGoogleReviews = (requestUrl: string): Promise<GoogleReviewPayload> => {
	const existingRequest = inFlightRequests.get(requestUrl);
	if (existingRequest) return existingRequest;

	const controller = new AbortController();
	let timedOut = false;
	const timeoutId = window.setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, REQUEST_TIMEOUT_MS);

	const request = (async () => {
		try {
			const response = await fetch(requestUrl, { signal: controller.signal });
			if (!response.ok) {
				throw new Error(`Non-200 response ${response.status}`);
			}

			const payload: unknown = await response.json();
			if (!isGoogleReviewPayload(payload)) {
				throw new Error('Invalid Google Reviews response payload');
			}

			return payload;
		} catch (error) {
			if (timedOut) {
				throw new Error(`Google Reviews request timed out after ${REQUEST_TIMEOUT_MS}ms`);
			}
			throw error;
		}
	})().finally(() => {
		window.clearTimeout(timeoutId);
		if (inFlightRequests.get(requestUrl) === request) {
			inFlightRequests.delete(requestUrl);
		}
	});

	inFlightRequests.set(requestUrl, request);
	return request;
};

export default function initGoogleReviews(options: GoogleReviewsClientOptions) {
	if (typeof window === 'undefined') return;

	const selectors = { ...defaultSelectors, ...(options.selectors ?? {}) };
	const strings = { ...defaultStrings, ...(options.strings ?? {}) };
	const root = document.getElementById(options.id);

	if (!root) {
		if (import.meta.env.DEV) {
			console.warn('[GoogleReviews] Root element not found for id:', options.id);
		}
		return;
	}

	const fallbackTemplate = selectors.fallback
		? (root.querySelector(selectors.fallback) as HTMLTemplateElement | null)
		: null;
	const fallbackData = fallbackTemplate?.textContent
		? parseFallbackData(fallbackTemplate.textContent)
		: null;

	const ratingEl = selectors.rating
		? (root.querySelector(selectors.rating) as HTMLElement | null)
		: null;
	const stars = selectors.star ? Array.from(root.querySelectorAll(selectors.star)) as HTMLElement[] : [];
	const starsContainer = selectors.starsContainer
		? (root.querySelector(selectors.starsContainer) as HTMLElement | null)
		: null;
	const reviewLink = selectors.reviewLink
		? (root.querySelector(selectors.reviewLink) as HTMLAnchorElement | null)
		: null;
	const ctaTextEl = selectors.ctaText
		? (root.querySelector(selectors.ctaText) as HTMLElement | null)
		: null;
	const reviewCountEl = selectors.reviewCount
		? (root.querySelector(selectors.reviewCount) as HTMLElement | null)
		: null;
	const updatedAtEl = selectors.updatedAt
		? (root.querySelector(selectors.updatedAt) as HTMLElement | null)
		: null;

	const dataset = root.dataset;
	const placeId = dataset.placeId || '';
	const endpoint = dataset.endpoint || '/api/google-reviews';
	const language = dataset.language || 'en';
	const initialBusinessName = dataset.businessName?.trim() ?? '';
	const ctaTemplate = dataset.ctaTemplate || options.ctaTemplate || '';
	let disposed = false;

	const setState = (state: GoogleReviewsState) => {
		root.dataset.googleReviewsState = state;
	};

	const applyStars = (rating: number) => {
		if (!stars.length) return;
		stars.forEach((starEl, index) => {
			const fill = Math.max(0, Math.min(1, rating - index));
			starEl.style.setProperty('--star-fill', fill.toString());
		});
	};

	const buildRatingLabel = (rating: number | null) =>
		rating !== null
			? template(strings.ratingAvailable, { rating: formatRating(rating) })
			: strings.ratingPending;

	const buildStarsLabel = (rating: number | null) =>
		rating !== null
			? template(strings.starsAvailable, { rating: formatRating(rating) })
			: strings.starsPending;

	const updateText = (payload: RenderableReviewPayload, state: GoogleReviewsState) => {
		const rating = isRating(payload.rating) ? payload.rating : null;

		if (ratingEl) {
			ratingEl.textContent = rating !== null ? formatRating(rating) : '—';
			ratingEl.setAttribute('aria-label', buildRatingLabel(rating));
		}

		if (starsContainer) {
			starsContainer.setAttribute('aria-label', buildStarsLabel(rating));
			starsContainer.setAttribute('aria-hidden', rating !== null ? 'false' : 'true');
		}
		applyStars(rating ?? 0);

		const reviewCount = isReviewCount(payload.reviewCount) ? payload.reviewCount : null;

		if (reviewCountEl) {
			reviewCountEl.textContent =
				reviewCount !== null
					? `${formatCount(reviewCount)} ${reviewCount === 1 ? 'review' : 'reviews'}`
					: strings.noReviewsText;
		}

		if (ctaTextEl) {
			if (reviewCount !== null) {
				const countText = formatCount(reviewCount);
				const label = reviewCount === 1 ? 'review' : 'reviews';
				if (ctaTemplate) {
					let output = ctaTemplate;
					if (output.includes('{label}')) output = output.replace('{label}', label);
					ctaTextEl.textContent = output.replace('{count}', countText);
				} else {
					ctaTextEl.textContent = `${countText} ${label}`;
				}
			} else {
				ctaTextEl.textContent = strings.noReviewsCtaText;
			}
		}

		if (reviewLink && payload.reviewsUrl) {
			reviewLink.href = payload.reviewsUrl;
		}

		if (updatedAtEl && payload.updatedAt) {
			const timestamp = new Date(payload.updatedAt);
			const label = Number.isNaN(timestamp.getTime()) ? null : timestamp.toLocaleString();
			updatedAtEl.textContent = label ? `Last updated ${label}` : 'Last updated recently';
			if (label) updatedAtEl.setAttribute('title', label);
		}

		if (payload.placeId) root.dataset.placeId = payload.placeId;
		if (rating !== null) root.dataset.rating = String(rating);
		if (reviewCount !== null) root.dataset.reviewCount = String(reviewCount);
		if (payload.updatedAt) root.dataset.updatedAt = payload.updatedAt;
		if (payload.businessName) root.dataset.businessName = payload.businessName;
		if (payload.source) root.dataset.source = payload.source;
		setState(state);

		const nextBusinessName = payload.businessName ?? root.dataset.businessName ?? initialBusinessName;
		window.dispatchEvent(
			new CustomEvent('google-reviews:update', {
				detail: {
					placeId: payload.placeId || root.dataset.placeId,
					businessName: nextBusinessName,
					state,
					data: payload,
				},
			}),
		);
	};

	if (fallbackData) {
		updateText({ ...fallbackData, source: 'fallback' }, 'fallback');
	} else {
		setState('unavailable');
	}

	const fetchData = async () => {
		if (disposed) return;
		setState('loading');

		try {
			const requestUrl = buildGoogleReviewsRequestUrl({
				endpoint,
				origin: window.location.origin,
				placeId,
				languageCode: language,
				businessName: root.dataset.businessName?.trim() ?? initialBusinessName,
			});
			const payload = await requestGoogleReviews(requestUrl);
			if (!disposed) updateText(payload, payload.source === 'fallback' ? 'fallback' : 'ready');
		} catch (error) {
			if (!disposed) setState('error');
			if (import.meta.env.DEV) {
				console.error('[GoogleReviews]', error);
			}
		}
	};

	let readyHandler: (() => void) | null = null;
	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		void fetchData();
	} else {
		readyHandler = () => {
			readyHandler = null;
			void fetchData();
		};
		document.addEventListener('DOMContentLoaded', readyHandler, { once: true });
	}

	let visibilityHandler: (() => void) | null = null;
	if (!options.disableVisibilityRefresh) {
		visibilityHandler = () => {
			const state = root.dataset.googleReviewsState;
			if (
				document.visibilityState === 'visible' &&
				(state === 'fallback' || state === 'unavailable' || state === 'error')
			) {
				void fetchData();
			}
		};
		document.addEventListener('visibilitychange', visibilityHandler);
	}

	root.addEventListener(
		'astro:unmount',
		() => {
			disposed = true;
			if (readyHandler) document.removeEventListener('DOMContentLoaded', readyHandler);
			if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
		},
		{ once: true },
	);
}

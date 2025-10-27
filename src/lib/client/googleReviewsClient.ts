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

type ReviewPayload = {
	rating?: number;
	reviewCount?: number;
	reviewsUrl?: string;
	updatedAt?: string;
	placeId?: string;
	businessName?: string;
	source?: 'fresh' | 'cache' | 'fallback';
};

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
	let fallbackData: ReviewPayload | null = null;

	if (fallbackTemplate?.textContent) {
		try {
			fallbackData = JSON.parse(fallbackTemplate.textContent) as ReviewPayload;
		} catch (error) {
			if (import.meta.env.DEV) {
				console.warn('[GoogleReviews] Failed to parse fallback data', error);
			}
		}
	}

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
	const initialSource = dataset.source || '';

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

	const updateText = (payload: ReviewPayload) => {
		if (!payload) return;

		const rating =
			typeof payload.rating === 'number' && Number.isFinite(payload.rating) ? payload.rating : null;

		if (ratingEl) {
			if (rating !== null) {
				ratingEl.textContent = formatRating(rating);
				ratingEl.setAttribute('aria-label', buildRatingLabel(rating));
			} else {
				ratingEl.textContent = '—';
				ratingEl.setAttribute('aria-label', buildRatingLabel(null));
			}
		}

		if (starsContainer) {
			starsContainer.setAttribute('aria-label', buildStarsLabel(rating));
		}

		if (rating !== null) {
			applyStars(rating);
		} else {
			applyStars(0);
		}

		const reviewCount =
			typeof payload.reviewCount === 'number' && Number.isFinite(payload.reviewCount)
				? payload.reviewCount
				: null;

		if (reviewCountEl) {
			reviewCountEl.textContent =
				reviewCount !== null ? `${formatCount(reviewCount)} ${reviewCount === 1 ? 'review' : 'reviews'}` : strings.noReviewsText;
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

		if (updatedAtEl) {
			if (payload.updatedAt) {
				try {
					const label = new Date(payload.updatedAt).toLocaleString();
					updatedAtEl.textContent = `Last updated ${label}`;
					updatedAtEl.setAttribute('title', label);
				} catch {
					updatedAtEl.textContent = 'Last updated recently';
				}
			}
		}

		if (payload.placeId) {
			root.dataset.placeId = payload.placeId;
		}
		if (typeof payload.rating === 'number') {
			root.dataset.rating = String(payload.rating);
		}
		if (typeof payload.reviewCount === 'number') {
			root.dataset.reviewCount = String(payload.reviewCount);
		}
		if (payload.updatedAt) {
			root.dataset.updatedAt = payload.updatedAt;
		}
		if (payload.businessName) {
			root.dataset.businessName = payload.businessName;
		}
		if (payload.source) {
			root.dataset.source = payload.source;
		}

		const nextBusinessName = payload.businessName ?? root.dataset.businessName ?? initialBusinessName;

		window.dispatchEvent(
			new CustomEvent('google-reviews:update', {
				detail: {
					placeId: payload.placeId || root.dataset.placeId,
					businessName: nextBusinessName,
					data: payload,
				},
			}),
		);
	};

	if (fallbackData) {
		if (typeof fallbackData.rating === 'number') {
			applyStars(fallbackData.rating);
		}
		updateText({ ...fallbackData, source: 'fallback' });
	}

	const controller = new AbortController();

	const fetchData = async () => {
		try {
			const url = new URL(endpoint, window.location.origin);
			if (placeId) url.searchParams.set('placeId', placeId);
			url.searchParams.set('languageCode', language);
			const currentBusinessName = root.dataset.businessName?.trim() ?? initialBusinessName;
			if (currentBusinessName) url.searchParams.set('businessName', currentBusinessName);
			const response = await fetch(url.toString(), { signal: controller.signal });
			if (!response.ok) {
				throw new Error(`Non-200 response ${response.status}`);
			}

			const payload = (await response.json()) as ReviewPayload;
			updateText(payload);
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error('[GoogleReviews]', error);
			}
		}
	};

	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		fetchData();
	} else {
		document.addEventListener('DOMContentLoaded', fetchData, { once: true });
	}

	let visibilityHandler: (() => void) | null = null;
	if (!options.disableVisibilityRefresh) {
		visibilityHandler = () => {
			if (document.visibilityState === 'visible' && root.dataset.source === 'fallback') {
				fetchData();
			}
		};
		window.addEventListener('visibilitychange', visibilityHandler);
	}

	root.addEventListener('astro:unmount', () => {
		controller.abort();
		if (visibilityHandler) {
			window.removeEventListener('visibilitychange', visibilityHandler);
		}
	});
}

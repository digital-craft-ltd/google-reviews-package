export type FallbackReviewData = {
	rating: number;
	reviewCount: number | null;
	source: 'fallback';
	updatedAt: string;
};

const formatNumber = (value?: number | null) =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

export const formatRatingDisplay = (value?: number | string | null): string => {
	if (typeof value === 'string') return value;
	const numericValue = formatNumber(typeof value === 'number' ? value : null);
	return numericValue !== null ? numericValue.toFixed(1) : '—';
};

export const buildReviewsUrl = (placeId?: string | null): string | undefined => {
	if (!placeId) return undefined;
	return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`;
};

export const resolveReviewsUrl = (placeId?: string | null, explicitUrl?: string | null): string | undefined => {
	if (explicitUrl && explicitUrl.trim().length > 0) return explicitUrl;
	return buildReviewsUrl(placeId);
};

type FallbackOptions = {
	fallbackRating?: number;
	fallbackReviewCount?: number;
};

export const createFallbackData = ({ fallbackRating, fallbackReviewCount }: FallbackOptions): FallbackReviewData | null => {
	const ratingValue = formatNumber(fallbackRating);
	if (ratingValue === null) {
		return null;
	}

	const reviewCountValue = formatNumber(fallbackReviewCount);

	return {
		rating: ratingValue,
		reviewCount: reviewCountValue,
		source: 'fallback',
		updatedAt: new Date().toISOString(),
	};
};

import type { APIRoute } from 'astro';
import { getGoogleReviewSnapshot } from '../lib/server/googleReviews';

const CACHE_HEADERS = {
	'Content-Type': 'application/json',
	'Cache-Control': 'no-store',
	'Access-Control-Allow-Origin': '*',
};

export const googleReviewsHandler: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const placeIdParam = url.searchParams.get('placeId');
	const placeId = typeof placeIdParam === 'string' && placeIdParam.trim().length > 0 ? placeIdParam.trim() : null;
	const languageCode = url.searchParams.get('languageCode')?.trim() || 'en';
	const businessNameParam = url.searchParams.get('businessName');
	const businessName = businessNameParam && businessNameParam.trim().length > 0 ? businessNameParam.trim() : undefined;
	const forceParam = url.searchParams.get('force');
	const cronSecret = process.env.CRON_SECRET;
	const authHeader = request.headers.get('authorization') ?? '';
	const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

	if (!placeId) {
		return new Response(JSON.stringify({ error: 'Missing placeId query parameter.' }), {
			status: 400,
			headers: CACHE_HEADERS,
		});
	}

	const wantsForce = forceParam === 'true' || forceParam === '1';
	const hasCronSecret = Boolean(cronSecret);
	const forceRefresh = Boolean(wantsForce && hasCronSecret && bearerToken === cronSecret);

	if (wantsForce && (!cronSecret || !forceRefresh)) {
		const message = cronSecret
			? 'Missing or invalid Authorization header for forced refresh.'
			: 'CRON_SECRET is not configured, forced refresh is disabled.';
		return new Response(JSON.stringify({ error: message }), {
			status: 401,
			headers: CACHE_HEADERS,
		});
	}

	try {
		const { data, error } = await getGoogleReviewSnapshot(placeId, {
			languageCode,
			businessName,
			forceRefresh,
		});

		return new Response(
			JSON.stringify({
				placeId: data.placeId,
				rating: data.rating,
				reviewCount: data.reviewCount,
				businessName: data.businessName,
				reviewsUrl: data.reviewsUrl,
				languageCode: data.languageCode,
				updatedAt: data.updatedAt,
				source: data.source,
				meta: {
					cacheTtlSeconds: Number.parseInt(process.env.GOOGLE_REVIEWS_CACHE_TTL ?? '', 10) || 60 * 60 * 24,
					fetchError: error ?? null,
				},
			}),
			{
				status: 200,
				headers: CACHE_HEADERS,
			},
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to fetch Google Reviews and no cached value is available.';

		return new Response(JSON.stringify({ error: message }), {
			status: 502,
			headers: CACHE_HEADERS,
		});
	}
};

export default googleReviewsHandler;

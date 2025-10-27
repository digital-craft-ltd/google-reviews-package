/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly GOOGLE_PLACES_API_KEY: string;
	readonly GOOGLE_PLACES_DEFAULT_PLACE_ID?: string;
	readonly GOOGLE_PLACES_DEFAULT_NAME?: string;
	readonly GOOGLE_REVIEWS_CACHE_TTL?: string;
	readonly GOOGLE_REVIEWS_CRON_SECRET?: string;
	readonly CRON_SECRET?: string;
	readonly KV_REST_API_URL?: string;
	readonly KV_REST_API_TOKEN?: string;
	readonly KV_REST_API_READ_ONLY_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

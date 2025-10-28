import { defineConfig } from 'tsup';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(__dirname);
const srcDir = resolve(projectRoot, 'src');
const distDir = resolve(projectRoot, 'dist');

const copyAssetDir = (directory: string) => {
	const from = resolve(srcDir, directory);
	const to = resolve(distDir, directory);

	if (!existsSync(from)) return;
	if (existsSync(to)) {
		rmSync(to, { recursive: true, force: true });
	}

	mkdirSync(distDir, { recursive: true });
	cpSync(from, to, { recursive: true });
};

export default defineConfig({
		entry: {
			index: 'src/index.ts',
			'lib/client/googleReviewsClient': 'src/lib/client/googleReviewsClient.ts',
			'lib/utils/reviewFormatting': 'src/lib/utils/reviewFormatting.ts',
			'lib/server/googleReviews': 'src/lib/server/googleReviews.ts',
			'server/googleReviewsHandler': 'src/server/googleReviewsHandler.ts',
		},
	clean: true,
	dts: false,
	format: ['esm', 'cjs'],
	outDir: 'dist',
	minify: false,
	sourcemap: true,
	target: 'es2021',
	treeshake: true,
	tsconfig: 'tsconfig.build.json',
	esbuildOptions(options) {
		options.external = [
			...(options.external ?? []),
			'astro',
			'@vercel/kv',
			'./components/google-reviews/GoogleReviewInlineScript.astro',
			'./components/google-reviews/GoogleReviewsWidget.astro',
			'./components/google-reviews/GoogleReviewsBadge.astro',
			'./components/google-reviews/types',
			'./styles/google-reviews.css',
		];
	},
		async onSuccess() {
			copyAssetDir('components');
			copyAssetDir('styles');
		},
	});

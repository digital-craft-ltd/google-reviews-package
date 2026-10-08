import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const inlineScriptPath = resolve('dist/components/google-reviews/GoogleReviewInlineScript.astro');
const inlineScript = await readFile(inlineScriptPath, 'utf8');

const rawBrowserImportPattern =
	/import\s+\{\s*buildGoogleReviewsRequestUrl\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/utils\/reviewFormatting['"]/;

if (rawBrowserImportPattern.test(inlineScript)) {
	console.error(
		`Raw browser import regression detected in ${inlineScriptPath}. Inline script must not import source-relative package modules at runtime.`,
	);
	process.exit(1);
}

const requiredLifecycleMarkers = [
	'inFlightRequests',
	'googleReviewsState',
	'Invalid Google Reviews response payload',
	'Google Reviews request timed out',
];
const missingLifecycleMarkers = requiredLifecycleMarkers.filter((marker) => !inlineScript.includes(marker));

if (missingLifecycleMarkers.length > 0) {
	console.error(
		`Inline client lifecycle is incomplete in ${inlineScriptPath}: ${missingLifecycleMarkers.join(', ')}`,
	);
	process.exit(1);
}

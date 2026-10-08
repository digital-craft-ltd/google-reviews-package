// Builds a throwaway consumer Astro app against a given astro major and proves the
// published .astro components install, type-check, build and render there.
//
// The package build never compiles .astro files (tsup copies them verbatim), so
// `npm run build` passing says nothing about Astro compatibility. This does.
//
// Usage: node scripts/verify-astro-consumer.mjs <major>   (or ASTRO_MAJOR=<major>)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const major = process.argv[2] ?? process.env.ASTRO_MAJOR;

if (!major || !/^\d+$/.test(major)) {
	console.error('Usage: node scripts/verify-astro-consumer.mjs <astro-major>');
	process.exit(1);
}

const projectRoot = resolve(import.meta.dirname, '..');
const workDir = mkdtempSync(join(tmpdir(), `digital-craft-google-reviews-astro${major}-`));
const run = (cmd, args, cwd) =>
	execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let failed = false;
const step = (label, fn) => {
	try {
		fn();
		console.log(`  PASS  ${label}`);
	} catch (error) {
		failed = true;
		console.error(`  FAIL  ${label}`);
		console.error(`${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}`.trim().split('\n').slice(-25).join('\n'));
	}
};

console.log(`\nConsumer verification against astro@^${major}.0.0`);

try {
	const packed = run('npm', ['pack', '--pack-destination', workDir], projectRoot).trim().split('\n').pop();
	const tarball = join(workDir, packed);

	const appDir = join(workDir, 'app');
	mkdirSync(join(appDir, 'src', 'pages'), { recursive: true });

	writeFileSync(
		join(appDir, 'package.json'),
		JSON.stringify(
			{
				name: `@digital-craft/google-reviews-consumer-astro${major}`,
				private: true,
				type: 'module',
				dependencies: { astro: `^${major}.0.0`, '@digital-craft/google-reviews': `file:${tarball}` },
				devDependencies: { '@astrojs/check': 'latest', typescript: '^5.5.4' },
			},
			null,
			2,
		),
	);
	writeFileSync(join(appDir, 'astro.config.mjs'), "import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n");
	writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: 'astro/tsconfigs/strict' }, null, 2));

	// Mirrors the usage example in README.md.
	writeFileSync(
		join(appDir, 'src', 'pages', 'index.astro'),
		`---
import {
  GoogleReviewInlineScript,
  GoogleReviewsWidget,
  GoogleReviewsBadge,
} from '@digital-craft/google-reviews';
import '@digital-craft/google-reviews/styles.css';
---
<html lang="en">
  <head><title>consumer</title></head>
  <body>
    <GoogleReviewInlineScript />
    <GoogleReviewsWidget
      placeId="FIXTURE_PLACE_ID"
      businessName="Fixture Business"
      fallbackRating={4.9}
      fallbackReviewCount={237}
    />
    <GoogleReviewsBadge
      placeId="FIXTURE_PLACE_ID"
      businessName="Fixture Business"
      fallbackRating={4.9}
    />
  </body>
</html>
`,
	);

	step('install', () => run('npm', ['install', '--no-audit', '--no-fund'], appDir));

	const installedAstro = existsSync(join(appDir, 'node_modules', 'astro', 'package.json'))
		? JSON.parse(readFileSync(join(appDir, 'node_modules', 'astro', 'package.json'), 'utf8')).version
		: 'unknown';
	console.log(`  astro resolved to ${installedAstro}`);

	// Invoke the fixture's own binary, never npx: npx falls back to a cached astro
	// when the local install failed, which would turn a broken install into a pass.
	const astroBin = join(appDir, 'node_modules', '.bin', 'astro');

	step('astro binary present', () => {
		if (!existsSync(astroBin)) {
			throw new Error(`astro was not installed into the fixture (${astroBin})`);
		}
	});

	step('astro check', () => run(astroBin, ['check'], appDir));
	step('astro build', () => run(astroBin, ['build'], appDir));

	step('render', () => {
		const outPath = join(appDir, 'dist', 'index.html');

		if (!existsSync(outPath)) {
			throw new Error('no dist/index.html produced');
		}

		const html = readFileSync(outPath, 'utf8');
		const missing = [
			'4.9',
			'FIXTURE_PLACE_ID',
			'Fixture Business',
			'data-google-reviews-options',
			'data-google-reviews-state="fallback"',
		].filter(
			(needle) => !html.includes(needle),
		);

		if (missing.length) {
			throw new Error(`rendered html missing: ${missing.join(', ')}`);
		}

		// Guards the inline-script import regression that verify-dist.mjs also covers.
		if (/from\s+['"]\.\.\/\.\.\/lib\/utils\/reviewFormatting['"]/.test(html)) {
			throw new Error('inline script left a raw source-relative import in the rendered html');
		}
	});
} finally {
	rmSync(workDir, { recursive: true, force: true });
}

if (failed) {
	console.error(`\nConsumer verification FAILED for astro@^${major}.0.0`);
	process.exit(1);
}

console.log(`\nConsumer verification passed for astro@^${major}.0.0`);

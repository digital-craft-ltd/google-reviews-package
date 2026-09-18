# CI/CD Policy

## CI

Every pull request and every push to `main` or `codex/*` must pass the GitHub Actions `CI` workflow in `.github/workflows/ci.yml`.

The workflow validates the package with:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:dist`
- `npm pack --dry-run`
- `npm audit --omit=dev`

Both jobs run on a single pinned Node.js version (22.22) so runs are reproducible and the two matrices cannot drift apart. Astro dropped Node 20 in 6.1.0, so Astro 6 and 7 require Node >=22.12.0 and a mixed Node matrix cannot cover the full peer range.

A second `consumer` job builds a throwaway Astro app against every major in the `astro` peer range (`npm run verify:consumer -- <major>`) and asserts the components install, type-check, build, and render there. The package build copies `.astro` files verbatim rather than compiling them, so this job is the only thing that actually proves Astro compatibility.

Its matrix lists one leg per Astro major. (Astro dropped Node 20 in 6.1.0. Astro 6.0.x still advertises `^20.19.1` in its `engines` field, but its CLI rejects Node 20 at runtime, so npm's engine-aware resolution does not produce a working install either - which is why Node 20 is no longer in either matrix.) **Any major added to the `astro` peer range must be added to this matrix in the same change** - a peer range advertising an untested major is worse than a narrow one.

## Merge Policy

- Prefer pull requests over direct pushes to `main`.
- Do not merge while CI is red.
- Treat `typecheck`, `test`, `build`, and `pack` failures as release blockers.
- Treat production `npm audit` failures as blockers unless the failure is confirmed to be a false positive or a non-actionable upstream advisory.

## Release Policy

- Publish from `main` only after the CI workflow is green.
- Keep `prepublishOnly` intact so local and CI release flows both require a successful build and test run.
- Bump versions explicitly with SemVer and push the tag only after CI passes on the release commit.
- Confirm `npm whoami` resolves before publishing; npm session tokens expire and the failure otherwise surfaces only at `npm publish`.

## Enforcement Note

This repository currently cannot enable GitHub branch protection or rulesets through the API because GitHub returns a plan-level restriction for that feature on this private repo.

When the repository plan allows it, enable:

- required pull requests for `main`
- required status checks for the `CI` workflow
- restriction on direct pushes to `main`

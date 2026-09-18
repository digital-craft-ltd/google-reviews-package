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

The validation matrix runs on Node.js 20 and 22. The production dependency audit runs once on Node.js 20 to keep the signal high and avoid duplicate failures.

A second `consumer` job builds a throwaway Astro app against every major in the `astro` peer range (`npm run verify:consumer -- <major>`) and asserts the components install, type-check, build, and render there. The package build copies `.astro` files verbatim rather than compiling them, so this job is the only thing that actually proves Astro compatibility.

Its matrix is a list of explicit Node/Astro pairs rather than a cross product, because Astro 7 requires Node >=22.12.0 and has no Node 20 leg. **Any major added to the `astro` peer range must be added to this matrix in the same change** - a peer range advertising an untested major is worse than a narrow one.

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

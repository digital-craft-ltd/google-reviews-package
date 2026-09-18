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

A third `npm 12 install defaults` job installs npm 12 explicitly and runs the build. npm 12 turns dependency lifecycle scripts off by default; the other jobs use the Node-bundled npm, which ignores the `allowScripts` field entirely, so this job is the only thing that exercises it - and it does so on Linux, where prebuilt binaries differ from a local macOS tree.

`allowScripts` in `package.json` denies every install script in the tree (`esbuild`, `sharp`, `fsevents`). None of them are needed: all three ship prebuilt binaries via optional dependencies, and their install scripts are fallbacks. The entries are deliberately unpinned so a dependency bump does not silently reopen them as pending. If a future dependency genuinely needs its install script, that job fails and the entry should be added as `"<pkg>": true` with a note explaining why.

## Merge Policy

- Prefer pull requests over direct pushes to `main`.
- Do not merge while CI is red.
- Treat `typecheck`, `test`, `build`, and `pack` failures as release blockers.
- Treat production `npm audit` failures as blockers unless the failure is confirmed to be a false positive or a non-actionable upstream advisory.

## Release Policy

Releases publish through **trusted publishing** (GitHub Actions OIDC) in `.github/workflows/release.yml`. There is no npm token in the repository, in CI secrets, or on any maintainer machine: npm verifies the workflow's OIDC claims against the trusted publisher configured on the package and mints a short-lived credential for that one publish.

This is not only a hardening measure. The maintainer account uses a **passkey** for 2FA, and npm's CLI publish prompt accepts only a TOTP code or a 64-character hex token - it has no WebAuthn flow (`lib/utils/read-user-info.js` validates against `/^[\d ]+$|^[A-Fa-f0-9]{64,64}$/`). A local `npm publish` therefore cannot be completed interactively at all. CI is the only publishing path.

To cut a release:

- Publish from `main` only after the CI workflow is green.
- Bump the version explicitly with SemVer and merge it to `main`.
- Tag the release commit and push the tag: `git tag v1.2.3 && git push origin v1.2.3`.
- The `Release` workflow verifies the tag matches `package.json`, typechecks, and publishes. A tag that disagrees with `package.json` fails the run rather than publishing an unexpected version.
- Keep `prepublishOnly` intact; it runs build, `verify:dist`, and the test suite as the final gate inside the publish step.

### Trusted publisher configuration

Configured once on npmjs.com, under the package's Settings, and it must match the workflow exactly:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `Davidiborra` |
| Repository | `google-reviews-package` |
| Workflow filename | `release.yml` |
| Environment | *(leave empty)* |
| Allowed actions | **must include `npm publish`** |

**The `Allowed actions` field matters.** Trusted publisher configurations created after 2026-09-03 default to allowing `npm stage publish` only. If direct publishing is not explicitly permitted, `release.yml` fails even with everything else correct. Either enable direct `npm publish`, or switch the workflow's publish step to `npm stage publish` and approve each release on npmjs.com.

If the workflow file is ever renamed, or an `environment:` is added to the publish job, the npm-side configuration must be updated in the same change or every release will fail with an OIDC claim mismatch.

Requirements, both checked by the workflow: trusted publishing needs **npm >= 11.5.1** and **Node >= 22.14.0**. Node 22.22 clears the Node floor but bundles npm 10.9.x, which has no OIDC support, so the workflow installs npm 12 before publishing.

### Diagnosing a failed release

`npm error code E404 ... PUT https://registry.npmjs.org/dc-google-reviews` at the publish step means npm did **not** authenticate via OIDC and fell back to a token. The npm CLI tries OIDC first and only falls back, so a 404 here almost always means the trusted publisher is missing, its claims do not match the workflow, or direct `npm publish` is not among its allowed actions - not that the workflow is broken. `actions/setup-node` with `registry-url` always sets a placeholder `NODE_AUTH_TOKEN`; that is expected and is not the cause.

## Enforcement Note

This repository currently cannot enable GitHub branch protection or rulesets through the API because GitHub returns a plan-level restriction for that feature on this private repo.

When the repository plan allows it, enable:

- required pull requests for `main`
- required status checks for the `CI` workflow
- restriction on direct pushes to `main`

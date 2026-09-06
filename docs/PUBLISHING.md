# Publishing Axiom Worksheet

Live application: https://wieslawsoltes.github.io/AxiomWorksheet/

Source: https://github.com/wieslawsoltes/AxiomWorksheet

## Repository layout

`main` holds the editable source, tests, examples, architecture notes and the reproducible standalone HTML. `gh-pages` holds only the generated static site and example worksheets. There are no runtime package or CDN dependencies.

## Automatic deployment

Every push to `main` runs `.github/workflows/pages.yml`:

1. Rebuild the standalone HTML and run all Node tests with Node 22.
2. Package `dist/index.html`, `.nojekyll`, example worksheets and a source revision marker.
3. Read the repository's existing Pages configuration. Branch-based Pages updates `gh-pages` without force-pushing and explicitly requests a Pages build. Actions-based Pages deploys the same artifact with the official deploy-pages action and a short-lived OIDC token.
4. Fetch the HTTPS application and compare the actual served HTML byte-for-byte with the validated build. A deployment is not marked verified unless the content matches.

No personal access token, external hosting service or long-lived deployment secret is required. The build uses read-only repository access; the branch-publishing job has only contents/pages write permission, while the Actions-publishing job has pages/id-token write permission. Deployments are serialized.

The current branch-based source is `gh-pages` at `/`. The workflow also supports switching the repository's Settings > Pages source to GitHub Actions. It never changes repository administration settings itself.

## Continuous integration

`.github/workflows/ci.yml` builds and runs Node tests on pushes and pull requests. It also serves the app from a real localhost origin and runs the existing Chromium integration suite, publishing screenshots and JSON diagnostics as a workflow artifact. Chromium uses explicitly requested software-GPU flags; this is not a hardware-performance benchmark. Browser downloads remain verified via an export-payload harness, not an operating-system dialog test.

The first successful default-branch browser run restores the screenshot assets and records its diagnostics separately in `docs/github-browser-validation.json`. The original sandbox evidence in `docs/browser-validation.json` and `docs/VALIDATION.md` is preserved. Subsequent CI runs keep evidence as workflow artifacts instead of continually modifying the repository.

## Local commands

```sh
npm run validate
python3 -m http.server 8080 --bind 127.0.0.1
```

For browser tests, install `playwright==1.55.0`, run `python3 -m playwright install chromium`, then run `python3 tests/browser_e2e.py` against the local server. `AXIOM_BASE_URL` selects another origin. The normal browser run reports the renderer and worker backend actually used.

## Deployment troubleshooting

Use the workflow logs and final verification job rather than assuming a branch push means the site is live. Branch-based Pages builds are requested explicitly because pushes made with the workflow's GitHub token do not themselves trigger another Pages workflow. Keep `gh-pages` free of hand-edited application files; edit `src/`, run `npm run build`, and commit both source and generated standalone HTML to `main`.

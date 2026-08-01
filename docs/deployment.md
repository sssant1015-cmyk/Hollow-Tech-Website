# Hollow Tech Frontend Deployment

This provider-neutral guide prepares the static website and Rafael public beta
for deployment. The production API URL is intentionally not committed because
the hosted API origin has not been selected.

## Production inputs

Choose the final HTTPS website origin and HTTPS Rafael API origin. Configure the
backend with the website's exact origin in `RAFAEL_PUBLIC_ALLOWED_ORIGINS`; do
not use `*`. The frontend contains no API key or provider credential.

Set the API origin only for the build process:

```powershell
$env:RAFAEL_API_BASE_URL = "https://api.your-domain.example"
node scripts/build-production.js
```

The value must be an HTTPS origin with no path, query, credentials, or loopback
host. A missing or unsafe value stops the build. The script creates `dist/`,
generates its production-only `rafael-public-config.js`, replaces the Rafael
page's `connect-src` origin, emits `_headers`, and verifies that the artifact has
no localhost fallback, Windows path, placeholder, provider key name, test file,
or unsafe CSP directive.

## Deployable artifact

Publish only the contents of `dist/`. Do not publish repository tests, scripts,
documentation, or the development `rafael-public-config.js`. A static host can
serve the artifact without a Node.js runtime.

The generated `_headers` file is understood by several static hosts. On a host
that does not support it, configure the same headers at its edge. CSP meta tags
provide a browser baseline, but `frame-ancestors` and the remaining HTTP-only
protections require response headers. GitHub Pages does not apply repository
custom-header files, so use a header-capable CDN or static host when those
response headers are required.

No canonical URL or `og:url` is emitted until the final public domain is known.
Add those only after choosing the permanent website URL.

## Pre-deployment verification

Run the automated frontend suite and build:

```powershell
node --test tests/*.test.js
$env:RAFAEL_API_BASE_URL = "https://api.your-domain.example"
node scripts/build-production.js
```

Serve `dist/` from an HTTP server rather than opening files directly. With the
production API configured to allow the test website origin, confirm:

1. `index.html` and `rafael.html` load with no console errors.
2. The Rafael status becomes **Ready** only after both `GET /health` and
   `GET /ready` succeed.
3. Chat, clear-session, feedback, `429 Retry-After`, and safe error messages work.
4. A backend restart turns an expired session into a visible new-session state.
5. The contact form targets Formspree and the support link targets Ko-fi.
6. Keyboard navigation, focus visibility, reduced motion, and widths 320, 375,
   768, and 1024 pixels remain usable.
7. Response headers match `dist/_headers` and the browser reports no CSP errors.

## Backend coordination and rollback

Deploy the backend as one instance and one worker while sessions and rate limits
remain in memory. Verify `/health`, then `/ready`, before directing users to the
beta. The backend exposes only `X-Request-ID` and `Retry-After` to the configured
frontend origin and applies a 16 KiB request-body limit, 15-second provider
timeout, 30 chat requests per 60 seconds, and 10 feedback requests per 60 seconds.

For rollback, retain the previous immutable frontend artifact and backend image.
Restore both known-good releases, verify health/readiness and exact CORS origins,
then repeat the browser smoke test. Temporary sessions are not migrated.

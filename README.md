# Hollow Technologies Website

The Rafael public beta page is a static frontend that connects to the restricted
Rafael public API. It does not contain API keys, authentication state, provider
selection, conversation persistence, or privileged controls.

## Local development

Start the API from the parent `Rafael_Reboot` repository. CORS is fail-closed, so
the exact website origin must be configured before the server starts:

```powershell
cd C:\path\to\Rafael_Reboot
$env:RAFAEL_PUBLIC_ALLOWED_ORIGINS = "http://127.0.0.1:5500"
py -m uvicorn web.api:create_app --factory --host 127.0.0.1 --port 8000
```

In another terminal, start the static website from this repository:

```powershell
cd C:\path\to\Hollow-Tech-Website
py -m http.server 5500 --bind 127.0.0.1
```

Open <http://127.0.0.1:5500/rafael.html>. Using `localhost` instead of
`127.0.0.1` creates a different origin; if you change the website URL, update
`RAFAEL_PUBLIC_ALLOWED_ORIGINS` to that exact origin rather than using a
wildcard.

## Frontend configuration

Public, non-secret settings live in `rafael-config.js`. The development API is
configured as `http://127.0.0.1:8000`. Replace `apiBaseUrl` when a production API
origin is available. Real API mode is the default and never falls back to mock
answers after a failed request.

For frontend-only development, open:

```text
http://127.0.0.1:5500/rafael.html?mock=1
```

Mock replies are visibly identified in the status and response text. Add
`&dev=1` to expose visual failure-state controls. Mock mode is for local UI work
only, is restricted to `localhost` and `127.0.0.1`, and uses the same client
interface as live mode. Set `allowDevelopmentMockQuery` to `false` for a
production configuration as an additional defense in depth.

## Synchronized public limits

The frontend mirrors these backend constants:

| Frontend setting | Value | Backend source |
| --- | ---: | --- |
| `maxMessageLength` | 2048 | `public.models.PUBLIC_SERVICE_LIMITS` |
| `maxFeedbackLength` | 2000 | `public.feedback.FEEDBACK_LIMITS` |
| `maxFeedbackContactLength` | 254 | `public.feedback.FEEDBACK_LIMITS` |
| Session ID shape | 32–64 URL-safe characters | `public.models.PUBLIC_SERVICE_LIMITS` |

The API timeout is 15 seconds in `web.settings.WebSettings`; the browser timeout
is deliberately 20 seconds so the API has time to return its sanitized 503
response first. The initial health check retries once after five seconds. A
browser cooldown honors `Retry-After` up to 60 seconds, matching the API's
default rate-limit window. Default API policies are 30 chat requests and 10
feedback requests per 60 seconds.

## Sessions and beta limitations

- The first successful `/chat` response supplies the opaque session ID.
- Only that ID is stored in `sessionStorage`; messages are never stored locally.
- Refreshing the same tab keeps the server session ID but resets visible chat.
- Closing the tab discards browser session storage.
- Clear chat requests `/session/clear`, removes the local ID even if the network
  request fails, and resets the visible conversation.
- Server sessions expire after 30 idle minutes and are limited to six turns.
- Sessions and feedback are held in bounded server memory and disappear when the
  API process restarts.

## Safe connection test

1. Confirm `/health` changes the page status from **Connecting** to **Ready**.
2. Send `help`, `version`, `calculate 2 + 2`, and an ordinary question.
3. Refresh the page and confirm the session indicator remains abbreviated while
   visible messages reset.
4. Clear chat and confirm the session indicator returns to **No server session
   yet**.
5. Submit feedback without contact permission and verify no contact field is
   included in the request.
6. Inspect browser storage: it should contain at most
   `rafael_public_beta_session`, never conversation text.

Run the frontend client tests with the bundled or system Node.js runtime:

```powershell
node --test tests/rafael-api.test.js
```

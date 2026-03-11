# Spike

Last updated: 2026-03-11

This file tracks the active spike for Linux support of Codex web extras.

## Goal

Figure out a Linux implementation path for:

- automatic browser cookie extraction for `chatgpt.com` / `openai.com`
- cookie validation against the signed-in Codex/OpenAI account
- identifying whether the Codex usage dashboard can be fetched through direct HTTP endpoints or requires a browser-rendered path

## Scope

This spike is investigative.

Production code should not be added from this track yet.
Experimental code and scripts live under `skipe/`.

## What we know

- Upstream CodexBar auto-import is macOS-only.
- Upstream validates cookie candidates through:
  - `https://chatgpt.com/backend-api/me`
  - `https://chatgpt.com/api/auth/session`
- Upstream then uses WebKit to probe and scrape `https://chatgpt.com/codex/settings/usage`.
- The upstream dashboard fetch is not a plain static HTML scrape; it waits for SPA hydration and may need scrolling for credits history.

## Main unknowns

- how to read Firefox cookies reliably on Linux in this repo
- how to read and decrypt Chromium-family cookies on Linux in this repo
- whether the dashboard data we need is available from direct HTTP/JSON endpoints
- whether Linux will require a browser automation fallback for the dashboard path

## Current work items

- [ ] enumerate Linux cookie-store locations for Firefox and Chromium-family browsers
- [ ] validate OpenAI session endpoints with a real cookie header
- [ ] inspect the Codex usage page response with a valid cookie header
- [ ] determine whether direct JSON endpoints exist for:
  - code review remaining
  - usage breakdown
  - credits history
  - purchase URL
- [ ] decide whether Linux implementation should be:
  - direct HTTP only
  - HTTP + headless browser fallback

## Verified findings

### Linux cookie extraction

- common Chromium-family cookie stores were found on this machine under:
  - `~/.config/google-chrome/Default/Cookies`
  - `~/.config/chromium/Default/Cookies`
  - `~/.config/BraveSoftware/Brave-Browser/Default/Cookies`
- Firefox cookie store was found on this machine under:
  - `~/.config/mozilla/firefox/66ayacls.default-release/cookies.sqlite`
- Chromium-family OpenAI cookies in these stores use encrypted values with the `v11` prefix
- the local cookie DB version is `24`
- in this environment, Linux Chromium decryption works by:
- in this environment:
- Linux Chrome, Chromium, and Brave decryption all work by:
  - reading the SQLite cookie DB
  - retrieving the safe-storage secret from `secret-tool`
  - deriving the AES key with the Chromium Linux PBKDF2 flow
  - decrypting cookie values
  - stripping the version-24 SHA-256 domain digest prefix from decrypted plaintext
- Linux Firefox cookie extraction works by:
  - reading `cookies.sqlite`
  - using the plain `value` column directly for ChatGPT/OpenAI cookies on this machine

### Session validation

- extracted Firefox, Chrome, Chromium, and Brave cookies successfully authenticate against:
  - `https://chatgpt.com/backend-api/me`
  - `https://chatgpt.com/api/auth/session`
- `api/auth/session` returns the signed-in email for this account
- `api/auth/session` also returns a bearer access token and account id usable for follow-up API calls

### Dashboard shell

- fetching `https://chatgpt.com/codex/settings/usage` with the extracted cookies returns a logged-in HTML shell
- the HTML includes `client-bootstrap` with account/session metadata
- the initial HTML does not contain the actual usage widgets we need
- this confirms the visible dashboard metrics are hydrated after the initial document response

### Hydration endpoints

- the route bundles point to these Codex usage APIs:
  - `GET /wham/usage`
  - `GET /wham/usage/credit-usage-events`
  - `GET /wham/usage/daily-token-usage-breakdown`
  - `GET /wham/usage/daily-enterprise-token-usage-breakdown`
  - `GET /wham/usage/approximate-credit-usage?credit_amount=...`
- the real callable path is `https://chatgpt.com/backend-api/wham/...`
- direct `https://chatgpt.com/wham/...` requests returned the HTML app shell with `404`, so that path is not the correct Linux fetch target for this spike
- `backend-api/wham` endpoints returned the same result for Firefox, Chrome, Chromium, and Brave on this machine:
  - `401` with cookies only
  - `200` with cookie-derived bearer token for:
    - `/backend-api/wham/usage`
    - `/backend-api/wham/usage/credit-usage-events`
    - `/backend-api/wham/usage/daily-token-usage-breakdown`
    - `/backend-api/wham/usage/approximate-credit-usage`
  - `403` for `/backend-api/wham/usage/daily-enterprise-token-usage-breakdown` on this account

### Response-shape summary

- `/backend-api/wham/usage` includes:
  - identity fields like `user_id`, `account_id`, `email`, `plan_type`
  - `rate_limit`
  - `code_review_rate_limit`
  - `additional_rate_limits`
  - `credits`
  - `promo`
- `/backend-api/wham/usage/credit-usage-events` currently returned `data: []` for this account
- `/backend-api/wham/usage/daily-token-usage-breakdown` returned `data` with 30 daily rows plus `units`
- `/backend-api/wham/usage/approximate-credit-usage` returned `approx_local_messages` and `approx_cloud_messages`

## Current conclusion

The Linux implementation path is now clear enough for the first Codex web-extras slice:

1. Extract Chromium cookies locally on Linux.
2. Validate the session through `api/auth/session`.
3. Derive the bearer access token and account id from that session response.
4. Fetch Codex usage data from `https://chatgpt.com/backend-api/wham/...`.
5. Use the HTML usage page only as a fallback/source for session/account bootstrap, not as the primary data source.

## Remaining unknowns

- Chromium extraction is only validated on this Linux machine and browser setup
- we have not yet confirmed whether purchase URL and any remaining credits-history details are fully available from `backend-api/wham` or still require DOM/browser fallback
- we have not yet validated behavior for business / enterprise / multi-workspace accounts

## Artifacts

- experimental scripts: `skipe/`
- upstream references:
  - `.repositories/CodexBar/docs/codex.md`
  - `.repositories/CodexBar/Sources/CodexBarCore/OpenAIWeb/OpenAIDashboardBrowserCookieImporter.swift`
  - `.repositories/CodexBar/Sources/CodexBarCore/OpenAIWeb/OpenAIDashboardFetcher.swift`

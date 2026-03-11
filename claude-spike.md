# Claude Spike

Last updated: 2026-03-11

This file tracks the active spike for Linux Claude web-session import and API validation.

## Goal

Figure out a Linux implementation path for:

- automatic browser cookie extraction for `claude.ai`
- extracting a valid `sessionKey` from supported browsers
- validating that the extracted session can call the same direct Claude APIs used by CodexBar

## Scope

This spike is investigative.

Production code should not be added from this track yet.
Experimental code and scripts live under `skipe/`.

## What we know

- Upstream CodexBar Claude web support is simpler than Codex web extras.
- The required browser cookie is `sessionKey` for `claude.ai`.
- Upstream CodexBar calls direct JSON APIs, not a browser-hydrated dashboard:
  - `GET https://claude.ai/api/account`
  - `GET https://claude.ai/api/organizations`
  - `GET https://claude.ai/api/organizations/{orgId}/usage`
  - `GET https://claude.ai/api/organizations/{orgId}/overage_spend_limit`
- Our local runtime already has a Claude web API path, but it does not yet auto-import browser cookies on Linux.

## Main unknowns

- whether Linux browser cookie extraction is equally viable for Claude across Firefox and Chromium-family browsers
- whether `sessionKey` alone is sufficient for the direct API calls on this machine
- whether any endpoint behaves differently across browser-sourced sessions

## Current work items

- [x] extract `sessionKey` from Firefox on Linux
- [x] extract `sessionKey` from Chrome on Linux
- [x] extract `sessionKey` from Chromium on Linux
- [x] extract `sessionKey` from Brave on Linux
- [x] validate `api/account`
- [x] validate `api/organizations`
- [x] validate `api/organizations/{orgId}/usage`
- [x] validate `api/organizations/{orgId}/overage_spend_limit`

## Verified findings

### Linux cookie extraction

- Chrome, Chromium, and Brave all store Claude cookies in their Chromium-family `Cookies` SQLite DBs on this machine.
- For those Chromium-family browsers, Linux extraction works through the same mechanism already validated in the Codex spike:
  - read the cookie DB
  - retrieve the safe-storage secret with `secret-tool`
  - derive the AES key with the Chromium Linux PBKDF2 flow
  - decrypt `v11` cookie values
  - strip the DB-version-24 SHA-256 domain digest prefix
- Firefox stores Claude cookies in `cookies.sqlite` under `~/.config/mozilla/firefox/...` on this machine.
- Firefox Claude cookies were readable from the plain `value` column on this machine.
- All four validated browsers had a usable `sessionKey` for `claude.ai`:
  - Chromium
  - Chrome
  - Firefox
  - Brave

### API validation

- `sessionKey` alone is sufficient for the direct Claude web API calls on this machine.
- The following endpoints returned `200` for Chromium, Chrome, Firefox, and Brave:
  - `GET https://claude.ai/api/account`
  - `GET https://claude.ai/api/organizations`
  - `GET https://claude.ai/api/organizations/{orgId}/usage`
  - `GET https://claude.ai/api/organizations/{orgId}/overage_spend_limit`

### Response-shape notes

- `GET /api/account` includes the account email under `email_address`, not `email`.
- `GET /api/organizations` returned an array with two org-like entries on this account.
- The first organization entry included a UUID-style identifier and a user-facing organization name.
- `GET /api/organizations/{orgId}/usage` returned keys including:
  - `five_hour`
  - `seven_day`
  - `seven_day_opus`
  - `seven_day_sonnet`
  - `extra_usage`
- `GET /api/organizations/{orgId}/overage_spend_limit` returned structured account and spend-limit fields including:
  - `account_email`
  - `account_name`
  - `account_uuid`
  - `currency`

## Current conclusion

The Linux Claude implementation path is now clear enough for a first parity slice:

1. Reuse the Linux browser-cookie extraction layer across Firefox and Chromium-family browsers.
2. Extract only the `sessionKey` cookie for `claude.ai`.
3. Call the direct Claude APIs with `Cookie: sessionKey=<value>`.
4. Treat browser-specific work as cookie acquisition only; the Claude API path is shared after that.

## Remaining unknowns

- This validation is still from one Linux machine and one account shape.
- I have not yet validated business / enterprise-specific differences in the Claude organization and usage payloads.
- I have not yet checked whether multi-org selection needs account matching or org-selection heuristics beyond "first valid organization".

## Artifacts

- experimental scripts: `skipe/`
- upstream references:
  - `.repositories/CodexBar/docs/claude.md`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeWeb/ClaudeWebAPIFetcher.swift`

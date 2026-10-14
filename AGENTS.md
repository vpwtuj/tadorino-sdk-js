# Tadorino JavaScript SDK

Read `README.md`, `src/index.js` and `docs/guides/` before changing the SDK.
This repository publishes `@bright203/tadorino-sdk-js`; the consuming application
owns its login, token storage and refresh. The SDK calls only the public memo API.

## Development

- Runtime is JavaScript with JSDoc. React/TypeScript and Express are examples.
- Keep ESM and CommonJS behavior equivalent and declaration entry points correct.
- Edit source comments and Markdown; generate HTML and declarations rather than
  editing generated files.
- Keep the server's independently generated OpenAPI snapshot in `tests/fixtures/`.
  A parent integration verifies its hash. Do not duplicate server/DB/Auth0 code.
- Preserve original memo content and result order. Drop unknown response fields;
  reject unknown request fields. Never introduce implicit retries or new save keys.
- Bind each access-token callback to one user. Never share mutable token state.
- Cancellation/deadlines cover token retrieval, request and response streaming.
- Errors must not contain raw exceptions, tokens, memo content or arbitrary URLs.
- Examples must retain the initial save key and payload on an uncertain result.

## Verification

```sh
npm ci
npm run check
npx playwright install chromium firefox webkit
npm run browser:check
```

`check` includes declarations, documentation, tests and fresh consumer installations
from one tarball. Browser checks use an explicitly synthetic fixture.
Report actual tested versions and failures; WebKit is not proof of actual Safari.
Real Auth0, public REST, npm and Pages require separate verification.

## Distribution

- MIT copyright holder: BRIGHT203 Co., ltd.
- Commit source/lock/config/tests only. Exclude `.env`, tokens, real memos,
  generated bundles/sites and verification artifacts.
- Release tag, npm version and versioned documentation must match.
- Configure npm trusted publishing for this repository and `release.yml` before
  using that workflow. Do not place long-lived registry tokens in the repository.
- A parent repository pins this SDK by gitlink; normal checks never use `--remote`.

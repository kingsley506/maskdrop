# Contributing to MaskDrop

Thanks for helping make sharing snippets easier to review.

## Start locally

Use Node.js 22 or newer. The project has no dependencies, and serving the source app requires no build step.

```sh
node --test
node scripts/serve.js
```

Open `http://localhost:4173` to check browser changes.

To generate the optional standalone app, run `node scripts/build-standalone.js` and open `dist/maskdrop.html`. Check both the source app and standalone app when changing browser code.

## Useful contributions

- A missed pattern or false positive, demonstrated with entirely fictional data.
- Clearer finding explanations and more accessible keyboard interactions.
- Focused regression tests for detection, overlap handling, exports, or CLI behavior.
- Documentation corrections and translations.

For a larger feature, open an issue first to discuss the use case. Keep pull requests focused and describe the behavior before and after your change, how you checked it, and any tradeoffs.

## Detection changes

Patterns affect both the browser and CLI. Include a realistic fictional positive example and a harmless near-match when useful. Check that replacement boundaries preserve surrounding text, repeated values stay consistent, and overlapping findings do not reveal part of a value. Avoid expensive patterns that can hang on large input.

Do not label the result “safe” or claim complete detection. New rules need honest descriptions and documented limitations.

## Privacy rules

Never include real credentials, customer information, private logs, or internal hostnames in issues, tests, screenshots, commits, or pull requests. Replace them with fictional equivalents before submitting. Do not add analytics, remote processing, external scripts, or persistence of original input as an incidental dependency or convenience.

If you think you found a vulnerability in MaskDrop itself, follow [SECURITY.md](SECURITY.md) rather than posting exploit details publicly.

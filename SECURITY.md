# Security policy

## What MaskDrop does

MaskDrop looks for common secret and personal-data patterns in text and lets a user review replacements. It runs in the browser or a local Node process. There is no server-side processing or intended remote transmission of input, and the browser app does not intentionally persist original text.

The hosted application still requires trust in the code delivered by its host. For sensitive inputs, use a local copy and inspect the source before supplying data. The host receives ordinary page requests, and external links navigate away from the app.

## Boundaries

- Detection is heuristic, incomplete, and subject to false positives.
- A clean-looking preview is not evidence that all sensitive information was removed.
- User-selected **keep** decisions intentionally retain original values in exports.
- Private names, business context, encoded values, uncommon token formats, and other unknown patterns may remain.
- MaskDrop does not scan repository history, rotate credentials, revoke access, inspect PDFs or images, or provide a formal data-loss-prevention system.
- Clipboard history, browser extensions, developer tools, screenshots, compromised devices, and software outside MaskDrop can expose input or output.

Review the entire processed result before sharing it. If a real credential has already been exposed, revoke or rotate it through its issuing service; masking a later copy does not undo that exposure.

## Report a vulnerability

Use GitHub's private vulnerability reporting, if available, from the repository's [Security page](https://github.com/kingsley506/maskdrop/security). Submit only fictional proof-of-concept data. Do not include live credentials or someone else's personal information.

If private reporting is unavailable, open an issue titled “Private security contact requested” without vulnerability details or sensitive data so the maintainer can arrange a private channel.

A missed detection pattern using fictional text can normally be reported as a bug. Report it privately when it reveals an exploitable flaw in the application itself, such as input being transmitted or rendered as executable content.

Only the latest release is supported. This is a community project with no promised response time or security warranty.

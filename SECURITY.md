# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.2.5   | Yes       |
| < 1.2.5 | No        |

Fixes land on the latest minor release. Please upgrade before reporting an issue
against an older version.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately through GitHub:

1. Go to <https://github.com/0trebor0/buildhtml/security/advisories/new>
2. Describe the issue, the affected version, and how to reproduce it.

If private advisories are unavailable to you, email **webdevme@outlook.com** with
`buildhtml security` in the subject.

Please include:

- The version of `@trebor/buildhtml` and of Node.js.
- A minimal reproduction — ideally a short script that renders a document and
  shows the unexpected output.
- What an attacker gains: the rendered HTML, attribute, CSS, or compiled
  JavaScript that escapes its context.

You should get an acknowledgement within 7 days. Please allow up to 90 days for a
fix before public disclosure, and expect credit in the release notes unless you
would rather not be named.

## What is in scope

This library's job is to render untrusted data into HTML safely. The security
boundary is `lib/utils.js`, and the following are the guarantees worth testing:

- **HTML escaping** — text and attribute values cannot introduce markup or close
  the attribute they sit in.
- **URL sanitisation** — `href`, `src`, `action`, `formaction`, `cite`, `poster`,
  and `xlink:href` cannot carry an executable scheme (`javascript:`, `vbscript:`,
  `data:`), including through control characters, leading whitespace, or case.
- **CSS sanitisation** — a value cannot terminate its declaration, open a block,
  escape a `<style>` element, or reach `expression()` / `url(javascript:)`.
- **Attribute keys** — inline event handler attributes (`onclick`, and the
  camelCase form `onClick` that kebab-cases to `on-click`) are never emitted.
  Events compile to `addEventListener` instead.
- **Callback serialisation** — handler source is captured at registration and
  screened for dangerous patterns. Serialised context is JSON-encoded so it cannot
  break out of the compiled script.
- **JSON and JS embedding** — `<` and the U+2028/U+2029 separators are escaped so
  embedded data cannot close a `<script>` element.

A report that shows any of these failing is a vulnerability.

## What is not in scope

- `appendUnsafe()`, `raw()`, `rawHead()`, `inlineScript()`, and the `html` field
  in builder definitions insert raw markup **by design**. They are documented as
  unsafe and are your responsibility to sanitise. Passing attacker-controlled
  data to them is not a library vulnerability.
- Application-level issues in your own callbacks. Serialised callbacks run in the
  browser with full page privileges; the library screens for known-dangerous
  patterns but does not sandbox your code.
- Content Security Policy configuration. The library supports nonces
  (`new Document({ nonce })`); choosing and enforcing a policy is yours.
- Denial of service from deliberately enormous documents.

## Verifying a release

Releases from 1.2.5 are published to npm with provenance from the `release`
workflow. Check the attestation with:

```bash
npm audit signatures
```

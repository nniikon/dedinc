# Toolchain staging

This directory contains generated compiler payloads during packaging. Only this
README is tracked.

- `win32-x64/` is a staged MSYS2 UCRT64 GCC 16.2 toolchain. Its include root
  also contains the pinned TXLib single-header graphics library.
- `darwin-arm64` has no payload; DedInC invokes Apple Command Line Tools through
  `xcrun`.

Run the matching preparation script, then:

```sh
pnpm package:platform -- win32-x64
```

The packaging command rejects missing or unrelated payloads so a VSIX cannot
silently contain the wrong compiler.

The Windows staging script downloads TXLib at the revision and checksum recorded
in `toolchains.lock.json`. It requires `curl`, which the release workflow installs.

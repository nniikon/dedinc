# DedInC — Run C/C++ Code in VS Code

DedInC compiles and runs the active C or C++ source file with one click. Program
input and output remain in VS Code's integrated terminal.

## Supported platforms

| Platform | Compiler |
| --- | --- |
| Windows x64 | Bundled GCC/MinGW-w64 `g++` |
| macOS ARM64 | Apple `clang++` from Command Line Tools |

Installations from the VS Code Marketplace automatically receive the matching
platform package. On macOS, DedInC opens Apple's Command Line Tools installer on
the first run if necessary. Complete that installation and click Run again.

Both `.c` and `.cpp` files are intentionally compiled as C++.

## Usage

1. Open a `.c` or `.cpp` file.
2. Click **Run C/C++ Code** in the editor toolbar.
3. Use the DedInC task terminal for program input and output.

The generated program is `_run_DedInC.exe` on Windows and `_run_DedInC` on
macOS, alongside the source file.

## Compiler flags

Set `dedinc.compilerFlags` at user, workspace, or workspace-folder scope. Each
array entry is passed as exactly one compiler argument, so flags containing
spaces do not require shell escaping.

```json
{
  "dedinc.compilerFlags": ["-Wall", "-Wextra", "-g", "-std=c++23"]
}
```

The default is `-Wall`, `-Wextra`, and `-g`. Set the value to `[]` to pass no
optional flags. The configured array replaces the defaults rather than being
appended to them.

## Development and packaging

```sh
pnpm install
pnpm test
pnpm package:platform -- darwin-arm64
```

Windows packages require the generated directory under `toolchains/`. See
[toolchains/README.md](toolchains/README.md). Release builds
are defined in `.github/workflows/release-platforms.yml`.

## Current limitations

- Only Windows x64 and macOS ARM64 are supported.
- DedInC compiles one active source file; it does not replace a multi-file build
  system such as CMake or Make.
- Unsaved editor changes are not compiled until the file is saved.

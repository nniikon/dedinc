# Change Log

All notable changes to the "dedinc" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Restored Linux x64 support using an existing `g++` from `PATH`, without installing or bundling a Linux toolchain.

## [1.1.3]

- Included the TXLib single-header graphics library in the Windows x64 package.
- Added Windows packaging smoke tests for compiling and linking `#include <TXLib.h>`.

## [1.1.2]

- Kept student-facing compiler errors separate from detailed diagnostic logs.
- Fixed running compiled programs when a file is opened without a workspace folder.

## [1.1.1]

- Fixed bundled GCC subprocess and DLL lookup when running from VS Code on Windows.
- Added detailed compiler failure diagnostics and a **Show Diagnostics** action.
- Added a native Windows smoke test for the staged compiler toolchain.

## [1.1.0]

- Added Windows x64 and macOS ARM64 compiler resolution.
- Added bundled GCC platform packaging for Windows.
- Added automatic Apple Command Line Tools setup on macOS.
- Added configurable `dedinc.compilerFlags` with learning-friendly defaults.
- Renamed the extension to DedInC for the standalone fork.
- Replaced shell command construction with safe process argument arrays.

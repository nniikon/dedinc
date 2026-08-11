#!/usr/bin/env bash
set -euo pipefail

# Run inside an MSYS2 UCRT64 shell after installing
# mingw-w64-ucrt-x86_64-gcc. Copying the UCRT prefix keeps GCC's compiler,
# headers, linker, standard library, and runtime DLLs together.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
destination="$repo_root/toolchains/win32-x64"
expected_version=16.1.0-5
installed_version=$(pacman -Q mingw-w64-ucrt-x86_64-gcc | awk '{print $2}')
if [[ "$installed_version" != "$expected_version" ]]; then
	echo "Expected mingw-w64-ucrt-x86_64-gcc $expected_version, found $installed_version." >&2
	echo "Update toolchains.lock.json deliberately before changing the compiler payload." >&2
	exit 1
fi
mkdir -p "$destination"
cp -a /ucrt64/. "$destination/"
"$destination/bin/g++.exe" --version
smoke_dir=$(mktemp -d)
trap 'rm -rf "$smoke_dir"' EXIT
printf '#include <iostream>\nint main() { std::cout << "DedInC"; }\n' > "$smoke_dir/smoke.cpp"
"$destination/bin/g++.exe" "$smoke_dir/smoke.cpp" -o "$smoke_dir/smoke.exe" -static-libgcc -static-libstdc++
[[ "$("$smoke_dir/smoke.exe")" == "DedInC" ]]

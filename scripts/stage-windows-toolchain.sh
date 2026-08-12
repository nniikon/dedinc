#!/usr/bin/env bash
set -euo pipefail

# Run inside an MSYS2 UCRT64 shell after installing
# mingw-w64-ucrt-x86_64-gcc. Copying the UCRT prefix keeps GCC's compiler,
# headers, linker, standard library, and runtime DLLs together.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
destination="$repo_root/toolchains/win32-x64"
expected_version=16.2.0-3
installed_version=$(pacman -Q mingw-w64-ucrt-x86_64-gcc | awk '{print $2}')
if [[ "$installed_version" != "$expected_version" ]]; then
	echo "Expected mingw-w64-ucrt-x86_64-gcc $expected_version, found $installed_version." >&2
	echo "Update toolchains.lock.json deliberately before changing the compiler payload." >&2
	exit 1
fi
mkdir -p "$destination"
cp -a /ucrt64/. "$destination/"

# Install a pinned TXLib header into the bundled compiler's system include root.
# Keep these values in sync with toolchains.lock.json.
txlib_commit=adc8f17ae8c8601b9b555fbc8d4d2c09c6b9ff85
txlib_header_sha256=a49b54506850572334f6c2e8e67fd9702ba0ed6998b4badf2ce8cad62dcd9b82
txlib_license_sha256=ee2e8e7864753f7531075f471bfc69bd746305c8f5b66783e9c3c05f646f0761
txlib_header="$destination/include/TXLib.h"
txlib_license="$destination/share/licenses/txlib/License.txt"
mkdir -p "$(dirname "$txlib_license")"
curl --fail --location --retry 3 --silent --show-error \
	"https://raw.githubusercontent.com/ded32/TXLib/$txlib_commit/TXLib.h" \
	--output "$txlib_header"
curl --fail --location --retry 3 --silent --show-error \
	"https://raw.githubusercontent.com/ded32/TXLib/$txlib_commit/License.txt" \
	--output "$txlib_license"
printf '%s  %s\n' "$txlib_header_sha256" "$txlib_header" | sha256sum --check
printf '%s  %s\n' "$txlib_license_sha256" "$txlib_license" | sha256sum --check

"$destination/bin/g++.exe" --version
smoke_dir=$(mktemp -d)
trap 'rm -rf "$smoke_dir"' EXIT
printf '#include <iostream>\nint main() { std::cout << "DedInC"; }\n' > "$smoke_dir/smoke.cpp"
"$destination/bin/g++.exe" \
	-B "$destination/bin/" \
	-B "$destination/lib/" \
	-idirafter "$destination/include" \
	-L "$destination/lib" \
	"$smoke_dir/smoke.cpp" \
	-o "$smoke_dir/smoke.exe" \
	-static
smoke_output=$(PATH=/usr/bin:/bin "$smoke_dir/smoke.exe")
[[ "$smoke_output" == "DedInC" ]]

printf '#include <TXLib.h>\nint main() { return 0; }\n' > "$smoke_dir/txlib-smoke.cpp"
"$destination/bin/g++.exe" \
	-B "$destination/bin/" \
	-B "$destination/lib/" \
	-idirafter "$destination/include" \
	-L "$destination/lib" \
	"$smoke_dir/txlib-smoke.cpp" \
	-o "$smoke_dir/txlib-smoke.exe" \
	-static

#!/usr/bin/env bash
set -euo pipefail

# Run this in a glibc 2.17 build container (the release workflow uses
# quay.io/pypa/manylinux2014_x86_64) so the resulting compiler remains usable
# on a broad range of x86-64 Linux distributions.
gcc_version=16.1.0
binutils_version=2.45
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
build_root=${DEDINC_BUILD_ROOT:-/tmp/dedinc-toolchain-build}
install_root="$repo_root/toolchains/linux-x64"

mkdir -p "$build_root" "$install_root"
cd "$build_root"

curl --fail --location --retry 3 --remote-name \
	"https://gcc.gnu.org/pub/gcc/releases/gcc-${gcc_version}/gcc-${gcc_version}.tar.xz"
curl --fail --location --retry 3 --remote-name \
	"https://sourceware.org/pub/binutils/releases/binutils-${binutils_version}.tar.xz"

echo "b3454958891ab47e1e5b6cb9396c0ad3b04f32fe2a7bf1153a143f21013fdb6b295ca94c98964698a688e4c1d7555ffd8ffbc20187507cce6b1c32cbcc09897a  gcc-${gcc_version}.tar.xz" | sha512sum --check
echo "c50c0e7f9cb188980e2cc97e4537626b1672441815587f1eab69d2a1bfbef5d2  binutils-${binutils_version}.tar.xz" | sha256sum --check

tar -xf "gcc-${gcc_version}.tar.xz"
tar -xf "binutils-${binutils_version}.tar.xz"
cd "gcc-${gcc_version}"
./contrib/download_prerequisites

mkdir -p "$build_root/build-binutils" "$build_root/build-gcc"
cd "$build_root/build-binutils"
"$build_root/binutils-${binutils_version}/configure" \
	--prefix="$install_root" --disable-nls --disable-werror
make -j"$(nproc)"
make install-strip

cd "$build_root/build-gcc"
PATH="$install_root/bin:$PATH" "$build_root/gcc-${gcc_version}/configure" \
	--prefix="$install_root" \
	--with-gnu-as \
	--with-gnu-ld \
	--enable-languages=c,c++ \
	--disable-bootstrap \
	--disable-multilib \
	--disable-nls
make -j"$(nproc)"
make install-strip

mkdir -p "$install_root/licenses/gcc" "$install_root/licenses/binutils"
cp "$build_root/gcc-${gcc_version}"/COPYING* "$install_root/licenses/gcc/"
cp "$build_root/binutils-${binutils_version}"/COPYING* "$install_root/licenses/binutils/"
cat > "$install_root/SOURCES.txt" <<EOF
GCC ${gcc_version}: https://gcc.gnu.org/pub/gcc/releases/gcc-${gcc_version}/
GNU Binutils ${binutils_version}: https://sourceware.org/pub/binutils/releases/
GCC prerequisite source URLs are recorded by gcc-${gcc_version}/contrib/download_prerequisites.
EOF

relocated_root="${install_root}-relocated"
mv "$install_root" "$relocated_root"
"$relocated_root/bin/g++" --version
printf '#include <iostream>\nint main() { std::cout << "DedInC"; }\n' > "$build_root/smoke.cpp"
"$relocated_root/bin/g++" "$build_root/smoke.cpp" -o "$build_root/smoke" -static-libgcc -static-libstdc++
[[ "$("$build_root/smoke")" == "DedInC" ]]
mv "$relocated_root" "$install_root"

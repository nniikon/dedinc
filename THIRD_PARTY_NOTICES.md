# Third-party notices

Platform packages of DedInC contain software maintained by other projects.

## GNU Compiler Collection and GNU Binutils

The Windows x64 package contains GCC and GNU Binutils from MSYS2. These are
licensed under the GNU General Public License and related component licenses;
GCC runtime libraries include the GCC Runtime Library Exception. Exact license
files and corresponding-source locations must be copied into each generated
toolchain payload by the release workflow before publication.

- MSYS2 package sources: https://packages.msys2.org/

Do not publish a compiler-containing VSIX unless its generated payload includes
the applicable license texts and the release provides complete corresponding
source for the exact binaries.

## TX Library

The Windows x64 package contains `TXLib.h` from the TX Library project by Ded
(Ilya Dedinsky). The exact source revision is recorded in
`toolchains.lock.json`, and its license text is included in the generated
toolchain under `share/licenses/txlib/License.txt`.

- Source: https://github.com/ded32/TXLib

# Third-party notices

Platform packages of DedInC contain software maintained by other projects.

## GNU Compiler Collection and GNU Binutils

The Windows x64 and Linux x64 packages contain GCC and GNU Binutils. These are
licensed under the GNU General Public License and related component licenses;
GCC runtime libraries include the GCC Runtime Library Exception. Exact license
files and corresponding-source locations must be copied into each generated
toolchain payload by the release workflow before publication.

- GCC source: https://gcc.gnu.org/pub/gcc/releases/gcc-16.1.0/
- Binutils source: https://sourceware.org/pub/binutils/releases/
- MSYS2 package sources: https://packages.msys2.org/

Do not publish a compiler-containing VSIX unless its generated payload includes
the applicable license texts and the release provides complete corresponding
source for the exact binaries.

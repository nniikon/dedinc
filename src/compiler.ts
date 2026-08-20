import * as path from "path";

export const DEFAULT_COMPILER_FLAGS = [
	"-Wshadow",
	"-Winit-self",
	"-Wredundant-decls",
	"-Wcast-align",
	"-Wundef",
	"-Wfloat-equal",
	"-Winline",
	"-Wunreachable-code",
	"-Wmissing-declarations",
	"-Wswitch-enum",
	"-Wswitch-default",
	"-Weffc++",
	"-Wextra",
	"-Wall",
	"-Wcast-qual",
	"-Wconversion",
	"-Wctor-dtor-privacy",
	"-Wempty-body",
	"-Wformat-security",
	"-Wformat=2",
	"-Wno-missing-field-initializers",
	"-Wnon-virtual-dtor",
	"-Woverloaded-virtual",
	"-Wpointer-arith",
	"-Wsign-promo",
	"-Werror=vla",
	"-D_DEBUG",
] as const;

export const DEFAULT_WINDOWS_COMPILER_FLAGS = [
	"-Wmissing-include-dirs",
	"-Wmain",
	"-g",
	"-pipe",
	"-fexceptions",
	"-Wignored-qualifiers",
	"-Wlogical-op",
	"-Wstack-usage=8192",
	"-Wstrict-aliasing",
	"-Wstrict-null-sentinel",
	"-Wtype-limits",
	"-Wwrite-strings",
	"-D_EJUDGE_CLIENT_SIDE",
] as const;

export const DEFAULT_LINUX_COMPILER_FLAGS = [
	"-ggdb3",
	"-std=c++17",
	"-Waggressive-loop-optimizations",
	"-Wc++14-compat",
	"-Wchar-subscripts",
	"-Wconditionally-supported",
	"-Wformat-nonliteral",
	"-Wformat-signedness",
	"-Wlogical-op",
	"-Wopenmp-simd",
	"-Wpacked",
	"-Wsign-conversion",
	"-Wstrict-null-sentinel",
	"-Wstrict-overflow=2",
	"-Wsuggest-attribute=noreturn",
	"-Wsuggest-final-methods",
	"-Wsuggest-final-types",
	"-Wsuggest-override",
	"-Wsync-nand",
	"-Wunused",
	"-Wuseless-cast",
	"-Wvariadic-macros",
	"-Wno-literal-suffix",
	"-Wno-narrowing",
	"-Wno-old-style-cast",
	"-Wno-varargs",
	"-Wstack-protector",
	"-fcheck-new",
	"-fsized-deallocation",
	"-fstack-protector",
	"-fstrict-overflow",
	"-flto-odr-type-merging",
	"-fno-omit-frame-pointer",
	"-pie",
	"-fPIE",
	"-fsanitize=address,alignment,bool,bounds,enum,float-cast-overflow,float-divide-by-zero,integer-divide-by-zero,leak,nonnull-attribute,null,object-size,return,returns-nonnull-attribute,shift,signed-integer-overflow,undefined,unreachable,vla-bound,vptr",
] as const;

export const DEFAULT_MACOS_COMPILER_FLAGS = [
	"-ggdb3",
	"-std=c++17",
	"-Wc++14-compat",
	"-Wchar-subscripts",
	"-Wformat-nonliteral",
	"-Wformat-signedness",
	"-Wpacked",
	"-Wsign-conversion",
	"-Wstrict-overflow=2",
	"-Wsuggest-override",
	"-Wunused",
	"-Wvariadic-macros",
	"-Wno-narrowing",
	"-Wno-old-style-cast",
	"-Wno-varargs",
	"-Wstack-protector",
	"-fcheck-new",
	"-fsized-deallocation",
	"-fstack-protector",
	"-fstrict-overflow",
	"-fno-omit-frame-pointer",
	"-Wlarger-than=8192",
	"-fPIE",
	"-fsanitize=address,alignment,bool,bounds,enum,float-cast-overflow,float-divide-by-zero,integer-divide-by-zero,nonnull-attribute,null,return,returns-nonnull-attribute,shift,signed-integer-overflow,undefined,unreachable,vla-bound,vptr",
] as const;

export type SupportedTarget = "win32-x64" | "linux-x64" | "darwin-arm64";

export interface CompilerInvocation {
	command: string;
	prefixArgs: string[];
	runtimeArgs: string[];
	target: SupportedTarget;
	bundled: boolean;
}

export function combineCompilerFlags(
	commonFlags: readonly string[],
	platformFlags: readonly string[]
): string[] {
	return [...commonFlags, ...platformFlags];
}

export function resolveTarget(
	platform: NodeJS.Platform,
	arch: string
): SupportedTarget | undefined {
	if (platform === "win32" && arch === "x64") {
		return "win32-x64";
	}
	if (platform === "linux" && arch === "x64") {
		return "linux-x64";
	}
	if (platform === "darwin" && arch === "arm64") {
		return "darwin-arm64";
	}
	return undefined;
}

export function resolveCompiler(
	extensionPath: string,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch
): CompilerInvocation {
	const target = resolveTarget(platform, arch);
	if (!target) {
		throw new Error(
			`DedInC does not support ${platform}-${arch}. Supported targets are Windows x64, Linux x64, and macOS ARM64.`
		);
	}

	if (target === "linux-x64") {
		return {
			command: "g++",
			prefixArgs: [],
			runtimeArgs: [],
			target,
			bundled: false,
		};
	}

	if (target === "darwin-arm64") {
		return {
			command: "xcrun",
			prefixArgs: ["clang++"],
			runtimeArgs: [],
			target,
			bundled: false,
		};
	}

	const pathApi = platform === "win32" ? path.win32 : path.posix;
	const toolchainRoot = pathApi.join(extensionPath, "toolchains", target);
	const binDirectory = pathApi.join(toolchainRoot, "bin");
	const libraryDirectory = pathApi.join(toolchainRoot, "lib");
	const includeDirectory = pathApi.join(toolchainRoot, "include");
	const executable = target === "win32-x64" ? "g++.exe" : "g++";
	return {
		command: pathApi.join(binDirectory, executable),
		prefixArgs: [],
		runtimeArgs: [
			"-B",
			`${binDirectory}${pathApi.sep}`,
			"-B",
			`${libraryDirectory}${pathApi.sep}`,
			"-idirafter",
			includeDirectory,
			"-L",
			libraryDirectory,
			"-static",
		],
		target,
		bundled: true,
	};
}

export function outputPathFor(sourcePath: string, platform: NodeJS.Platform): string {
	const suffix = platform === "win32" ? ".exe" : "";
	const pathApi = platform === "win32" ? path.win32 : path.posix;
	return pathApi.join(pathApi.dirname(sourcePath), `_run_DedInC${suffix}`);
}

export function buildCompilerArgs(
	invocation: CompilerInvocation,
	sourcePath: string,
	outputPath: string,
	flags: readonly string[]
): string[] {
	return [
		...invocation.prefixArgs,
		sourcePath,
		"-o",
		outputPath,
		...flags,
		...invocation.runtimeArgs,
	];
}

export function buildCompilerEnvironment(
	invocation: CompilerInvocation,
	baseEnvironment: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
	if (!invocation.bundled) {
		return baseEnvironment;
	}

	const environment = { ...baseEnvironment };
	const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const pathApi = platform === "win32" ? path.win32 : path.posix;
	const delimiter = platform === "win32" ? ";" : ":";
	const compilerBin = pathApi.dirname(invocation.command);
	environment[pathKey] = environment[pathKey]
		? `${compilerBin}${delimiter}${environment[pathKey]}`
		: compilerBin;
	return environment;
}

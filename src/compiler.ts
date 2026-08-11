import * as path from "path";

export const DEFAULT_COMPILER_FLAGS = ["-Wall", "-Wextra", "-g"] as const;

export type SupportedTarget = "win32-x64" | "darwin-arm64";

export interface CompilerInvocation {
	command: string;
	prefixArgs: string[];
	runtimeArgs: string[];
	target: SupportedTarget;
	bundled: boolean;
}

export function resolveTarget(
	platform: NodeJS.Platform,
	arch: string
): SupportedTarget | undefined {
	if (platform === "win32" && arch === "x64") {
		return "win32-x64";
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
			`DedInC does not support ${platform}-${arch}. Supported targets are Windows x64 and macOS ARM64.`
		);
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
			"-isystem",
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

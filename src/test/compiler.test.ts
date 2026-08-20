import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
	buildCompilerArgs,
	buildCompilerEnvironment,
	combineCompilerFlags,
	DEFAULT_COMPILER_FLAGS,
	DEFAULT_LINUX_COMPILER_FLAGS,
	DEFAULT_MACOS_COMPILER_FLAGS,
	DEFAULT_WINDOWS_COMPILER_FLAGS,
	outputPathFor,
	resolveCompiler,
	resolveTarget,
} from "../compiler";

suite("Compiler configuration", () => {
	test("keeps manifest defaults synchronized with compiler defaults", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
		) as {
			contributes: {
				configuration: {
					properties: Record<string, { default: string[] }>;
				};
			};
		};
		const properties = packageJson.contributes.configuration.properties;
		assert.deepStrictEqual(properties["dedinc.compilerFlags"].default, [
			...DEFAULT_COMPILER_FLAGS,
		]);
		assert.deepStrictEqual(properties["dedinc.windowsCompilerFlags"].default, [
			...DEFAULT_WINDOWS_COMPILER_FLAGS,
		]);
		assert.deepStrictEqual(properties["dedinc.linuxCompilerFlags"].default, [
			...DEFAULT_LINUX_COMPILER_FLAGS,
		]);
		assert.deepStrictEqual(properties["dedinc.macosCompilerFlags"].default, [
			...DEFAULT_MACOS_COMPILER_FLAGS,
		]);
	});

	test("partitions the default flags into common and platform-specific lists", () => {
		assert.strictEqual(DEFAULT_COMPILER_FLAGS.length, 27);
		assert.strictEqual(DEFAULT_WINDOWS_COMPILER_FLAGS.length, 13);
		assert.strictEqual(DEFAULT_LINUX_COMPILER_FLAGS.length, 36);
		assert.strictEqual(DEFAULT_MACOS_COMPILER_FLAGS.length, 24);

		for (const platformFlags of [
			DEFAULT_WINDOWS_COMPILER_FLAGS,
			DEFAULT_LINUX_COMPILER_FLAGS,
			DEFAULT_MACOS_COMPILER_FLAGS,
		]) {
			const combined = combineCompilerFlags(DEFAULT_COMPILER_FLAGS, platformFlags);
			assert.strictEqual(new Set(combined).size, combined.length);
		}

		assert.ok(DEFAULT_COMPILER_FLAGS.includes("-D_DEBUG"));
		assert.ok(DEFAULT_WINDOWS_COMPILER_FLAGS.includes("-D_EJUDGE_CLIENT_SIDE"));
		assert.ok(DEFAULT_LINUX_COMPILER_FLAGS.includes("-flto-odr-type-merging"));
		assert.ok(DEFAULT_MACOS_COMPILER_FLAGS.includes("-Wlarger-than=8192"));
	});

	test("combines common flags before the active platform flags", () => {
		const common = ["-Wall", "-DDEBUG"];
		const platform = ["-std=c++17", "-g"];
		assert.deepStrictEqual(combineCompilerFlags(common, platform), [
			"-Wall",
			"-DDEBUG",
			"-std=c++17",
			"-g",
		]);
		assert.deepStrictEqual(common, ["-Wall", "-DDEBUG"]);
		assert.deepStrictEqual(platform, ["-std=c++17", "-g"]);
	});

	test("resolves supported targets", () => {
		assert.strictEqual(resolveTarget("win32", "x64"), "win32-x64");
		assert.strictEqual(resolveTarget("linux", "x64"), "linux-x64");
		assert.strictEqual(resolveTarget("darwin", "arm64"), "darwin-arm64");
		assert.strictEqual(resolveTarget("linux", "arm64"), undefined);
		assert.strictEqual(resolveTarget("darwin", "x64"), undefined);
	});

	test("uses g++ from PATH on Linux", () => {
		const linux = resolveCompiler("/extension", "linux", "x64");
		assert.strictEqual(linux.command, "g++");
		assert.deepStrictEqual(linux.prefixArgs, []);
		assert.deepStrictEqual(linux.runtimeArgs, []);
		assert.strictEqual(linux.bundled, false);
	});

	test("uses a packaged compiler on Windows", () => {
		const windows = resolveCompiler("C:\\extension", "win32", "x64");
		assert.strictEqual(windows.bundled, true);
		assert.strictEqual(path.win32.basename(windows.command), "g++.exe");
		assert.deepStrictEqual(windows.runtimeArgs, [
			"-B",
			"C:\\extension\\toolchains\\win32-x64\\bin\\",
			"-B",
			"C:\\extension\\toolchains\\win32-x64\\lib\\",
			"-idirafter",
			"C:\\extension\\toolchains\\win32-x64\\include",
			"-L",
			"C:\\extension\\toolchains\\win32-x64\\lib",
			"-static",
		]);
	});

	test("uses xcrun clang++ on Apple Silicon", () => {
		const mac = resolveCompiler("/extension", "darwin", "arm64");
		assert.strictEqual(mac.command, "xcrun");
		assert.deepStrictEqual(mac.prefixArgs, ["clang++"]);
		assert.deepStrictEqual(mac.runtimeArgs, []);
		assert.strictEqual(mac.bundled, false);
	});

	test("rejects unsupported platforms", () => {
		assert.throws(
			() => resolveCompiler("/extension", "freebsd", "x64"),
			/does not support freebsd-x64/
		);
	});

	test("builds argument arrays without shell quoting", () => {
		const compiler = resolveCompiler("C:\\extension with spaces", "win32", "x64");
		assert.deepStrictEqual(
			buildCompilerArgs(
				compiler,
				"/project with spaces/main.cpp",
				"/project with spaces/_run_DedInC",
				["-Wall", "-DFOO=hello world", "-lm"]
			),
			[
				"/project with spaces/main.cpp",
				"-o",
				"/project with spaces/_run_DedInC",
				"-Wall",
				"-DFOO=hello world",
				"-lm",
				"-B",
				"C:\\extension with spaces\\toolchains\\win32-x64\\bin\\",
				"-B",
				"C:\\extension with spaces\\toolchains\\win32-x64\\lib\\",
				"-idirafter",
				"C:\\extension with spaces\\toolchains\\win32-x64\\include",
				"-L",
				"C:\\extension with spaces\\toolchains\\win32-x64\\lib",
				"-static",
			]
		);
	});

	test("uses platform-specific output names", () => {
		assert.strictEqual(outputPathFor("/project/main.cpp", "darwin"), "/project/_run_DedInC");
		assert.strictEqual(
			outputPathFor("C:\\project\\main.cpp", "win32"),
			"C:\\project\\_run_DedInC.exe"
		);
	});

	test("allows an empty optional flags array", () => {
		const compiler = resolveCompiler("C:\\extension", "win32", "x64");
		assert.deepStrictEqual(buildCompilerArgs(compiler, "/p/a.c", "/p/out", []), [
			"/p/a.c",
			"-o",
			"/p/out",
			"-B",
			"C:\\extension\\toolchains\\win32-x64\\bin\\",
			"-B",
			"C:\\extension\\toolchains\\win32-x64\\lib\\",
			"-idirafter",
			"C:\\extension\\toolchains\\win32-x64\\include",
			"-L",
			"C:\\extension\\toolchains\\win32-x64\\lib",
			"-static",
		]);
	});

	test("adds the bundled compiler directory to the Windows PATH", () => {
		const compiler = resolveCompiler("C:\\extension", "win32", "x64");
		const environment = buildCompilerEnvironment(
			compiler,
			{ Path: "C:\\Windows\\System32", TEMP: "C:\\Temp" },
			"win32"
		);

		assert.strictEqual(
			environment.Path,
			"C:\\extension\\toolchains\\win32-x64\\bin;C:\\Windows\\System32"
		);
		assert.strictEqual(environment.TEMP, "C:\\Temp");
	});

	test("does not modify the environment for a system compiler", () => {
		const compiler = resolveCompiler("/extension", "linux", "x64");
		const baseEnvironment = { PATH: "/usr/bin" };
		assert.strictEqual(buildCompilerEnvironment(compiler, baseEnvironment, "linux"), baseEnvironment);
	});
});

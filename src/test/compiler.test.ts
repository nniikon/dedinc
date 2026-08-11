import * as assert from "assert";
import * as path from "path";
import {
	buildCompilerArgs,
	outputPathFor,
	resolveCompiler,
	resolveTarget,
} from "../compiler";

suite("Compiler configuration", () => {
	test("resolves supported targets", () => {
		assert.strictEqual(resolveTarget("win32", "x64"), "win32-x64");
		assert.strictEqual(resolveTarget("darwin", "arm64"), "darwin-arm64");
		assert.strictEqual(resolveTarget("linux", "x64"), undefined);
		assert.strictEqual(resolveTarget("linux", "arm64"), undefined);
		assert.strictEqual(resolveTarget("darwin", "x64"), undefined);
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
});

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDirectory, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const supportedTargets = ["win32-x64", "darwin-arm64"];
const target = process.argv.slice(2).find((argument) => argument !== "--");
if (!supportedTargets.includes(target)) {
	console.error(`Usage: pnpm package:platform -- <${supportedTargets.join("|")}>`);
	process.exit(2);
}

const toolchainsRoot = join(root, "toolchains");
const stagedTargets = existsSync(toolchainsRoot)
	? readdirSync(toolchainsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
	: [];

if (target !== "darwin-arm64" && !stagedTargets.includes(target)) {
	console.error(`Missing staged compiler at toolchains/${target}.`);
	process.exit(1);
}
if (target !== "darwin-arm64") {
	const compilerName = target === "win32-x64" ? "g++.exe" : "g++";
	const compilerPath = join(toolchainsRoot, target, "bin", compilerName);
	if (!existsSync(compilerPath)) {
		console.error(`Missing staged compiler executable: ${compilerPath}`);
		process.exit(1);
	}
}
const unwantedTargets = stagedTargets.filter((name) => name !== target);
if (unwantedTargets.length > 0) {
	console.error(`Remove unrelated staged toolchains before packaging: ${unwantedTargets.join(", ")}`);
	process.exit(1);
}

const outputDirectory = join(root, "artifacts");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, `${packageJson.name}-${packageJson.version}-${target}.vsix`);
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
	command,
	["dlx", "@vscode/vsce@3.6.2", "package", "--target", target, "--out", outputPath],
	{ cwd: root, stdio: "inherit" }
);
if (result.error) {
	console.error(`Could not start the VSIX packager: ${result.error.message}`);
}
process.exit(result.status ?? 1);

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDirectory, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const toolchainsLock = JSON.parse(readFileSync(join(root, "toolchains.lock.json"), "utf8"));

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
	const requiredPayloadFiles = [
		{
			path: join(toolchainsRoot, target, "include", "TXLib.h"),
			sha256: toolchainsLock[target].txlib.headerSha256,
		},
		{
			path: join(toolchainsRoot, target, "share", "licenses", "txlib", "License.txt"),
			sha256: toolchainsLock[target].txlib.licenseSha256,
		},
	];
	for (const requiredFile of requiredPayloadFiles) {
		if (!existsSync(requiredFile.path)) {
			console.error(`Missing staged Windows payload file: ${requiredFile.path}`);
			process.exit(1);
		}
		const actualSha256 = createHash("sha256")
			.update(readFileSync(requiredFile.path))
			.digest("hex");
		if (actualSha256 !== requiredFile.sha256) {
			console.error(`Checksum mismatch for staged Windows payload file: ${requiredFile.path}`);
			process.exit(1);
		}
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
const pnpmArguments = [
	"dlx",
	"@vscode/vsce@3.6.2",
	"package",
	"--target",
	target,
	"--out",
	outputPath,
];
const pnpmEntryPoint = process.env.npm_execpath;
const command = pnpmEntryPoint
	? process.execPath
	: process.platform === "win32"
		? "pnpm.cmd"
		: "pnpm";
const commandArguments = pnpmEntryPoint
	? [pnpmEntryPoint, ...pnpmArguments]
	: pnpmArguments;
const result = spawnSync(
	command,
	commandArguments,
	{
		cwd: root,
		stdio: "inherit",
		shell: !pnpmEntryPoint && process.platform === "win32",
	}
);
if (result.error) {
	console.error(`Could not start the VSIX packager: ${result.error.message}`);
}
process.exit(result.status ?? 1);

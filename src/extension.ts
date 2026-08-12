import * as vscode from "vscode";
import * as path from "path";
import { spawn } from "child_process";
import * as fs from "fs";
import {
	buildCompilerArgs,
	buildCompilerEnvironment,
	DEFAULT_COMPILER_FLAGS,
	outputPathFor,
	resolveCompiler,
	type CompilerInvocation,
} from "./compiler";

let activeExecution: vscode.TaskExecution | undefined;
let outputChannel: vscode.OutputChannel;
let compilationInProgress = false;

function runProcess(
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], { cwd, env, windowsHide: true });
		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
		child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
		child.once("error", reject);
		child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
	});
}

function runCompilerProcess(
	invocation: CompilerInvocation,
	args: readonly string[],
	cwd: string
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
	return runProcess(invocation.command, args, cwd, buildCompilerEnvironment(invocation));
}

function diagnosticValue(value: string): string {
	return value.length > 0 ? value.trimEnd() : "<empty>";
}

async function appendCompilerDiagnostics(
	invocation: CompilerInvocation,
	args: readonly string[],
	cwd: string,
	result?: { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string },
	error?: unknown
): Promise<void> {
	outputChannel.appendLine("");
	outputChannel.appendLine("=== DedInC compilation diagnostics ===");
	outputChannel.appendLine(`Platform: ${process.platform}-${process.arch}`);
	outputChannel.appendLine(`VS Code: ${vscode.version}`);
	outputChannel.appendLine(`Compiler: ${invocation.command}`);
	outputChannel.appendLine(`Compiler exists: ${fs.existsSync(invocation.command)}`);
	outputChannel.appendLine(
		`Bundled compiler bin added to PATH: ${invocation.bundled ? path.dirname(invocation.command) : "not applicable"}`
	);
	outputChannel.appendLine(`Working directory: ${cwd}`);
	outputChannel.appendLine(`Working directory exists: ${fs.existsSync(cwd)}`);
	outputChannel.appendLine(`Arguments: ${JSON.stringify(args, null, 2)}`);
	if (result) {
		outputChannel.appendLine(`Exit code: ${result.code ?? "null"}`);
		outputChannel.appendLine(`Signal: ${result.signal ?? "none"}`);
		outputChannel.appendLine(`stdout: ${diagnosticValue(result.stdout)}`);
		outputChannel.appendLine(`stderr: ${diagnosticValue(result.stderr)}`);
	}
	if (error) {
		const processError = error as NodeJS.ErrnoException;
		outputChannel.appendLine(`Process error: ${processError.stack ?? String(error)}`);
		outputChannel.appendLine(`Process error code: ${processError.code ?? "none"}`);
	}

	if (!invocation.bundled) {
		return;
	}

	outputChannel.appendLine("");
	outputChannel.appendLine("--- Bundled compiler self-test ---");
	for (const probeArgs of [
		["--version"],
		["-print-search-dirs"],
		["-print-prog-name=cc1plus"],
		["-print-prog-name=as"],
		["-print-prog-name=ld"],
	]) {
		try {
			const probe = await runCompilerProcess(invocation, probeArgs, cwd);
			outputChannel.appendLine(`$ g++ ${probeArgs.join(" ")}`);
			outputChannel.appendLine(`exit=${probe.code ?? "null"}, signal=${probe.signal ?? "none"}`);
			if (probe.stdout) {
				outputChannel.appendLine(`stdout: ${diagnosticValue(probe.stdout)}`);
			}
			if (probe.stderr) {
				outputChannel.appendLine(`stderr: ${diagnosticValue(probe.stderr)}`);
			}
		} catch (probeError) {
			outputChannel.appendLine(`$ g++ ${probeArgs.join(" ")}`);
			outputChannel.appendLine(`could not start: ${(probeError as Error).message}`);
		}
	}
}

async function showCompilationFailure(message: string): Promise<void> {
	outputChannel.show(true);
	const action = await vscode.window.showErrorMessage(message, "Show Diagnostics");
	if (action === "Show Diagnostics") {
		outputChannel.show(false);
	}
}

async function ensureCompiler(invocation: CompilerInvocation): Promise<boolean> {
	if (invocation.bundled) {
		if (fs.existsSync(invocation.command)) {
			return true;
		}
		vscode.window.showErrorMessage(
			`The DedInC compiler payload for ${invocation.target} is missing. Reinstall the platform-specific extension package.`
		);
		return false;
	}

	try {
		const probe = await runProcess("xcrun", ["--find", "clang++"], process.cwd());
		if (probe.code === 0) {
			return true;
		}
	} catch {
		// Fall through to Apple's installer prompt.
	}

	try {
		const installer = spawn("xcode-select", ["--install"], {
			detached: true,
			stdio: "ignore",
		});
		installer.unref();
	} catch {
		vscode.window.showErrorMessage(
			"Apple Command Line Tools are required. Run `xcode-select --install`, then try again."
		);
		return false;
	}

	vscode.window.showInformationMessage(
		"Install Apple Command Line Tools in the system dialog, then run DedInC again."
	);
	return false;
}

function configuredFlags(resource: vscode.Uri): string[] | undefined {
	const value = vscode.workspace
		.getConfiguration("dedinc", resource)
		.get<unknown>("compilerFlags", [...DEFAULT_COMPILER_FLAGS]);
	if (!Array.isArray(value) || !value.every((flag) => typeof flag === "string")) {
		vscode.window.showErrorMessage("dedinc.compilerFlags must be an array of strings.");
		return undefined;
	}
	return value;
}

async function removeOldOutput(outputPath: string): Promise<void> {
	try {
		await fs.promises.unlink(outputPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

async function terminateActiveExecution(): Promise<void> {
	const execution = activeExecution;
	if (!execution) {
		return;
	}

	await new Promise<void>((resolve) => {
		let timer: NodeJS.Timeout;
		const finish = (): void => {
			clearTimeout(timer);
			subscription.dispose();
			resolve();
		};
		const subscription = vscode.tasks.onDidEndTask((event) => {
			if (event.execution === execution) {
				finish();
			}
		});
		timer = setTimeout(finish, 2000);
		execution.terminate();
	});
	if (activeExecution === execution) {
		activeExecution = undefined;
	}
}

async function executeProgram(sourcePath: string, executablePath: string): Promise<void> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourcePath));
	const scope = workspaceFolder ?? vscode.TaskScope.Workspace;
	const execution = new vscode.ProcessExecution(executablePath, [], {
		cwd: path.dirname(sourcePath),
	});
	const task = new vscode.Task(
		{ type: "dedinc" },
		scope,
		"Run C/C++ Code",
		"DedInC",
		execution
	);
	task.presentationOptions = {
		reveal: vscode.TaskRevealKind.Always,
		panel: vscode.TaskPanelKind.Shared,
		clear: true,
		focus: true,
	};
	activeExecution = await vscode.tasks.executeTask(task);
}

async function runCCode(context: vscode.ExtensionContext): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage("No active editor found!");
		return;
	}

	const sourcePath = editor.document.fileName;
	const extension = path.extname(sourcePath).toLowerCase();
	if (extension !== ".c" && extension !== ".cpp") {
		vscode.window.showErrorMessage("Please open a C or C++ file!");
		return;
	}

	let compiler: CompilerInvocation;
	try {
		compiler = resolveCompiler(context.extensionPath);
	} catch (error) {
		vscode.window.showErrorMessage((error as Error).message);
		return;
	}
	if (!(await ensureCompiler(compiler))) {
		return;
	}

	const flags = configuredFlags(editor.document.uri);
	if (!flags) {
		return;
	}
	if (compilationInProgress) {
		vscode.window.showInformationMessage("DedInC is already compiling a file.");
		return;
	}
	compilationInProgress = true;
	const outputPath = outputPathFor(sourcePath, process.platform);
	const args = buildCompilerArgs(compiler, sourcePath, outputPath, flags);
	const cwd = path.dirname(sourcePath);

	try {
		await terminateActiveExecution();
		await removeOldOutput(outputPath);
		outputChannel.clear();
		outputChannel.appendLine(`Compiling ${path.basename(sourcePath)}...`);
		const result = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: "DedInC: Compiling" },
			() => runCompilerProcess(compiler, args, cwd)
		);
		if (result.stdout) {
			outputChannel.append(result.stdout);
		}
		if (result.stderr) {
			outputChannel.append(result.stderr);
		}
		if (result.code !== 0 || !fs.existsSync(outputPath)) {
			await appendCompilerDiagnostics(compiler, args, cwd, result);
			await showCompilationFailure(
				`Compilation failed (exit code ${result.code ?? "unknown"}). See the DedInC output for diagnostics.`
			);
			return;
		}
		await executeProgram(sourcePath, outputPath);
	} catch (error) {
		await appendCompilerDiagnostics(compiler, args, cwd, undefined, error);
		await showCompilationFailure(`DedInC failed: ${(error as Error).message}`);
	} finally {
		compilationInProgress = false;
	}
}

export function activate(context: vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel("DedInC");
	context.subscriptions.push(
		outputChannel,
		vscode.commands.registerCommand("dedinc.runCCode", () => runCCode(context)),
		vscode.tasks.onDidEndTask((event) => {
			if (event.execution === activeExecution) {
				activeExecution = undefined;
			}
		})
	);
}

export function deactivate(): void {
	activeExecution?.terminate();
}

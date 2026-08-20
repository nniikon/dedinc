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
let activeStandaloneTerminal: vscode.Terminal | undefined;
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

async function writeCompilerDiagnostics(
	context: vscode.ExtensionContext,
	invocation: CompilerInvocation,
	args: readonly string[],
	cwd: string,
	result?: { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string },
	error?: unknown
): Promise<vscode.Uri | undefined> {
	const lines = [
		"=== DedInC compilation diagnostics ===",
		`Time: ${new Date().toISOString()}`,
		`Platform: ${process.platform}-${process.arch}`,
		`VS Code: ${vscode.version}`,
		`Compiler: ${invocation.command}`,
		`Compiler file exists: ${invocation.bundled ? fs.existsSync(invocation.command) : "resolved through PATH"}`,
		`Bundled compiler bin added to PATH: ${invocation.bundled ? path.dirname(invocation.command) : "not applicable"}`,
		`Working directory: ${cwd}`,
		`Working directory exists: ${fs.existsSync(cwd)}`,
		`Arguments: ${JSON.stringify(args, null, 2)}`,
	];
	if (result) {
		lines.push(
			`Exit code: ${result.code ?? "null"}`,
			`Signal: ${result.signal ?? "none"}`,
			`stdout: ${diagnosticValue(result.stdout)}`,
			`stderr: ${diagnosticValue(result.stderr)}`
		);
	}
	if (error) {
		const processError = error as NodeJS.ErrnoException;
		lines.push(
			`Process error: ${processError.stack ?? String(error)}`,
			`Process error code: ${processError.code ?? "none"}`
		);
	}

	if (invocation.bundled) {
		lines.push("", "--- Bundled compiler self-test ---");
		for (const probeArgs of [
			["--version"],
			["-print-search-dirs"],
			["-print-prog-name=cc1plus"],
			["-print-prog-name=as"],
			["-print-prog-name=ld"],
		]) {
			lines.push(`$ g++ ${probeArgs.join(" ")}`);
			try {
				const probe = await runCompilerProcess(invocation, probeArgs, cwd);
				lines.push(`exit=${probe.code ?? "null"}, signal=${probe.signal ?? "none"}`);
				if (probe.stdout) {
					lines.push(`stdout: ${diagnosticValue(probe.stdout)}`);
				}
				if (probe.stderr) {
					lines.push(`stderr: ${diagnosticValue(probe.stderr)}`);
				}
			} catch (probeError) {
				lines.push(`could not start: ${(probeError as Error).message}`);
			}
		}
	}

	try {
		await vscode.workspace.fs.createDirectory(context.logUri);
		const logUri = vscode.Uri.joinPath(context.logUri, "last-compilation.log");
		await vscode.workspace.fs.writeFile(logUri, Buffer.from(`${lines.join("\n")}\n`, "utf8"));
		return logUri;
	} catch {
		return undefined;
	}
}

async function showCompilationFailure(message: string, diagnosticLog?: vscode.Uri): Promise<void> {
	outputChannel.show(true);
	if (!diagnosticLog) {
		await vscode.window.showErrorMessage(message);
		return;
	}
	const action = await vscode.window.showErrorMessage(message, "Open Diagnostic Log");
	if (action === "Open Diagnostic Log") {
		const document = await vscode.workspace.openTextDocument(diagnosticLog);
		await vscode.window.showTextDocument(document, { preview: true });
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

	if (invocation.target === "linux-x64") {
		try {
			const probe = await runCompilerProcess(invocation, ["--version"], process.cwd());
			if (probe.code === 0) {
				return true;
			}
		} catch {
			// Report the missing system compiler below.
		}

		vscode.window.showErrorMessage(
			"DedInC could not find g++ in PATH. Install g++ with your Linux distribution's package manager, then try again."
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
	if (activeStandaloneTerminal) {
		activeStandaloneTerminal.dispose();
		activeStandaloneTerminal = undefined;
	}

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
	if (!workspaceFolder) {
		activeStandaloneTerminal = vscode.window.createTerminal({
			name: "DedInC: Run C/C++ Code",
			shellPath: executablePath,
			cwd: path.dirname(sourcePath),
		});
		activeStandaloneTerminal.show(false);
		return;
	}

	const execution = new vscode.ProcessExecution(executablePath, [], {
		cwd: path.dirname(sourcePath),
	});
	const task = new vscode.Task(
		{ type: "dedinc" },
		workspaceFolder,
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
			const diagnosticLog = await writeCompilerDiagnostics(context, compiler, args, cwd, result);
			await showCompilationFailure(
				`Compilation failed (exit code ${result.code ?? "unknown"}).`,
				diagnosticLog
			);
			return;
		}
		await executeProgram(sourcePath, outputPath);
	} catch (error) {
		const diagnosticLog = await writeCompilerDiagnostics(
			context,
			compiler,
			args,
			cwd,
			undefined,
			error
		);
		outputChannel.appendLine(`DedInC failed: ${(error as Error).message}`);
		await showCompilationFailure(`DedInC failed: ${(error as Error).message}`, diagnosticLog);
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
		}),
		vscode.window.onDidCloseTerminal((terminal) => {
			if (terminal === activeStandaloneTerminal) {
				activeStandaloneTerminal = undefined;
			}
		})
	);
}

export function deactivate(): void {
	activeExecution?.terminate();
	activeStandaloneTerminal?.dispose();
}

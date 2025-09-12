import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import * as fs from "fs";

// Create a global variable for the terminal so it can be reused
let runTerminal: vscode.Terminal | undefined = undefined;

function runCCode(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage("No active editor found!");
		return;
	}

	const fileName = editor.document.fileName;
	const fileExtension = path.extname(fileName);

	if (fileExtension !== ".c" && fileExtension !== ".cpp") {
		vscode.window.showErrorMessage("Please open a C or C++ file!");
		return;
	}

	// Define the compiler location (bundled MinGW/Clang)
	const compilerPath = path.join(
		context.extensionPath,
		"tdm",
		"bin",
		"gcc.exe"
	);
	console.log("Compiler Path:", compilerPath);

	if (!fs.existsSync(compilerPath)) {
		vscode.window.showErrorMessage(
			"GCC compiler not found! Please ensure the compiler is bundled correctly."
		);
		return;
	}

	const outputFilePath = path.join(path.dirname(fileName), "_run_playC.exe"); // output executable
	console.log("Output File Path:", outputFilePath);

	// Compile the code
	const compileCommand =
		fileExtension === ".cpp"
			? `"${compilerPath}" -o "${outputFilePath}" "${fileName}" -lstdc++` // C++ compile command
			: `"${compilerPath}" -o "${outputFilePath}" "${fileName}"`; // C compile command

	const options = {
		cwd: path.dirname(fileName), // Ensure the correct working directory for the command
	};

	cp.exec(compileCommand, options, (error, stdout, stderr) => {
		if (error) {
			vscode.window.showErrorMessage(`Compilation failed: ${stderr}`);
			return;
		}

		// Check if executable exists
		if (fs.existsSync(outputFilePath)) {
			// If the terminal doesn't exist, create a new one
			if (!runTerminal) {
				runTerminal = vscode.window.createTerminal("PlayC Terminal");
				runTerminal.show();
			}

			runTerminal.show();

			// Run the executable with blank lines before and after
			runTerminal.sendText(` "";""; ${outputFilePath} ;"";""`);

			// vscode.window.showInformationMessage("✅ PlayC ran successfully!");
		} else {
			vscode.window.showErrorMessage("❌ Failed to generate executable!");
		}
	});
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "playc" is now active!');

	let disposable = vscode.commands.registerCommand("extension.runCCode", () =>
		runCCode(context)
	);
	context.subscriptions.push(disposable);
}

export function deactivate() {
	// Clean up terminal on deactivation
	if (runTerminal) {
		runTerminal.dispose();
	}
}

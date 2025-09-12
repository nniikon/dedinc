# PlayC - Run C/C++ Code in VS Code

PlayC is a Visual Studio Code extension designed to streamline compiling and running C and C++ programs directly within the editor. It comes with a bundled compiler, removing the need for manual setup.

## Features

- **One-click Compile & Run**: Run your C/C++ code with a single click.
- **Integrated Terminal**: View input and output directly in the VS Code terminal.
- **No Setup Required**: Includes a bundled compiler for hassle-free use.
- **Cross-Platform**: Compatible with Windows, macOS, and Linux.

## Requirements

- Visual Studio Code installed.
- A C or C++ file open in the editor.
- No external compiler setup required, as PlayC includes a bundled compiler.

## Extension Settings

> **Note**: PlayC currently does not offer configuration options. Customizable settings may be added in future updates.

## Known Issues

- Optimized for Windows with the bundled MinGW compiler. Other platforms may require a manually installed compiler.
- Terminal focus may not function correctly on the first run.

## Release Notes

### 0.0.1

- Initial release with compile and run functionality for C/C++ code.
- Included TDM-GCC for Windows users.

### 0.0.2

- Fixed terminal focus issue after the first run.

## Installation

1. Install Visual Studio Code from [code.visualstudio.com](https://code.visualstudio.com/).
2. Open VS Code, go to the Extensions view (`Ctrl+Shift+X`), and search for **PlayC**.
3. Click **Install**.

### Manual Installation via .vsix

1. Download the `.vsix` file from the release page.
2. In VS Code, navigate to **Extensions > Install from VSIX**.
3. Select the downloaded `.vsix` file.

## Usage

1. Open a C or C++ file in the VS Code editor.
2. Click the **Run C/C++** button in the editor's toolbar.
3. View the output in the integrated terminal.

---

**Enjoy coding with PlayC! 🎉**

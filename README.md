# Build Runner MCP Server

A Model Context Protocol (MCP) server that provides structured build, compile, and test operations with parsed output to reduce token usage and improve readability.

## Features

- **Java version switching** via SDKMAN (`sdk use java <version>`)
- **Compilation** with structured error output
- **Build/Package** with success/failure summary
- **Test execution** with parsed test results (passed, failed, skipped)
- **Multi-build-system support**: Maven, Gradle, npm/pnpm/yarn

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd build-runner-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Add to your Claude Code settings (`~/.claude.json`):

```json
{
  "mcpServers": {
    "build-runner": {
      "command": "node",
      "args": ["/path/to/build-runner-mcp/build/index.js"]
    }
  }
}
```

## Available Tools

### `detect_project`
Detect project type, build system, test framework, and configuration.

```json
{
  "projectPath": "/path/to/project"
}
```

Returns: Project info including languages, build system, package manager, and test framework.

### `set_java_version`
Switch Java version using SDKMAN before running commands.

Available versions: 17.0.16-amzn, 21.0.8-tem, 21.0.9-amzn, 25.0.1-tem

```json
{
  "version": "17.0.16-amzn"
}
```

### `compile_project`
Compile a Java project using Maven or Gradle.

```json
{
  "projectPath": "/path/to/project",
  "javaVersion": "17.0.16-amzn",
  "clean": false,
  "module": "core"
}
```

Returns: Structured compile errors and warnings with file, line, column, and message.

### `build_project`
Build/package a Java project.

```json
{
  "projectPath": "/path/to/project",
  "javaVersion": "21.0.8-tem",
  "skipTests": true,
  "clean": true
}
```

Returns: Build artifacts with paths and sizes, duration, and any errors.

### `run_tests`
Run tests for a Java project with structured results.

```json
{
  "projectPath": "/path/to/project",
  "javaVersion": "17.0.16-amzn",
  "testPattern": "UserServiceTest",
  "module": "api",
  "failFast": true
}
```

Returns:
```json
{
  "success": false,
  "summary": { "total": 50, "passed": 47, "failed": 2, "skipped": 1, "duration": "12.5s" },
  "failures": [
    {
      "testClass": "UserServiceTest",
      "testMethod": "testLogin",
      "message": "Expected 200 but got 401",
      "stackTrace": "...",
      "file": "UserServiceTest.java",
      "line": 42
    }
  ]
}
```

### `node_build`
Build a Node.js/TypeScript project.

```json
{
  "projectPath": "/path/to/project",
  "script": "build",
  "packageManager": "pnpm"
}
```

### `node_typecheck`
Type check a TypeScript project using `tsc --noEmit`.

```json
{
  "projectPath": "/path/to/project"
}
```

### `node_test`
Run tests for a Node.js/TypeScript project (Jest, Vitest, or Mocha).

```json
{
  "projectPath": "/path/to/project",
  "testPattern": "user.test.ts",
  "failFast": true,
  "coverage": true
}
```

## Token Savings

### Before (raw Maven test output): ~500 lines
```
[INFO] Scanning for projects...
[INFO] --- maven-surefire-plugin:3.0.0:test ---
... (hundreds of lines)
[ERROR] Tests run: 50, Failures: 2, Errors: 0, Skipped: 1
```

### After (structured): ~20 lines
```json
{
  "success": false,
  "summary": { "total": 50, "passed": 47, "failed": 2, "skipped": 1 },
  "failures": [
    { "testClass": "UserServiceTest", "testMethod": "testLogin", "message": "Expected 200 but got 401" }
  ]
}
```

## SDKMAN Integration

The server automatically sources SDKMAN and switches Java versions when specified:

```bash
source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk use java 17.0.16-amzn && mvn compile
```

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Clean build artifacts
npm run clean
```

## License

MIT

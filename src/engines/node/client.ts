import { executeCommand, formatDuration, CommandOptions } from '../../utils/command.js';
import { parseJestJsonOutput, parseJestConsoleOutput, JestTestResult } from '../../parsers/jest-output.js';
import { parseVitestJsonOutput, parseVitestConsoleOutput, VitestTestResult } from '../../parsers/vitest-output.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface NodeBuildResult {
  success: boolean;
  duration: string;
  errors?: string[];
}

export interface NodeTestResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: string;
  };
  failures: Array<{
    testFile: string;
    testName: string;
    message: string;
    stackTrace: string;
    file?: string;
    line?: number;
  }>;
  skipped: Array<{
    testFile: string;
    testName: string;
    reason?: string;
  }>;
}

export interface NodeOptions {
  projectPath: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn';
  testPattern?: string;
  failFast?: boolean;
  coverage?: boolean;
  testFramework?: 'jest' | 'vitest' | 'mocha';
  script?: string;
}

/**
 * Detect package manager from lock files
 */
function detectPackageManager(projectPath: string): 'npm' | 'pnpm' | 'yarn' {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  } else if (existsSync(join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

/**
 * Detect test framework from package.json
 */
function detectTestFramework(projectPath: string): 'jest' | 'vitest' | 'mocha' | undefined {
  try {
    const packageJson = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['vitest']) return 'vitest';
    if (deps['jest']) return 'jest';
    if (deps['mocha']) return 'mocha';
  } catch {
    // Ignore errors
  }
  return undefined;
}

/**
 * Get the run command for the package manager
 */
function getRunCommand(pm: 'npm' | 'pnpm' | 'yarn'): string {
  return pm === 'npm' ? 'npm run' : `${pm}`;
}

/**
 * Run Node build (npm/pnpm/yarn build)
 */
export async function nodeBuild(options: NodeOptions): Promise<NodeBuildResult> {
  const pm = options.packageManager ?? detectPackageManager(options.projectPath);
  const script = options.script ?? 'build';
  const runCmd = getRunCommand(pm);
  const command = `${runCmd} ${script}`;

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    timeout: 300000,
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const buildResult: NodeBuildResult = {
    success: result.success,
    duration,
  };

  if (!result.success) {
    // Extract error lines
    const output = result.stdout + '\n' + result.stderr;
    const errorLines = output
      .split('\n')
      .filter(line =>
        line.includes('error') ||
        line.includes('Error') ||
        line.includes('ERROR') ||
        line.includes('failed')
      )
      .slice(0, 15);

    buildResult.errors = errorLines.length > 0 ? errorLines : [output.slice(0, 1000)];
  }

  return buildResult;
}

/**
 * Run Jest tests
 */
export async function jestTest(options: NodeOptions): Promise<NodeTestResult> {
  const pm = options.packageManager ?? detectPackageManager(options.projectPath);

  // Build Jest command with JSON output
  const parts: string[] = [];

  if (pm === 'npm') {
    parts.push('npx jest');
  } else {
    parts.push(`${pm} jest`);
  }

  parts.push('--json');

  if (options.testPattern) {
    parts.push(`--testPathPattern="${options.testPattern}"`);
  }

  if (options.failFast) {
    parts.push('--bail');
  }

  if (options.coverage) {
    parts.push('--coverage');
  }

  const command = parts.join(' ');

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    timeout: 600000,
  };

  const result = await executeCommand(command, cmdOptions);

  // Try to parse JSON output
  try {
    // Jest outputs JSON to stdout when --json is used
    const jsonOutput = result.stdout;
    return parseJestJsonOutput(jsonOutput);
  } catch {
    // Fall back to console output parsing
    const consoleResult = parseJestConsoleOutput(result.stdout + '\n' + result.stderr);
    return {
      success: consoleResult.success ?? result.success,
      summary: consoleResult.summary ?? { total: 0, passed: 0, failed: 0, skipped: 0, duration: '0s' },
      failures: consoleResult.failures ?? [],
      skipped: [],
    };
  }
}

/**
 * Run Vitest tests
 */
export async function vitestTest(options: NodeOptions): Promise<NodeTestResult> {
  const pm = options.packageManager ?? detectPackageManager(options.projectPath);

  // Build Vitest command with JSON reporter
  const parts: string[] = [];

  if (pm === 'npm') {
    parts.push('npx vitest run');
  } else {
    parts.push(`${pm} vitest run`);
  }

  parts.push('--reporter=json');

  if (options.testPattern) {
    parts.push(options.testPattern);
  }

  if (options.failFast) {
    parts.push('--bail');
  }

  if (options.coverage) {
    parts.push('--coverage');
  }

  const command = parts.join(' ');

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    timeout: 600000,
  };

  const result = await executeCommand(command, cmdOptions);

  // Try to parse JSON output
  try {
    const jsonOutput = result.stdout;
    return parseVitestJsonOutput(jsonOutput);
  } catch {
    const consoleResult = parseVitestConsoleOutput(result.stdout + '\n' + result.stderr);
    return {
      success: consoleResult.success ?? result.success,
      summary: consoleResult.summary ?? { total: 0, passed: 0, failed: 0, skipped: 0, duration: '0s' },
      failures: consoleResult.failures ?? [],
      skipped: [],
    };
  }
}

/**
 * Run Node tests (auto-detect framework)
 */
export async function nodeTest(options: NodeOptions): Promise<NodeTestResult> {
  const framework = options.testFramework ?? detectTestFramework(options.projectPath);

  switch (framework) {
    case 'jest':
      return jestTest(options);
    case 'vitest':
      return vitestTest(options);
    case 'mocha':
      // For mocha, fall back to running the test script
      return runTestScript(options);
    default:
      return runTestScript(options);
  }
}

/**
 * Run the test script from package.json
 */
async function runTestScript(options: NodeOptions): Promise<NodeTestResult> {
  const pm = options.packageManager ?? detectPackageManager(options.projectPath);
  const runCmd = getRunCommand(pm);
  const command = `${runCmd} test`;

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    timeout: 600000,
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  // Try to parse output generically
  const output = result.stdout + '\n' + result.stderr;

  // Look for common test output patterns
  const passMatch = output.match(/(\d+)\s+(?:passing|passed)/);
  const failMatch = output.match(/(\d+)\s+(?:failing|failed)/);
  const skipMatch = output.match(/(\d+)\s+(?:skipped|pending)/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;

  return {
    success: result.success && failed === 0,
    summary: {
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
      duration,
    },
    failures: [],
    skipped: [],
  };
}

/**
 * Type check TypeScript project
 */
export async function nodeTypeCheck(options: NodeOptions): Promise<NodeBuildResult> {
  const pm = options.packageManager ?? detectPackageManager(options.projectPath);
  const command = pm === 'npm' ? 'npx tsc --noEmit' : `${pm} tsc --noEmit`;

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    timeout: 120000,
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const buildResult: NodeBuildResult = {
    success: result.success,
    duration,
  };

  if (!result.success) {
    // Parse TypeScript errors
    const errorLines = (result.stdout + '\n' + result.stderr)
      .split('\n')
      .filter(line => line.includes('error TS'))
      .slice(0, 15);

    buildResult.errors = errorLines.length > 0 ? errorLines : undefined;
  }

  return buildResult;
}

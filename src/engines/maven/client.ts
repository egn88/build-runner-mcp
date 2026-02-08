import { executeCommand, formatDuration, CommandOptions } from '../../utils/command.js';
import {
  parseMavenCompileOutput,
  parseMavenTestOutput,
  parseMavenBuildOutput,
  CompileResult,
  TestResult,
  BuildResult,
} from '../../parsers/maven-output.js';

export interface MavenOptions {
  projectPath: string;
  javaVersion?: string;
  clean?: boolean;
  skipTests?: boolean;
  module?: string;
  testPattern?: string;
  failFast?: boolean;
  profiles?: string[];
  additionalArgs?: string[];
}

/**
 * Build Maven command with options
 */
function buildMavenCommand(goal: string, options: MavenOptions): string {
  const parts = ['mvn'];

  // Add profiles
  if (options.profiles?.length) {
    parts.push(`-P${options.profiles.join(',')}`);
  }

  // Add module if specified
  if (options.module) {
    parts.push('-pl', options.module, '-am');
  }

  // Add clean if requested
  if (options.clean) {
    parts.push('clean');
  }

  // Add the main goal
  parts.push(goal);

  // Skip tests for build
  if (options.skipTests) {
    parts.push('-DskipTests');
  }

  // Test pattern
  if (options.testPattern) {
    parts.push(`-Dtest=${options.testPattern}`);
  }

  // Fail fast
  if (options.failFast) {
    parts.push('-Dsurefire.skipAfterFailureCount=1');
  }

  // Additional args
  if (options.additionalArgs?.length) {
    parts.push(...options.additionalArgs);
  }

  // Always use batch mode for cleaner output
  parts.push('-B');

  return parts.join(' ');
}

/**
 * Run Maven compile
 */
export async function mavenCompile(options: MavenOptions): Promise<CompileResult> {
  const command = buildMavenCommand('compile', options);

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 300000,
  };

  const result = await executeCommand(command, cmdOptions);
  const parseResult = parseMavenCompileOutput(result.stdout + '\n' + result.stderr);

  // If no specific errors were parsed but command failed, add a general error
  if (!result.success && parseResult.errors.length === 0) {
    parseResult.success = false;
    parseResult.errors.push({
      file: 'unknown',
      line: 0,
      message: 'Compilation failed. Check build output.',
      severity: 'error',
    });
    parseResult.summary.errorCount = parseResult.errors.length;
  }

  return parseResult;
}

/**
 * Run Maven package/build
 */
export async function mavenBuild(options: MavenOptions): Promise<BuildResult> {
  const command = buildMavenCommand('package', { ...options, skipTests: options.skipTests ?? true });

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000, // 10 minutes for builds
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const artifacts = parseMavenBuildOutput(result.stdout + '\n' + result.stderr, options.projectPath);

  const buildResult: BuildResult = {
    success: result.success,
    artifacts,
    duration,
  };

  if (!result.success) {
    // Extract error messages
    const errorLines = (result.stdout + '\n' + result.stderr)
      .split('\n')
      .filter(line => line.includes('[ERROR]'))
      .map(line => line.replace('[ERROR]', '').trim())
      .filter(line => line.length > 0)
      .slice(0, 10); // Limit to 10 error lines

    buildResult.errors = errorLines;
  }

  return buildResult;
}

/**
 * Run Maven tests
 */
export async function mavenTest(options: MavenOptions): Promise<TestResult> {
  const command = buildMavenCommand('test', options);

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000, // 10 minutes for tests
  };

  const result = await executeCommand(command, cmdOptions);
  const consoleOutput = result.stdout + '\n' + result.stderr;

  // Parse console output directly - this only includes tests from the current run
  const testResult = parseMavenTestOutput(consoleOutput);

  // If console parsing found no results, command may have failed before tests ran
  if (testResult.summary.total === 0 && !result.success) {
    testResult.success = false;
    // Extract error message from output
    const errorLines = consoleOutput
      .split('\n')
      .filter(line => line.includes('[ERROR]'))
      .map(line => line.replace('[ERROR]', '').trim())
      .filter(line => line.length > 0)
      .slice(0, 5);

    if (errorLines.length > 0) {
      testResult.failures.push({
        testClass: 'Build',
        testMethod: 'compile',
        message: 'Tests could not run due to build error',
        stackTrace: errorLines.join('\n'),
      });
    }
  }

  return testResult;
}

/**
 * Run Maven install (package and install to local repository)
 */
export async function mavenInstall(options: MavenOptions): Promise<BuildResult> {
  const command = buildMavenCommand('install', { ...options, skipTests: options.skipTests ?? true });

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000, // 10 minutes for install
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const artifacts = parseMavenBuildOutput(result.stdout + '\n' + result.stderr, options.projectPath);

  const buildResult: BuildResult = {
    success: result.success,
    artifacts,
    duration,
  };

  if (!result.success) {
    // Extract error messages
    const errorLines = (result.stdout + '\n' + result.stderr)
      .split('\n')
      .filter(line => line.includes('[ERROR]'))
      .map(line => line.replace('[ERROR]', '').trim())
      .filter(line => line.length > 0)
      .slice(0, 10); // Limit to 10 error lines

    buildResult.errors = errorLines;
  }

  return buildResult;
}

/**
 * Run Maven verify (includes integration tests)
 */
export async function mavenVerify(options: MavenOptions): Promise<TestResult> {
  const command = buildMavenCommand('verify', options);

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 900000, // 15 minutes for integration tests
  };

  const result = await executeCommand(command, cmdOptions);
  const consoleOutput = result.stdout + '\n' + result.stderr;

  // Parse console output directly - this only includes tests from the current run
  const testResult = parseMavenTestOutput(consoleOutput);

  // If console parsing found no results, command may have failed before tests ran
  if (testResult.summary.total === 0 && !result.success) {
    testResult.success = false;
    const errorLines = consoleOutput
      .split('\n')
      .filter(line => line.includes('[ERROR]'))
      .map(line => line.replace('[ERROR]', '').trim())
      .filter(line => line.length > 0)
      .slice(0, 5);

    if (errorLines.length > 0) {
      testResult.failures.push({
        testClass: 'Build',
        testMethod: 'verify',
        message: 'Verification failed due to build error',
        stackTrace: errorLines.join('\n'),
      });
    }
  }

  return testResult;
}

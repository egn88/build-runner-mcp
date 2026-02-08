import { executeCommand, formatDuration, CommandOptions } from '../../utils/command.js';
import {
  parseGradleCompileOutput,
  parseGradleTestReports,
  parseGradleBuildOutput,
} from '../../parsers/gradle-output.js';
import { CompileResult, TestResult, BuildResult } from '../../parsers/maven-output.js';
import { existsSync } from 'fs';
import { join } from 'path';

export interface GradleOptions {
  projectPath: string;
  javaVersion?: string;
  clean?: boolean;
  skipTests?: boolean;
  module?: string;
  alsoMake?: boolean; // Note: Gradle builds dependencies automatically, this is for API consistency
  testPattern?: string;
  failFast?: boolean;
  additionalArgs?: string[];
}

/**
 * Detect Gradle wrapper or use system gradle
 */
function getGradleCommand(projectPath: string): string {
  const wrapperUnix = join(projectPath, 'gradlew');
  const wrapperWindows = join(projectPath, 'gradlew.bat');

  if (existsSync(wrapperUnix)) {
    return './gradlew';
  } else if (existsSync(wrapperWindows)) {
    return 'gradlew.bat';
  }
  return 'gradle';
}

/**
 * Build Gradle command with options
 */
function buildGradleCommand(task: string, options: GradleOptions): string {
  const gradleCmd = getGradleCommand(options.projectPath);
  const parts = [gradleCmd];

  // Add module prefix if specified
  const taskPrefix = options.module ? `:${options.module}:` : '';

  // Add clean if requested
  if (options.clean) {
    parts.push(`${taskPrefix}clean`);
  }

  // Add the main task
  parts.push(`${taskPrefix}${task}`);

  // Skip tests for build
  if (options.skipTests) {
    parts.push('-x', 'test');
  }

  // Test pattern
  if (options.testPattern) {
    parts.push('--tests', options.testPattern);
  }

  // Fail fast
  if (options.failFast) {
    parts.push('--fail-fast');
  }

  // Additional args
  if (options.additionalArgs?.length) {
    parts.push(...options.additionalArgs);
  }

  // Add common options
  parts.push('--no-daemon', '--console=plain');

  return parts.join(' ');
}

/**
 * Run Gradle compile
 */
export async function gradleCompile(options: GradleOptions): Promise<CompileResult> {
  const command = buildGradleCommand('compileJava', options);

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 300000,
  };

  const result = await executeCommand(command, cmdOptions);
  const parseResult = parseGradleCompileOutput(result.stdout + '\n' + result.stderr);

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
 * Run Gradle build
 */
export async function gradleBuild(options: GradleOptions): Promise<BuildResult> {
  const command = buildGradleCommand('build', { ...options, skipTests: options.skipTests ?? true });

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000,
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const artifacts = parseGradleBuildOutput(result.stdout + '\n' + result.stderr, options.projectPath);

  const buildResult: BuildResult = {
    success: result.success,
    artifacts,
    duration,
  };

  if (!result.success) {
    const errorLines = (result.stdout + '\n' + result.stderr)
      .split('\n')
      .filter(line => line.includes('FAILED') || line.includes('error:') || line.startsWith('e:'))
      .slice(0, 10);

    buildResult.errors = errorLines;
  }

  return buildResult;
}

/**
 * Run Gradle tests
 */
export async function gradleTest(options: GradleOptions): Promise<TestResult> {
  const command = buildGradleCommand('test', options);

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000,
  };

  await executeCommand(command, cmdOptions);

  // Parse test reports
  const testResult = parseGradleTestReports(options.projectPath, options.module);

  return testResult;
}

/**
 * Run Gradle install (publishToMavenLocal)
 */
export async function gradleInstall(options: GradleOptions): Promise<BuildResult> {
  const command = buildGradleCommand('publishToMavenLocal', { ...options, skipTests: options.skipTests ?? true });

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000, // 10 minutes for install
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const artifacts = parseGradleBuildOutput(result.stdout + '\n' + result.stderr, options.projectPath);

  const buildResult: BuildResult = {
    success: result.success,
    artifacts,
    duration,
  };

  if (!result.success) {
    const errorLines = (result.stdout + '\n' + result.stderr)
      .split('\n')
      .filter(line => line.includes('FAILED') || line.includes('error:') || line.startsWith('e:'))
      .slice(0, 10);

    buildResult.errors = errorLines;
  }

  return buildResult;
}

/**
 * Run Gradle assemble (build without tests)
 */
export async function gradleAssemble(options: GradleOptions): Promise<BuildResult> {
  const command = buildGradleCommand('assemble', options);

  const cmdOptions: CommandOptions = {
    cwd: options.projectPath,
    javaVersion: options.javaVersion,
    timeout: 600000,
  };

  const startTime = Date.now();
  const result = await executeCommand(command, cmdOptions);
  const duration = formatDuration(Date.now() - startTime);

  const artifacts = parseGradleBuildOutput(result.stdout + '\n' + result.stderr, options.projectPath);

  return {
    success: result.success,
    artifacts,
    duration,
    errors: result.success ? undefined : [result.stderr],
  };
}

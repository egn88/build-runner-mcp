import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

export interface CompileError {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface CompileResult {
  success: boolean;
  errors: CompileError[];
  warnings: CompileError[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
}

export interface TestFailure {
  testClass: string;
  testMethod: string;
  message: string;
  stackTrace: string;
  file?: string;
  line?: number;
}

export interface SkippedTest {
  testClass: string;
  testMethod: string;
  reason?: string;
}

export interface TestResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    duration: string;
  };
  failures: TestFailure[];
  skipped: SkippedTest[];
}

export interface BuildArtifact {
  path: string;
  size: string;
}

export interface BuildResult {
  success: boolean;
  artifacts: BuildArtifact[];
  duration: string;
  errors?: string[];
}

/**
 * Parse Maven compile output for errors and warnings
 */
export function parseMavenCompileOutput(output: string): CompileResult {
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];

  const lines = output.split('\n');

  for (const line of lines) {
    // Match Maven compile error format: [ERROR] /path/File.java:[42,15] message
    const errorMatch = line.match(/\[ERROR\]\s+(.+\.java):\[(\d+),(\d+)\]\s+(.+)/);
    if (errorMatch) {
      errors.push({
        file: errorMatch[1],
        line: parseInt(errorMatch[2], 10),
        column: parseInt(errorMatch[3], 10),
        message: errorMatch[4],
        severity: 'error',
      });
      continue;
    }

    // Match alternative error format: [ERROR] /path/File.java:[42] message
    const errorMatch2 = line.match(/\[ERROR\]\s+(.+\.java):\[(\d+)\]\s+(.+)/);
    if (errorMatch2) {
      errors.push({
        file: errorMatch2[1],
        line: parseInt(errorMatch2[2], 10),
        message: errorMatch2[3],
        severity: 'error',
      });
      continue;
    }

    // Match warning format
    const warningMatch = line.match(/\[WARNING\]\s+(.+\.java):\[(\d+),?(\d+)?\]\s+(.+)/);
    if (warningMatch) {
      warnings.push({
        file: warningMatch[1],
        line: parseInt(warningMatch[2], 10),
        column: warningMatch[3] ? parseInt(warningMatch[3], 10) : undefined,
        message: warningMatch[4],
        severity: 'warning',
      });
      continue;
    }

    // Match general error messages
    const generalErrorMatch = line.match(/\[ERROR\]\s+(.+): (.+)/);
    if (generalErrorMatch && !generalErrorMatch[1].startsWith('Failed to')) {
      const filePath = generalErrorMatch[1];
      if (filePath.endsWith('.java')) {
        errors.push({
          file: filePath,
          line: 0,
          message: generalErrorMatch[2],
          severity: 'error',
        });
      }
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

/**
 * Parse Surefire XML test reports
 */
export function parseSurefireReports(projectPath: string, module?: string): TestResult {
  const surefireDir = module
    ? join(projectPath, module, 'target', 'surefire-reports')
    : join(projectPath, 'target', 'surefire-reports');

  const result: TestResult = {
    success: true,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      duration: '0s',
    },
    failures: [],
    skipped: [],
  };

  if (!existsSync(surefireDir)) {
    return result;
  }

  let totalDuration = 0;

  try {
    const files = readdirSync(surefireDir).filter(f => f.endsWith('.xml'));

    for (const file of files) {
      const content = readFileSync(join(surefireDir, file), 'utf-8');

      // Parse testsuite attributes
      const suiteMatch = content.match(/<testsuite[^>]+tests="(\d+)"[^>]+errors="(\d+)"[^>]+skipped="(\d+)"[^>]+failures="(\d+)"[^>]+time="([\d.]+)"/);
      if (suiteMatch) {
        const tests = parseInt(suiteMatch[1], 10);
        const errors = parseInt(suiteMatch[2], 10);
        const skipped = parseInt(suiteMatch[3], 10);
        const failures = parseInt(suiteMatch[4], 10);
        const time = parseFloat(suiteMatch[5]);

        result.summary.total += tests;
        result.summary.errors += errors;
        result.summary.skipped += skipped;
        result.summary.failed += failures;
        result.summary.passed += tests - errors - skipped - failures;
        totalDuration += time;
      }

      // Parse individual test failures
      const testCaseRegex = /<testcase[^>]+name="([^"]+)"[^>]+classname="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g;
      let match;

      while ((match = testCaseRegex.exec(content)) !== null) {
        const testMethod = match[1];
        const testClass = match[2];
        const testContent = match[3];

        // Check for failure
        const failureMatch = testContent.match(/<failure[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/failure>/);
        if (failureMatch) {
          const stackTrace = failureMatch[2].trim();
          const stackLines = stackTrace.split('\n').slice(0, config.maxStackTraceLines);

          // Try to extract file and line from stack trace
          const locationMatch = stackTrace.match(/at\s+[\w.]+\((\w+\.java):(\d+)\)/);

          result.failures.push({
            testClass,
            testMethod,
            message: failureMatch[1] || 'Test failed',
            stackTrace: stackLines.join('\n'),
            file: locationMatch?.[1],
            line: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
          });
          continue;
        }

        // Check for error
        const errorMatch = testContent.match(/<error[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/error>/);
        if (errorMatch) {
          const stackTrace = errorMatch[2].trim();
          const stackLines = stackTrace.split('\n').slice(0, config.maxStackTraceLines);

          const locationMatch = stackTrace.match(/at\s+[\w.]+\((\w+\.java):(\d+)\)/);

          result.failures.push({
            testClass,
            testMethod,
            message: errorMatch[1] || 'Test error',
            stackTrace: stackLines.join('\n'),
            file: locationMatch?.[1],
            line: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
          });
          continue;
        }

        // Check for skipped
        const skippedMatch = testContent.match(/<skipped[^>]*(?:message="([^"]*)")?/);
        if (skippedMatch) {
          result.skipped.push({
            testClass,
            testMethod,
            reason: skippedMatch[1],
          });
        }
      }
    }
  } catch (error) {
    // Return partial results if there's an error reading reports
  }

  result.summary.duration = `${totalDuration.toFixed(2)}s`;
  result.success = result.summary.failed === 0 && result.summary.errors === 0;

  return result;
}

/**
 * Parse Maven test output from console
 */
export function parseMavenTestOutput(output: string): TestResult {
  const result: TestResult = {
    success: true,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      duration: '0s',
    },
    failures: [],
    skipped: [],
  };

  // Parse summary line: Tests run: 10, Failures: 2, Errors: 0, Skipped: 1
  const summaryMatch = output.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/g);

  if (summaryMatch) {
    for (const match of summaryMatch) {
      const numbers = match.match(/\d+/g);
      if (numbers && numbers.length >= 4) {
        result.summary.total += parseInt(numbers[0], 10);
        result.summary.failed += parseInt(numbers[1], 10);
        result.summary.errors += parseInt(numbers[2], 10);
        result.summary.skipped += parseInt(numbers[3], 10);
      }
    }
    result.summary.passed = result.summary.total - result.summary.failed - result.summary.errors - result.summary.skipped;
  }

  // Parse total time from summary
  const totalTimeMatch = output.match(/\[INFO\] Total time:\s*([\d.:]+\s*\w*)/);
  if (totalTimeMatch) {
    result.summary.duration = totalTimeMatch[1].trim();
  }

  // Parse individual test failures
  // Format: [ERROR] testMethod(com.package.TestClass)  Time elapsed: 0.005 s  <<< FAILURE!
  // Followed by stack trace lines
  const lines = output.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Match failure/error pattern: testMethod(com.package.TestClass)  <<< FAILURE! or <<< ERROR!
    const failureMatch = line.match(/\[ERROR\]\s+(\w+)\(([^)]+)\)\s+.*<<<\s*(FAILURE|ERROR)!/);
    if (failureMatch) {
      const testMethod = failureMatch[1];
      const testClass = failureMatch[2];
      const failureType = failureMatch[3];

      // Collect stack trace lines (they follow the failure line)
      const stackLines: string[] = [];
      let message = '';
      i++;

      // First non-empty line after FAILURE is usually the exception message
      while (i < lines.length && lines[i].trim() === '') {
        i++;
      }

      // Capture exception message and stack trace
      while (i < lines.length) {
        const stackLine = lines[i];
        // Stop at next test or empty sections
        if (stackLine.match(/\[INFO\]|Tests run:|^\s*$/) && stackLines.length > 0) {
          break;
        }
        if (stackLine.match(/\[ERROR\]\s+\w+\([^)]+\).*<<<\s*(FAILURE|ERROR)!/)) {
          // Next failure, don't increment i
          break;
        }

        const cleanLine = stackLine.replace(/^\[ERROR\]\s*/, '').trim();
        if (cleanLine) {
          if (!message && !cleanLine.startsWith('at ')) {
            message = cleanLine;
          }
          stackLines.push(cleanLine);
        }
        i++;
      }

      // Limit stack trace lines
      const limitedStack = stackLines.slice(0, config.maxStackTraceLines);

      // Try to extract file and line from stack trace
      const locationMatch = limitedStack.join('\n').match(/at\s+[\w.$]+\((\w+\.java):(\d+)\)/);

      result.failures.push({
        testClass,
        testMethod,
        message: message || `Test ${failureType.toLowerCase()}`,
        stackTrace: limitedStack.join('\n'),
        file: locationMatch?.[1],
        line: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
      });

      continue;
    }

    i++;
  }

  result.success = result.summary.failed === 0 && result.summary.errors === 0;

  return result;
}

/**
 * Parse Maven build output to find artifacts
 */
export function parseMavenBuildOutput(output: string, projectPath: string): BuildArtifact[] {
  const artifacts: BuildArtifact[] = [];

  // Match "Building jar: /path/to/artifact.jar" pattern
  const jarMatch = output.matchAll(/Building jar:\s+(.+\.jar)/g);
  for (const match of jarMatch) {
    try {
      const stats = require('fs').statSync(match[1]);
      artifacts.push({
        path: match[1],
        size: formatBytes(stats.size),
      });
    } catch {
      artifacts.push({
        path: match[1],
        size: 'unknown',
      });
    }
  }

  // Match "Building war: /path/to/artifact.war" pattern
  const warMatch = output.matchAll(/Building war:\s+(.+\.war)/g);
  for (const match of warMatch) {
    try {
      const stats = require('fs').statSync(match[1]);
      artifacts.push({
        path: match[1],
        size: formatBytes(stats.size),
      });
    } catch {
      artifacts.push({
        path: match[1],
        size: 'unknown',
      });
    }
  }

  return artifacts;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

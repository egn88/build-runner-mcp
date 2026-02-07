import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { CompileError, CompileResult, TestResult, TestFailure, TestError, SkippedTest, BuildArtifact } from './maven-output.js';

/**
 * Parse Gradle compile output for errors and warnings
 */
export function parseGradleCompileOutput(output: string): CompileResult {
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];

  const lines = output.split('\n');

  for (const line of lines) {
    // Kotlin compile error format: e: file:///path/File.kt:42:15 message
    const kotlinErrorMatch = line.match(/e:\s+file:\/\/(.+\.kt):(\d+):(\d+)\s+(.+)/);
    if (kotlinErrorMatch) {
      errors.push({
        file: kotlinErrorMatch[1],
        line: parseInt(kotlinErrorMatch[2], 10),
        column: parseInt(kotlinErrorMatch[3], 10),
        message: kotlinErrorMatch[4],
        severity: 'error',
      });
      continue;
    }

    // Java compile error format: /path/File.java:42: error: message
    const javaErrorMatch = line.match(/(.+\.java):(\d+):\s+error:\s+(.+)/);
    if (javaErrorMatch) {
      errors.push({
        file: javaErrorMatch[1],
        line: parseInt(javaErrorMatch[2], 10),
        message: javaErrorMatch[3],
        severity: 'error',
      });
      continue;
    }

    // Warning format
    const warningMatch = line.match(/(.+\.(java|kt)):(\d+):\s+warning:\s+(.+)/);
    if (warningMatch) {
      warnings.push({
        file: warningMatch[1],
        line: parseInt(warningMatch[3], 10),
        message: warningMatch[4],
        severity: 'warning',
      });
      continue;
    }

    // Gradle task failure
    const taskFailureMatch = line.match(/> Task :(\S+) FAILED/);
    if (taskFailureMatch) {
      // Look for error details in subsequent lines
      continue;
    }

    // Compilation failed message
    const compileFailedMatch = line.match(/Compilation failed; see the compiler error output for details/);
    if (compileFailedMatch && errors.length === 0) {
      errors.push({
        file: 'unknown',
        line: 0,
        message: 'Compilation failed; see build output for details',
        severity: 'error',
      });
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
 * Parse Gradle test reports (JUnit XML format)
 */
export function parseGradleTestReports(projectPath: string, module?: string): TestResult {
  // Gradle stores test reports in different locations
  const possibleDirs = [
    join(projectPath, module || '', 'build', 'test-results', 'test'),
    join(projectPath, module || '', 'build', 'test-results'),
  ];

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
    errors: [],
    skipped: [],
  };

  let testDir: string | null = null;
  for (const dir of possibleDirs) {
    if (existsSync(dir)) {
      testDir = dir;
      break;
    }
  }

  if (!testDir) {
    return result;
  }

  let totalDuration = 0;

  try {
    const files = readdirSync(testDir).filter(f => f.endsWith('.xml'));

    for (const file of files) {
      const content = readFileSync(join(testDir, file), 'utf-8');

      // Parse testsuite attributes (same format as Surefire)
      const suiteMatch = content.match(/<testsuite[^>]+tests="(\d+)"[^>]+(?:skipped|skips)="(\d+)"[^>]+failures="(\d+)"[^>]+errors="(\d+)"[^>]+(?:time|timestamp)="([\d.]+)"/);
      if (suiteMatch) {
        const tests = parseInt(suiteMatch[1], 10);
        const skipped = parseInt(suiteMatch[2], 10);
        const failures = parseInt(suiteMatch[3], 10);
        const errors = parseInt(suiteMatch[4], 10);
        const time = parseFloat(suiteMatch[5]);

        result.summary.total += tests;
        result.summary.skipped += skipped;
        result.summary.failed += failures;
        result.summary.errors += errors;
        result.summary.passed += tests - errors - skipped - failures;
        totalDuration += time;
      }

      // Parse individual test failures (same as Maven)
      const testCaseRegex = /<testcase[^>]+name="([^"]+)"[^>]+classname="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g;
      let match;

      while ((match = testCaseRegex.exec(content)) !== null) {
        const testMethod = match[1];
        const testClass = match[2];
        const testContent = match[3];

        // Check for failure
        const failureMatch = testContent.match(/<failure[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/failure>/);
        if (failureMatch) {
          const stackTrace = (failureMatch[2] || '').trim();
          const stackLines = stackTrace.split('\n').slice(0, config.maxStackTraceLines);

          const locationMatch = stackTrace.match(/at\s+[\w.]+\((\w+\.(?:java|kt)):(\d+)\)/);

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
        const errorMatch = testContent.match(/<error[^>]*(?:type="([^"]*)")?[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/error>/);
        if (errorMatch) {
          const stackTrace = (errorMatch[3] || '').trim();
          const stackLines = stackTrace.split('\n').slice(0, config.maxStackTraceLines);

          const locationMatch = stackTrace.match(/at\s+[\w.]+\((\w+\.(?:java|kt)):(\d+)\)/);

          // Extract error type from attribute or stack trace
          let errorType = errorMatch[1] || '';
          if (!errorType) {
            const typeMatch = stackTrace.match(/^([\w.]+Exception|[\w.]+Error)/);
            errorType = typeMatch?.[1] || 'Exception';
          }

          result.errors.push({
            testClass,
            testMethod,
            errorType,
            message: errorMatch[2] || 'Test error',
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
 * Parse Gradle build output to find artifacts
 */
export function parseGradleBuildOutput(output: string, projectPath: string): BuildArtifact[] {
  const artifacts: BuildArtifact[] = [];

  // Look in build/libs for JARs
  const buildLibsDir = join(projectPath, 'build', 'libs');
  if (existsSync(buildLibsDir)) {
    try {
      const files = readdirSync(buildLibsDir);
      for (const file of files) {
        if (file.endsWith('.jar') || file.endsWith('.war')) {
          const filePath = join(buildLibsDir, file);
          const stats = require('fs').statSync(filePath);
          artifacts.push({
            path: filePath,
            size: formatBytes(stats.size),
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return artifacts;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

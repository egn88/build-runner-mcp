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

export interface TestError {
  testClass: string;
  testMethod: string;
  errorType: string;
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
  errors: TestError[];
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
    errors: [],
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
        const errorMatch = testContent.match(/<error[^>]*(?:type="([^"]*)")?[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/error>/);
        if (errorMatch) {
          const stackTrace = errorMatch[3].trim();
          const stackLines = stackTrace.split('\n').slice(0, config.maxStackTraceLines);

          const locationMatch = stackTrace.match(/at\s+[\w.]+\((\w+\.java):(\d+)\)/);

          // Extract error type from stack trace if not in attribute
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
    errors: [],
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

  // Parse individual test failures using multiple patterns
  const lines = output.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Pattern 1: Old format - testMethod(com.package.TestClass)  <<< FAILURE! or <<< ERROR!
    let failureMatch = line.match(/\[ERROR\]\s+(\w+)\(([^)]+)\)\s+.*<<<\s*(FAILURE|ERROR)!/);

    // Pattern 2: Newer Surefire format - TestClass.testMethod:lineNum <<< FAILURE!
    // Example: [ERROR]   UserServiceTest.testCreateUser:42 expected: <true> but was: <false> <<< FAILURE!
    if (!failureMatch) {
      const newFormatMatch = line.match(/\[ERROR\]\s+(?:[\w.]+\.)?(\w+)\.(\w+)(?::\d+)?.*<<<\s*(FAILURE|ERROR)!/);
      if (newFormatMatch) {
        // In new format, group 1 is class name (short), group 2 is method
        failureMatch = [line, newFormatMatch[2], newFormatMatch[1], newFormatMatch[3]];
      }
    }

    // Pattern 3: Parameterized test format - testMethod[params](TestClass) <<< FAILURE!
    if (!failureMatch) {
      const paramMatch = line.match(/\[ERROR\]\s+(\w+)\[[^\]]*\]\(([^)]+)\)\s+.*<<<\s*(FAILURE|ERROR)!/);
      if (paramMatch) {
        failureMatch = [line, paramMatch[1], paramMatch[2], paramMatch[3]];
      }
    }

    if (failureMatch) {
      const testMethod = failureMatch[1];
      const testClass = failureMatch[2];
      const isError = failureMatch[3] === 'ERROR';

      // Collect stack trace lines (they follow the failure line)
      const stackLines: string[] = [];
      let message = '';
      let errorType = '';
      i++;

      // First non-empty line after FAILURE is usually the exception message
      while (i < lines.length && lines[i].trim() === '') {
        i++;
      }

      // Capture exception message and stack trace
      while (i < lines.length) {
        const stackLine = lines[i];
        // Stop at next test or info sections
        if (stackLine.match(/\[INFO\]/) && stackLines.length > 0) {
          break;
        }
        // Stop at summary line
        if (stackLine.match(/Tests run:\s*\d+,\s*Failures:/)) {
          break;
        }
        // Stop at next failure/error line (check all patterns)
        if (stackLine.match(/\[ERROR\].*<<<\s*(FAILURE|ERROR)!/)) {
          break;
        }
        // Stop at completely empty lines after we've collected some content
        if (stackLine.trim() === '' && stackLines.length > 3) {
          break;
        }

        const cleanLine = stackLine.replace(/^\[ERROR\]\s*/, '').trim();
        if (cleanLine) {
          if (!message && !cleanLine.startsWith('at ')) {
            message = cleanLine;
            // Extract error type from message like "java.lang.NullPointerException: message"
            const typeMatch = cleanLine.match(/^([\w.]+(?:Exception|Error))(?::\s*(.*))?$/);
            if (typeMatch) {
              errorType = typeMatch[1];
              if (typeMatch[2]) {
                message = typeMatch[2];
              }
            }
          }
          stackLines.push(cleanLine);
        }
        i++;
      }

      // Limit stack trace lines
      const limitedStack = stackLines.slice(0, config.maxStackTraceLines);

      // Try to extract file and line from stack trace
      const locationMatch = limitedStack.join('\n').match(/at\s+[\w.$]+\((\w+\.java):(\d+)\)/);

      if (isError) {
        result.errors.push({
          testClass,
          testMethod,
          errorType: errorType || 'Exception',
          message: message || 'Test error',
          stackTrace: limitedStack.join('\n'),
          file: locationMatch?.[1],
          line: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
        });
      } else {
        result.failures.push({
          testClass,
          testMethod,
          message: message || 'Test failure',
          stackTrace: limitedStack.join('\n'),
          file: locationMatch?.[1],
          line: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
        });
      }

      continue;
    }

    i++;
  }

  // Fallback: Parse failures/errors from summary section if we didn't find any inline
  // Maven Surefire outputs sections like:
  // [ERROR] Failures:
  // [ERROR]   TestClass.testMethod:42 expected <X> but was <Y>
  // [ERROR] Errors:
  // [ERROR]   TestClass.testMethod:42 NullPointerException
  if (result.failures.length === 0 && result.summary.failed > 0) {
    parseFailureSummarySection(output, result.failures, 'Failures:');
  }
  if (result.errors.length === 0 && result.summary.errors > 0) {
    parseErrorSummarySection(output, result.errors, 'Errors:');
  }

  result.success = result.summary.failed === 0 && result.summary.errors === 0;

  return result;
}

/**
 * Parse the failure summary section from Maven output
 */
function parseFailureSummarySection(output: string, failures: TestFailure[], sectionHeader: string): void {
  const lines = output.split('\n');
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start of failures section
    if (line.match(new RegExp(`\\[ERROR\\]\\s*${sectionHeader}`))) {
      inSection = true;
      continue;
    }

    // End of section (next section or empty line after some entries)
    if (inSection && (line.match(/\[ERROR\]\s*(Errors:|Tests run:|\s*$)/) || line.match(/\[INFO\]/))) {
      if (line.match(/\[ERROR\]\s*Errors:/)) {
        inSection = false;
      }
      continue;
    }

    if (inSection) {
      // Pattern: [ERROR]   TestClass.testMethod:42 message
      // Or: [ERROR]   com.package.TestClass.testMethod:42 message
      const match = line.match(/\[ERROR\]\s+(?:[\w.]+\.)?(\w+)\.(\w+)(?::(\d+))?\s*(.*)/);
      if (match) {
        const testClass = match[1];
        const testMethod = match[2];
        const lineNum = match[3] ? parseInt(match[3], 10) : undefined;
        const message = match[4] || 'Test failed';

        failures.push({
          testClass,
          testMethod,
          message,
          stackTrace: '',
          line: lineNum,
        });
      }
    }
  }
}

/**
 * Parse the error summary section from Maven output
 */
function parseErrorSummarySection(output: string, errors: TestError[], sectionHeader: string): void {
  const lines = output.split('\n');
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start of errors section
    if (line.match(new RegExp(`\\[ERROR\\]\\s*${sectionHeader}`))) {
      inSection = true;
      continue;
    }

    // End of section
    if (inSection && (line.match(/\[ERROR\]\s*(Tests run:|\s*$)/) || line.match(/\[INFO\]/))) {
      continue;
    }

    if (inSection) {
      // Pattern: [ERROR]   TestClass.testMethod:42 ExceptionType: message
      // Or: [ERROR]   com.package.TestClass.testMethod:42 message
      const match = line.match(/\[ERROR\]\s+(?:[\w.]+\.)?(\w+)\.(\w+)(?::(\d+))?\s*(.*)/);
      if (match) {
        const testClass = match[1];
        const testMethod = match[2];
        const lineNum = match[3] ? parseInt(match[3], 10) : undefined;
        const rawMessage = match[4] || 'Test error';

        // Try to extract error type from message
        let errorType = 'Exception';
        let message = rawMessage;
        const typeMatch = rawMessage.match(/^([\w.]+(?:Exception|Error))(?::\s*(.*))?$/);
        if (typeMatch) {
          errorType = typeMatch[1];
          message = typeMatch[2] || errorType;
        }

        errors.push({
          testClass,
          testMethod,
          errorType,
          message,
          stackTrace: '',
          line: lineNum,
        });
      }
    }
  }
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

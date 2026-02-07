import { config } from '../config.js';

export interface JestTestResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: string;
  };
  failures: JestTestFailure[];
  skipped: JestSkippedTest[];
}

export interface JestTestFailure {
  testFile: string;
  testName: string;
  message: string;
  stackTrace: string;
  file?: string;
  line?: number;
}

export interface JestSkippedTest {
  testFile: string;
  testName: string;
  reason?: string;
}

/**
 * Parse Jest JSON output
 */
export function parseJestJsonOutput(jsonOutput: string): JestTestResult {
  const result: JestTestResult = {
    success: true,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: '0s',
    },
    failures: [],
    skipped: [],
  };

  try {
    const data = JSON.parse(jsonOutput);

    result.success = data.success ?? data.numFailedTests === 0;

    if (data.numTotalTests !== undefined) {
      result.summary.total = data.numTotalTests;
      result.summary.passed = data.numPassedTests || 0;
      result.summary.failed = data.numFailedTests || 0;
      result.summary.skipped = data.numPendingTests || 0;
    }

    // Parse duration
    if (data.startTime && data.endTime) {
      const duration = (data.endTime - data.startTime) / 1000;
      result.summary.duration = `${duration.toFixed(2)}s`;
    } else if (typeof data.testResults?.[0]?.perfStats?.runtime === 'number') {
      const totalRuntime = data.testResults.reduce(
        (sum: number, r: { perfStats?: { runtime?: number } }) => sum + (r.perfStats?.runtime || 0),
        0
      );
      result.summary.duration = `${(totalRuntime / 1000).toFixed(2)}s`;
    }

    // Parse test results
    if (Array.isArray(data.testResults)) {
      for (const testFile of data.testResults) {
        const fileName = testFile.name || testFile.testFilePath || 'unknown';

        if (Array.isArray(testFile.assertionResults)) {
          for (const assertion of testFile.assertionResults) {
            if (assertion.status === 'failed') {
              const messages = assertion.failureMessages || [];
              const message = messages[0] || 'Test failed';

              // Extract stack trace (limit lines)
              const fullStack = message.split('\n');
              const stackTrace = fullStack.slice(0, config.maxStackTraceLines).join('\n');

              // Try to extract file and line from error
              const locationMatch = message.match(/at\s+.*\((.+):(\d+):\d+\)/);

              result.failures.push({
                testFile: fileName,
                testName: assertion.fullName || assertion.title || 'unknown',
                message: fullStack[0] || 'Test failed',
                stackTrace,
                file: locationMatch?.[1],
                line: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
              });
            } else if (assertion.status === 'pending' || assertion.status === 'skipped') {
              result.skipped.push({
                testFile: fileName,
                testName: assertion.fullName || assertion.title || 'unknown',
                reason: assertion.pendingMessage,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    result.success = false;
    result.failures.push({
      testFile: 'unknown',
      testName: 'JSON parsing',
      message: `Failed to parse Jest JSON output: ${error instanceof Error ? error.message : String(error)}`,
      stackTrace: '',
    });
  }

  return result;
}

/**
 * Parse Jest console output (fallback when JSON is not available)
 */
export function parseJestConsoleOutput(output: string): Partial<JestTestResult> {
  const result: Partial<JestTestResult> = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: '0s',
    },
    failures: [],
  };

  // Parse summary line: Tests: X passed, Y failed, Z total
  const summaryMatch = output.match(/Tests:\s+(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(\d+)\s+total/);
  if (summaryMatch) {
    result.summary!.passed = parseInt(summaryMatch[1] || '0', 10);
    result.summary!.failed = parseInt(summaryMatch[2] || '0', 10);
    result.summary!.skipped = parseInt(summaryMatch[3] || '0', 10);
    result.summary!.total = parseInt(summaryMatch[4], 10);
  }

  // Parse time
  const timeMatch = output.match(/Time:\s+([\d.]+)\s*s/);
  if (timeMatch) {
    result.summary!.duration = `${timeMatch[1]}s`;
  }

  result.success = result.summary!.failed === 0;

  return result;
}

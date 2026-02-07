import { config } from '../config.js';

export interface VitestTestResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: string;
  };
  failures: VitestTestFailure[];
  skipped: VitestSkippedTest[];
}

export interface VitestTestFailure {
  testFile: string;
  testName: string;
  message: string;
  stackTrace: string;
  file?: string;
  line?: number;
}

export interface VitestSkippedTest {
  testFile: string;
  testName: string;
  reason?: string;
}

/**
 * Parse Vitest JSON output
 */
export function parseVitestJsonOutput(jsonOutput: string): VitestTestResult {
  const result: VitestTestResult = {
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

    result.success = data.success ?? true;

    // Vitest JSON format
    if (data.numTotalTests !== undefined) {
      result.summary.total = data.numTotalTests;
      result.summary.passed = data.numPassedTests || 0;
      result.summary.failed = data.numFailedTests || 0;
      result.summary.skipped = data.numPendingTests || data.numSkippedTests || 0;
    }

    // Parse duration
    if (data.duration) {
      result.summary.duration = `${(data.duration / 1000).toFixed(2)}s`;
    }

    // Parse test files
    if (Array.isArray(data.testResults)) {
      for (const testFile of data.testResults) {
        const fileName = testFile.name || 'unknown';

        if (Array.isArray(testFile.assertionResults)) {
          for (const assertion of testFile.assertionResults) {
            if (assertion.status === 'failed') {
              const messages = assertion.failureMessages || [];
              const message = messages[0] || 'Test failed';
              const fullStack = message.split('\n');
              const stackTrace = fullStack.slice(0, config.maxStackTraceLines).join('\n');

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

    result.success = result.summary.failed === 0;
  } catch (error) {
    result.success = false;
    result.failures.push({
      testFile: 'unknown',
      testName: 'JSON parsing',
      message: `Failed to parse Vitest JSON output: ${error instanceof Error ? error.message : String(error)}`,
      stackTrace: '',
    });
  }

  return result;
}

/**
 * Parse Vitest console output (fallback when JSON is not available)
 */
export function parseVitestConsoleOutput(output: string): Partial<VitestTestResult> {
  const result: Partial<VitestTestResult> = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: '0s',
    },
    failures: [],
  };

  // Parse summary lines
  // Tests  3 passed | 1 failed | 1 skipped (5)
  const testsMatch = output.match(/Tests\s+(?:(\d+)\s+passed\s*\|?\s*)?(?:(\d+)\s+failed\s*\|?\s*)?(?:(\d+)\s+skipped\s*\|?\s*)?\((\d+)\)/);
  if (testsMatch) {
    result.summary!.passed = parseInt(testsMatch[1] || '0', 10);
    result.summary!.failed = parseInt(testsMatch[2] || '0', 10);
    result.summary!.skipped = parseInt(testsMatch[3] || '0', 10);
    result.summary!.total = parseInt(testsMatch[4], 10);
  }

  // Parse duration
  const durationMatch = output.match(/Duration\s+([\d.]+)([sm]s?)/);
  if (durationMatch) {
    const value = parseFloat(durationMatch[1]);
    const unit = durationMatch[2];
    if (unit === 'ms') {
      result.summary!.duration = `${(value / 1000).toFixed(2)}s`;
    } else {
      result.summary!.duration = `${value}s`;
    }
  }

  result.success = result.summary!.failed === 0;

  return result;
}

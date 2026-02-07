import { z } from 'zod';
import { detectProject } from '../utility/detect-project.js';
import { mavenTest } from '../../engines/maven/client.js';
import { gradleTest } from '../../engines/gradle/client.js';
import { TestResult } from '../../parsers/maven-output.js';

export const runTestsSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  javaVersion: z.string().optional().describe('Java version to use (e.g., "17.0.16-amzn", "21.0.8-tem")'),
  testPattern: z.string().optional().describe('Specific test class or method pattern (e.g., "UserServiceTest", "UserServiceTest#testLogin")'),
  module: z.string().optional().describe('Specific module to test (for multi-module projects)'),
  failFast: z.boolean().optional().describe('Stop on first failure'),
  clean: z.boolean().optional().describe('Run clean before tests'),
});

export type RunTestsParams = z.infer<typeof runTestsSchema>;

export interface RunTestsResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    duration: string;
  };
  failures: Array<{
    testClass: string;
    testMethod: string;
    message: string;
    stackTrace: string;
    file?: string;
    line?: number;
  }>;
  skipped: Array<{
    testClass: string;
    testMethod: string;
    reason?: string;
  }>;
  buildSystem?: string;
}

/**
 * Run tests for a Java project using Maven or Gradle
 */
export async function runTests(params: RunTestsParams): Promise<RunTestsResult> {
  const { projectPath, javaVersion, testPattern, module, failFast = false, clean = false } = params;

  // Detect project type
  const projectInfo = await detectProject({ projectPath });

  if (!projectInfo.success || !projectInfo.project) {
    return {
      success: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 1, duration: '0s' },
      failures: [{
        testClass: 'ProjectDetection',
        testMethod: 'detectProject',
        message: projectInfo.error || 'Failed to detect project type',
        stackTrace: '',
      }],
      skipped: [],
    };
  }

  const buildSystem = projectInfo.project.buildSystem;

  if (!buildSystem || !['maven', 'gradle'].includes(buildSystem)) {
    return {
      success: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 1, duration: '0s' },
      failures: [{
        testClass: 'BuildSystem',
        testMethod: 'validate',
        message: `Unsupported build system: ${buildSystem}. Expected maven or gradle.`,
        stackTrace: '',
      }],
      skipped: [],
    };
  }

  let result: TestResult;

  if (buildSystem === 'maven') {
    result = await mavenTest({
      projectPath,
      javaVersion,
      testPattern,
      module,
      failFast,
      clean,
    });
  } else {
    result = await gradleTest({
      projectPath,
      javaVersion,
      testPattern,
      module,
      failFast,
      clean,
    });
  }

  return {
    ...result,
    buildSystem,
  };
}

export const runTestsTool = {
  name: 'run_tests',
  description: 'Run tests for a Java project using Maven or Gradle. Returns structured test results with failures and stack traces.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to the project root directory',
      },
      javaVersion: {
        type: 'string',
        description: 'Java version to use (e.g., "17.0.16-amzn", "21.0.8-tem")',
      },
      testPattern: {
        type: 'string',
        description: 'Specific test class or method pattern (e.g., "UserServiceTest", "UserServiceTest#testLogin")',
      },
      module: {
        type: 'string',
        description: 'Specific module to test (for multi-module projects)',
      },
      failFast: {
        type: 'boolean',
        description: 'Stop on first failure (default: false)',
      },
      clean: {
        type: 'boolean',
        description: 'Run clean before tests (default: false)',
      },
    },
    required: ['projectPath'],
  },
};

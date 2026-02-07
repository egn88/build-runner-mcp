import { z } from 'zod';
import { nodeTest, NodeTestResult } from '../../engines/node/client.js';
import { detectProject } from '../utility/detect-project.js';

export const nodeRunTestsSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  testPattern: z.string().optional().describe('Test file or name pattern'),
  failFast: z.boolean().optional().describe('Stop on first failure'),
  coverage: z.boolean().optional().describe('Generate coverage report'),
  packageManager: z.enum(['npm', 'pnpm', 'yarn']).optional().describe('Package manager to use (auto-detected if not specified)'),
  testFramework: z.enum(['jest', 'vitest', 'mocha']).optional().describe('Test framework (auto-detected if not specified)'),
});

export type NodeRunTestsParams = z.infer<typeof nodeRunTestsSchema>;

export interface NodeRunTestsResult {
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
  packageManager?: string;
  testFramework?: string;
}

/**
 * Run tests for a Node.js/TypeScript project
 */
export async function nodeRunTests(params: NodeRunTestsParams): Promise<NodeRunTestsResult> {
  const { projectPath, testPattern, failFast = false, coverage = false, packageManager, testFramework } = params;

  // Detect project settings if not specified
  let pm = packageManager;
  let tf = testFramework;

  const projectInfo = await detectProject({ projectPath });
  if (projectInfo.success && projectInfo.project) {
    if (!pm && projectInfo.project.packageManager) {
      pm = projectInfo.project.packageManager;
    }
    if (!tf && projectInfo.project.testFramework) {
      tf = projectInfo.project.testFramework as 'jest' | 'vitest' | 'mocha';
    }
  }

  const result = await nodeTest({
    projectPath,
    packageManager: pm,
    testPattern,
    failFast,
    coverage,
    testFramework: tf,
  });

  return {
    ...result,
    packageManager: pm,
    testFramework: tf,
  };
}

export const nodeRunTestsTool = {
  name: 'node_test',
  description: 'Run tests for a Node.js/TypeScript project using Jest, Vitest, or Mocha. Returns structured test results.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to the project root directory',
      },
      testPattern: {
        type: 'string',
        description: 'Test file or name pattern',
      },
      failFast: {
        type: 'boolean',
        description: 'Stop on first failure (default: false)',
      },
      coverage: {
        type: 'boolean',
        description: 'Generate coverage report (default: false)',
      },
      packageManager: {
        type: 'string',
        enum: ['npm', 'pnpm', 'yarn'],
        description: 'Package manager to use (auto-detected if not specified)',
      },
      testFramework: {
        type: 'string',
        enum: ['jest', 'vitest', 'mocha'],
        description: 'Test framework (auto-detected if not specified)',
      },
    },
    required: ['projectPath'],
  },
};

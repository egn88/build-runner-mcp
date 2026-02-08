import { z } from 'zod';
import { detectProject } from '../utility/detect-project.js';
import { mavenCompile } from '../../engines/maven/client.js';
import { gradleCompile } from '../../engines/gradle/client.js';
import { CompileResult } from '../../parsers/maven-output.js';

export const compileProjectSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  javaVersion: z.string().optional().describe('Java version to use (e.g., "17.0.16-amzn", "21.0.8-tem")'),
  clean: z.boolean().optional().describe('Run clean before compile'),
  module: z.string().optional().describe('Module(s) to include/exclude (e.g., "core,api" or "!slow-tests" or "core,!tests")'),
  alsoMake: z.boolean().optional().describe('Build required dependencies with -am flag (default: true)'),
});

export type CompileProjectParams = z.infer<typeof compileProjectSchema>;

export interface CompileProjectResult {
  success: boolean;
  errors: Array<{
    file: string;
    line: number;
    column?: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    file: string;
    line: number;
    column?: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  summary: {
    errorCount: number;
    warningCount: number;
  };
  buildSystem?: string;
}

/**
 * Compile a Java project using Maven or Gradle
 */
export async function compileProject(params: CompileProjectParams): Promise<CompileProjectResult> {
  const { projectPath, javaVersion, clean = false, module, alsoMake } = params;

  // Detect project type
  const projectInfo = await detectProject({ projectPath });

  if (!projectInfo.success || !projectInfo.project) {
    return {
      success: false,
      errors: [{
        file: projectPath,
        line: 0,
        message: projectInfo.error || 'Failed to detect project type',
        severity: 'error',
      }],
      warnings: [],
      summary: { errorCount: 1, warningCount: 0 },
    };
  }

  const buildSystem = projectInfo.project.buildSystem;

  if (!buildSystem || !['maven', 'gradle'].includes(buildSystem)) {
    return {
      success: false,
      errors: [{
        file: projectPath,
        line: 0,
        message: `Unsupported build system: ${buildSystem}. Expected maven or gradle.`,
        severity: 'error',
      }],
      warnings: [],
      summary: { errorCount: 1, warningCount: 0 },
    };
  }

  let result: CompileResult;

  if (buildSystem === 'maven') {
    result = await mavenCompile({
      projectPath,
      javaVersion,
      clean,
      module,
      alsoMake,
    });
  } else {
    result = await gradleCompile({
      projectPath,
      javaVersion,
      clean,
      module,
      alsoMake,
    });
  }

  return {
    ...result,
    buildSystem,
  };
}

export const compileProjectTool = {
  name: 'compile_project',
  description: 'Compile a Java project using Maven or Gradle. Returns structured error/warning information.',
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
      clean: {
        type: 'boolean',
        description: 'Run clean before compile (default: false)',
      },
      module: {
        type: 'string',
        description: 'Module(s) to include/exclude (e.g., "core,api" or "!slow-tests" or "core,!tests")',
      },
      alsoMake: {
        type: 'boolean',
        description: 'Build required dependencies with -am flag (default: true, Maven only)',
      },
    },
    required: ['projectPath'],
  },
};

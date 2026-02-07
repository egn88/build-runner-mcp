import { z } from 'zod';
import { detectProject } from '../utility/detect-project.js';
import { mavenBuild } from '../../engines/maven/client.js';
import { gradleBuild } from '../../engines/gradle/client.js';
import { BuildResult } from '../../parsers/maven-output.js';

export const buildProjectSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  javaVersion: z.string().optional().describe('Java version to use (e.g., "17.0.16-amzn", "21.0.8-tem")'),
  skipTests: z.boolean().optional().describe('Skip running tests during build'),
  clean: z.boolean().optional().describe('Run clean before build'),
  module: z.string().optional().describe('Specific module to build (for multi-module projects)'),
});

export type BuildProjectParams = z.infer<typeof buildProjectSchema>;

export interface BuildProjectResult {
  success: boolean;
  artifacts: Array<{
    path: string;
    size: string;
  }>;
  duration: string;
  errors?: string[];
  buildSystem?: string;
}

/**
 * Build/package a Java project using Maven or Gradle
 */
export async function buildProject(params: BuildProjectParams): Promise<BuildProjectResult> {
  const { projectPath, javaVersion, skipTests = true, clean = false, module } = params;

  // Detect project type
  const projectInfo = await detectProject({ projectPath });

  if (!projectInfo.success || !projectInfo.project) {
    return {
      success: false,
      artifacts: [],
      duration: '0s',
      errors: [projectInfo.error || 'Failed to detect project type'],
    };
  }

  const buildSystem = projectInfo.project.buildSystem;

  if (!buildSystem || !['maven', 'gradle'].includes(buildSystem)) {
    return {
      success: false,
      artifacts: [],
      duration: '0s',
      errors: [`Unsupported build system: ${buildSystem}. Expected maven or gradle.`],
    };
  }

  let result: BuildResult;

  if (buildSystem === 'maven') {
    result = await mavenBuild({
      projectPath,
      javaVersion,
      skipTests,
      clean,
      module,
    });
  } else {
    result = await gradleBuild({
      projectPath,
      javaVersion,
      skipTests,
      clean,
      module,
    });
  }

  return {
    ...result,
    buildSystem,
  };
}

export const buildProjectTool = {
  name: 'build_project',
  description: 'Build/package a Java project using Maven or Gradle. Returns build artifacts and duration.',
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
      skipTests: {
        type: 'boolean',
        description: 'Skip running tests during build (default: true)',
      },
      clean: {
        type: 'boolean',
        description: 'Run clean before build (default: false)',
      },
      module: {
        type: 'string',
        description: 'Specific module to build (for multi-module projects)',
      },
    },
    required: ['projectPath'],
  },
};

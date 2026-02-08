import { z } from 'zod';
import { detectProject } from '../utility/detect-project.js';
import { mavenInstall } from '../../engines/maven/client.js';
import { gradleInstall } from '../../engines/gradle/client.js';
import { BuildResult } from '../../parsers/maven-output.js';

export const installProjectSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  javaVersion: z.string().optional().describe('Java version to use (e.g., "17.0.16-amzn", "21.0.8-tem")'),
  skipTests: z.boolean().optional().describe('Skip running tests during install (default: true)'),
  clean: z.boolean().optional().describe('Run clean before install (default: false)'),
  module: z.string().optional().describe('Module(s) to include/exclude (e.g., "core,api" or "!slow-tests" or "core,!tests")'),
  alsoMake: z.boolean().optional().describe('Build required dependencies with -am flag (default: true)'),
});

export type InstallProjectParams = z.infer<typeof installProjectSchema>;

export interface InstallProjectResult {
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
 * Install a Java project to local repository using Maven or Gradle
 */
export async function installProject(params: InstallProjectParams): Promise<InstallProjectResult> {
  const { projectPath, javaVersion, skipTests = true, clean = false, module, alsoMake } = params;

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
    result = await mavenInstall({
      projectPath,
      javaVersion,
      skipTests,
      clean,
      module,
      alsoMake,
    });
  } else {
    result = await gradleInstall({
      projectPath,
      javaVersion,
      skipTests,
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

export const installProjectTool = {
  name: 'install_project',
  description: 'Install a Java project to the local Maven repository using Maven (mvn install) or Gradle (publishToMavenLocal). Supports multi-module projects with -pl flag for inclusion/exclusion.',
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
        description: 'Skip running tests during install (default: true)',
      },
      clean: {
        type: 'boolean',
        description: 'Run clean before install (default: false)',
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

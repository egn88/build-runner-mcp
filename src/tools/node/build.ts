import { z } from 'zod';
import { nodeBuild, nodeTypeCheck, NodeBuildResult } from '../../engines/node/client.js';
import { detectProject } from '../utility/detect-project.js';

export const nodeBuildProjectSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  script: z.string().optional().describe('NPM script to run (default: "build")'),
  packageManager: z.enum(['npm', 'pnpm', 'yarn']).optional().describe('Package manager to use (auto-detected if not specified)'),
});

export type NodeBuildProjectParams = z.infer<typeof nodeBuildProjectSchema>;

export interface NodeBuildProjectResult {
  success: boolean;
  duration: string;
  errors?: string[];
  packageManager?: string;
}

/**
 * Build a Node.js/TypeScript project
 */
export async function nodeBuildProject(params: NodeBuildProjectParams): Promise<NodeBuildProjectResult> {
  const { projectPath, script = 'build', packageManager } = params;

  // Detect project if package manager not specified
  let pm = packageManager;
  if (!pm) {
    const projectInfo = await detectProject({ projectPath });
    if (projectInfo.success && projectInfo.project?.packageManager) {
      pm = projectInfo.project.packageManager;
    }
  }

  const result = await nodeBuild({
    projectPath,
    packageManager: pm,
    script,
  });

  return {
    ...result,
    packageManager: pm,
  };
}

export const nodeTypeCheckSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
  packageManager: z.enum(['npm', 'pnpm', 'yarn']).optional().describe('Package manager to use (auto-detected if not specified)'),
});

export type NodeTypeCheckParams = z.infer<typeof nodeTypeCheckSchema>;

/**
 * Type check a TypeScript project
 */
export async function nodeTypeCheckProject(params: NodeTypeCheckParams): Promise<NodeBuildProjectResult> {
  const { projectPath, packageManager } = params;

  let pm = packageManager;
  if (!pm) {
    const projectInfo = await detectProject({ projectPath });
    if (projectInfo.success && projectInfo.project?.packageManager) {
      pm = projectInfo.project.packageManager;
    }
  }

  const result = await nodeTypeCheck({
    projectPath,
    packageManager: pm,
  });

  return {
    ...result,
    packageManager: pm,
  };
}

export const nodeBuildProjectTool = {
  name: 'node_build',
  description: 'Build a Node.js/TypeScript project using npm, pnpm, or yarn.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to the project root directory',
      },
      script: {
        type: 'string',
        description: 'NPM script to run (default: "build")',
      },
      packageManager: {
        type: 'string',
        enum: ['npm', 'pnpm', 'yarn'],
        description: 'Package manager to use (auto-detected if not specified)',
      },
    },
    required: ['projectPath'],
  },
};

export const nodeTypeCheckTool = {
  name: 'node_typecheck',
  description: 'Type check a TypeScript project using tsc --noEmit.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to the project root directory',
      },
      packageManager: {
        type: 'string',
        enum: ['npm', 'pnpm', 'yarn'],
        description: 'Package manager to use (auto-detected if not specified)',
      },
    },
    required: ['projectPath'],
  },
};

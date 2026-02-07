import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export const detectProjectSchema = z.object({
  projectPath: z.string().describe('Path to the project root directory'),
});

export type DetectProjectParams = z.infer<typeof detectProjectSchema>;

export interface ProjectInfo {
  projectPath: string;
  languages: string[];
  buildSystem?: 'maven' | 'gradle' | 'npm' | 'pnpm' | 'yarn';
  javaVersion?: string;
  typescriptConfig?: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn';
  testFramework?: 'junit' | 'testng' | 'jest' | 'vitest' | 'mocha';
  isMultiModule?: boolean;
  modules?: string[];
}

export interface DetectProjectResult {
  success: boolean;
  project?: ProjectInfo;
  error?: string;
}

/**
 * Detect project type, build system, and configuration
 */
export async function detectProject(params: DetectProjectParams): Promise<DetectProjectResult> {
  const projectPath = resolve(params.projectPath);

  if (!existsSync(projectPath)) {
    return {
      success: false,
      error: `Project path does not exist: ${projectPath}`,
    };
  }

  const info: ProjectInfo = {
    projectPath,
    languages: [],
  };

  // Detect Java projects
  const pomPath = join(projectPath, 'pom.xml');
  const gradlePath = join(projectPath, 'build.gradle');
  const gradleKtsPath = join(projectPath, 'build.gradle.kts');

  if (existsSync(pomPath)) {
    info.languages.push('java');
    info.buildSystem = 'maven';
    info.testFramework = 'junit';

    // Check for multi-module Maven project
    try {
      const pomContent = readFileSync(pomPath, 'utf-8');
      if (pomContent.includes('<modules>')) {
        info.isMultiModule = true;
        const moduleMatches = pomContent.matchAll(/<module>([^<]+)<\/module>/g);
        info.modules = Array.from(moduleMatches).map(m => m[1]);
      }
    } catch {
      // Ignore read errors
    }
  } else if (existsSync(gradlePath) || existsSync(gradleKtsPath)) {
    info.languages.push('java');
    info.buildSystem = 'gradle';
    info.testFramework = 'junit';

    // Check for multi-module Gradle project
    const settingsPath = join(projectPath, 'settings.gradle');
    const settingsKtsPath = join(projectPath, 'settings.gradle.kts');
    if (existsSync(settingsPath) || existsSync(settingsKtsPath)) {
      const settingsFile = existsSync(settingsPath) ? settingsPath : settingsKtsPath;
      try {
        const settingsContent = readFileSync(settingsFile, 'utf-8');
        if (settingsContent.includes('include')) {
          info.isMultiModule = true;
          const moduleMatches = settingsContent.matchAll(/include\s*\(?['"]([^'"]+)['"]/g);
          info.modules = Array.from(moduleMatches).map(m => m[1].replace(':', ''));
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  // Check for src/main/java directory as additional indicator
  if (existsSync(join(projectPath, 'src', 'main', 'java'))) {
    if (!info.languages.includes('java')) {
      info.languages.push('java');
    }
  }

  // Detect TypeScript/JavaScript projects
  const tsconfigPath = join(projectPath, 'tsconfig.json');
  const packageJsonPath = join(projectPath, 'package.json');

  if (existsSync(tsconfigPath)) {
    info.languages.push('typescript');
    info.typescriptConfig = tsconfigPath;
  }

  // Detect package manager and test framework
  if (existsSync(packageJsonPath)) {
    if (!info.languages.includes('typescript') && !info.languages.includes('javascript')) {
      info.languages.push('javascript');
    }

    // Check for lock files to determine package manager
    if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
      info.packageManager = 'pnpm';
      info.buildSystem = 'pnpm';
    } else if (existsSync(join(projectPath, 'yarn.lock'))) {
      info.packageManager = 'yarn';
      info.buildSystem = 'yarn';
    } else if (existsSync(join(projectPath, 'package-lock.json'))) {
      info.packageManager = 'npm';
      info.buildSystem = 'npm';
    } else {
      info.packageManager = 'npm';
      info.buildSystem = 'npm';
    }

    // Detect test framework from package.json
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps['vitest']) {
        info.testFramework = 'vitest';
      } else if (deps['jest']) {
        info.testFramework = 'jest';
      } else if (deps['mocha']) {
        info.testFramework = 'mocha';
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for Angular-specific files
  if (existsSync(join(projectPath, 'angular.json'))) {
    if (!info.languages.includes('typescript')) {
      info.languages.push('typescript');
    }
  }

  return {
    success: true,
    project: info,
  };
}

export const detectProjectTool = {
  name: 'detect_project',
  description: 'Detect project type, build system, test framework, and configuration. Supports Maven, Gradle, npm, pnpm, and yarn projects.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to the project root directory',
      },
    },
    required: ['projectPath'],
  },
};

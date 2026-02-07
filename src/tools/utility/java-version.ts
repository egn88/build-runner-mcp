import { z } from 'zod';
import { executeCommand } from '../../utils/command.js';
import { config } from '../../config.js';
import { homedir } from 'os';
import { join } from 'path';

export const setJavaVersionSchema = z.object({
  version: z.string().describe('Java version to switch to (e.g., "17.0.16-amzn", "21.0.8-tem")'),
  projectPath: z.string().optional().describe('Optional: project path to verify the switch'),
});

export type SetJavaVersionParams = z.infer<typeof setJavaVersionSchema>;

export interface JavaVersionResult {
  success: boolean;
  currentVersion?: string;
  previousVersion?: string;
  error?: string;
}

/**
 * Get current Java version
 */
export async function getCurrentJavaVersion(): Promise<string | null> {
  const sdkmanInit = `source "${join(homedir(), '.sdkman/bin/sdkman-init.sh')}"`;
  const result = await executeCommand(`${sdkmanInit} && sdk current java`);

  if (result.success) {
    // Parse output like "Using java version 17.0.16-amzn"
    const match = result.stdout.match(/Using java version ([^\s]+)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * List available Java versions from SDKMAN
 */
export async function listAvailableVersions(): Promise<string[]> {
  const sdkmanInit = `source "${join(homedir(), '.sdkman/bin/sdkman-init.sh')}"`;
  const result = await executeCommand(`${sdkmanInit} && sdk list java | grep installed`);

  if (result.success) {
    const versions: string[] = [];
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      // Parse SDKMAN list output to extract installed versions
      const match = line.match(/\|\s+(\d+\.\d+\.\d+-[^\s|]+)\s+\|.*installed/);
      if (match) {
        versions.push(match[1]);
      }
    }
    return versions.length > 0 ? versions : config.availableJavaVersions;
  }
  return config.availableJavaVersions;
}

/**
 * Switch Java version using SDKMAN
 */
export async function setJavaVersion(params: SetJavaVersionParams): Promise<JavaVersionResult> {
  const { version, projectPath } = params;

  // Get current version first
  const previousVersion = await getCurrentJavaVersion();

  // Switch to the requested version
  const result = await executeCommand(
    `sdk use java ${version}`,
    { javaVersion: version, cwd: projectPath }
  );

  if (!result.success) {
    // Check if version is not installed
    if (result.stderr.includes('not installed') || result.stderr.includes('not found')) {
      return {
        success: false,
        previousVersion: previousVersion ?? undefined,
        error: `Java version ${version} is not installed. Available versions: ${config.availableJavaVersions.join(', ')}`,
      };
    }
    return {
      success: false,
      previousVersion: previousVersion ?? undefined,
      error: `Failed to switch Java version: ${result.stderr}`,
    };
  }

  // Verify the switch worked
  const verifyResult = await executeCommand(
    'java -version 2>&1 | head -1',
    { javaVersion: version }
  );

  return {
    success: true,
    currentVersion: version,
    previousVersion: previousVersion ?? undefined,
  };
}

export const setJavaVersionTool = {
  name: 'set_java_version',
  description: `Switch Java version using SDKMAN before running commands. Available versions: ${config.availableJavaVersions.join(', ')}`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      version: {
        type: 'string',
        description: 'Java version to switch to (e.g., "17.0.16-amzn", "21.0.8-tem")',
      },
      projectPath: {
        type: 'string',
        description: 'Optional: project path to verify the switch',
      },
    },
    required: ['version'],
  },
};

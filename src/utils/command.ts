import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  javaVersion?: string;
}

const SDKMAN_INIT = `source "${join(homedir(), '.sdkman/bin/sdkman-init.sh')}"`;

/**
 * Execute a shell command with optional SDKMAN Java version switching
 */
export async function executeCommand(
  command: string,
  options: CommandOptions = {}
): Promise<CommandResult> {
  const { cwd, env, timeout = 300000, javaVersion } = options;
  const startTime = Date.now();

  // Build the full command with SDKMAN if Java version is specified
  let fullCommand = command;
  if (javaVersion) {
    fullCommand = `${SDKMAN_INIT} && sdk use java ${javaVersion} > /dev/null 2>&1 && ${command}`;
  }

  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', fullCommand], {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        stdout,
        stderr: stderr + '\n[TIMEOUT] Command exceeded time limit',
        exitCode: -1,
        duration: Date.now() - startTime,
      });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code ?? -1,
        duration: Date.now() - startTime,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        stdout,
        stderr: stderr + '\n' + error.message,
        exitCode: -1,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

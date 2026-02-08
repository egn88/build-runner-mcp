import { homedir } from 'os';
import { join } from 'path';

export interface Config {
  sdkmanPath: string;
  availableJavaVersions: string[];
  defaultTimeout: number;
  maxStackTraceLines: number;
}

export const config: Config = {
  sdkmanPath: join(homedir(), '.sdkman'),
  availableJavaVersions: [
    '17.0.16-amzn',
    '21.0.8-tem',
    '21.0.9-amzn',
    '25.0.1-tem',
  ],
  defaultTimeout: 300000, // 5 minutes
  maxStackTraceLines: 25,
};

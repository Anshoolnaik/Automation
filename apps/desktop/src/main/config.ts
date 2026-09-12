import { DEFAULT_AGENT_PORT } from '@atlas/agent-protocol';
import { LOG_LEVELS, type LogLevel } from '@atlas/logger';
import { z } from 'zod';

export interface AppConfig {
  agentPort: number;
  logLevel: LogLevel;
  /** Optional explicit Chrome executable, for non-standard installations. */
  chromeExecutablePath?: string;
  isDevelopment: boolean;
}

const EnvSchema = z.object({
  ATLAS_AGENT_PORT: z.coerce
    .number()
    .int('ATLAS_AGENT_PORT must be an integer')
    .min(1024, 'ATLAS_AGENT_PORT must be between 1024 and 65535')
    .max(65535, 'ATLAS_AGENT_PORT must be between 1024 and 65535')
    .optional(),
  ATLAS_LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  ATLAS_CHROME_EXECUTABLE: z.string().trim().min(1).optional(),
});

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadAppConfig(
  env: Record<string, string | undefined>,
  options: { isPackaged: boolean },
): AppConfig {
  const withoutBlanks = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = EnvSchema.safeParse(withoutBlanks);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new ConfigError(`Invalid Atlas configuration: ${details}`);
  }
  const isDevelopment = !options.isPackaged;
  const config: AppConfig = {
    agentPort: parsed.data.ATLAS_AGENT_PORT ?? DEFAULT_AGENT_PORT,
    logLevel: parsed.data.ATLAS_LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
    isDevelopment,
  };
  if (parsed.data.ATLAS_CHROME_EXECUTABLE) {
    config.chromeExecutablePath = parsed.data.ATLAS_CHROME_EXECUTABLE;
  }
  return config;
}

import { ATLAS_EXTENSION_ID, DEFAULT_AGENT_PORT } from '@atlas/agent-protocol';
import { LOG_LEVELS, type LogLevel } from '@atlas/logger';
import { z } from 'zod';

export interface AppConfig {
  agentPort: number;
  logLevel: LogLevel;
  /**
   * Chrome extension IDs allowed to connect to the local agent server.
   * Empty means any Chrome extension (only via ATLAS_ALLOWED_EXTENSION_IDS=*).
   */
  allowedExtensionIds: string[];
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
  ATLAS_ALLOWED_EXTENSION_IDS: z
    .string()
    .trim()
    .refine(
      (value) => value === '*' || value.split(',').every((id) => /^[a-p]{32}$/.test(id.trim())),
      'ATLAS_ALLOWED_EXTENSION_IDS must be "*" or a comma-separated list of Chrome extension IDs',
    )
    .optional(),
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
    allowedExtensionIds: parseAllowedExtensionIds(parsed.data.ATLAS_ALLOWED_EXTENSION_IDS),
    isDevelopment,
  };
  if (parsed.data.ATLAS_CHROME_EXECUTABLE) {
    config.chromeExecutablePath = parsed.data.ATLAS_CHROME_EXECUTABLE;
  }
  return config;
}

function parseAllowedExtensionIds(raw: string | undefined): string[] {
  if (raw === undefined) return [ATLAS_EXTENSION_ID];
  if (raw === '*') return [];
  return raw.split(',').map((id) => id.trim());
}

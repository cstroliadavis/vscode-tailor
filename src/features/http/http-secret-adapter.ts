import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { HttpEnvironmentFileMap } from './http-variable-resolver.ts';
import {
  listEnvironmentNames,
  parseDotenvFile,
  parseHttpClientEnvJson,
} from './http-variable-resolver.ts';

/**
 * Reads a UTF-8 file if it exists, or returns `''` when missing or unreadable.
 */
async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Resolves the active environment name, falling back to the first available environment.
 */
function resolveActiveEnvName(activeEnv: string | null, envNames: readonly string[]): string {
  if (activeEnv) return activeEnv;

  return envNames.at(0) ?? 'default';
}

/**
 * Creates an `HttpSecretProvider` backed by macOS `/usr/bin/security` and VS Code `SecretStorage`.
 *
 * @param secrets - VS Code extension `SecretStorage` instance.
 * @returns Configured `HttpSecretProvider` for `{{$keychain ...}}` and `{{$secret ...}}` lookups.
 *
 * @example
 * ```ts
 * const provider = createHttpSecretProvider(context.secrets);
 * ```
 */
export function createHttpSecretProvider(secrets: vscode.SecretStorage): HttpSecretProvider {
  return {
    getKeychainPassword: (service, account) => queryMacOsKeychain(service, account),
    async getSecretStorage(key) {
      const val = await secrets.get(`vscodeTailor.http.${key}`);

      return val ?? undefined;
    },
  };
}

/**
 * Loads `.env`, `.env.local`, `http-client.env.json`, and `http-client.private.env.json` from `dirPath`.
 *
 * @param dirPath - Directory containing the `.http` file or workspace root.
 * @param activeEnv - Selected environment name (`dev`, `prod`, etc.).
 * @returns Loaded `.env` variables, parsed public/private environment maps, and discovered environment names.
 *
 * @example
 * ```ts
 * const envData = await loadDirectoryEnvironmentConfig('/workspace', 'dev');
 * ```
 */
export async function loadDirectoryEnvironmentConfig(
  dirPath: string,
  activeEnv: string | null,
): Promise<LoadedEnvironmentConfig> {
  const [dotEnvRaw, dotEnvLocalRaw, pubEnvRaw, privEnvRaw] = await Promise.all([
    readOptionalFile(path.join(dirPath, '.env')),
    readOptionalFile(path.join(dirPath, '.env.local')),
    readOptionalFile(path.join(dirPath, 'http-client.env.json')),
    readOptionalFile(path.join(dirPath, 'http-client.private.env.json')),
  ]);
  const httpClientEnv = parseHttpClientEnvJson(pubEnvRaw);
  const httpClientPrivateEnv = parseHttpClientEnvJson(privEnvRaw);
  const discovered = listEnvironmentNames(httpClientEnv, httpClientPrivateEnv);
  const environments = discovered.length > 0 ? discovered : ['default'];
  const resolvedActive = resolveActiveEnvName(activeEnv, environments);

  return {
    activeEnvironment: resolvedActive,
    dotenvVariables: {
      ...parseDotenvFile(dotEnvRaw),
      ...parseDotenvFile(dotEnvLocalRaw),
    },
    environments,
    httpClientEnv,
    httpClientPrivateEnv,
  };
}

/**
 * Queries macOS Keychain via `/usr/bin/security find-generic-password -s <service> -a <account> -w`.
 *
 * @param service - Keychain service name (`-s`).
 * @param account - Keychain account name (`-a`).
 * @returns Trimmed secret string if found, or `undefined` if not found / non-macOS.
 *
 * @example
 * ```ts
 * const secret = await queryMacOsKeychain('my-api', 'default');
 * ```
 */
export function queryMacOsKeychain(service: string, account: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-s', service, '-a', account, '-w'],
      { timeout: 5000 },
      (err, stdout) => {
        if (err) {
          resolve(undefined);

          return;
        }

        resolve(stdout.trim());
      },
    );
  });
}

/**
 * Adapter interface for resolving `{{$keychain}}` and `{{$secret}}` expressions.
 */
export interface HttpSecretProvider {
  /** Queries macOS Keychain for `(service, account)`. */
  getKeychainPassword: (service: string, account: string) => Promise<string | undefined>;
  /** Queries VS Code `SecretStorage` for `key`. */
  getSecretStorage: (key: string) => Promise<string | undefined>;
}

/**
 * Loaded environment and `.env` variable bundle for a workspace/file directory.
 */
export interface LoadedEnvironmentConfig {
  /** Effective environment name (`dev`, `prod`, or `'default'`). */
  activeEnvironment: string;
  /** Merged `.env` and `.env.local` key-value pairs. */
  dotenvVariables: Record<string, string>;
  /** All discovered non-`$shared` environment names. */
  environments: string[];
  /** Parsed `http-client.env.json` environment map. */
  httpClientEnv: HttpEnvironmentFileMap;
  /** Parsed `http-client.private.env.json` environment map. */
  httpClientPrivateEnv: HttpEnvironmentFileMap;
}

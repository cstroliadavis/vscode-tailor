import { describe, expect, it } from 'bun:test';
import {
  detectSyntaxFormat,
  isSyntaxFormatEnabled,
  resolveTargetLanguageId,
} from '../src/features/syntax/syntax-detector.ts';
import {
  groupSyntaxTokensByKind,
  tokenizeSyntaxDocument,
} from '../src/features/syntax/syntax-tokenizer.ts';
import type { SyntaxSettings } from '../src/features/syntax/syntax-types.ts';

describe('syntax-detector and syntax-tokenizer', () => {
  /**
   * Optional configuration overrides for syntax test setup.
   */
  interface SetupOverrides {
    jsonEnabled?: boolean;
    terraformEnabled?: boolean;
    tomlEnabled?: boolean;
    yamlEnabled?: boolean;
  }

  const setup = (overrides: SetupOverrides = {}) => {
    const settings: SyntaxSettings = Object.freeze({
      jsonEnabled: overrides.jsonEnabled ?? true,
      terraformEnabled: overrides.terraformEnabled ?? true,
      tomlEnabled: overrides.tomlEnabled ?? true,
      yamlEnabled: overrides.yamlEnabled ?? true,
    });

    return { settings };
  };

  it('detects TOML, JSON, YAML, and Terraform formats from extensions and custom associations', () => {
    const customAssociations = Object.freeze({
      '.prettierrc': 'jsonc' as const,
      '.terraformrc': 'terraform' as const,
      '.yamllint': 'yaml' as const,
      'Cargo.lock': 'toml' as const,
    });

    expect(detectSyntaxFormat('/workspace/.mise.toml')).toBe('toml');
    expect(detectSyntaxFormat('/workspace/bunfig.toml', 'LANGUAGE_UNSPECIFIED')).toBe('toml');
    expect(detectSyntaxFormat('/workspace/Cargo.lock')).toBeNull();
    expect(detectSyntaxFormat('/workspace/Cargo.lock', '', customAssociations)).toBe('toml');
    expect(detectSyntaxFormat('/workspace/package.json', 'json')).toBe('json');
    expect(detectSyntaxFormat('/workspace/infra/terraform.tfstate')).toBe('json');
    expect(detectSyntaxFormat('/workspace/infra/terraform.tfstate.backup')).toBe('json');
    expect(detectSyntaxFormat('/workspace/settings.jsonc')).toBe('json');
    expect(detectSyntaxFormat('/workspace/events.jsonl')).toBe('json');
    expect(detectSyntaxFormat('/workspace/.prettierrc', '', customAssociations)).toBe('json');
    expect(detectSyntaxFormat('/workspace/docker-compose.yml')).toBe('yaml');
    expect(detectSyntaxFormat('/workspace/config.yaml')).toBe('yaml');
    expect(detectSyntaxFormat('/workspace/.yamllint', '', customAssociations)).toBe('yaml');
    expect(detectSyntaxFormat('/workspace/infra/main.tf')).toBe('terraform');
    expect(detectSyntaxFormat('/workspace/infra/dev.tfvars')).toBe('terraform');
    expect(detectSyntaxFormat('/workspace/infra/.terraform.lock.hcl')).toBe('terraform');
    expect(detectSyntaxFormat('/workspace/.terraformrc', '', customAssociations)).toBe('terraform');
    expect(detectSyntaxFormat('/workspace/README.md', 'markdown')).toBeNull();
  });

  it('resolves target language IDs when a config document opens as plaintext or misclassified', () => {
    const customAssociations = Object.freeze({
      '.bad': 'invalid-lang',
      '.rc': 'YML',
      '.terraformrc': 'HCL',
      'Cargo.lock': 'TOML',
    });

    expect(resolveTargetLanguageId('/repo/.mise.toml', 'plaintext')).toBe('toml');
    expect(resolveTargetLanguageId('/repo/Cargo.lock', 'LANGUAGE_UNSPECIFIED')).toBeNull();
    expect(
      resolveTargetLanguageId('/repo/Cargo.lock', 'LANGUAGE_UNSPECIFIED', customAssociations),
    ).toBe('toml');
    expect(resolveTargetLanguageId('/repo/app.rc', 'plaintext', customAssociations)).toBe('yaml');
    expect(resolveTargetLanguageId('/repo/file.bad', 'plaintext', customAssociations)).toBeNull();
    expect(resolveTargetLanguageId('/repo/tsconfig.jsonc', 'plaintext')).toBe('jsonc');
    expect(resolveTargetLanguageId('/repo/infra/terraform.tfstate', 'plaintext')).toBe('json');
    expect(resolveTargetLanguageId('/repo/infra/terraform.tfstate.backup', 'plaintext')).toBe(
      'json',
    );
    expect(resolveTargetLanguageId('/repo/data.jsonl', 'unknown')).toBe('jsonl');
    expect(resolveTargetLanguageId('/repo/config.yaml', '')).toBe('yaml');
    expect(resolveTargetLanguageId('/repo/infra/main.tf', 'typescript')).toBe('terraform');
    expect(resolveTargetLanguageId('/repo/infra/.terraform.lock.hcl', 'plaintext')).toBe(
      'terraform',
    );
    expect(resolveTargetLanguageId('/repo/.terraformrc', 'plaintext', customAssociations)).toBe(
      'terraform',
    );
    expect(resolveTargetLanguageId('/repo/.mise.toml', 'toml')).toBeNull();
  });

  it('checks per-format enablement flags from SyntaxSettings', () => {
    const { settings } = setup({
      jsonEnabled: true,
      terraformEnabled: true,
      tomlEnabled: false,
      yamlEnabled: true,
    });

    expect(isSyntaxFormatEnabled('toml', settings)).toBe(false);
    expect(isSyntaxFormatEnabled('json', settings)).toBe(true);
    expect(isSyntaxFormatEnabled('yaml', settings)).toBe(true);
    expect(isSyntaxFormatEnabled('terraform', settings)).toBe(true);
  });

  it('tokenizes TOML sections, keys, strings, numbers, booleans, datetimes, and comments', () => {
    const tomlSource = [
      '# Mise configuration',
      '[tools]',
      'node = "22.11.0"',
      'port = 8080',
      'enabled = true',
      'created = 2026-10-26T15:39:07Z',
      'inline = { name = "tailor", retries = 3 } # inline comment',
    ].join('\n');

    const tokens = tokenizeSyntaxDocument(tomlSource, 'toml');
    const grouped = groupSyntaxTokensByKind(tokens);

    expect(grouped.get('comment')?.length).toBe(2);
    expect(grouped.get('section')?.length).toBe(1);
    expect(grouped.get('key')?.length).toBe(7);
    expect(grouped.get('string')?.length).toBe(2);
    expect(grouped.get('number')?.length).toBe(2);
    expect(grouped.get('boolean')?.length).toBe(1);
    expect(grouped.get('datetime')?.length).toBe(1);
  });

  it('tokenizes JSON and JSONC keys, strings, numbers, booleans, null, and comments', () => {
    const jsoncSource = [
      '{',
      '  // Server settings',
      '  "host": "localhost",',
      '  "port": 3000,',
      '  "tls": false,',
      '  "cert": null /* inline block */',
      '}',
    ].join('\n');

    const tokens = tokenizeSyntaxDocument(jsoncSource, 'json');
    const grouped = groupSyntaxTokensByKind(tokens);

    expect(grouped.get('comment')?.length).toBe(2);
    expect(grouped.get('key')?.length).toBe(4);
    expect(grouped.get('string')?.length).toBe(1);
    expect(grouped.get('number')?.length).toBe(1);
    expect(grouped.get('boolean')?.length).toBe(1);
    expect(grouped.get('null')?.length).toBe(1);
  });

  it('tokenizes YAML document headers, mapping keys, anchors, scalars, dates, and comments', () => {
    const yamlSource = [
      '---',
      '# Deployment manifest',
      'service: &svc vscode-tailor',
      'replicas: 3',
      'enabled: true',
      'fallback: null',
      'released: 2026-10-26',
      'ref: *svc',
    ].join('\n');

    const tokens = tokenizeSyntaxDocument(yamlSource, 'yaml');
    const grouped = groupSyntaxTokensByKind(tokens);

    expect(grouped.get('section')?.length).toBe(1);
    expect(grouped.get('comment')?.length).toBe(1);
    expect(grouped.get('key')?.length).toBe(6);
    expect(grouped.get('anchor')?.length).toBe(2);
    expect(grouped.get('string')?.length).toBe(1);
    expect(grouped.get('number')?.length).toBe(1);
    expect(grouped.get('boolean')?.length).toBe(1);
    expect(grouped.get('null')?.length).toBe(1);
    expect(grouped.get('datetime')?.length).toBe(1);
  });

  it('tokenizes Terraform blocks, attributes, strings, booleans, types, references, and comments', () => {
    const tfSource = [
      '# DynamoDB portfolio table',
      'resource "aws_dynamodb_table" "portfolio" {',
      '  name = "ChrisPortfolio"',
      '  billing_mode = "PAY_PER_REQUEST"',
      '  skip_credentials_validation = true',
      '  read_capacity = 5',
      '  type = string',
      '  attribute {',
      '    name = "pk"',
      '  }',
      '}',
      'output "table_name" {',
      '  value = aws_dynamodb_table.portfolio.name',
      '}',
    ].join('\n');

    const tokens = tokenizeSyntaxDocument(tfSource, 'terraform');
    const grouped = groupSyntaxTokensByKind(tokens);

    expect(grouped.get('comment')?.length).toBe(1);
    expect(grouped.get('section')?.length).toBe(3);
    expect(grouped.get('key')?.length).toBe(7);
    expect(grouped.get('string')?.length).toBe(6);
    expect(grouped.get('boolean')?.length).toBe(1);
    expect(grouped.get('number')?.length).toBe(1);
    expect(grouped.get('datetime')?.length).toBe(1);
    expect(grouped.get('anchor')?.length).toBe(1);
  });
});

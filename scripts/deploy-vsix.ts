import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VSCODE_CLI_CANDIDATES = [
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
  '/usr/local/bin/code',
  '/opt/homebrew/bin/code',
] as const;

/**
 * Generates the `[Content_Types].xml` manifest required at the root of a `.vsix` archive.
 */
function buildContentTypesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".cjs" ContentType="application/javascript" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".map" ContentType="application/json" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".txt" ContentType="text/plain" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
</Types>
`;
}

/**
 * Generates the `extension.vsixmanifest` XML file from `package.json` metadata.
 */
function buildVsixManifestXml(pkg: PackageManifest): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}" />
    <DisplayName>${pkg.displayName}</DisplayName>
    <Description xml:space="preserve">${pkg.description}</Description>
    <Tags>tailor,csv,rainbow-csv,custom-editor</Tags>
    <Categories>${pkg.categories.join(',')}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui,workspace" />
    </Properties>
    <License>extension/LICENSE</License>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

/**
 * Resolves the path to the local VS Code CLI binary (`code`), if present.
 */
function findVscodeCli(): string | null {
  for (const candidate of VSCODE_CLI_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Packages the built extension into a `.vsix` file and installs it into the local VS Code editor.
 *
 * @example
 * ```ts
 * await packageAndDeployVsix();
 * ```
 */
export async function packageAndDeployVsix(): Promise<void> {
  const rootDir = process.cwd();
  const pkgText = readFileSync(join(rootDir, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgText) as PackageManifest;
  const vsixName = `${pkg.name}-${pkg.version}.vsix`;
  const vsixPath = join(rootDir, vsixName);
  const stageDir = join(rootDir, '.vsix-stage');
  const extDir = join(stageDir, 'extension');

  rmSync(stageDir, { force: true, recursive: true });
  rmSync(vsixPath, { force: true });
  mkdirSync(extDir, { recursive: true });

  writeFileSync(join(stageDir, '[Content_Types].xml'), buildContentTypesXml(), 'utf8');
  writeFileSync(join(stageDir, 'extension.vsixmanifest'), buildVsixManifestXml(pkg), 'utf8');
  cpSync(join(rootDir, 'package.json'), join(extDir, 'package.json'));
  cpSync(join(rootDir, 'README.md'), join(extDir, 'README.md'));
  cpSync(join(rootDir, 'LICENSE'), join(extDir, 'LICENSE'));
  cpSync(join(rootDir, 'dist'), join(extDir, 'dist'), { recursive: true });

  const zipProc = Bun.spawnSync(['zip', '-r', '-q', vsixPath, '.'], { cwd: stageDir });

  rmSync(stageDir, { force: true, recursive: true });

  if (zipProc.exitCode !== 0) {
    throw new Error(`Failed to create VSIX archive: ${zipProc.stderr.toString()}`);
  }

  console.log(`Packaged VSIX: ${vsixPath}`);
  const codeCli = findVscodeCli();

  if (!codeCli) {
    console.log('VS Code CLI not found; install the generated .vsix manually via Extensions menu.');

    return;
  }

  const installProc = Bun.spawnSync([codeCli, '--install-extension', vsixPath, '--force']);

  if (installProc.exitCode !== 0) {
    throw new Error(`VS Code CLI install failed: ${installProc.stderr.toString()}`);
  }

  console.log(installProc.stdout.toString().trim());
}

/**
 * Subset of `package.json` fields consumed by the VSIX manifest builder.
 */
interface PackageManifest {
  categories: string[];
  description: string;
  displayName: string;
  engines: { vscode: string };
  name: string;
  publisher: string;
  version: string;
}

if (import.meta.main) {
  await packageAndDeployVsix();
}

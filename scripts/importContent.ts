import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  applyContentImportPreview,
  ExistingUpdateDecision,
  ImportPreviewReport,
  ImportableContent,
  PotentialDuplicateDecision,
  previewContentImport,
} from "../src/services/contentImportService.ts";
import { ContentFamily } from "../src/services/contentIdentityService.ts";
import { CONTENT_FILES } from "./auditContent.ts";

interface CliOptions {
  input: string;
  family: ContentFamily;
  apply: boolean;
  includePotential: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const input = valueAfter("--input");
  const family = valueAfter("--type") as ContentFamily | undefined;
  const supported = Object.keys(CONTENT_FILES) as ContentFamily[];
  if (!input) throw new Error("Missing --input path.");
  if (!family || !supported.includes(family)) {
    throw new Error(`--type must be one of: ${supported.join(", ")}.`);
  }
  if (args.includes("--apply") && args.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  return {
    input,
    family,
    apply: args.includes("--apply"),
    includePotential: args.includes("--include-potential"),
  };
}

async function readJsonArray(filePath: string): Promise<ImportableContent[]> {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${filePath}: JSON root must be an array.`);
  return parsed as ImportableContent[];
}

function printPreview(preview: ImportPreviewReport): void {
  console.log(JSON.stringify({
    family: preview.family,
    total: preview.total,
    newItems: preview.newItems,
    updates: preview.updates,
    exactDuplicates: preview.exactDuplicates,
    potentialDuplicates: preview.potentialDuplicates,
    idConflicts: preview.idConflicts,
    invalidItems: preview.invalidItems,
  }, null, 2));
  preview.items.forEach((item) => {
    const existing = item.existingId === undefined ? "" : ` existing=${String(item.existingId)}`;
    console.log(`[${item.index}] ${item.action} id=${String(item.incomingId ?? "-")}${existing} term="${item.term}"${item.reason ? ` - ${item.reason}` : ""}`);
  });
}

async function replaceFileAtomically(target: string, content: string, temp: string): Promise<void> {
  await writeFile(temp, content, "utf8");
  await rename(temp, target);
}

function runAudit(rootDir: string): void {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "data:audit"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`data:audit failed with exit code ${String(result.status)}.`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = path.resolve(options.input);
  const targetPath = path.resolve(rootDir, CONTENT_FILES[options.family]);
  const dataVersionPath = path.resolve(rootDir, "src/services/dataVersion.ts");
  const existing = await readJsonArray(targetPath);
  const incoming = await readJsonArray(inputPath);
  const preview = previewContentImport(incoming, existing, options.family, existing);
  printPreview(preview);

  if (preview.idConflicts || preview.invalidItems) {
    throw new Error("Import is blocked by id conflicts or invalid items. No files were changed.");
  }
  if (!options.apply) {
    console.log("Dry run complete. No files were changed.");
    return;
  }

  const potentialDecisions = Object.fromEntries(
    preview.items
      .filter((item) => item.action === "potential_duplicate")
      .map((item) => [item.index, options.includePotential ? "add" : "skip"])
  ) as Record<number, PotentialDuplicateDecision>;
  const updateDecisions = Object.fromEntries(
    preview.items
      .filter((item) => item.action === "update")
      .map((item) => [item.index, "update"])
  ) as Record<number, ExistingUpdateDecision>;
  const applied = applyContentImportPreview(
    existing,
    preview,
    potentialDecisions,
    updateDecisions,
    false
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(rootDir, ".content-backups");
  const targetBackup = path.join(backupDir, `${path.basename(targetPath)}.${timestamp}.backup`);
  const versionBackup = path.join(backupDir, `dataVersion.ts.${timestamp}.backup`);
  const targetTemp = `${targetPath}.${process.pid}.tmp`;
  const versionTemp = `${dataVersionPath}.${process.pid}.tmp`;
  await mkdir(backupDir, { recursive: true });
  await copyFile(targetPath, targetBackup);
  await copyFile(dataVersionPath, versionBackup);

  try {
    const currentVersionSource = await readFile(dataVersionPath, "utf8");
    const nextVersion = `content-${new Date().toISOString()}`;
    const nextVersionSource = currentVersionSource.replace(
      /export const DATA_VERSION\s*=\s*[^;]+;/,
      `export const DATA_VERSION = ${JSON.stringify(nextVersion)};`
    );
    if (nextVersionSource === currentVersionSource) {
      throw new Error("Could not update the central DATA_VERSION constant.");
    }

    await replaceFileAtomically(targetPath, `${JSON.stringify(applied.items, null, 2)}\n`, targetTemp);
    await replaceFileAtomically(dataVersionPath, nextVersionSource, versionTemp);
    runAudit(rootDir);
    console.log(`Applied import: ${applied.created} created, ${applied.updated} updated, ${applied.skipped} skipped.`);
    console.log(`Backup: ${targetBackup}`);
  } catch (error) {
    await copyFile(targetBackup, targetPath);
    await copyFile(versionBackup, dataVersionPath);
    throw new Error(`Import failed and files were rolled back: ${(error as Error).message}`);
  } finally {
    await rm(targetTemp, { force: true });
    await rm(versionTemp, { force: true });
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd(), 'server');

export const paths = {
  dataDir: path.join(root, 'data'),
  dbFile: path.join(root, 'data', 'app.sqlite'),
  uploadsDir: path.join(root, 'uploads'),
  generatedDir: path.join(root, 'generated')
};

export async function ensureDirs() {
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  await fs.mkdir(paths.generatedDir, { recursive: true });
}

export function templateDir(templateId) {
  return path.join(paths.uploadsDir, templateId);
}

export function templateOriginalPath(templateId, filename) {
  return path.join(templateDir(templateId), `original-${filename}`);
}

export function templateWorkingPath(templateId, filename) {
  return path.join(templateDir(templateId), `template-${filename}`);
}

export function generatedPath(generatedId, filename) {
  return path.join(paths.generatedDir, `${generatedId}-${filename}`);
}


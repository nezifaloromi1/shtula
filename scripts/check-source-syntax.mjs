import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch {
  for (const candidate of [process.env.TYPESCRIPT_PATH, '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript'].filter(Boolean)) {
    try { ts = require(candidate); break; } catch { /* Try next path. */ }
  }
}
if (!ts) throw new Error('TypeScript is required. Run npm install first.');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = [
  ...walk('src'),
  ...walk('modules'),
].filter((file) => /\.(ts|tsx)$/.test(file));
const failures = [];
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    failures.push(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  }
  const sourceFile = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const inspect = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
        const name = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) ? property.name.text : null;
        if (name === null) continue;
        if (seen.has(name)) failures.push(`${file}: duplicate object-literal property \"${name}\"`);
        seen.add(name);
      }
    }
    ts.forEachChild(node, inspect);
  };
  inspect(sourceFile);
}
for (const file of walk('src').filter((name) => name.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`${file}: invalid JSON (${String(error)})`); }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Passed: TypeScript/TSX syntax transpilation for ${files.length} files and JSON parsing for ${walk('src').filter((name) => name.endsWith('.json')).length} files.`);
}

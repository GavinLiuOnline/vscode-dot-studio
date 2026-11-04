// Regenerates the Solution Explorer context menu commands, menus and keybindings in package.json,
// the menu reference docs/context-menus.md and the menu strings of package.nls.json, from
// src/core/contextMenus.ts. Run via `npm run generate:menus`.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/core/contextMenus.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const mod = { exports: {} };
new Function('module', 'exports', 'require', outputText)(mod, mod.exports, require);

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
fs.writeFileSync(pkgPath, JSON.stringify(mod.exports.applyMenuContributions(pkg), null, 2) + '\n');
fs.writeFileSync(path.join(root, 'docs', 'context-menus.md'), mod.exports.buildMenuReference());

// The generated titles and submenu labels are NLS keys in package.json: keep their English text here
const nlsPath = path.join(root, 'package.nls.json');
let nls = {};
try {
    nls = JSON.parse(fs.readFileSync(nlsPath, 'utf8'));
} catch {
    // The file does not exist yet: the first `npm run generate:menus` creates it
}
fs.writeFileSync(nlsPath, JSON.stringify({ ...nls, ...mod.exports.buildMenuNls() }, null, 2) + '\n');
console.log('package.json context menus, docs/context-menus.md and package.nls.json updated');

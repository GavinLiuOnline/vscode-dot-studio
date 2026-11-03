// Minimal LSP client for the Roslyn language server over stdio: opens a solution, asks for code actions on a class name.
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const extension = process.argv[3]; // dll or ''
const server = process.env.ROSLYN_SERVER ?? process.env.HOME + '/.vscode-oss/extensions/muhammad-sammy.csharp-2.160.9-g01198ecc1f-linux-x64/.roslyn/Microsoft.CodeAnalysis.LanguageServer';
const logDir = fs.mkdtempSync('/tmp/roslyn-spike-logs-');
const args = ['--stdio', '--logLevel', 'Information', '--extensionLogDirectory', logDir, '--autoLoadProjects', ...(extension ? ['--extension', extension] : [])];
const child = spawn(server, args, { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
const notifications = [];
const serverLog = [];
child.stderr.on('data', d => serverLog.push(d.toString()));
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.slice(0, headerEnd).toString())[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const message = JSON.parse(buffer.slice(headerEnd + 4, headerEnd + 4 + length).toString());
    buffer = buffer.slice(headerEnd + 4 + length);
    if (message.id !== undefined && message.method) {
      // a request from the server: answer with null/empty
      const result = message.method === 'workspace/configuration' ? (message.params.items ?? []).map(() => null) : null;
      send({ jsonrpc: '2.0', id: message.id, result });
    } else if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) {
      notifications.push(message.method);
      if (message.method === 'window/logMessage' && /extension|Extension|Shinobi/.test(JSON.stringify(message.params))) serverLog.push('LOG ' + JSON.stringify(message.params).slice(0, 300));
    }
  }
});
const send = m => { const body = JSON.stringify(m); child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`); };
const request = (method, params, timeout = 60000) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => reject(new Error('timeout ' + method)), timeout);
  pending.set(id, m => { clearTimeout(timer); resolve(m); });
  send({ jsonrpc: '2.0', id, method, params });
});
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const rootUri = pathToFileURL(root).href;
const init = await request('initialize', {
  processId: process.pid, rootUri, workspaceFolders: [{ uri: rootUri, name: 'Contoso' }],
  capabilities: { workspace: { configuration: true, workspaceFolders: true }, textDocument: { codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['', 'quickfix', 'refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite', 'source'] } }, dataSupport: true, resolveSupport: { properties: ['edit'] } } } },
});
console.log('initialized, server caps codeAction:', JSON.stringify(init.result?.capabilities?.codeActionProvider));
notify('initialized', {});
notify('solution/open', { solution: pathToFileURL(path.join(root, 'Contoso.slnx')).href });
for (let i = 0; i < 120 && !notifications.includes('workspace/projectInitializationComplete'); i++) await sleep(1000);
console.log('project initialization complete:', notifications.includes('workspace/projectInitializationComplete'));

const file = path.join(root, 'src/Shop.Core/Orders/Order.cs');
const text = fs.readFileSync(file, 'utf8');
const uri = pathToFileURL(file).href;
notify('textDocument/didOpen', { textDocument: { uri, languageId: 'csharp', version: 1, text } });
await sleep(3000);
const lines = text.split('\n');
const probes = [
  ['class name', /public class Order\b/, 'Order'],
  ['method name', /public void Add\(/, 'Add'],
  ['method parameter', /public void Add\(/, 'product'],
  ['property name', /public decimal Total/, 'Total'],
  ['field name', /private readonly List<OrderLine> _lines/, '_lines'],
  ['namespace', /^namespace /, 'Shop'],
  ['local variable', /int unused/, 'unused'],
];
const actions = [];
for (const [label, re, token] of probes) {
  const line = lines.findIndex(l => re.test(l));
  if (line < 0) { console.log(label, ': line not found'); continue; }
  const character = lines[line].indexOf(token) + 1;
  const result = await request('textDocument/codeAction', { textDocument: { uri }, range: { start: { line, character }, end: { line, character } }, context: { diagnostics: [] } });
  actions.push(...(result.result ?? []));
  console.log(`== ${label} (${line + 1}:${character + 1}):`, (result.result ?? []).map(a => a.title).join(' || '));
}
console.log('Shinobi action present:', actions.some(a => /Shinobi/.test(a.title)));
console.log('server stderr tail:', serverLog.join('').split('\n').slice(-6).join('\n').slice(0, 600));
child.kill();
process.exit(0);

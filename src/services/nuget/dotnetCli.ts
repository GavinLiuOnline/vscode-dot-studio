import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Runs `dotnet` with these arguments, without a shell: ids, versions and paths from the user or from a project file
 * are never interpreted (`Foo;touch x` is one argument). Rejects when the command exits with an error, like `exec`.
 */
export function execDotnet(args: readonly string[], options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('dotnet', [...args], { ...options, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

/**
 * Why a dotnet command failed, in one line: the `error:` lines of its output (the CLI prints them to stdout, and the
 * message of the exception then has only "Command failed: dotnet add ..."), else the exception's first line
 */
export function cliFailureReason(error: unknown): string {
    const { stdout = '', stderr = '', message = '' } = (error ?? {}) as { stdout?: string; stderr?: string; message?: string };
    const errors = `${stderr}\n${stdout}`.split(/\r?\n/)
        .map(line => /^\s*(?:error|fail)\b\s*:?\s*(.+)$/i.exec(line)?.[1]?.replace(/\s+-\s*$/, '').trim())
        .filter((line): line is string => !!line);
    return errors.length > 0 ? [...new Set(errors)].join(' ') : (message.split(/\r?\n/)[0] || 'Unknown error');
}

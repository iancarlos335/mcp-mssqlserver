import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function stripQuotes(value) {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}
function parseEnvFile(contents) {
    const result = {};
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;
        const eq = line.indexOf('=');
        if (eq === -1)
            continue;
        const key = line.slice(0, eq).trim();
        const value = stripQuotes(line.slice(eq + 1).trim());
        if (key)
            result[key] = value;
    }
    return result;
}
/**
 * Loads the repo's own .env file, anchored to this module's location rather
 * than process.cwd(), so a globally installed/linked `mssql-cli` picks up
 * this repo's configuration regardless of the caller's working directory.
 * Existing process.env values always win over .env values.
 */
export function loadRepoEnv() {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const envPath = resolve(repoRoot, '.env');
    let contents;
    try {
        contents = readFileSync(envPath, 'utf8');
    }
    catch {
        return;
    }
    const parsed = parseEnvFile(contents);
    for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
//# sourceMappingURL=env.js.map
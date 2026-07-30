/**
 * Loads the repo's own .env file, anchored to this module's location rather
 * than process.cwd(), so a globally installed/linked `mssql-cli` picks up
 * this repo's configuration regardless of the caller's working directory.
 * Existing process.env values always win over .env values.
 */
export declare function loadRepoEnv(): void;
//# sourceMappingURL=env.d.ts.map
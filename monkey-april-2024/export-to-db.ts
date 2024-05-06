import fse from 'fs-extra';
import { globby } from 'globby';
import sqlite3 from 'better-sqlite3';

const platform = process.argv[2];
const dataDir = process.argv[3];
const databasePath = process.argv[4];
if (!platform || !dataDir || !databasePath)
    throw new Error(
        'You need to provide the platform, the path for the HAR files, and path to the database as the arguments.'
    );

const db = sqlite3(databasePath);
db.prepare(
    `create table if not exists "requests" (
    "id" integer,
    "dataset" text default 'monkey-april-2024',
    "initiator" text,
    "platform" text not null,
    "runType" text,
    "startTime" text not null,
    "method" text not null,
    "httpVersion" text,
    "endpointUrl" text,
    "scheme" text,
    "host" text not null,
    "port" integer,
    "path" text not null,
    "content" blob,
    "headers" text not null,
    "cookies" text not null,
    primary key("dataset", "id")
) without rowid;`
).run();
db.pragma('journal_mode = WAL');

const insertStmt = db.prepare<
    [
        number,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number | null,
        string,
        string,
        string,
        string
    ]
>(
    `insert into "requests" (id, initiator, platform, runType, startTime, method, httpVersion, endpointUrl, scheme, host, port, path, content, headers, cookies) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
);

// Taken from: https://github.com/tweaselORG/TrackHAR/blob/6fadcff049054fa1d4ef4bc89dfb93267b6ad1a1/src/common/request.ts#L29-L52
const unhar = (har: { log: { entries: any[] } }) =>
    har.log.entries.map((e) => {
        const url = new URL(e.request.url);
        const endpointUrl = `${url.protocol}//${url.host}${url.pathname}`;

        return {
            startTime: new Date(e.startedDateTime),
            method: e.request.method,
            host: url.hostname,
            path: url.pathname + url.search,
            endpointUrl,
            content: e.request.postData?.text,
            port: url.port,
            scheme: url.protocol.replace(':', '') as 'http' | 'https',
            httpVersion: e.request.httpVersion,
            headers: e.request.headers,
            cookies: e.request.cookies,
        };
    });

(async () => {
    const harFiles = await globby('**/*.har', { cwd: dataDir, absolute: true });

    let i = (db.prepare('select max(id) as max from requests').get() as { max: number }).max || 0;
    for (const harFile of harFiles) {
        const metaFile = harFile.replace(/\.har$/, '-meta.json');
        if (!(await fse.pathExists(metaFile))) throw new Error(`Meta file for ${harFile} does not exist.`);

        const meta = await fse.readJSON(metaFile);

        const har = await fse.readJSON(harFile);
        try {
            const requests = unhar(har);

            for (const request of requests) {
                insertStmt.run(
                    ++i,
                    `${meta.app.id}@${meta.app.version}`,
                    platform,
                    platform === 'android' ? 'monkey' : 'no-interaction',
                    request.startTime.toISOString(),
                    request.method,
                    request.httpVersion,
                    request.endpointUrl,
                    request.scheme,
                    request.host,
                    +request.port || (request.scheme === 'http' ? 80 : request.scheme === 'https' ? 443 : null),
                    request.path,
                    request.content,
                    JSON.stringify(request.headers),
                    JSON.stringify(request.cookies)
                );
            }
        } catch (err) {
            console.error(`Failed to process ${harFile}:`, err);
        }
    }
})();

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

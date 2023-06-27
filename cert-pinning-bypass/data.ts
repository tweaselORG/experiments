import sqlite3 from 'better-sqlite3';
import { join } from 'path';

const db = sqlite3(join('data', 'results.db'));

(async () => {
    db.pragma('journal_mode = WAL');

    const incompleteApps = db
        .prepare<string[]>(
            `SELECT DISTINCT appId FROM runs
WHERE appId NOT IN (
  SELECT appId FROM runs
  WHERE method IN ('none', 'objection', 'httptoolkit')
  GROUP BY appId
  HAVING COUNT(DISTINCT method) = 3
);`
        )
        .all();
    if (incompleteApps.length > 0)
        throw new Error(`The following apps don't have results for all methods: ${incompleteApps.join(', ')}`);

    const crashesPerMethod = db.prepare('SELECT method, SUM(appCrashed) AS crashCount FROM runs GROUP BY method').all();
    console.log('Crashes per method:', crashesPerMethod);

    for (const error of [
        'The client disconnected during the handshake',
        "The client does not trust the proxy''s certificate for",
        'connection closed early',
        'Client and mitmproxy cannot agree on a TLS version to use',
    ]) {
        const appsPerMethodWithTlsError = db
            .prepare(
                `SELECT method, COUNT(DISTINCT appId) AS appCount FROM runs
    WHERE tlsErrors like '%${error}%'
    GROUP BY method;`
            )
            .all();
        console.log(`Apps per method with TLS error "${error}":`, appsPerMethodWithTlsError);
    }

    const appsPerMethodWithAnyTlsError = db
        .prepare(
            `SELECT method, COUNT(DISTINCT appId) AS appCount FROM runs
    WHERE json_array_length(tlsErrors) > 0
    GROUP BY method;`
        )
        .all();
    console.log(`Apps per method with any TLS error:`, appsPerMethodWithAnyTlsError);

    // https://github.com/tweaselORG/meta/issues/16#issuecomment-1602683111 :(
    const domainFromErrorMessage = (error: string) => {
        for (const regex of [
            /The client disconnected during the handshake. If this happens consistently for (.+?),/,
            /The client does not trust the proxy's certificate for (.+?) /,
        ]) {
            const match = error.match(regex);
            if (match) return match[1];
        }
    };
    const runs = (
        db.prepare('SELECT appId, method, tlsErrors FROM runs;').all() as {
            appId: string;
            method: string;
            tlsErrors: string;
        }[]
    )
        .map((r) => ({
            ...r,
            tlsErrors: JSON.parse(r.tlsErrors).map((e) => {
                const serverDomain = domainFromErrorMessage(e.context.error);
                return { ...e, serverDomain };
            }),
        }))
        .map((r) => ({
            ...r,
            domainsWithUntrustedCertificate: new Set(
                r.tlsErrors
                    // As per https://github.com/tweaselORG/meta/issues/16#issuecomment-1604533549, "The client does not
                    // trust the proxy's certificate for" is the only error related to certificate pinning.
                    .filter((e) => e.context.error.includes("The client does not trust the proxy's certificate for"))
                    .map((e) => e.serverDomain)
                    .filter((d) => !!d)
            ),
        }));

    const domainsWithUntrustedCertificateWithoutBypass = new Set(
        runs.filter((r) => r.method === 'none').flatMap((r) => Array.from(r.domainsWithUntrustedCertificate))
    );
    console.log('Domains with untrusted certificate without bypass:', domainsWithUntrustedCertificateWithoutBypass);
    const unsolvedDomains = new Set(
        runs.filter((r) => r.method !== 'none').flatMap((r) => Array.from(r.domainsWithUntrustedCertificate))
    );
    console.log('Unsolved domains despite bypass (for either script):', unsolvedDomains);

    const solvedDomains = {
        objection: new Set<string>(),
        httptoolkit: new Set<string>(),
    };
    for (const run of runs) {
        if (run.method === 'none') continue;

        const runForNone = runs.find((r) => r.appId === run.appId && r.method === 'none');
        if (!runForNone) throw new Error(`No run for none found for ${run.appId}. That should never happen.`);

        for (const domain of runForNone.domainsWithUntrustedCertificate) {
            if (!run.domainsWithUntrustedCertificate.has(domain)) solvedDomains[run.method].add(domain);
        }
    }

    const compareSets = <T>(a: Set<T>, b: Set<T>) => {
        const added = [...b].filter((x) => !a.has(x));
        const removed = [...a].filter((x) => !b.has(x));
        return { added, removed };
    };

    console.log('Solved domains per method:', {
        objection: solvedDomains.objection.size,
        httptoolkit: solvedDomains.httptoolkit.size,
    });
    console.log(
        'Comparing solved domains between objection and httptoolkit:',
        compareSets(solvedDomains.objection, solvedDomains.httptoolkit)
    );
})();

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

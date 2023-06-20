import { pause, startAnalysis } from 'cyanoacrylate';
import fse from 'fs-extra';
import { join } from 'path';
import { getVenv } from 'autopy';
import sqlite3 from 'better-sqlite3';
import { ExecaChildProcess } from 'execa';
import { parseAppMeta } from 'appstraction';
import { killProcess } from './util';

const apkDir = process.argv[2];
if (!apkDir) throw new Error('You need to provide the path that holds the APKs as the only argument.');

const db = sqlite3(join('data', 'results.db'));

(async () => {
    const python = await getVenv({
        name: 'appstraction',
        pythonVersion: '~3.11',
        requirements: [
            { name: 'frida-tools', version: '~=12.1' },
            { name: 'objection', version: '~=1.11' },
        ],
    });
    db.prepare(
        'CREATE TABLE IF NOT EXISTS runs (appId TEXT, version TEXT, method TEXT, requestCount INTEGER, tlsErrors TEXT, appCrashed INTEGER, PRIMARY KEY(appId, method));'
    ).run();
    db.pragma('journal_mode = WAL');
    const checkStmt = db.prepare<[string, string]>('SELECT 1 FROM runs WHERE appId = ? AND method = ?;');
    const insertStmt = db.prepare<[string, string, string, number, string, 0 | 1]>(
        'INSERT INTO runs(appId, version, method, requestCount, tlsErrors, appCrashed) VALUES(?, ?, ?, ?, ?, ?);'
    );

    const analysis = await startAnalysis({
        platform: 'android',
        runTarget: 'device',
        capabilities: ['frida'],
    });
    const apps = (await fse.readdir(apkDir)).map((f) => join(apkDir, f));

    await analysis.ensureDevice();

    for (const app of apps) {
        try {
            const appMeta = await parseAppMeta(app as `${string}.apk`);
            for (const method of ['none', 'objection', 'httptoolkit']) {
                if (checkStmt.get(appMeta!.id, method)) {
                    console.log(`Already analyzed ${appMeta!.id} (method: ${method}).`);
                    continue;
                }
                console.log(`Analyzing ${appMeta!.id} (method: ${method})...`);

                await analysis.ensureTrackingDomainResolution();

                const appAnalysis = await analysis.startAppAnalysis(app);
                await appAnalysis.uninstallApp();
                await appAnalysis.installApp();
                await appAnalysis.setAppPermissions();
                await appAnalysis.startTrafficCollection('main');

                let startProcess: ExecaChildProcess<string> | undefined;
                if (method === 'none') await appAnalysis.startApp();
                else if (method === 'objection')
                    startProcess = python('objection', [
                        '--gadget',
                        appAnalysis.app.id,
                        'explore',
                        '--startup-command',
                        'android sslpinning disable',
                    ]);
                else if (method === 'httptoolkit')
                    startProcess = python('frida', [
                        '-U',
                        '-f',
                        appAnalysis.app.id,
                        '-l',
                        join('external', 'httptoolkit-script.js'),
                    ]);

                await pause(30_000);
                const appCrashed = (await analysis.platform.getForegroundAppId()) !== appAnalysis.app.id;

                await appAnalysis.stopTrafficCollection();
                if (startProcess) killProcess(startProcess);
                await appAnalysis.uninstallApp();

                const res = await appAnalysis.stop();
                insertStmt.run(
                    res.app.id,
                    res.app.version || 'unknown',
                    method,
                    res.traffic['main'].log.entries.length,
                    JSON.stringify(res.mitmproxyEvents.filter((e) => e.status === 'tlsFailed')),
                    appCrashed ? 1 : 0
                );
            }
            console.log();
        } catch (err) {
            console.error(`Failed to analyze app ${app}:`, err);
            console.log();

            const appMeta = await parseAppMeta(app as `${string}.apk`);
            await analysis.platform.uninstallApp(appMeta?.id!);
        }
    }

    await analysis.stop();
})();

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

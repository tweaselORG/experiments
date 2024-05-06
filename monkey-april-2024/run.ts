import { pause, startAnalysis } from 'cyanoacrylate';
import fse from 'fs-extra';
import { join, basename } from 'path';
import { execa } from 'execa';
import arrayShuffle from 'array-shuffle';
import type { ExecaChildProcess } from 'execa';
import { parseAppMeta } from 'appstraction';
import { killProcess } from './util';
import timeout from 'p-timeout';

const platform = process.argv[2] as 'android' | 'ios';
const appDir = process.argv[3];
const dataDir = process.argv[4];
const proxyIp = process.argv[5];
if (!platform || !appDir || !dataDir)
    throw new Error(
        'You need to provide the platform, the path that holds the APKs, and the path where to put the results as the arguments.'
    );
if (platform === 'ios' && !proxyIp) throw new Error('On iOS, you need to provide the proxy IP as the last argument.');

const runAppFor = 120_000;

(async () => {
    await fse.ensureDir(dataDir);

    const analysis = await startAnalysis({
        platform,
        runTarget: 'emulator',
        capabilities: ['frida', 'certificate-pinning-bypass'],
        targetOptions: {
            startEmulatorOptions: {
                emulatorName: 'monkey-april-2024',
                headless: true,
            },
            snapshotName: 'clean',
        },
    });

    const ensurePromise = analysis.ensureDevice();

    const apps = await Promise.all(
        (await fse.readdir(appDir, { withFileTypes: true }))
            .filter((e) => e.isDirectory() || e.name.endsWith('.apk'))
            .map((e) =>
                e.isDirectory()
                    ? fse
                          .readdir(join(appDir, e.name), { withFileTypes: true })
                          .then(
                              (se) =>
                                  se
                                      .filter((f) => f.name.endsWith('.apk'))
                                      .map((f) => join(appDir, e.name, f.name)) as `${string}.apk`[]
                          )
                    : (join(appDir, e.name) as `${string}.apk`)
            )
    );

    for (const app of arrayShuffle(apps)) {
        const analyzeApp = async () => {
            const appMeta = await parseAppMeta(app);
            if (!appMeta) {
                console.error(`Failed to parse app ${app}: Not a valid app.`);
                return;
            }

            const harFile = join(dataDir, `${appMeta.id}.har`);
            const metaFile = join(dataDir, `${appMeta.id}-meta.json`);

            if (await fse.exists(harFile)) {
                console.log(`Already analyzed ${appMeta.id}.`);
                return;
            }

            await ensurePromise;

            console.log(`Analyzing ${appMeta.id})...`);

            if (platform === 'android') await analysis.resetDevice();
            await analysis.ensureTrackingDomainResolution();

            const appAnalysis = await analysis.startAppAnalysis(app);
            await appAnalysis.installApp();
            await appAnalysis.setAppPermissions();
            await appAnalysis.startTrafficCollection('main');

            // Even though the monkey would start the app itself, this is necessary for the certificate pinning bypass.
            await appAnalysis.startApp();
            let monkeyProcess: ExecaChildProcess<string> | undefined;
            if (platform === 'android')
                monkeyProcess = execa('adb', [
                    'shell',
                    'monkey',
                    '-p',
                    appMeta.id,
                    '--throttle',
                    '50',
                    '--pct-syskeys',
                    '0',
                    '10000000',
                ]);
            const appStartedDate = new Date();
            await pause(runAppFor);
            const appCrashed = (await analysis.platform.getForegroundAppId()) !== appAnalysis.app.id;

            await appAnalysis.stopTrafficCollection();
            const trafficCollectionStoppedDate = new Date();

            const res = await appAnalysis.stop();
            if (monkeyProcess) await killProcess(monkeyProcess);

            await fse.writeFile(harFile, JSON.stringify(res.traffic['main'], null, 4));
            await fse.writeFile(
                metaFile,
                JSON.stringify(
                    {
                        app: res.app,
                        mitmproxyEvents: res.mitmproxyEvents,
                        appCrashed,
                        appStartedDate,
                        trafficCollectionStoppedDate,
                    },
                    null,
                    4
                )
            );

            if (platform === 'ios') await analysis.platform.uninstallApp(appMeta.id);
        };

        try {
            await timeout(analyzeApp(), { milliseconds: runAppFor * 2 + 60_000 });
        } catch (err) {
            console.error(`Failed to analyze app ${app}:`, err);
            console.log();

            process.exit();
        }
    }

    await analysis.stop();
})();

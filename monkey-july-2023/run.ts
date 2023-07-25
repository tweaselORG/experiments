import { pause, startAnalysis } from 'cyanoacrylate';
import fse from 'fs-extra';
import { join } from 'path';
import { execa } from 'execa';
import type { ExecaChildProcess } from 'execa';
import { parseAppMeta } from 'appstraction';
import { killProcess } from './util';

const platform = process.argv[2] as 'android' | 'ios';
const appDir = process.argv[3];
const dataDir = process.argv[4];
const proxyIp = process.argv[5];
if (!platform || !appDir || !dataDir)
    throw new Error(
        'You need to provide the platform, the path that holds the APKs, and the path where to put the results as the arguments.'
    );
if (platform === 'ios' && !proxyIp) throw new Error('On iOS, you need to provide the proxy IP as the last argument.');

(async () => {
    await fse.ensureDir(dataDir);

    const analysis = await startAnalysis({
        platform,
        runTarget: platform === 'android' ? 'emulator' : 'device',
        capabilities: ['frida', 'certificate-pinning-bypass'],
        targetOptions: {
            snapshotName: 'clean',
            proxyIp,
        } as any,
    });
    const apps = (await fse.readdir(appDir)).map((f) => join(appDir, f));

    for (const app of apps) {
        try {
            const appMeta = await parseAppMeta(app as `${string}.apk`);

            const harFile = join(dataDir, `${appMeta!.id}.har`);
            const metaFile = join(dataDir, `${appMeta!.id}-meta.json`);

            if (await fse.exists(harFile)) {
                console.log(`Already analyzed ${appMeta!.id}.`);
                continue;
            }
            console.log(`Analyzing ${appMeta!.id}...`);

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
                    appMeta!.id,
                    '--throttle',
                    '50',
                    '--pct-syskeys',
                    '0',
                    '10000000',
                ]);
            const appStartedDate = new Date();
            await pause(45_000);
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

            if (platform === 'ios') await analysis.platform.uninstallApp(appMeta?.id!);

            console.log();
        } catch (err) {
            console.error(`Failed to analyze app ${app}:`, err);
            console.log();

            const appMeta = await parseAppMeta(app as `${string}.apk`).catch(() => undefined);
            await analysis.platform.uninstallApp(appMeta?.id!).catch(() => undefined);
        }
    }

    await analysis.stop();
})();

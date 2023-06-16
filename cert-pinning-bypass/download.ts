import { execa } from 'execa';
import fse from 'fs-extra';
import { join } from 'path';

(async () => {
    const appIds = (await fse.readFile(join('data', 'app-ids.txt'), 'utf-8'))
        .split('\n')
        .filter((l) => l.trim().length > 0);
    const apkDir = join('data', 'apks');
    await fse.ensureDir(apkDir);

    const alreadyDownloaded = (await fse.readdir(apkDir)).map((f) => f.split('-')[0]);

    for (const appId of appIds) {
        if (alreadyDownloaded.includes(appId)) {
            console.log(`Already downloaded ${appId}.`);
            continue;
        }

        try {
            await execa('googleplay', ['-d', appId, '-purchase']);

            const { stdout: appDetails } = await execa('googleplay', ['-d', appId]);
            const versionCode = appDetails.match(/version code: (.+)$/)![1];

            await execa('googleplay', ['-d', appId, '-v', versionCode, '-s'], { cwd: apkDir });

            console.log(`Downloaded ${appId}.`);
        } catch (e) {
            console.error(`Failed to download ${appId}:`, e.shortMessage);
        }
    }
})();

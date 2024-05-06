import { execa } from 'execa';
import fse from 'fs-extra';
import { join, basename } from 'path';
import arrayShuffle from 'array-shuffle';
import { pause } from 'appstraction';

const apkDir = process.argv[2];
if (!apkDir) throw new Error('You need to provide the output path for the APKs as the only argument.');

(async () => {
    await fse.ensureDir(apkDir);

    const appIds = (await fse.readFile(join('data', 'app-ids-android.txt'), 'utf-8'))
        .split('\n')
        .filter((l) => l.trim().length > 0);

    const alreadyDownloaded = (await fse.readdir(apkDir)).map((f) => basename(f, '.apk'));

    for (const appId of arrayShuffle(appIds)) {
        if (alreadyDownloaded.includes(appId)) {
            continue;
        }

        try {
            await execa(
                'apkeep',
                [
                    '-d',
                    'google-play',
                    '-o',
                    'device=px_3a,locale=en_DE,include_additional_files=1,split_apk=1',
                    '-a',
                    appId,
                    apkDir,
                ],
                { stdout: 'inherit', stderr: 'inherit' }
            );

            await pause(500);
        } catch (e) {
            console.error(`Failed to download ${appId}:`, e.shortMessage);
        }
    }
})();

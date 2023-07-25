import { execa } from 'execa';
import fse from 'fs-extra';
import { join } from 'path';
import stripAnsi from 'strip-ansi';
import arrayShuffle from 'array-shuffle';
import { pause } from 'appstraction';

const apkDir = process.argv[2];
if (!apkDir) throw new Error('You need to provide the output path for the IPAs as the only argument.');

(async () => {
    await fse.ensureDir(apkDir);

    const appIds = (await fse.readFile(join('data', 'app-ids-ios.txt'), 'utf-8'))
        .split('\n')
        .filter((l) => l.trim().length > 0);

    const alreadyDownloaded = (await fse.readdir(apkDir)).map((f) => f.split('_')[0]);

    for (const appId of arrayShuffle(appIds)) {
        if (alreadyDownloaded.includes(appId)) {
            console.log(`Already downloaded ${appId}.`);
            continue;
        }

        try {
            // When using `--purchase` with the `download` command, I often got a `failed to purchase item with param
            // 'STDQ': password token is expired` error. That's not the case if I first purchase and then download for
            // some reason.
            await execa('ipatool', ['purchase', '-b', appId]).catch((e) => {
                if (e.stderr?.includes('license already exists')) return;
                throw e;
            });
            await execa('ipatool', ['download', '-b', appId], { cwd: apkDir });

            console.log(`Downloaded ${appId}.`);
            await pause(770);
        } catch (e) {
            console.error(`Failed to download ${appId}:`, stripAnsi(e.stderr));
        }
    }
})();

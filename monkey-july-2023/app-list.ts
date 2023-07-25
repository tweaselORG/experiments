import { fetchTopCharts, categories } from 'parse-play';
import fse from 'fs-extra';
import { join } from 'path';
import iosEntries from './data/app-ids-ios-raw.json';

const outDir = process.argv[2];
if (!outDir) throw new Error('You need to provide the data directory as the only argument.');

(async () => {
    await fse.ensureDir(outDir);

    const androidEntries = (
        await fetchTopCharts(
            Object.keys(categories)
                .filter((c) => !c.startsWith('GAME_'))
                .map((id) => ({
                    category: id as 'APPLICATION',
                    chart: 'topselling_free',
                    count: 30,
                })),
            { country: 'DE', language: 'EN' }
        )
    ).flat();

    const uniqueAndroidAppIds = new Set(androidEntries?.map((e) => e?.app_id));
    await fse.writeFile(join(outDir, 'app-ids-android.txt'), [...uniqueAndroidAppIds].join('\n'));

    // Annoyingly, ipatool only accepts bundle IDs (string), whereas parse-tunes returns adam IDs (numeric). I tried
    // fetching the corresponding bundle IDs through parse-tunes but ran into rate limits
    // (https://github.com/tweaselORG/parse-tunes/issues/10). So instead, I just manually grabbed
    // `storePlatformData.lockup.results.*.bundleId` for all categories. *shrug*
    // Even more annoyingly, these include paid apps, which we can't download. Thus, we can only download a fraction of
    // the apps we have IDs for.
    const uniqueIosAppIds = new Set(iosEntries.flat());
    await fse.writeFile(join(outDir, 'app-ids-ios.txt'), [...uniqueIosAppIds].join('\n'));
})();

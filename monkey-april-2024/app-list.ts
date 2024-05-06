import { fetchTopCharts, categories } from 'parse-play';
import fse from 'fs-extra';
import { join } from 'path';

const outDir = process.argv[2];
if (!outDir) throw new Error('You need to provide the data directory as the only argument.');

(async () => {
    await fse.ensureDir(outDir);

    const androidEntries = (
        await fetchTopCharts(
            Object.keys(categories).map((id) => ({
                category: id as 'APPLICATION',
                chart: 'topselling_free',
                count: 50,
            })),
            { country: 'DE', language: 'EN' }
        )
    ).flat();

    const uniqueAndroidAppIds = new Set(androidEntries?.map((e) => e?.app_id));
    await fse.writeFile(join(outDir, 'app-ids-android.txt'), [...uniqueAndroidAppIds].join('\n'));
})();

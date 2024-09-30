import { chromium } from 'playwright';
import { join } from 'path';
import { ensureDir, readFile, exists, writeFile } from 'fs-extra';
import arrayShuffle from 'array-shuffle';
import { pause } from './util';
import { installRecoverNavigation, weightedRandomAction } from './monkey';
import pMap from 'p-map';
import slugify from '@sindresorhus/slugify';

const headless = !process.env.HEADED;
const concurrency = process.env.CONCURRENCY ? +process.env.CONCURRENCY : 3;
const timeout = process.env.TIMEOUT ? +process.env.TIMEOUT : 60_000;
const monkeyActionDelay = process.env.MONKEY_ACTION_DELAY ? +process.env.MONKEY_ACTION_DELAY : 75;

const urlListFile = process.argv[2];
const dataDir = process.argv[3];

if (!urlListFile || !dataDir)
    throw new Error('You need to provide the paths to the URL list as well as the data directory as the arguments.');

const runTypes = ['no-interaction', 'monkey'] as const;

(async () => {
    for (const runType of runTypes) await ensureDir(join(dataDir, runType));

    const urls = await readFile(urlListFile, 'utf-8').then((l) => l.split('\n').filter(Boolean));

    const browser = await chromium.launch({ headless, args: ['--mute-audio'] });

    const run = async ([url, runType]: readonly [string, (typeof runTypes)[number]]) => {
        const filename = slugify(url);
        const harFile = join(dataDir, runType, `${filename}.har`);
        const metaFile = join(dataDir, runType, `${filename}-meta.json`);

        if (await exists(harFile)) {
            console.log(`Already analyzed: ${url} (${runType})`);
            return;
        }

        console.log(`Analyzing ${url} (${runType})...`);

        const context = await browser.newContext({
            colorScheme: 'dark',
            geolocation: { longitude: 10.5232356, latitude: 52.2723916 },
            locale: 'de-DE',
            recordHar: {
                content: 'embed',
                path: harFile,
                mode: 'full',
            },
            timezoneId: 'Europe/Berlin',
        });
        const page = await context.newPage();

        const startedDate = new Date();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const homeUrl = page.url();

        if (runType === 'monkey') {
            await installRecoverNavigation(page, homeUrl);

            const end = Date.now() + timeout;
            while (Date.now() < end) {
                await weightedRandomAction(page).catch(() => 1);
                await pause(monkeyActionDelay);
            }
        } else await pause(timeout);

        const stoppedDate = new Date();

        await context.close();
        await writeFile(metaFile, JSON.stringify({ url, startedDate, stoppedDate }, null, 4));
    };

    const jobParams = runTypes.flatMap((r) => arrayShuffle(urls).map((url) => [url, r] as const));

    await pMap(jobParams, run, { concurrency, stopOnError: false }).catch(() => 1);

    await browser.close();
})();

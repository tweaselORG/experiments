import { chromium } from 'playwright';
import { join } from 'path';
import { readFile, exists, writeFile } from 'fs-extra';
import { arrayToShuffled } from 'array-shuffle';
import { pause } from './util';
import { installRecoverNavigation, weightedRandomAction } from './monkey';
import pMap from 'p-map';
import slugify from '@sindresorhus/slugify';

const headless = !process.env.HEADED;
const concurrency = process.env.CONCURRENCY ? +process.env.CONCURRENCY : 3;
const timeout = process.env.TIMEOUT ? +process.env.TIMEOUT : 60_000;
const monkeyActionDelay = process.env.MONKEY_ACTION_DELAY ? +process.env.MONKEY_ACTION_DELAY : 150;

const urlListFile = process.argv[2];
const dataDir = process.argv[3];

if (!urlListFile || !dataDir)
    throw new Error('You need to provide the paths to the URL list as well as the data directory as the arguments.');

const noInteractionTimeout = timeout * 0.25;
const monkeyTimeout = timeout * 0.75;

(async () => {
    const urls = await readFile(urlListFile, 'utf-8').then((l) => l.split('\n').filter(Boolean));

    const browser = await chromium.launch({ headless, args: ['--mute-audio'] });
    const context = await browser.newContext({
        colorScheme: 'dark',
        geolocation: { longitude: 10.5232356, latitude: 52.2723916 },
        locale: 'de-DE',

        timezoneId: 'Europe/Berlin',
    });

    const run = async (url: string) => {
        const filename = slugify(url);
        const harFile = join(dataDir, `${slugify(url)}.har`);
        const metaFile = join(dataDir, `${filename}-meta.json`);

        if (await exists(harFile)) {
            console.log(`Already analyzed: ${url}`);
            return;
        }

        console.log(`Analyzing ${url} (no interaction)...`);

        await context.tracing.startHar(harFile, { mode: 'full', content: 'embed' });
        const page = await context.newPage();

        const startedDate = new Date();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const homeUrl = page.url();

        await pause(noInteractionTimeout);

        console.log(`Analyzing ${url} (monkey)...`);
        await installRecoverNavigation(page, homeUrl);
        const end = Date.now() + monkeyTimeout;
        while (Date.now() < end) {
            await weightedRandomAction(page).catch(() => 1);
            await pause(monkeyActionDelay * Math.random());
        }

        const stoppedDate = new Date();

        await page.close();
        await context.tracing.stopHar();
        await writeFile(metaFile, JSON.stringify({ url, startedDate, stoppedDate }, null, 4));
    };

    const jobParams = arrayToShuffled(urls);
    await pMap(jobParams, run, { concurrency, stopOnError: false }).catch(() => 1);

    await context.close();
    await browser.close();
})();

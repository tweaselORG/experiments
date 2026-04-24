import { type Browser, type BrowserContext, chromium } from 'playwright';
import { join } from 'path';
import { readFile, exists, writeFile, remove } from 'fs-extra';
import { arrayToShuffled } from 'array-shuffle';
import { pause } from './util';
import { installRecoverNavigation, weightedRandomAction } from './monkey';
import pMap from 'p-map';
import pTimeout from 'p-timeout';
import slugify from '@sindresorhus/slugify';

const headless = !process.env.HEADED;
const timeout = process.env.TIMEOUT ? +process.env.TIMEOUT : 120_000;
const monkeyActionDelay = process.env.MONKEY_ACTION_DELAY ? +process.env.MONKEY_ACTION_DELAY : 150;
const proxy = process.env.PROXY;
const batchSize = process.env.BATCH_SIZE ? +process.env.BATCH_SIZE : 5;

const urlListFile = process.argv[2];
const dataDir = process.argv[3];

if (!urlListFile || !dataDir)
    throw new Error('You need to provide the paths to the URL list as well as the data directory as the arguments.');

const noInteractionTimeout = timeout * 0.25;
const monkeyTimeout = timeout * 0.75;

const log = (...msg: unknown[]) => console.log(`[${new Date().toISOString().substring(0, 19)}]`, ...msg);

let browser: Browser;
let context: BrowserContext;

const dumpStorageState = () => context.storageState({ path: 'storage-state.json' });
const exit = async () => {
    await dumpStorageState().catch(() => 1);
    await context.close().catch(() => 1);
    await browser.close().catch(() => 1);
};

const getStorageState = async () => {
    try {
        const json = await readFile('storage-state.json', 'utf-8');
        const state = JSON.parse(json);
        console.log(
            'Reusing storage state with',
            state.cookies.length,
            'cookies, and',
            state.origins.length,
            'origins.',
        );
        return state;
    } catch {
        return undefined;
    }
};

(async () => {
    const urls = await readFile(urlListFile, 'utf-8').then((l) => l.split('\n').filter(Boolean));

    browser = await chromium.launch({ headless, args: ['--mute-audio'] });
    context = await browser.newContext({
        colorScheme: 'dark',
        geolocation: { longitude: 10.5232356, latitude: 52.2723916 },
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin',

        ...(proxy && { proxy: { server: proxy } }),
        storageState: await getStorageState(),
    });

    const run = async (url: string) => {
        const filename = slugify(url);
        const harFile = join(dataDir, `${slugify(url)}.har`);
        const metaFile = join(dataDir, `${filename}-meta.json`);

        try {
            if ((await exists(harFile)) && (await exists(metaFile))) {
                log(`Already analyzed: ${url}`);
                return;
            }

            log(`Analyzing ${url} (no interaction)...`);

            await context.tracing.startHar(harFile, { mode: 'full', content: 'embed' });
            const page = await context.newPage();

            const startedDate = new Date();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
            const homeUrl = page.url();

            await pause(noInteractionTimeout);

            log(`Analyzing ${url} (monkey)...`);
            await installRecoverNavigation(page, homeUrl);
            const end = Date.now() + monkeyTimeout;
            while (Date.now() < end) {
                await weightedRandomAction(page).catch(() => 1);
                await pause(monkeyActionDelay * Math.random());
            }

            const stoppedDate = new Date();

            await page.close();
            await writeFile(metaFile, JSON.stringify({ url, startedDate, stoppedDate }, null, 4));
            await context.tracing.stopHar();

            await dumpStorageState();
        } catch (err) {
            log(err);
            await dumpStorageState();

            await context.tracing.stopHar().catch(() => 1);
            await remove(metaFile);
            await remove(harFile);
        }
    };

    const jobParams = arrayToShuffled(urls);
    await pMap(jobParams.slice(0, batchSize), (url: string) => pTimeout(run(url), { milliseconds: 2 * timeout }), {
        concurrency: 1,
        stopOnError: false,
    }).catch(() => 1);

    await exit();
})();

process.on('SIGINT', exit);

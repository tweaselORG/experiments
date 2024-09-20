import { Locator, Page } from 'playwright';

// Stolen from: https://github.com/baltpeter/thesis-mobile-consent-dialogs/blob/5cfd174035fe76070fd8000c0d38578178d205da/src/common/indicators.ts#L22-L23
const acceptLabels = [
    /(accept|agree|allow|consent|permit) and continue/,
    'accept',
    'agree',
    'allow',
    'consent',
    'permit',
    /(select|choose) all/,
    'yes',
    /(akzeptieren?|zustimmen|zulassen|annehmen|erlauben?|einwilligen|genehmigen?) und weiter/,
    /akzeptieren?/,
    'zustimmen',
    'zulassen',
    'annehmen',
    /erlauben?/,
    'einwilligen',
    /genehmigen?/,
    /alle (aus)?wählen/,
    /stimm[^.]{0,4} zu/,
    /nehm[^.]{0,4} an/,
    /willig[^.]{0,4} ein/,
    'ja',
    'ok',
    'okay',
    'got it',
    'confirm',
    'next',
    'continue',
    'yes, continue to see relevant ads',
    'weiter',
    'fortfahren',
    'bestätigen',
];
const acceptLabelRegex = new RegExp(
    acceptLabels
        .map((frag) => (typeof frag === 'string' ? `\\b${frag.toLowerCase()}\\b` : `\\b${frag.source}\\b`))
        .join('|'),
    'i'
);

const clickRandomLocatorElement = async (locator: Locator) => {
    const count = await locator.count();
    if (count > 0) {
        const randomIndex = Math.floor(Math.random() * count);
        const element = locator.nth(randomIndex);

        await element.click({ timeout: 1000 });
    }

    return false;
};

const randomClick = async (page: Page) => {
    const locator = page.locator('a[href], button, [onclick], input[type="button"], input[type="submit"]');
    const count = await locator.count();

    if (count > 0) {
        // Prefer accept buttons.
        if (Math.random() < 0.9) {
            const acceptButtons = locator.filter({ hasText: acceptLabelRegex });

            if (await clickRandomLocatorElement(acceptButtons)) return;
        }

        await clickRandomLocatorElement(locator);
    }
};

const randomFormFill = async (page: Page) => {
    const locator = page.locator('input[type="text"], input[type="email"], input[type="password"], textarea, label');
    const count = await locator.count();

    if (count > 0) {
        const randomIndex = Math.floor(Math.random() * count);
        const element = locator.nth(randomIndex);

        const randomTextLength = Math.floor(Math.random() * 10) + 5;
        const randomText = Math.random()
            .toString(36)
            .substring(2, 2 + randomTextLength);

        await element.fill(randomText);
    }
};

const randomScroll = async (page: Page) => {
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);

    const randomX = Math.floor(Math.random() * (bodyWidth || 1000));
    const randomY = Math.floor(Math.random() * (bodyHeight || 1000));

    await page.mouse.wheel(randomX, randomY);
};

const actions = [
    { func: randomClick, weight: 0.6 },
    { func: randomFormFill, weight: 0.3 },
    { func: randomScroll, weight: 0.1 },
];

export const weightedRandomAction = async (page: Page) => {
    const totalWeight = actions.reduce((acc, action) => acc + action.weight, 0);

    let rand = Math.random() * totalWeight;
    for (const action of actions) {
        if (rand < action.weight) {
            await action.func(page);
            return;
        }
        rand -= action.weight;
    }

    // Fallback to the first action
    await actions[0].func(page);
};

export const installRecoverNavigation = async (page: Page, homeUrl: string): Promise<void> => {
    page.on('load', async (loadedPage: Page) => {
        try {
            const currentUrl = loadedPage.url();
            const origin = new URL(currentUrl).origin;
            const homeOrigin = new URL(homeUrl).origin;

            if (origin !== homeOrigin || currentUrl.endsWith('.pdf') || currentUrl.endsWith('.xml'))
                await loadedPage.goto(homeUrl);
        } catch (e) {
            console.warn('Error handling page load event:', e);
        }
    });

    page.on('popup', (popup) => popup.close().catch((e) => console.warn('Failed to close popup:', e)));
};

import { fetchTopCharts, categories } from 'parse-play';

(async () => {
    const entries = (
        await fetchTopCharts(
            Object.keys(categories)
                .filter((c) => !c.startsWith('GAME'))
                .map((id) => ({
                    category: id as 'APPLICATION',
                    chart: 'topselling_free',
                    count: 30,
                })),
            { country: 'DE', language: 'EN' }
        )
    ).flat();

    const uniqueAppIds = new Set(entries?.map((e) => e?.app_id));
    for (const appId of uniqueAppIds) console.log(appId);
})();

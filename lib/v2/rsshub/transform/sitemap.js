const got = require('@/utils/got');
const cheerio = require('cheerio');
const config = require('@/config').value;

const getItemsFromSitemapXML = (xml) => {
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls = $('urlset url').toArray();
    let items
    if (urls && urls.length) {
        items = urls
            .map((item) => {
                try {
                    const title = $(item).find('loc').text() || '';
                    const link = $(item).find('loc').text() || '';
                    const description = $(item).find('loc').text() || '';
                    const pubDate = $(item).find('lastmod').text() || undefined;

                    return {
                        title,
                        link,
                        description,
                        pubDate,
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);
    } else {
        items = [];
    }

    return items;
}

module.exports = async (ctx) => {
    if (!config.feature.allow_user_supply_unsafe_domain) {
        ctx.throw(403, `This RSS is disabled unless 'ALLOW_USER_SUPPLY_UNSAFE_DOMAIN' is set to 'true'.`);
    }
    const { url } = ctx.params;
    const response = await got({
        method: 'get',
        url,
    });

    const routeParams = new URLSearchParams(ctx.params.routeParams);
    const $ = cheerio.load(response.data, { xmlMode: true });

    const sitemapindex = $('sitemapindex');
    let items
    if (sitemapindex.length) {
        const sitemaps = sitemapindex.find('sitemap').toArray();
        let sitemapUrls = sitemaps.map((item) => $(item).find('loc').text());

        if (routeParams.get('indexPattern')) {
            const sitemapPattern = new RegExp(routeParams.get('indexPattern'));
            sitemapUrls = sitemapUrls.filter((item) => sitemapPattern.test(item));
        }

        const sitemapResponses = await Promise.all(
            sitemapUrls.map((item) =>
                got({
                    method: 'get',
                    url: item,
                })
            )
        );
        const sitemapItems = sitemapResponses.map((item) => getItemsFromSitemapXML(item.data));
        items = sitemapItems.flat();
    }
    else {
        items = getItemsFromSitemapXML(response.data);
    }

    const rssTitle = routeParams.get('title') ? routeParams.get('title') : 'Sitemap';

    ctx.state.data = {
        title: rssTitle,
        link: url,
        description: `Proxy ${url}`,
        item: items,
    };
};

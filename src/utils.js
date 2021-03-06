export function asQueryCode(query, minCount) {
    if (minCount && minCount > 0) {
        return `document.querySelectorAll("${query}").length > ${minCount}`;
    }

    return `!!document.querySelector("${query}")`;
}

export const queryCodes = {
    nijie: {
        view: [
            asQueryCode("#gallery a[href*='view_popup.php']", 1),
            asQueryCode("#img_diff a"),
        ],
        viewPopup: [
            asQueryCode(".illust_click", 1),
            asQueryCode(".box-shadow999", 1),
            asQueryCode("img[src*='pic.nijie.net']", 1),
        ],
        sp: {
            view: [
                asQueryCode("#manga"),
            ],
            viewPopup: [
                asQueryCode(".popup_illust", 1),
                asQueryCode("img[src*='pic.nijie.net']", 1),
            ],
        },
    },
    pixiv: [
        asQueryCode("img[src*='i.pximg.net/img-master']", 1),
        asQueryCode(".gtm-manga-viewer-preview-modal-open"),
        asQueryCode("[aria-label='プレビュー']"),
        asQueryCode("[aria-label='Preview']"),
    ],
    fanbox: [
        asQueryCode("article figure"),
        asQueryCode("img[src^='https://downloads.fanbox.cc/images/post/']", 1),
    ],
};

export function regexFixup(matchURLRegex, ...args) {
    return {
        match(url) {
            return matchURLRegex.test(url);
        },
        fix(url) {
            for (let [match, replaceWith] of args) {
                url = url.replace(match, replaceWith);
            }
            return url
        },
    };
}

export const urlFixups = [
    regexFixup(/\.hdslb\.com\//, [/@.*/, ""]),
    regexFixup(/:\/\/media.discordapp.net\//, [/\?.*/, ""]),
    regexFixup(/\.pinimg\.com\//, [/\/\d+x\//, "/originals/"]),
    regexFixup(/(pixiv|booth)\.pximg\.net\//, [/\/c\/\d+x\d+.*?\//, "/"], [/_base_resized/, ""]),
    regexFixup(/:\/\/c\.fantia.jp\//, [/(\d+)\/.*?_/, "$1/"]),
];

export function fixUrl(url) {
    for (let fixup of urlFixups) {
        if (fixup.match(url)) {
            url = fixup.fix(url);
        }
    }
    return url;
}

export class TabUtils {
    constructor(tab, api) {
        this.tab = tab;
        this.api = api;
    }

    makeUrl(prefix, batch) {
        return (batch ? makeBatchUrl : makePostUrl)(prefix, this.tab.url);
    }

    openPage(url, current, background, nextToCurrent) {
        if (current) {
            return this.api.update(this.tab.id, {url});
        }

        const createProperties = {
            active: !background,
            openerTabId: this.tab.id,
            url: url,
        };

        if (nextToCurrent) {
            createProperties["index"] = this.tab.index + 1;
        }

        return this.api.create(createProperties);
    }

    async getReferrer() {
        const code = "document.referrer";

        try {
            const results = await this.api.executeScript(this.tab.id, {code});

            return results.find(Boolean) || "";
        } catch (err) {
            console.error("failed to get referrer", err);
        }

        return "";
    }

    async isGenericBatch(queryCodes) {
        for (const code of queryCodes) {
            const results = await this.api.executeScript(this.tab.id, {code});
            const isBatch = results.find(Boolean);

            if (isBatch) {
                return true;
            }
        }

        return false;
    }

    isNijieBatch() {
        const url = this.tab.url;
        const codes = url.includes("://sp.") ? queryCodes.nijie.sp : queryCodes.nijie;

        if (url.includes("view_popup.php")) {
            return this.isGenericBatch(codes.viewPopup);
        }

        return this.isGenericBatch(codes.view);
    }

    isPixivBatch() {
        return this.isGenericBatch(queryCodes.pixiv);
    }

    isFanboxBatch() {
        return this.isGenericBatch(queryCodes.fanbox);
    }

    isNicoSeigaBatch() {
        return this.tab.url.includes("watch/mg");
    }

    async isTwitterBatch() {
        if (this.tab.url.includes("/photo/")) {
            return false;
        }

        const code = `
let article = document.querySelector("article");
let result = false;

if (article) {
    let totalImages = article.querySelectorAll("a img[src*='/media/']").length;
    let quotedImages = article.querySelectorAll("[role='blockquote'] a img[src*='/media/']").length;

    result = (totalImages - quotedImages) > 1;
}

result;
`;
        const results = await this.api.executeScript(this.tab.id, {code});

        return !!results.find(Boolean);
    }

    async isBatch() {
        const url = this.tab.url;
        const map = [
            [/^https?:\/\/(?:sp\.)?nijie\.info\//, "isNijieBatch"],
            [/^https:\/\/seiga\.nicovideo\.jp\//, "isNicoSeigaBatch"],
            [/^https:\/\/twitter\.com\//, "isTwitterBatch"],
            [/^https:\/\/www\.pixiv\.net\//, "isPixivBatch"],
            [/^https:\/\/.+?\.fanbox\.cc\/posts\//, "isFanboxBatch"],
        ];

        for (const [re, fn] of map) {
            if (re.test(url)) {
                return await this[fn]();
            }
        }

        return false;
    }
}

export function makeBatchUrl(prefix, url) {
    const uploadUrl = new URL("uploads/batch", prefix);

    uploadUrl.searchParams.set("url", url);

    return uploadUrl;
}

export function makePostUrl(prefix, url, ref) {
    const uploadUrl = new URL("uploads/new", prefix);



    uploadUrl.searchParams.set("url", url);

    if (ref) {
        uploadUrl.searchParams.set("ref", ref);
    }

    return uploadUrl;
}

export const DataURLsNotSupportedError = new Error("Data URLs are not supported");

export async function makeUrl(prefix, batch, info, getReferrer) {
    if (batch) {
        return makeBatchUrl(prefix, info.pageUrl);
    }

    if (info.srcUrl.startsWith("data:")) {
        throw DataURLsNotSupportedError;
    }

    let ref;

    if (info.srcUrl === info.pageUrl) {
        if (info.frameUrl) {
            ref = info.frameUrl;
        } else if (getReferrer) {
            ref = await getReferrer();
        }
    } else {
        ref = info.pageUrl;
    }

    return makePostUrl(prefix, fixUrl(info.srcUrl), ref);
}

export function getPageActionMatchRegExp(globs) {
    return globs.map((glob) => "^" + glob.replace(/\./g, "\\.").replace(/\*/g, ".*")).join("|");
}

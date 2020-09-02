import {TabUtils, makeUrl} from "./utils.js";
import {setupPageAction} from "./chrome.js";

const MenuID = "upload-to-danbooru";
const DefaultDanbooruURL = "https://danbooru.donmai.us/";

browser.contextMenus.create({
    id: MenuID,
    title: "Upload to &Danbooru",
    contexts: ["image"],
});

browser.contextMenus.onClicked.addListener(async function(info, tab) {
    if (info.menuItemId !== MenuID) {
        return;
    }

    const settings = await browser.storage.sync.get(["url", "openIn"]);
    const danbooruUrl = settings.url || DefaultDanbooruURL;
    const batch = (info.modifiers || []).some((key) => key === "Ctrl");
    const tabUtils = new TabUtils(tab, browser.tabs);
    const getReferrer = () => tabUtils.getReferrer();
    const url = await makeUrl(danbooruUrl, batch, info, getReferrer);
    const current = settings.openIn === "current";
    const background = settings.openIn === "background";
    const nextToCurrent = !!chrome;

    await tabUtils.openPage(url.href, current, background, nextToCurrent);
});

browser.pageAction.onClicked.addListener(async function(tab) {
    const settings = await browser.storage.sync.get(["url", "openIn"]);
    const danbooruUrl = settings.url || DefaultDanbooruURL;
    const tabUtils = new TabUtils(tab, browser.tabs);
    const batch = await tabUtils.isBatch();
    const url = tabUtils.makeUrl(danbooruUrl, batch);
    const current = settings.openIn === "current";
    const background = settings.openIn === "background";
    const nextToCurrent = !!chrome;

    await tabUtils.openPage(url.href, current, background, nextToCurrent);
});

if (chrome) {

    setupPageAction(chrome);
}

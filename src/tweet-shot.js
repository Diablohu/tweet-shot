const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const download = require('download');
const tunnel = require('tunnel');

const parseTweetUrl = require('./parse-tweet-url.js');

const thumbnailUrlStartWith = `https://pbs.twimg.com/media/`;
const defaultDest = process.cwd();
const defaultViewport = {
    width: 800,
    height: 800,
    deviceScaleFactor: 1,
};

const sleep = async (ms) =>
    await new Promise((resolve) => setTimeout(() => resolve(), ms));

/**
 * 分析推文，截图并下载全部媒体到指定目录
 * @param {string} url 推文 URL
 * @param {Object} options
 * @param {boolean} [options.headless=true]
 * @param {boolean} [options.darkMode=false]
 * @param {string} [options.proxy] 设置代理服务器连接。默认没有代理
 * @param {string} [options.dest] 设置存储目录。默认为当前工作目录
 * @param {number} [options.scale=1] 页面缩放值
 * @param {number} [options.quality=1]
 */
const tweetShot = async (url, options = {}) => {
    if (!url) throw new Error('missing parameter: url');

    const {
        headless = true,
        darkMode = false,
        proxy = undefined,
        dest = defaultDest,
        scale = 1,
        quality = 60,
    } = options;

    if (isNaN(scale)) console.warn(`'scale' invalid. reset to 1`);

    await fs.ensureDir(dest);

    const darkString = darkMode ? '_dark' : '';
    const deviceScaleFactor = parseFloat(scale);

    // 分析推文URL
    const { userId, tweetId } = parseTweetUrl(url);

    // 检查是否已下载
    const resultFilename = `${userId}-${tweetId}${darkString}.json`;
    const resultPathname = path.resolve(dest, resultFilename);
    if (fs.existsSync(resultPathname)) return await fs.readJSON(resultPathname);

    // 设定基础变量
    const tweetUrl = `https://mobile.twitter.com/${userId}/status/${tweetId}`;
    // const url = `https://youtube.com`
    const result = {
        screenshot: `${userId}-${tweetId}_${darkString}.jpg`,
        assets: [],
    };
    const puppeteerOptions = {
        headless,
        defaultViewport: {
            ...defaultViewport,
            deviceScaleFactor,
        },
        timeout: 0,
    };
    if (proxy) {
        if (!Array.isArray(puppeteerOptions.args)) puppeteerOptions.args = [];
        puppeteerOptions.args.push(`--proxy-server=${proxy}`);
    }

    // 启动 Puppeteer
    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    await page.emulateMediaFeatures([
        {
            name: 'prefers-color-scheme',
            value: darkMode ? 'dark' : 'light',
        },
    ]);
    await page.setDefaultNavigationTimeout(0);
    await page.goto(tweetUrl, {
        waitUntil: 'networkidle0',
    });

    const reject = async (err) => {
        await browser.close();
        throw err;
    };

    // 阻止 service-worker
    await page._client.send('ServiceWorker.enable');
    await page._client.send('ServiceWorker.stopAllWorkers');

    /** 添加全局函数: 获取 Tweet 元素 */
    const getElTweet = '__GET_ELEMENT_TWEET__';
    await page.evaluate((getElTweet) => {
        window[getElTweet] = function () {
            const articles = [
                ...document.querySelectorAll('article[role="article"]'),
            ];
            let tweet;
            while (!tweet && articles.length) {
                const el = articles[0];
                const styles = window.getComputedStyle(el);
                if (styles.cursor === 'pointer') articles.shift();
                else tweet = el;
            }
            return tweet;
        };
    }, getElTweet);

    // 修改 DOM / 样式
    await page
        .evaluate(
            ({ getElTweet }) => {
                const tweet = window[getElTweet]();
                if (!tweet) throw new Error('no tweet element');

                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
                // document.querySelectorAll(`${selectorTweetDetail} > div[role="group"]`)[0].style.display = 'none'
                // document.querySelectorAll(`${selectorTweetDetail} > div`)[0].style.display = 'none'
                // document
                //     .querySelector(`${selectorTweetDetail} > div:last-child`)
                //     .remove();
                // document
                //     .querySelector(`${selectorTweetDetail} > div:last-child`)
                //     .remove();
                // 侧边导航
                document.querySelector('header[role="banner"]').style.display =
                    'none';
                // 注册提示
                document.querySelector('#layers').style.display = 'none';
            },
            { getElTweet }
        )
        .catch(async () => {
            await reject(new Error('tweet not found or invalid tweet page'));
        });

    // 模拟按下 ESC，尝试关闭可能出现的弹出框
    await page.keyboard.press('Escape');

    // 检查是否包含敏感内容开关
    // 如果有，打开开关
    if (
        await page.evaluate(
            ({ getElTweet }) => {
                const tweet = window[getElTweet]();
                if (!tweet) return;
                const link = tweet.querySelector('a[href="/settings/safety"]');
                if (!link) return;
                const buttons = link.parentNode.parentNode.parentNode.querySelectorAll(
                    'div[role="button"]'
                );
                if (buttons.length) {
                    buttons[0].click();
                    return true;
                }
            },
            { getElTweet }
        )
    )
        await sleep(100);

    // 获取缩略图
    const selectorThumbnails = `img[src^="${thumbnailUrlStartWith}"]`;
    await page.waitForSelector(selectorThumbnails).catch(() => {});
    const thumbnails = await page.evaluate(
        ({ selectorThumbnails, getElTweet }) => {
            const tweet = window[getElTweet]();
            const thumbnails = tweet.querySelectorAll(selectorThumbnails);
            if (!thumbnails || !thumbnails.length) return [];
            return Array.from(thumbnails).map((el) => el.getAttribute('src'));
        },
        { selectorThumbnails, getElTweet }
    );
    // if (!thumbnails.length) {
    //     await browser.close();
    //     return false;
    // }

    // 下载全图
    {
        const assets = thumbnails
            .map((thumbnail) => {
                const url = new URL(thumbnail);
                // /media/xxxxxxx?format=jpg&name=small
                const matches = /^\/media\/([a-zA-Z0-9_-]+)$/.exec(
                    url.pathname
                );
                if (!Array.isArray(matches) || matches.length < 2)
                    return undefined;
                return {
                    filename: matches[1],
                    format:
                        url.searchParams.format ||
                        url.searchParams.get('format') ||
                        'jpg',
                    thumbnail,
                };
            })
            .filter((obj) => typeof obj === 'object');
        await Promise.all(
            assets.map(
                ({ filename, format }, index) =>
                    new Promise(async (resolve, reject) => {
                        const downloadUrl = `${thumbnailUrlStartWith}${filename}.${format}:orig`;
                        const destFilename = `${userId}-${tweetId}-${index}-${filename}${darkString}.${format}`;
                        const destPathname = path.resolve(dest, destFilename);
                        result.assets[index] = {
                            url: downloadUrl,
                            file: false,
                        };
                        const proxyUrl = proxy ? new URL(proxy) : undefined;
                        await download(downloadUrl, dest, {
                            filename: destFilename,
                            agent: proxyUrl
                                ? {
                                      https: tunnel.httpsOverHttp({
                                          proxy: {
                                              host: proxyUrl.hostname,
                                              port: proxyUrl.port,
                                          },
                                      }),
                                  }
                                : undefined,
                        }).catch((err) =>
                            reject(
                                `download fail - thumbnail: ${assets[index].thumbnail} | download: ${downloadUrl} | error: ${err}`
                            )
                        );
                        if (fs.existsSync(destPathname)) {
                            result.assets[index].file = destFilename;
                        }
                        resolve();
                    })
            )
        ).catch(async (err) => await reject(err));
    }

    // 等待缩略图
    await page.evaluate(
        async ({ selectorThumbnails }) => {
            const elTweet = (() => {
                const articles = [
                    ...document.querySelectorAll('article[role="article"]'),
                ];
                let tweet;
                while (!tweet && articles.length) {
                    const el = articles[0];
                    const styles = window.getComputedStyle(el);
                    if (styles.cursor === 'pointer') articles.shift();
                    else tweet = el;
                }
                return tweet;
            })();
            const thumbnails = elTweet.querySelectorAll(selectorThumbnails);
            if (!thumbnails || !thumbnails.length) return true;
            await Promise.all(
                Array.from(thumbnails).map(
                    (el) =>
                        new Promise((resolve) => {
                            const check = () => {
                                if (el.complete) return resolve();
                                setTimeout(check, 100);
                            };
                            check();
                        })
                )
            );
        },
        { selectorThumbnails }
    );

    // 截图
    {
        const rect = await page.evaluate(
            ({ getElTweet }) => {
                document.documentElement.scrollTop = 0;
                // document.body.scrollTop = top;
                document.body.scrollTop = 0;

                const elTweet = window[getElTweet]();
                const elFirstTweet = document.querySelectorAll('article')[0];

                // 获取位置
                const {
                    top,
                    left,
                    height,
                    width,
                } = elTweet.getBoundingClientRect();
                const offsetTop = elFirstTweet.getBoundingClientRect().top;

                // 重置滚动条
                document.body.scrollTop = top - offsetTop;

                return { top, left, height, width, offsetTop };
            },
            { getElTweet }
        );
        await page.setViewport({
            width: parseInt(rect.width),
            height: parseInt(rect.height),
            deviceScaleFactor,
        });
        await page.screenshot({
            path: path.resolve(dest, result.screenshot),
            type: 'jpeg',
            quality: quality,
            clip: {
                x: 0,
                y: rect.offsetTop,
                width: rect.width,
                height: rect.height - rect.offsetTop,
            },
        });
    }

    // 关闭
    await browser.close();

    // 创建 flag 文件
    await fs.writeJSON(resultPathname, result);

    return result;
};

module.exports = tweetShot;

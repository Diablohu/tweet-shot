const fs = require('fs-extra')
const path = require('path')
const puppeteer = require('puppeteer')
const download = require('download')

const parseTweetUrl = require('./parse-tweet-url.js')

const thumbnailUrlStartWith = `https://pbs.twimg.com/media/`
const defaultDest = process.cwd()
const defaultViewport = {
    width: 800,
    height: 800,
    deviceScaleFactor: 1
}

const selectorTweetDetail = `article[data-testid="tweetDetail"]:last-of-type`

/**
 * 分析推文，截图并下载全部媒体到指定目录
 * @param {String} url 推文 URL
 * @param {Object} options 
 * @param {Boolean} [options.headless=true] 
 * @param {String} [options.proxy] 设置代理服务器连接。默认没有代理
 * @param {String} [options.dest] 设置存储目录。默认为当前工作目录
 */
const tweetShot = async (url, options = {}) => {

    if (!url)
        throw new Error('missing parameter: url')

    const {
        headless = true,
        proxy = undefined,
        dest = defaultDest
    } = options
    await fs.ensureDir(dest)

    // 分析推文URL
    const { userId, tweetId } = parseTweetUrl(url)

    // 检查是否已下载
    const resultFilename = `${userId}-${tweetId}.json`
    const resultPathname = path.resolve(dest, resultFilename)
    if (fs.existsSync(resultPathname))
        return await fs.readJSON(resultPathname)

    // 设定基础变量
    const tweetUrl = `https://mobile.twitter.com/${userId}/status/${tweetId}`
    // const url = `https://youtube.com`
    const result = {
        screenshot: `${userId}-${tweetId}_.jpg`,
        assets: []
    }
    const puppeteerOptions = {
        headless,
        defaultViewport,
        timeout: 0
    }
    if (proxy) {
        if (!Array.isArray(puppeteerOptions.args))
            puppeteerOptions.args = []
        puppeteerOptions.args.push(`--proxy-server=${proxy}`)
    }

    // 启动 Puppeteer
    const browser = await puppeteer.launch(puppeteerOptions)
    const page = await browser.newPage()
    await page.setDefaultNavigationTimeout(0)
    await page.goto(tweetUrl, {
        waitUntil: 'networkidle0'
    })

    const reject = async (err) => {
        await browser.close()
        throw err
    }

    // 阻止 service-worker
    await page._client.send('ServiceWorker.enable')
    await page._client.send('ServiceWorker.stopAllWorkers')

    // 修改 DOM / 样式
    await page.evaluate(({ selectorTweetDetail }) => {
        document.documentElement.style.overflow = 'hidden'
        document.body.style.overflow = 'hidden'
        // document.querySelectorAll(`${selectorTweetDetail} > div[role="group"]`)[0].style.display = 'none'
        // document.querySelectorAll(`${selectorTweetDetail} > div`)[0].style.display = 'none'
        document.querySelector(`${selectorTweetDetail} > div:last-child`).remove()
        document.querySelector(`${selectorTweetDetail} > div:last-child`).remove()
        document.querySelector('header[role="banner"]').style.display = 'none'
    }, { selectorTweetDetail })
        .catch(async () => {
            await reject(new Error('tweet not found or invalid tweet page'))
        })

    // 模拟按下 ESC，尝试关闭可能出现的弹出框
    await page.keyboard.press('Escape')

    // 检查是否包含敏感内容开关
    // 如果有，打开开关
    {
        const $linksSafety = await page.$$('a[href="/settings/safety"]')
        for (const $linkSafety of $linksSafety) {
            if ($linkSafety && typeof $linkSafety === 'object') {
                await page.evaluate(() => {
                    const buttonParent = document.querySelector('a[href="/settings/safety"]')
                        .parentNode
                        .parentNode
                        .parentNode
                    const button = buttonParent.querySelectorAll('div[role="button"]')
                    if (button.length) {
                        button[0].click()
                    }
                })
            }
        }
    }

    // 获取缩略图
    const selectorThumbnails = `${selectorTweetDetail} img[src^="${thumbnailUrlStartWith}"]`
    await page.waitForSelector(selectorThumbnails)
        .catch(() => { })
    const thumbnails = await page.evaluate(({ selectorThumbnails }) => {
        const thumbnails = document.querySelectorAll(selectorThumbnails)
        if (!thumbnails || !thumbnails.length)
            return []
        return Array.from(thumbnails).map(el => el.getAttribute('src'))
    }, { selectorThumbnails })
    if (!thumbnails.length) {
        await browser.close()
        return false
    }

    // 下载全图
    {
        const assets = thumbnails
            .map(thumbnail => {
                const url = new URL(thumbnail)
                // /media/xxxxxxx?format=jpg&name=small
                const matches = /^\/media\/([a-zA-Z0-9_-]+)$/.exec(url.pathname)
                if (!Array.isArray(matches) || matches.length < 2)
                    return undefined
                return {
                    filename: matches[1],
                    format: url.searchParams.format || url.searchParams.get('format') || 'jpg',
                    thumbnail
                }
            })
            .filter(obj => typeof obj === 'object')
        await Promise.all(assets.map(({ filename, format }, index) =>
            new Promise(async (resolve, reject) => {
                const downloadUrl = `${thumbnailUrlStartWith}${filename}.${format}:orig`
                const destFilename = `${userId}-${tweetId}-${index}-${filename}.${format}`
                const destPathname = path.resolve(dest, destFilename)
                result.assets[index] = {
                    url: downloadUrl,
                    file: false
                }
                await download(
                    downloadUrl,
                    dest,
                    {
                        filename: destFilename,
                        proxy
                    }
                )
                    .catch((err) =>
                        reject(`download fail - thumbnail: ${assets[index].thumbnail} | download: ${downloadUrl} | error: ${err}`)
                    )
                if (fs.existsSync(destPathname)) {
                    result.assets[index].file = destFilename
                }
                resolve()
            })
        )).catch(async err => await reject(err))
    }

    // 等待缩略图
    await page.evaluate(async ({ selectorThumbnails }) => {
        const thumbnails = document.querySelectorAll(selectorThumbnails)
        if (!thumbnails || !thumbnails.length)
            return true
        await Promise.all(Array.from(thumbnails).map(el =>
            new Promise(resolve => {
                const check = () => {
                    if (el.complete)
                        return resolve()
                    setTimeout(check, 10)
                }
                check()
            })
        ))
    }, { selectorThumbnails })

    // 截图
    {
        const rect = await page.evaluate(({ selectorTweetDetail }) => {
            const elTweet = document.querySelector(selectorTweetDetail)
            // 获取位置
            const { top, left, height, width } = elTweet
                .getBoundingClientRect()

            // 重置滚动条
            document.documentElement.scrollTop = 0
            document.body.scrollTop = top

            return { top, left, height, width }
        }, { selectorTweetDetail })
        await page.setViewport({
            width: parseInt(rect.width),
            height: parseInt(rect.height),
            deviceScaleFactor: 1
        })
        await page.screenshot({
            path: path.resolve(dest, result.screenshot),
            type: 'jpeg',
            quality: 60,
            clip: {
                x: 0,
                y: 0,
                width: rect.width,
                height: rect.height
            }
        })
    }

    // 关闭
    await browser.close()

    // 创建 flag 文件
    await fs.writeJSON(resultPathname, result)

    return result
}

module.exports = tweetShot

// jest configuration
jest.setTimeout(10 * 60 * 1000) // 10 mins

//

const fs = require('fs-extra')
const path = require('path')
const { spawn } = require('child_process')

const parseTweetUrl = require('../src/parse-tweet-url')

const testUrls = [
    'https://twitter.com/rint_rnt/status/1092121977442029568',
    'https://twitter.com/Strangestone/status/1092196348001054720',
    'https://twitter.com/caidychenkd/status/1092741766623592449'
]
const dirTestResults = path.resolve(__dirname, './test-results')

describe('tweet-shot', async () => {
    for (const url of testUrls) {
        test(`Tweet: ${url}`, async () => {
            const { userId, tweetId } = parseTweetUrl(url)
            await new Promise(resolve => {
                const child = spawn(
                    'node',
                    [
                        path.resolve(__dirname, '../bin/tweet-shot.js'),
                        `--url`, url,
                        '--dest', dirTestResults,
                        '--proxy', 'socks5://127.0.0.1:1080',
                    ],
                    {
                        stdio: false,
                        shell: true,
                    }
                )
                child.on('close', () => {
                    resolve()
                })
            })

            const fileResult = path.resolve(
                dirTestResults,
                `${userId}-${tweetId}.json`
            )
            expect(fs.existsSync(fileResult)).toBe(true)

            const result = await fs.readJson(fileResult)

            expect(typeof result).toBe('object')
            expect(typeof result.screenshot).toBe('string')
            expect(Array.isArray(result.assets)).toBe(true)

            for (const { file } of result.assets) {
                expect(fs.existsSync(path.resolve(
                    dirTestResults, file
                ))).toBe(true)
            }

            // 清理文件
            await fs.emptyDir(dirTestResults)

        })
    }
})

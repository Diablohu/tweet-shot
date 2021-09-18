import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import parseTweetUrl from '../src/parse-tweet-url.js';

//

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testUrls = [
    'https://twitter.com/Diablohu/status/1290887385484414976', // no media
    'https://twitter.com/caidychenkd/status/1092741766623592449', // 1 pic
    'https://twitter.com/rint_rnt/status/1092121977442029568', // 2 pics
    'https://twitter.com/Diablohu/status/1292423780438966280', // 4 pics
    'https://twitter.com/Strangestone/status/1092196348001054720', // in thread
    'https://twitter.com/Diablohu/status/1292433453414150148', // 1 video
    'https://twitter.com/Diablohu/status/1292431619475693569', // retweet 1 pic
    'https://twitter.com/kakage0904/status/1438263434357850114', // NSFW 1 pic
];
const dirTestResults = path.resolve(__dirname, './test-results');

describe('tweet-shot', () => {
    for (const url of testUrls) {
        test(`Tweet: ${url}`, async () => {
            const { userId, tweetId } = parseTweetUrl(url);

            expect(typeof userId).toBe('string');
            expect(typeof tweetId).toBe('string');

            // console.log(
            //     'node ' +
            //         [
            //             path.resolve(__dirname, '../bin/tweet-shot.js'),
            //             `--url`,
            //             url,
            //             '--dest',
            //             dirTestResults,
            //             '--proxy',
            //             'socks5://127.0.0.1:10807',
            //         ].join(' ')
            // );

            await new Promise((resolve) => {
                const child = spawn(
                    'node',
                    [
                        path.resolve(__dirname, '../bin/tweet-shot.js'),
                        `--url`,
                        url,
                        '--dest',
                        dirTestResults,
                        '--proxy',
                        'http://127.0.0.1:10807',
                    ],
                    {
                        stdio: false,
                        shell: true,
                    }
                );
                child.on('close', () => {
                    resolve();
                });
            });

            const fileResult = path.resolve(
                dirTestResults,
                `${userId}-${tweetId}.json`
            );
            expect(fs.existsSync(fileResult)).toBe(true);

            const result = await fs.readJson(fileResult);

            expect(typeof result).toBe('object');
            expect(typeof result.screenshot).toBe('string');
            expect(Array.isArray(result.assets)).toBe(true);

            for (const { file } of result.assets) {
                expect(fs.existsSync(path.resolve(dirTestResults, file))).toBe(
                    true
                );
            }

            // 清理文件
            await fs.emptyDir(dirTestResults);
        });
    }
});

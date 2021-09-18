#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import program from 'commander';
import ora from 'ora';
import spinners from 'cli-spinners';

import tweetShot from '../src/tweet-shot.js';

const pkg = fs.readJsonSync(
    path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../package.json'
    )
);

program
    .version(pkg.version, '-v, --version')
    .usage('[options]')
    .option('--url <url-of-tweet>', 'Set url of tweet')
    .option('--dest <destination-path>', 'Set destination directory')
    .option('--proxy <proxy-url>', 'Set proxy url')
    .option('--scale <scale-number>', 'Set scale')
    .option('--quality <quality-number>', 'Set quality', parseInt)
    .option('--dark-mode', 'Set dark mode in browser')
    .parse(process.argv);

const spinner = (text) => {
    const s = ora({
        spinner: spinners.dots,
        color: 'cyan',
        text,
    });
    s.start();
    return s;
};

const run = async () => {
    const { url, dest, proxy, scale, quality, darkMode } = program.opts();

    const stepName = `[tweet-shot] downloading ${url}`;
    const step = spinner(`${stepName}...`);

    step.start();
    try {
        await tweetShot(url, {
            dest,
            proxy,
            scale,
            quality,
            darkMode,
        });
        step.stop();
        spinner(stepName).succeed();
    } catch (e) {
        step.stop();
        spinner(stepName).fail();
        console.error(e);
    }
};

run();

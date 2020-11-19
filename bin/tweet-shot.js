#!/usr/bin/env node

const program = require('commander');
const ora = require('ora');
const spinners = require('cli-spinners');
const tweetShot = require('../src/tweet-shot');

program
    .version(require('../package').version, '-v, --version')
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
    const { url, dest, proxy, scale, quality, darkMode } = program;

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

const twitterBaseUrl = `https://mobile.twitter.com/`;

/**
 * @typedef {Object} TweetInfos
 * @property {String} userId
 * @property {String} tweetId
 */
/**
 * 分析推文 URL
 * @param {String} url 支持的格式: 完整的URL, 不包含协议的URL, 不包含域名的URL
 * @returns {TweetInfos} 推文信息
 */
const parseTweetUrl = (url) => {
    const fullUrl = /(?:^[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)
        ? new URL(url)
        : new URL(url, twitterBaseUrl);
    // https://twitter.com/pockyfactory/status/1092296548346519552
    const matches = /\/([a-zA-Z0-9-_]+)\/status\/([0-9]+)/.exec(
        fullUrl.pathname
    );
    if (!Array.isArray(matches) || matches.length < 2) {
        throw new Error('invalid url input');
    }
    return {
        userId: matches[1],
        tweetId: matches[2],
    };
};

export default parseTweetUrl;

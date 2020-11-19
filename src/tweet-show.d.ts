export interface Options {
    /**
     * 是否为 headless 模式，默认为 `true`
     * @default true
     */
    headless?: boolean;

    /** 设置代理服务器连接，默认没有代理 */
    proxy?: string;

    /** 设置存储目录，默认为当前工作目录 */
    dest?: string;

    /** 设置页面缩放值，默认为 `1` */
    scale?: number;

    quality?: number;

    darkMode?: boolean;
}

export interface Result {
    screenshot: string;
    assets: Array<{
        url: string;
        file: string;
    }>;
}

/**
 * 分析推文，截图并下载全部媒体到指定目录
 */
async function tweetShot(url: string, options: Options): Promise<Result>;

export default tweetShot;

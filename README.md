# tweet-shot
Take a screenshot of a tweet and download all media from it

## Install

```bash
npm i tweet-shot
```

## Usage (Programmatically)

```javascript
const tweetShot = require('tweet-shot');

const main = async () => {
    // ...
    await tweetShot('https://twitter.com/Diablohu/status/1092414659057967104')
    // ...
};

main()
```

#### API

**tweetShot(url[, options])**

##### url

Type: `String` (**required**)

The URL of target tweet.

##### options

Type: `Object`

##### options.dest

Type: `String`

Destination directory. Default to current working directory.

##### options.proxy

Type: `String`

Proxy server URL.

## Usage (CLI)

```bash
tweet-bot --url https://twitter.com/Diablohu/status/1092414659057967104
```

Type `tweet-bot -h` for options.

## License

MIT © [Diablohu](https://diablohu.com)

# Randly.live

[Randly.live](https://randly.live/) is a browser-based random video and text chat service for adults aged **18 and over**. It runs on desktop and mobile without an app download or a required account.

- [Open Randly in English](https://randly.live/en.html)
- [Read the chat guides](https://randly.live/blog-en.html)
- [Privacy policy](https://randly.live/privacy-en.html) and [community rules](https://randly.live/rules-en.html)

## What the service offers

- Random video chat using WebRTC and text chat using Socket.IO.
- Country and interest preferences, plus global matching.
- An interface in Arabic, English, Spanish, French, German, Italian, Portuguese, Turkish, Russian, Hindi, Indonesian and Chinese.
- Optional text translation, depending on provider availability.
- Private invitation rooms and a built-in XO game.
- Reporting controls and automated temporary bans.

Matching depends on who is available. Country flags estimate an internet connection's location; they do not verify nationality or identity. Translation applies to text, not live voice interpretation. Reporting and moderation do not guarantee a safe conversation.

The server also supports configurable AI-assisted text conversations. See the operating guide and privacy policy for the role of external providers.

## Useful guides

- [Using free random video chat without registration](https://randly.live/post-free-video-chat-en.html)
- [Random video chat safety and privacy](https://randly.live/post-is-random-video-chat-safe-en.html)
- [Conversation ideas for people around the world](https://randly.live/post-chat-with-people-from-around-the-world-en.html)

## Run a development checkout

Use Node.js 22 or newer; the deployment workflow uses Node.js 24.

```sh
npm ci
npm test
```

For a new checkout, create a private `.env` from `.env.example`. Set `NODE_ENV=development` for localhost, choose a local port, and use `BIND_HOST=127.0.0.1` to keep a local preview on your computer. Start it with Node's explicit environment-file option:

```sh
node --env-file=.env server.js
```

The application does not automatically load `.env`. Provider keys are optional for the basic development server and belong only in private environment settings. The repository ignores local environment files.

For deployment, reverse proxies, TURN, provider configuration and synchronizing Azure with Oracle, see [DEPLOY.md](DEPLOY.md).

## Edit the localized guides

The two newer guide topics have editorial Markdown in `content/articles/`. The existing HTML pages live in `public/`. Build generated content and metadata in this order:

```sh
npm run build:articles
npm run build:seo
npm run build:assets
npm test
```

Existing page URLs should remain stable when improving a guide. See the build scripts before editing generated metadata.

## Contact

Product questions: [contact@randly.live](mailto:contact@randly.live).
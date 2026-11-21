# Art Day for Claude

One museum painting every day, right in Claude: the reproduction, a short story, one detail worth a closer look, a rating from 1 to 5 and your favourites. The next paintings are picked with your ratings in mind, and there is always room for something new.

Art Day speaks the language set in your system. The only source is Wikimedia Commons, and only reproductions with Public Domain or CC0 rights are shown.

Русская версия: [README.ru.md](README.ru.md).

## Install

In Claude Code:

```
/plugin install art-day --marketplace KZBSS888/claude-plugin-art-day
```

In Cowork: Customize → Plugins → Add, then add this repository.

Node.js 20 or newer is required. The plugin has no third-party packages; installing it downloads nothing else.

Art Day runs a local server on your computer, so it works in Claude Code and in Cowork sessions that run on your computer. The claude.ai chat on the web and on a phone does not start local servers, so the plugin does not work there.

## Try it

Type one of these in a chat:

- `art day` — shows today's painting, and picks one if the day has none yet.
- `rate today's painting 5 and add it to my favourites` — saves your rating.
- `show my taste in painting` — what your ratings say so far.
- `art day in French` — switches the language; `art day in the system language` switches back.

## How it works

1. You write "art day" and the card opens.
2. If the current museum day has no painting yet (the day starts at 09:00 Paris time), Claude searches Commons for fresh candidates, the plugin picks one at random with weights from your taste, Claude looks at the reproduction and writes the text.
3. The plugin takes the artist, year, museum, link and rights from Wikimedia itself, not from the model's text.
4. A painting is never shown twice. There are at most three picking attempts a day.
5. After publishing, Claude can keep a pinned copy of the card as a private Claude artifact in your sidebar: the plugin builds the page and the images in its data folder, and Claude publishes them with its own Artifact tool. The page has the same tabs as the card in the chat: today, favourites and taste.

The plugin starts nothing by itself. For a new painting every day without asking, create a scheduled task in Claude with the text "Pick today's Art Day painting".

## How ratings become taste

A rating from 1 to 5 and the favourite mark give weight to every tag of the painting and to its artist. When a new painting is picked, the random choice multiplies each candidate's odds by these weights, and no work is ever excluded. Tags are kept in groups: colours, mood, subject and manner. The traits under the rating sharpen their own group: "Colours" the colour tags, "Mood" the mood tags, "Subject" the subject tags, "The artist's manner" the manner tags and the artist. "The painting's story" does not affect picking and stays a note for you.

Your taste is built only from the ratings you give. The plugin does not read your conversations, files or Claude's memory.

## Language

The plugin follows the language set in the operating system; no language is fixed in the code.

- Claude writes the title, the story and the detail in that language every day. The plugin asks Wikidata for the artist's and museum's names in the same language and falls back to English.
- The fixed texts of the cards (buttons, captions, tool titles) come from a dictionary. English and Russian are built in. For any other language Claude translates the English dictionary once and the plugin keeps the translation in your collection.
- To choose another language, say so in the chat ("art day in Russian"). The choice is remembered; "as in the system" returns to automatic detection. The environment variable `ART_DAY_LANG` sets the language explicitly.

## What the plugin runs, fetches and sends

- **Runs** only its own Node.js code from the `server/` folder, started as a local MCP server over standard input and output. On macOS it also runs one system command, `defaults read -g AppleLanguages`, to read the list of system languages; on other systems it reads the `LC_ALL`, `LC_MESSAGES` and `LANG` environment variables instead.
- **Connects** only to Wikimedia: `commons.wikimedia.org` (search and licences), `www.wikidata.org` (artist, year, museum), `upload.wikimedia.org` and `thumb.wikimedia.org` (reproductions). The requests carry search words and work identifiers. Your ratings, favourites and taste are never sent anywhere. Wikimedia asks automated clients to name a contact in the User-Agent: set `ART_DAY_CONTACT` to a public page or a mailbox if you want a higher request limit; without it the plugin sends a generic client name.
- **The card in the chat** loads the reproduction straight from Wikimedia's image servers, so Wikimedia sees your IP address, as it does when you open one of its pages.
- **Stores** on your computer, in the plugin's data folder: `collection.json` and `ART-TASTE.md` with the full cards of today's work and your favourites, a short history of what was shown, your ratings, the chosen language and the address of the pinned artifact; and a `card/` folder with the page and images of the pinned card.
- **The pinned card** is a private Claude artifact that only you can open. Claude publishes it at your request with its own Artifact tool; it holds today's painting, your favourites and your ratings for them. Ratings tapped on that page are kept in the artifact's own database until the next "art day" in the chat carries them into your collection. You can delete the artifact at any time.
- **Does not**: read other files, use accounts or keys, collect statistics, change Claude's settings or permissions, or load instructions from the network. Text that comes from Wikimedia is treated as data, never as instructions.

See [PRIVACY.md](PRIVACY.md) for the privacy policy.

Picking a painting is done by Claude, so it uses your plan's limits. The texts are written by a language model: check facts about a painting against the source linked in the card.

## Troubleshooting

- **"art day" does nothing**: check that the plugin is enabled and that Node.js 20 or newer is on your `PATH`, then start a new session.
- **No painting was picked**: Wikimedia may be unreachable, or all three attempts for the day are used. Yesterday's painting stays until the next museum day.
- **The card shows the wrong language**: say "art day in <language>", or set `ART_DAY_LANG`.
- **Changes to the server code do not show**: start a new Claude session; a running plugin server is not restarted by reloading plugins.

Questions and problems: [open an issue](https://github.com/KZBSS888/claude-plugin-art-day/issues).

## Other ways to run it

The same code can run as a Claude Desktop extension or on your own server.

- **Desktop extension**: pack the folder with `mcpb pack` (the `@anthropic-ai/mcpb` tool) and install the file through Settings → Extensions. The collection then lives in `~/.art-day`.
- **Your own server**: start `server/http.mjs` with `ART_DAY_TOKEN` set to a random string of at least 32 characters. It listens on `127.0.0.1:8787`; put HTTPS in front of it and add a connector in Claude with the address `https://your-address/mcp/<ART_DAY_TOKEN>`. The address contains the access key, so do not publish it. Options: `ART_DAY_HOST`, `ART_DAY_PORT`, `ART_DAY_DATA`.

## Development

`npm test` runs the checks without a network. `npm run live -- "monet"` makes a trial search in the real Commons and saves nothing.

Layout: `server/store.mjs` (collection and taste), `server/commons.mjs` (search and rights check), `server/pick.mjs` (random choice), `server/i18n.mjs` (language and dictionaries), `server/tools.mjs` (tools), `server/card.mjs` and `server/card.html` (the pinned card), `server/mcp.mjs` (protocol), `server/view.html` (the card in the chat), `skills/art-day/SKILL.md` (instructions for Claude).

## License

The MIT license covers the code. Reproductions and museum data keep their own rights and belong to their sources.

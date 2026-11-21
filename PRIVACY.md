# Art Day privacy policy

Art Day is a plugin that runs on your own computer. Its author runs no service and receives no data from it.

## What is collected

Nothing is sent to the author of the plugin. There is no account, no analytics and no telemetry.

## What is stored, and where

The plugin stores these on your computer, in its data folder:

- the paintings it has shown you, with the full texts of today's work and of your favourites;
- the ratings, favourite marks and traits you give;
- the taste summary computed from those ratings;
- the language you chose, and the address of your pinned card.

The data stays until you delete the plugin's data folder. Removing the plugin and that folder removes all of it.

## What is sent, and to whom

The plugin connects only to Wikimedia: `commons.wikimedia.org`, `www.wikidata.org`, `upload.wikimedia.org` and `thumb.wikimedia.org`. It sends search words and the identifiers of works, and downloads reproductions. Like any site you open, Wikimedia sees your IP address and the client name. Your ratings, favourites and taste are never sent to Wikimedia or anywhere else. Wikimedia's own policy is at https://foundation.wikimedia.org/wiki/Policy:Privacy_policy.

If you set the `ART_DAY_CONTACT` environment variable, its value is sent to Wikimedia in the User-Agent header, as Wikimedia asks of automated clients. It is empty by default.

## The pinned card

If you ask Claude to keep a pinned card, Claude publishes it as a private artifact in your own Claude account. It holds today's painting, your favourites and your ratings for them, and ratings you tap on that page are kept in the artifact's database. This data is held by Anthropic under your Claude account and Anthropic's privacy policy; the author of the plugin has no access to it. Deleting the artifact removes it.

## What the plugin does not do

It does not read your conversations, your files or Claude's memory, does not use accounts or keys, and builds your taste only from the ratings you give.

## Children

The plugin is not directed at children and collects no personal data from anyone.

## Changes and contact

Changes to this policy are published in this file. Questions: https://github.com/KZBSS888/claude-plugin-art-day/issues.

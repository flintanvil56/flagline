# flagline

A feature flag store that lives in a JSON file next to your code, with a
library and a CLI on top. No service to run, no account to make, no
dependency to install. Good fit for side projects, scripts, and small
services that want flags without pulling in a hosted platform.

## Why

Most feature flag tools assume you want a dashboard, a SaaS account, and a
network call on every check. Sometimes you just want a flag: on for you, off
for everyone else, or on for 10% of users while you watch for errors. This
is that, stored as a plain JSON file you can commit, diff, or edit by hand.

## Install

There's no published package yet. Clone the repo and build it:

```
npm run build
node dist/cli.js --help
```

Once built, `dist/cli.js` is a standalone Node script - copy it wherever you
need a flags CLI, or link `flagline` as a bin from `package.json`.

## CLI usage

```
$ flagline init
created flags.json

$ flagline add dark-mode --description "new dark theme" --enabled
added dark-mode

$ flagline add checkout-v2 --description "rewritten checkout flow" --enabled --rollout 25
added checkout-v2

$ flagline list
dark-mode	on		new dark theme
checkout-v2	on @25%	rewritten checkout flow

$ flagline eval checkout-v2 --subject user-482
false

$ flagline eval checkout-v2 --subject user-482 --json
{
  "key": "checkout-v2",
  "subject": "user-482",
  "result": false
}

$ flagline allow checkout-v2 user-482
allowed user-482 on checkout-v2

$ flagline eval checkout-v2 --subject user-482
true
```

Every command accepts `--json` for machine-readable output and `--file path`
to point at a store other than `./flags.json` (or set `FLAGLINE_FILE`).

## Commands

| command | what it does |
| --- | --- |
| `init` | create an empty store file |
| `add <key>` | create a flag (`--description`, `--enabled`, `--rollout N`) |
| `rm <key>` | delete a flag |
| `enable` / `disable <key>` | flip the on/off switch |
| `set-rollout <key> <percent>` | set the percentage rollout (0-100) |
| `allow` / `deny <key> <subject>` | force a specific subject on or off |
| `list` | show all flags |
| `eval <key> [--subject id]` | evaluate a flag, optionally for a subject |

## Library usage

The CLI is a thin wrapper around `src/flags.ts`, which is usable on its own:

```ts
import { loadStore, evaluate } from "flagline";

const store = loadStore("flags.json");
const flag = store.flags["checkout-v2"];

if (evaluate(flag, currentUser.id)) {
  renderNewCheckout();
}
```

`evaluate` is deterministic: the same flag and subject always land in the
same rollout bucket, so a user doesn't flicker between on and off across
requests.

## Rollout rules

Evaluation order for a flag:

1. If the flag is disabled, it's always off.
2. If the subject is in `deny`, it's off.
3. If the subject is in `allow`, it's on.
4. Otherwise the subject is hashed into a bucket 0-99 and compared against
   the rollout percentage. No subject and a rollout under 100 means off,
   since there's nothing stable to bucket against.

## Status

Early skeleton. The store format (`flags.json`, `version: 1`) is stable
enough to build on but has no migration story yet - back up the file before
experimenting with breaking changes.

## License

MIT, see [LICENSE](LICENSE).

# Front-end

R-universe express front-end stack.

## Requirements

We need NodeJS and MongoDB. On homebrew you would do:

```sh
brew install node mongodb/brew/mongodb-community
```

## Testing locally with dummy data

Clone the repo, cd into it and run `npm install .` once to get dependencies.

To run a local test server that mimics a given universe e.g. `tidyverse` you can use:

```sh
./run-local.sh tidyverse --download
```

Then open `http://localhost:3000/` in your browser which should look a lot like `https://tidyverse.r-universe.dev`.

The `--download` flag copies some real dummy data from https://r-universe.dev into a local database so we have something to test with. The data will persist if you restart the script so you only have to do this once. Subsequent runs you can simply use:

```sh
./run-local.sh tidyverse
```

### Global pages

The global (meta) r-universe pages are under `/_global/` for example:

 - `http://localhost:3000/_global/search`  -> https://r-universe.dev/search
 - `http://localhost:3000/_global/organizations` -> https://r-universe.dev/organizations

This is not perfect because some of the links assume the root domain, but good enough to hack on the pages.

## Endpoints

Currently served URLs:

```
/builds
/packages
/contributors
/apis
/articles
/articles/:pkg/:filename
/:pkg
```

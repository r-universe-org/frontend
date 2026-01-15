# Front-end

R-universe express front-end stack. This runs the website and cranlike repositories from https://r-universe.dev 

## Requirements

We need __NodeJS__ and __MongoDB__. On homebrew you would do:

```sh
brew install node mongodb/brew/mongodb-community
```

On Ubuntu, `nodejs` can be installed from `apt` but you need instructions from the [mongodb website](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/) to install `mongodb-org`.

```sh
apt-get update
apt-get install nodejs mongodb-org
```

## Testing locally with dummy data

Clone this repo and run `npm install .` __once__ to download dependencies.

```sh
# Only need to do this once
git clone https://github.com/r-universe-org/frontend
cd frontend
npm install .
```

To run a local test server that mimics a given universe e.g. `ropensci` you can use:

```sh
./run-local.sh ropensci
```

Now you can open `http://localhost:3000/` in your browser which should look a lot like `https://ropensci.r-universe.dev`.

### About the dummy data

The first time you run this script, it will automatically download some dummy data into the local directory `dummydata-{universe}` so we have something to test with. This data will persist if you restart the script, so the second time you run this script this will be skipped. If you want to refresh your dummy data, just delete the `dummydata-{universe}` folder and restart the `./run-local.sh`  script.

### Global pages

The global (meta) r-universe pages are under `/_global/` for example:

 - `http://localhost:3000/_global/search`  -> https://r-universe.dev/search
 - `http://localhost:3000/_global/organizations` -> https://r-universe.dev/organizations

This is not perfect because some of the links assume the root domain, but good enough to hack on the pages.

## Development

### Linting

This project uses [ESLint](https://eslint.org/) for code quality and consistency. To run the linter:

```sh
# Check for linting issues
npm run lint

# Automatically fix issues where possible
npm run lint:fix
```

The linter is configured in `eslint.config.js` with separate rules for:
- Node.js server files (routes, app.js, src/)
- Browser-side files (static/, views/)

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

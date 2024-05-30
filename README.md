# Front-end

New front-end in express with some SSR.

## How to test

Clone the repo, cd into it and run `npm install .` once to get dependencies. After that run:

```sh
npm start
```

And that will start a webserver. Then go to `http://localhost:3000/jsonlite` (or any other package) to preview.

In development mode (the default) the server automatically guesses the universe for a given package and uses `ropensci` otherwise. This makes it easy to quickly test changes.

To test the front-end using a specific universe set the `UNIVERSE` environment variable:

```sh
UNIVERSE=tidyverse npm start
```

This will mimic `localhost` to be `tidyverse.r-universe.dev`.

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

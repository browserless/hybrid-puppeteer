# Hybrid Puppeteer

> Disclaimer: The application, and code within, are meant for educational purposes. This application and code is not production-ready, and should not be used in any production environment. Developer discretion advised.

A web-based application to run automated-and-hybrid headless web workflows! You'll need a browser or something already running and accessible via a WebSocket connection as this application doesn't facilitate that. Feel free to clone and add your own logic to it.

## Quick Start

Familiarity with command line interface and `NodeJS` as well as `npm` installed.

0. A browser running with a debugging port open.
1. `npm install`
2. `npm start`
3. Open the printed link in a web-browser and enjoy!

## Requirements

This repo is self-contained and only requires two dependencies to limit size and complexity. You will need a running browser in order for this to work. [Try out our docker image here for one](https://github.com/browserless/browserless/pkgs/container/chrome).

Otherwise you can start Chrome, locally, with a remote debugger port and copy the printed debugger URL into the index.js file's "browserWSEndpoint".

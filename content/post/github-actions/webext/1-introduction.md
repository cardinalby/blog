---
title: "Introduction. Constants"
date: 2022-02-04
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- web-extension
- devops
series: Releasing WebExtension using GitHub Actions
title_image: "../../../../images/posts/github-actions/webext/title.png"
---

# Introduction

In this article, I'm going to share my approach of preparing a complete CI/CD solution for building and publishing a browser extension ([WebExtension](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)) based on [GitHub Actions](https://docs.github.com/en/actions):
- Reusable building and testing pipeline.
- Releasing and building artifacts for offline distribution.
- Publishing an extension on [Chrome Web Store](https://chrome.google.com/webstore) and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/) store.

The described workflows are based on the existing and tested workflows for my ["Memrise Audio Uploader"](https://chrome.google.com/webstore/detail/memrise-audio-uploader/fonhjbpoimjmgfgbboichngpjlmilbmk?hl=en) extension.

From this series of posts you can learn:
- How to develop an architecture of interconnected GitHub Action workflows that is flexible and handy for developers and minimizes code duplication.
- Tricky approach of deferring and repeating a task in GitHub Actions
- Peculiarities of interacting with stores API

## I assume that:

1. You have a GitHub repo with your WebExtension.
2. You have already created developer accounts on [Chrome Web Store](https://developer.chrome.com/docs/webstore/register/) and [Firefox Add-ons](https://addons.mozilla.org/en-US/developers/) store.
3. You **have published the extension** on both stores. The approach described here is only suitable for extensions that are already published. The initial publishing involves adding screenshots, a description, assigning categories, etc.
4. You are familiar with the basics of Actions: a workflow file structure, inputs/outputs, env variables, and secrets concepts.

## More about used techniques

* [Reusing code in GitHub Actions](https://dev.to/cardinalby/github-actions-make-it-reusable-3ho7)
* [GitHub Actions: implementing deferred steps](https://dev.to/cardinalby/scheduling-delayed-github-action-12a6)

## Actions used in the workflows

In this article, I try not to focus on implementation details of individual actions so as not to overcomplicate the article. I have created a set of [webext-buildtools-...](https://github.com/marketplace?type=actions&query=webext-buildtools) actions to perform steps that are specific for releasing of WebExtension and also several general-purpose actions (if I didn't manage to find existing ones).

Not all of the actions used are production-ready. Nobody can guarantee that the actions which you use will still exist in a month. Also, pointing to an action using `@master` or `@v1`, you can't be sure what will be executed. It's the glitter and misery of GitHub Actions Marketplace. Don't forget that you pass your sensitive data to them. Possible solutions to protect yourself are: making forks of third-party actions or [pinning them to SHA](https://michaelheap.com/ensure-github-actions-pinned-sha/).

## Secrets and env variables

We are going to store all sensitive data (access tokens, private key, etc.) in the repo's [Encrypted secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

Also, creating multiple workflows we want to reuse some not secret constants inside them. I extracted the constants to `.env` file and used [export-env-action](https://github.com/marketplace/actions/export-env-action) to export constants to environment variables at the beginning of each job.

_.github/workflows/constants.env:_

```env
# Dir where the extension is located
EXTENSION_DIR=extension/

# Dir for build artifacts
BUILD_DIR=build/

# Packed extension file name and path
ZIP_FILE_NAME=extension.zip
ZIP_FILE_PATH=${BUILD_DIR}${ZIP_FILE_NAME}

# File name and path of crx file 
# downloaded from Chrome Web Store
WEBSTORE_CRX_FILE_NAME=extension.webstore.crx
WEBSTORE_CRX_FILE_PATH=${BUILD_DIR}${WEBSTORE_CRX_FILE_NAME}

# File name and path of crx file built 
# for offline distribution
OFFLINE_CRX_FILE_NAME=extension.offline.crx
OFFLINE_CRX_FILE_PATH=${BUILD_DIR}${OFFLINE_CRX_FILE_NAME}

# File name and path of xpi file built 
# for offline distribution 
XPI_FILE_NAME=extension.offline.xpi
XPI_FILE_PATH=${BUILD_DIR}${XPI_FILE_NAME}
```

## Versioning

We will mark each release of the extension with a corresponding tag. This tag should be the same as an extension version in `manifest.json` file. Pushing this tag will trigger our releasing process. So, you should add a new tag after you have incremented `manifest.json` version.
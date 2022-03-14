---
title: "Publish on Firefox Add-ons"
date: 2022-02-08
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- web-extension
- devops
- firefox
series: Releasing WebExtension using GitHub Actions
title_image: "images/posts/github-actions/webext/title.png"
---

In this part we are going to create the workflow that will be responsible for publishing the extension
on Firefox Add-ons marketplace.

## 🧱 Prepare

First, you need to find out your extension UUID. You can find it on your extension's page at Add-on Developer Hub in the "Technical Details" section.

Next, follow the [official documentation](https://addons-server.readthedocs.io/en/latest/topics/api/auth.html) and obtain `jwtIssuer` and `jwtSecret` values required for accessing the API.

## 🔒 Add these values to **_secrets_**:
* `FF_EXTENSION_ID ` - UUID of your extension
* `FF_JWT_ISSUER `
* `FF_JWT_SECRET `

## _publish-on-firefox-add-ons_ workflow

The workflow will have the only trigger: _workflow_dispatch_ event. It can be dispatched:
1. Manually specifying any commit or tag as workflow _ref_.
2. By _**publish-release-on-tag**_ workflow after it has prepared a release with **zip** asset.

We will utilize already created _*[get-zip-asset](./3-composite-actions.md#_get-zip-asset_-action)*_ composite action to obtain packed **zip** that is needed for deploying the extension.

_.github/workflows/publish-on-firefox-addons.yml_ :

```yaml
name: publish-on-firefox-add-ons
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - uses: cardinalby/export-env-action@v1
        with:
          envFile: './.github/workflows/constants.env'
          expand: true

      - name: Obtain packed zip
        uses: ./.github/workflows/actions/get-zip-asset
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}

      - name: Deploy to Firefox Addons
        id: addonsDeploy
        uses: cardinalby/webext-buildtools-firefox-addons-action@v1
        continue-on-error: true
        with:
          zipFilePath: ${{ env.ZIP_FILE_PATH }}
          extensionId: ${{ secrets.FF_EXTENSION_ID }}
          jwtIssuer: ${{ secrets.FF_JWT_ISSUER }}
          jwtSecret: ${{ secrets.FF_JWT_SECRET }}

      - name: Abort on upload error
        if: |
          steps.addonsDeploy.outcome == 'failure' &&
          steps.addonsDeploy.outputs.sameVersionAlreadyUploadedError != 'true'
        run: exit 1
```

1. [As usual](./3-composite-actions.md#not-a-composite-action), at the beginning of each workflow we check out the repo and export env variables from _constants.env_ file.
2. After calling __*get-zip-asset*__ composite action we expect to have **zip** file with packed and built extension at `env.ZIP_FILE_PATH` path. 
3. We pass its path along with other required inputs to _[webext-buildtools-firefox-addons-action](https://github.com/marketplace/actions/webext-buildtools-firefox-addons-action)_ action to publish the extension. We use `continue-on-error: true` flag to prevent the step from failing immediately in case of error and validate the result at the following step according to our preferences.
4. Examining _addonsDeploy_ step outputs we can find out the reason of its failure. If it failed because the version we try to publish is already published, we don't consider it as error.

### Timeout notes

Also, the publishing action can sometimes fail with `timeoutError == 'true'` output. It means, the extension was uploaded but the waiting for its processing by Addons server was timed out. I didn't include a handling of this error to the workflow, but you can: 
- Specify longer timeout with `timeoutMs` input of _webext-buildtools-firefox-addons-action_ action. Default timeout is _600000_ ms (10 min).
- Do not fail the job in the last step if `steps.addonsDeploy.outputs.timeoutError == 'true'`.
- Just rerun the workflow after a while in the case of timeout. If the extension has been processed after the first run, the workflow will pass (with `steps.addonsDeploy.outputs.sameVersionAlreadyUploadedError != 'true'`).
---
title: "Publish on Edge Add-ons"
date: 2022-02-08
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- web-extension
- devops
- edge
series: Releasing WebExtension using GitHub Actions
image: "images/posts/github-actions/webext/title.png"
---

In this part we are going to create the workflow for publishing the extension on Microsoft Edge Add-ons. The reason why we are starting from the least popular store is that the process is going to be the easiest one among other stores.

## 🧱 Prepare

First, you need to find the _Product ID_ of your extension. You can find it in [Developer Dashboard](https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview). Be attentive, there are also 2 other identifiers that we don't need - Store ID and CRX ID.

Next, follow the [official documentation](https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#before-you-begin) - create and obtain API credentials: _Client ID_, _Client secret_, _Access token URL_.

## 🔒 Add these values to **_secrets_**:
* `EDGE_PRODUCT_ID ` - _Product_ID_
* `EDGE_CLIENT_ID ` - _Client ID_
* `EDGE_CLIENT_SECRET ` - _Client secret_
* `EDGE_ACCESS_TOKEN_URL` - _Access token URL_

## _publish-on-edge-add-ons_ workflow

The workflow will have the only trigger: _workflow_dispatch_ event. It can be dispatched:
1. Manually specifying any branch or tag as workflow _ref_.
2. By _**publish-release-on-tag**_ workflow after it has prepared a release with **zip** asset.

We will utilize already created _*[get-zip-asset](./3-composite-actions.md#_get-zip-asset_-action)*_ composite action to obtain packed **zip** that is needed for deploying the extension.

_.github/workflows/publish-on-firefox-add-ons.yml_ :

```yaml
name: publish-on-edge-add-ons
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

      - name: Deploy to Edge Addons
        uses: wdzeng/edge-addon@v1.0.3
        with:
          product-id: ${{ secrets.EDGE_PRODUCT_ID }}
          zip-path: ${{ env.ZIP_FILE_PATH }}
          client-id: ${{ secrets.EDGE_CLIENT_ID }}
          client-secret: ${{ secrets.EDGE_CLIENT_SECRET }}
          access-token-url: ${{ secrets.EDGE_ACCESS_TOKEN_URL }}
```

1. [As usual](./3-composite-actions.md#not-a-composite-action), at the beginning of each workflow we check out the repo and export env variables from _constants.env_ file.
2. After calling __*get-zip-asset*__ composite action we expect to have **zip** file with packed and built extension at `env.ZIP_FILE_PATH` path.
3. We pass its path along with other required inputs to _[publish-edge-add-on](https://github.com/wdzeng/edge-addon)_ action to publish the extension.

## Access Token expiration

When you were generating API credentials you could notice that API credentials have an expiration date - 2 years from now. In this article I don't suggest any automated way for renewing it, so in 2 years your workflow will stop working, and you will need to create them again and put into secrets. We will face a similar problem with Google's Refresh token later, but we will be able to cope with it.


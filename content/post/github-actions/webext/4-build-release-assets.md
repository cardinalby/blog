---
title: "Build release assets"
date: 2022-02-07
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- web-extension
- devops
- firefox
- chrome
series: Releasing WebExtension using GitHub Actions
image: "images/posts/github-actions/webext/title.png"
---
# _build-assets-on-release_ workflow

Let's create the first workflow that utilizes _**build-test-pack**_ action and builds release assets for offline distribution once a release has been published.

![build-assets-on-release workflow](images/posts/github-actions/webext/build-assets-on-release.png)

_.github/workflows/build-assets-on-release.yml:_

```yaml
name: Build release assets

on:
  release:
    # Creating draft releases will not trigger it
    types: [published]
jobs:
  # We will add 3 jobs here...
```

The workflow will have 3 jobs:
1. _ensure-zip_: Ensuring we have **zip** release asset.
2. _build-signed-crx-asset_: Building **crx** asset.
3. _build-signed-xpi-asset_: Building **xpi** asset.

## _ensure-zip_ job

The first job will find **zip** asset in the release or build  it if not found:

```yaml
  ensure-zip:
    runs-on: ubuntu-latest
    outputs:
      zipAssetId: | 
        ${{ steps.getZipAssetId.outputs.result || 
            steps.uploadZipAsset.outputs.id }}
    steps:
      - uses: actions/checkout@v2
  
      - uses: cardinalby/export-env-action@v1
        with:
          envFile: './.github/workflows/constants.env'
          expand: true
  
      - name: Find out zip asset id from the release
        id: getZipAssetId
        uses: cardinalby/js-eval-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ASSETS_URL: ${{ github.event.release.assets_url }}
          ASSET_NAME: ${{ env.ZIP_FILE_NAME }}
        with:
          expression: |
            (await octokit.request("GET " + env.ASSETS_URL)).data
              .find(asset => asset.name == env.ASSET_NAME)?.id || ''
  
      - name: Build, test and pack
        if: '!steps.getZipAssetId.outputs.result'
        id: buildPack
        uses: ./.github/workflows/actions/build-test-pack
  
      - name: Upload "extension.zip" asset to the release
        id: uploadZipAsset
        if: '!steps.getZipAssetId.outputs.result'
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ${{ env.ZIP_FILE_PATH }}
          asset_name: ${{ env.ZIP_FILE_NAME }}
          asset_content_type: application/zip
```

- At the beginning of each workflow we check out the repo and export env variables from _constants.env_ file.
- `getZipAssetId` step uses `github.event.release.assets_url` to get the release assets list
  and find **zip** asset id. It may not exist if the workflow was triggered by a release created by a user directly. Used [`js-eval-action`](https://github.com/marketplace/actions/js-eval-action) is an action for executing general-purpose JavaScript code.
- If it hasn't been found, we call _**build-test-pack**_ composite action to build **zip** asset from the scratch, save it to `env.ZIP_FILE_PATH` and then attach to the release.
- `zipAssetId` job output will have a value from either `getZipAssetId` step (if **zip** asset was found in the release) or or `uploadZipAsset` step if it has been built and uploaded in the job.

The following 2 jobs will run in parallel using **zip** asset provided by the job we just created.
This order is defined using `needs: ensure-zip` key in the jobs.

## _build-signed-crx-asset_ job

`crx` file is a distribution package of your extension. When you install an extension from the store, `crx` file gets transmitted and installed to your browser. But it can be also installed in offline mode manually or via automation tools. Read more about alternative extension distribution options [here](https://developer.chrome.com/docs/extensions/mv2/external_extensions/).

Actually, `crx` file is a kind of `zip` file that contains the extension dir. But it also contains some additional metadata required by Chrome browser. Namely, it's signed using a developer's private key.

### 🧱 Prepare
For this step you need to have a `pem` private key that is used for offline signing. You can use [openssl](https://www.openssl.org/docs/manmaster/man1/genrsa.html) to [generate it](https://www.scottbrady91.com/openssl/creating-rsa-keys-using-openssl).

### 🔒 Add the key to the repo **_secrets_**:
* `CHROME_CRX_PRIVATE_KEY` - a string containing the private key.

### Add the job to the workflow:

```yaml
  build-signed-crx-asset:
    needs: ensure-zip
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: cardinalby/export-env-action@v1
        with:
          envFile: './.github/workflows/constants.env'
          expand: true
  
      - name: Download zip release asset
        uses: cardinalby/download-release-asset-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          assetId: ${{ needs.ensure-zip.outputs.zipAssetId }}
          targetPath: ${{ env.ZIP_FILE_PATH }}
  
      - name: Build offline crx
        id: buildOfflineCrx
        uses: cardinalby/webext-buildtools-chrome-crx-action@v2
        with:
          zipFilePath: ${{ env.ZIP_FILE_PATH }}
          crxFilePath: ${{ env.OFFLINE_CRX_FILE_PATH }}
          privateKey: ${{ secrets.CHROME_CRX_PRIVATE_KEY }}
  
      - name: Upload offline crx release asset
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ${{ env.OFFLINE_CRX_FILE_PATH }}
          asset_name: ${{ env.OFFLINE_CRX_FILE_NAME }}
          asset_content_type: application/x-chrome-extension
```

- The job uses `zipAssetId` output from `ensure-zip` job to download the asset.
- [`webext-buildtools-chrome-crx-action`](https://github.com/marketplace/actions/webext-buildtools-chrome-crx-action) action uses the private key from _secrets_ to build and sign  **crx** file for offline distribution. This action doesn't interact with Chrome Web Store.

## _build-signed-xpi-asset_ job

Firefox also has options for [self-distribution](https://extensionworkshop.com/documentation/publish/self-distribution/) of add-ons. Firefox's own format of extension package is called `xpi` and it also has to be signed. Unlike Chrome's, this signing procedure is online: we have to ask Firefox server to do it for us.

### 🧱 Prepare

It's recommended to create a separate entity for the offline distributed extension on Add-on Developer Hub and use its id for signing **xpi** files. Otherwise, a new entity will be added for every build. You can find extension UUID in the "Technical Details" section of the created entity.

Next, follow the [official documentation](https://addons-server.readthedocs.io/en/latest/topics/api/auth.html) and obtain `jwtIssuer` and `jwtSecret` values required for accessing the API.

### 🔒 Add these values to repo **_secrets_**:

* `FF_OFFLINE_EXT_ID ` - UUID of the add-on entity created for offline distribution.
* `FF_JWT_ISSUER `
* `FF_JWT_SECRET `

Finally, add the following job to the workflow:

```yaml
  build-signed-xpi-asset:
    needs: ensure-zip
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: cardinalby/export-env-action@v1
        with:
          envFile: './.github/workflows/constants.env'
          expand: true
  
      - name: Download zip release asset
        uses: cardinalby/download-release-asset-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          assetId: ${{ needs.ensure-zip.outputs.zipAssetId }}
          targetPath: ${{ env.ZIP_FILE_PATH }}
  
      - name: Sign Firefox xpi for offline distribution
        id: ffSignXpi
        continue-on-error: true
        uses: cardinalby/webext-buildtools-firefox-sign-xpi-action@v1
        with:
          timeoutMs: 1200000
          extensionId: ${{ secrets.FF_OFFLINE_EXT_ID }}
          zipFilePath: ${{ env.ZIP_FILE_PATH }}
          xpiFilePath: ${{ env.XPI_FILE_PATH }}
          jwtIssuer: ${{ secrets.FF_JWT_ISSUER }}
          jwtSecret: ${{ secrets.FF_JWT_SECRET }}
  
      - name: Abort on sign error
        if: |
          steps.ffSignXpi.outcome == 'failure' &&
          steps.ffSignXpi.outputs.sameVersionAlreadyUploadedError != 'true'
        run: exit 1
  
      - name: Upload offline xpi release asset
        if: steps.ffSignXpi.outcome == 'success'
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ${{ env.XPI_FILE_PATH }}
          asset_name: ${{ env.XPI_FILE_NAME }}
          asset_content_type: application/x-xpinstall
```

- [`webext-buildtools-firefox-sign-xpi-action`](https://github.com/marketplace/actions/webext-buildtools-firefox-sign-xpi-action) action uses the keys from _secrets_ to build and sign
  **xpi** file for offline distribution. Practice shows that this step can take quite a long time to complete. `timeoutMs` input allows you to configure the timeout.
- `continue-on-error: true` key of `ffSignXpi` step is used to prevent the step to fail immediately in case of error and examine an error at the next step.
- At the next step we examine an error (if any) and fail the job, except the case where the error happened because this version was already signed. It's a peculiarity of Firefox Add-ons signing process: it doesn't allow to sign the same version twice. So we just suppress the error and don't
  fail the entire workflow and just skip the following "upload" step instead.
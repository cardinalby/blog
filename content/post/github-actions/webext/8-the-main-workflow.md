---
title: "The main workflow"
date: 2022-02-11
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- devops
- web-extension
series: Releasing WebExtension using GitHub Actions
image: "images/posts/github-actions/webext/title.png"
---

We have prepared all the needed composite actions and workflows, and we are finally ready to create the main workflow that triggers the entire pipeline.

![The main workflow](images/posts/github-actions/webext/the-main-workflow.png)

_.github/workflows/publish-release-on-tag.yml_ :

```yaml
name: Release and publish on tag
on:
  push:
    tags:
      - '*.*.*'
  workflow_dispatch:
jobs:
  build-release-publish:
    if: github.ref_type == 'tag'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - uses: cardinalby/export-env-action@v1
        with:
          envFile: './.github/workflows/constants.env'
          expand: true

      - name: Look for an existing release
        id: getRelease
        uses: cardinalby/git-get-release-action@v1
        continue-on-error: true
        with:
          tag: ${{ github.ref_name }}
        env:
          GITHUB_TOKEN: ${{ github.token }}

      - name: Build, test and pack to zip
        id: buildPack
        if: steps.getRelease.outcome != 'success'
        uses: ./.github/workflows/actions/build-test-pack

      - name: Create Release
        id: createRelease
        if: steps.getRelease.outcome != 'success'
        uses: ncipollo/release-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          draft: 'true'

      - name: Upload zip asset to the release
        if: steps.getRelease.outcome != 'success'
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ steps.createRelease.outputs.upload_url }}
          asset_path: ${{ env.ZIP_FILE_PATH }}
          asset_name: ${{ env.ZIP_FILE_NAME }}
          asset_content_type: application/zip

      # Should trigger build-assets-on-release.yml
      - name: Publish release
        if: steps.getRelease.outcome != 'success'
        uses: eregon/publish-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.WORKFLOWS_TOKEN }}
        with:
          release_id: ${{ steps.createRelease.outputs.id }}

      - name: Publish on Chrome Webstore
        uses: benc-uk/workflow-dispatch@v1
        if: "!contains(github.event.head_commit.message, '[skip chrome]')"
        with:
          workflow: publish-on-chrome-web-store
          token: ${{ secrets.WORKFLOWS_TOKEN }}
          wait-for-completion: false

      - name: Publish on Firefox Add-ons
        uses: benc-uk/workflow-dispatch@v1
        if: "!contains(github.event.head_commit.message, '[skip firefox]')"
        with:
          workflow: publish-on-firefox-add-ons
          token: ${{ secrets.WORKFLOWS_TOKEN }}
          wait-for-completion: false
```

1. The workflow can be triggered by pushing _*.*.*_ tag or by _workflow_dispatch_ event.
2. To perform the work we need a tag to create a release for, that's why we add `if: github.ref_type == 'tag'` condition for the job to prevent running on branches.
3. We use [git-get-release-action](https://github.com/marketplace/actions/git-get-release-action) to find a release for the tag. `continue-on-error: true` prevents the job from failing if release not found.
4. If a release not found, we:
    - Call _**build-test-pack**_ composite action to build **zip** file.
    - Call [release-action](https://github.com/marketplace/actions/create-release) to create a draft release. This doesn't trigger `on: release` event.
    - Call [upload-release-asset](https://github.com/actions/upload-release-asset) to upload **zip** asset to the release (to be used by _**publish-on-chrome-web-store**_ and _**publish-on-firefox-add-ons**_ workflows later).
    - Call [eregon/publish-release](https://github.com/marketplace/actions/publish-release) to publish the draft release. This triggers `on: release` event and [build-assets-on-release](./4-build-release-assets.md) workflow.
5. We use [benc-uk/workflow-dispatch](https://github.com/marketplace/actions/workflow-dispatch) action to asynchronously dispatch:
    - [publish-on-chrome-web-store](./6-publish-on-chrome-web-store.md) workflow (if the commit message doesn't contain `[skip chrome]` text).
    - [publish-on-firefox-add-ons](./5-publish-on-firefox-addons.md) workflow (if the commit message doesn't contain `[skip firefox]` text).

## 👏 Thank you for reading

Finally, we are done! You can try out your first deployment by pushing a new _*.*.*_ tag to the repo (don't forget to check the extension version in _manifest.json_).

Any comments, critics and sharing your own experience would be appreciated.
You can find a real example of the described CI/CD approach in my [Memrise Audio Uploader](https://github.com/cardinalby/memrise-audio-uploader) extension.
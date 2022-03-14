---
title: "Composite actions"
date: 2022-02-06
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- web-extension
- devops
series: Releasing WebExtension using GitHub Actions
image: "images/posts/github-actions/webext/title.png"
---

In this part we will start with implementing composite actions, the base building blocks that are used in the workflows.

We save all created actions locally in the repo in `.github/workflows/actions` directory. Every action has own named directory and a single _action.yml_ file in it.

# _build-test-pack_ action

_.github/workflows/actions/build-test-pack/action.yml_ :

```yaml
name: "Build, test and pack WebExtension"
description: "Builds, tests, and packs extension dir into zip file"

inputs:
  doNotPackZip:
    description: 'Set `true` to omit pack step'
    required: false

runs:
  using: "composite"
  steps:
    # Add additional build and test steps here

    - name: Validate manifest.json of the extension
      uses: cardinalby/schema-validator-action@v1
      with:
        file: ${{ env.EXTENSION_DIR }}manifest.json
        schema: 'https://json.schemastore.org/webextension.json'

    - name: Pack directory to zip
      if: inputs.doNotPackZip != 'true'
      uses: cardinalby/webext-buildtools-pack-extension-dir-action@v1
      with:
        extensionDir: ${{ env.EXTENSION_DIR }}
        zipFilePath: ${{ env.ZIP_FILE_PATH }}
```

- It can pack or not pack **zip** depending on the input.
- My extension doesn't have any build and test steps, so I put _manifest.json_ schema validation instead of actual build and test steps. This post doesn't cover the topic of building and testing WebExtensions. But it's the place where these steps should be.
- The action needs _ZIP_FILE_PATH_ and _EXTENSION_DIR_ environment variables to be set in the workflow.

# _get-zip-asset_ action

The next composite action we are going to create will be used in __*publish-on-chrome-webstore*__ and __*publish-on-firefox-addons*__ workflows. These workflows can be triggered:
- Manually on any tag or branch (a release may not exist)
- Or by dispatching from __*publish-release-on-tag*__ workflow. In this case a release with packed zip file exists.

Both "Firefox" and "Chrome" workflows should handle these cases and download **zip** file from a release (if any) or build it on the spot. That is the duplicated logic that we extract to the composite action.

![get-zip action](images/posts/github-actions/webext/get-zip-action.png)

_.github/workflows/actions/get-zip-asset/action.yml_ :

```yaml
name: "Obtain extension.zip asset"
description: "Downloads or builds zip asset"
inputs:
  githubToken:
    description: GitHub token
    required: true
outputs:
  releaseUploadUrl:
    description: Release upload url, if exists
    value: ${{ steps.getRelease.outputs.upload_url }}
runs:
  using: "composite"
  steps:
    - name: Get release
      id: getRelease
      if: github.ref_type == 'tag'
      uses: cardinalby/git-get-release-action@v1
      env:
        GITHUB_TOKEN: ${{ inputs.githubToken }}
      with:
        tag: ${{ github.ref_name }}
        doNotFailIfNotFound: true

    - name: Find out zip asset id from assets JSON
      if: steps.getRelease.outputs.assets
      id: readAssetIdFromRelease
      uses: cardinalby/js-eval-action@v1
      env:
        ASSETS_JSON: ${{ steps.getRelease.outputs.assets }}
        ASSET_NAME: ${{ env.ZIP_ASSET_NAME }}
      with:
        expression: |
          JSON.parse(env.ASSETS_JSON)
            .find(asset => asset.name == env.ZIP_ASSET_NAME)
            ?.id || ''

    - name: Download found zip release asset
      id: downloadZipAsset
      if: steps.readAssetIdFromRelease.outputs.result
      uses: cardinalby/download-release-asset-action@v1
      with:
        token: ${{ inputs.githubToken }}
        assetId: ${{ steps.readAssetIdFromRelease.outputs.result }}
        targetPath: ${{ env.ZIP_FILE_PATH }}

    - name: Build and pack zip
      id: buildZip
      if: steps.downloadZipAsset.outcome != 'success'
      uses: ./.github/workflows/actions/build-test-pack

    - name: Upload zip file artifact
      if: steps.buildZip.outcome == 'success'
      uses: actions/upload-artifact@v2
      with:
        name: ${{ env.ZIP_FILE_NAME }}
        path: ${{ env.ZIP_FILE_PATH }}
```

- _githubToken_ input is needed because composite actions don't have access to secrets, and we have to pass them manually via inputs.
- _releaseUploadUrl_ output is filled if release exists. It can be used in a calling workflow to upload release assets.
- Searching for a release makes sense only if a workflow was triggered with `tag` _ref_. Passing `doNotFailIfNotFound: true` to [cardinalby/git-get-release-action](https://github.com/marketplace/actions/git-get-release-action) prevents the step from failing the entire job if a release not found.
- I use [js-eval-action](https://github.com/marketplace/actions/js-eval-action) (that is generic JS interpreter action) to find **zip** asset in the release.
- We build **zip** (calling the composite action we have just created) only if `steps.downloadZipAsset.outcome != 'success'`, i.e. in the case if ref is not `tag`, or release not found, or the release doesn't have **zip** asset.

# Not a composite action

We have one more piece of code that will be duplicated around all jobs and workflows. I'm talking about these steps we will add at the beginning of each job:

```yaml
- uses: actions/checkout@v2

- uses: cardinalby/export-env-action@v1
  with:
    envFile: './.github/workflows/constants.env'
    expand: true
```

This code:
1. Checks out the repo.
2. Exports env variables from _./.github/workflows/constants.env_ file (you can find its contents in the first post) to the job environment using [export-env-action](https://github.com/marketplace/actions/export-env-action).

Unfortunately, we can't extract checkout step to a local composite action because to call local composite actions you need first checkout the repo with the composite actions 🙂. Thus, I decided that extracting the single _export-env-action_ step doesn't make a big sense and left it as it is. In the following parts I will not draw attention to these steps at the beginning of each workflow.
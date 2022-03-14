---
title: "Publish on Chrome Web Store"
date: 2022-02-09
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- web-extension
- devops
- chrome
series: Releasing WebExtension using GitHub Actions
image: "images/posts/github-actions/webext/title.png"
---

In this part we are going to create the workflow that will be responsible for publishing the extension
on Chrome Web Store. This part is going to be a bit tricky comparing to the others.

## 🧱 Prepare

❶ To set up Google Publish API access you need to obtain `clientId`, `clientSecret` and `refreshToken` from Google. These articles can help you to do that:
    * [Using the Chrome Web Store Publish API](https://developer.chrome.com/webstore/using_webstore_api)
    * [How to generate Google API keys](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md)

🔒 Add to the repository **_secrets_**:
* `G_CLIENT_ID`
* `G_CLIENT_SECRET`
* `G_REFRESH_TOKEN`

❷ You should find out the ID of your extension on Chrome Web Store. Normally, it is shown on your Developer Dashboard. It's not private information, but I prefer to store it in _secrets_.

🔒 Add to the repository **_secrets_**:
* `G_EXTENSION_ID`

❸ Also, we have to create a new [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with write access to the repo. The automatically provided token e.g. `secrets.GITHUB_TOKEN` can not be used, GitHub prevents this token from being able to fire the _workflow_dispatch_ and _repository_dispatch_ event.

🔒 Add to the repository **_secrets_**:
* `WORKFLOWS_TOKEN`

❹ The last preparation step is [creating an environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#creating-an-environment) in the repository settings. It's main purpose is providing a [wait timer](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#wait-timer) to delay a workflow run (details will be explained below). Let's call the environment `12hoursDelay` and set its wait timer equal `720` minutes (12 hours).

## _publish-on-chrome-web-store_ workflow

_On the one hand_, the workflow will be similar to _**publish-on-firefox-add-ons**_ workflow (described in the previous part): it is also triggered by `workflow_dispatch` event (emitted manually or by _**publish-release-on-tag**_) and retrieves **zip** asset in the same way.

_On the other hand_, it has its own complications because of peculiarity of Webstore publishing. Also, we are going to include the additional job for downloading published **crx** file from Webstore and attaching it to the release (if any).

The publishing process consists of 2 steps: uploading a new version and publishing the extension. What is the peculiarity I'm speaking about?

It's a Webstore behavior in the case when you are trying to upload a new version shortly after a previous one was uploaded to the store. In this case API call completes with an error and with the status called `IN_REVIEW` (only one uploaded version can be in processing at the time). Unlike other errors, it doesn't mean that something is wrong with our extension and if we **try** uploading **later** it will succeed.

That's exactly what we are going to do, it only remains to find a good technical solution to do that.
If you are interested in learning about existing approaches, please read my ["GitHub Actions: implementing deferred steps"](../implementing-deferred-steps.md) post. Here we will
use ["Dispatched workflow calling itself + wait timer"](../implementing-deferred-steps.md#-dispatched-workflow-calling-itself--wait-timer) approach to repeat a new version uploading after 12 hours delay (number was chosen arbitrary).

Let's observe the workflow diagram and start with creating the workflow file:

![build-assets-on-release workflow](images/posts/github-actions/webext/publish-on-chrome-webstore.png)

As you can see, the main idea is the following:
1. We try to upload a new extension version.
2. If it succeeded, we proceed to publishing the extension and downloading the published **crx** file.
3. If it didn't succeed due to _IN_REVIEW_ error, we dispatch the workflow with 12 hours delay to repeat it later. We will limit attempts number by incrementing an attemptNumber and passing it as an input to the workflow.

_.github/workflows/publish-on-chrome-webstore.yml_ :

```yaml
name: publish-on-chrome-web-store
on:
  workflow_dispatch:
    inputs:
      attemptNumber:
        description: 'Attempt number'
        required: false
        default: '1'
      maxAttempts:
        description: 'Max attempts'
        required: false
        default: '10'
      environment:
        description: 'publish-on-webstore job environment'
        required: false
        default: ''
jobs:
  # We will add 2 jobs here:
  # publish-on-webstore:
  #   ...
  # download-published-crx:
  #  ...
```

Defined _workflow_dispatch_ event has 3 inputs that can be specified at the time of dispatching the workflow. You will see their usage in the following job. The first time the workflow is triggered, inputs will have their default values.

### _publish-on-webstore_ job

```yaml
  publish-on-webstore:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    outputs:
      result: ${{ steps.webStorePublish.outcome }}
      releaseUploadUrl: ${{ steps.getZipAsset.releaseUploadUrl }}
    steps:
      # Validate the inputs and increase the attemptNumber if less than maxAttempts
      - name: Get the next attempt number
        id: getNextAttemptNumber
        uses: cardinalby/js-eval-action@v1
        env:
          attemptNumber: ${{ github.event.inputs.attemptNumber }}
          maxAttempts: ${{ github.event.inputs.maxAttempts }}
        with:
          expression: |
            {
              const 
                attempt = parseInt(env.attemptNumber),
                max = parseInt(env.maxAttempts);
              assert(attempt && max && max >= attempt);
              return attempt < max ? attempt + 1 : '';
            }

      - uses: actions/checkout@v2

      - uses: cardinalby/export-env-action@v1
        with:
          envFile: './.github/workflows/constants.env'
          expand: true

      - name: Obtain packed zip
        id: getZipAsset
        uses: ./.github/workflows/actions/get-zip-asset
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}

      - name: Fetch Google API access token
        id: fetchAccessToken
        uses: cardinalby/google-api-fetch-token-action@v1
        with:
          clientId: ${{ secrets.G_CLIENT_ID }}
          clientSecret: ${{ secrets.G_CLIENT_SECRET }}
          refreshToken: ${{ secrets.G_REFRESH_TOKEN }}

      - name: Upload to Google Web Store
        id: webStoreUpload
        continue-on-error: true
        uses: cardinalby/webext-buildtools-chrome-webstore-upload-action@v1
        with:
          zipFilePath: ${{ env.ZIP_FILE_PATH }}
          extensionId: ${{ secrets.G_EXTENSION_ID }}
          apiAccessToken: ${{ steps.fetchAccessToken.outputs.accessToken }}
          waitForUploadCheckCount: 10
          waitForUploadCheckIntervalMs: 180000    # 3 minutes

      # Schedule a next attempt if store refused to accept new version because it
      # still has a previous one in review
      - name: Start the next attempt with the delay
        uses: aurelien-baudet/workflow-dispatch@v2
        if: |
          steps.getNextAttemptNumber.outputs.result && 
          steps.webStoreUpload.outputs.inReviewError == 'true'
        with:
          workflow: ${{ github.workflow }}
          token: ${{ secrets.WORKFLOWS_TOKEN }}
          wait-for-completion: false
          inputs: |
            { 
              "attemptNumber": "${{ steps.getNextAttemptNumber.outputs.result }}",
              "maxAttempts": "${{ github.event.inputs.maxAttempts }}",
              "environment": "12hoursDelay"
            }

      - name: Abort on unrecoverable upload error
        if: |
          !steps.webStoreUpload.outputs.newVersion &&
          steps.webStoreUpload.outputs.sameVersionAlreadyUploadedError != 'true'
        run: exit 1

      - name: Publish on Google Web Store
        id: webStorePublish
        uses: cardinalby/webext-buildtools-chrome-webstore-publish-action@v1
        with:
          extensionId: ${{ secrets.G_EXTENSION_ID }}
          apiAccessToken: ${{ steps.fetchAccessToken.outputs.accessToken }}
```

1. `environment: ${{ github.event.inputs.environment }}` sets the environment for the job providing a required delay (via "wait timer" of the environment).
2. We use [js-eval-action](https://github.com/marketplace/actions/js-eval-action) as a generic JS code interpreter to validate the inputs and calculated the incremented _attemptNumber_. It is accessible as _result_ output of the step.
3. [As usual](./3-composite-actions.md#not-a-composite-action), at the beginning of each workflow we check out the repo and export env variables from _constants.env_ file.
4. After calling __*get-zip-asset*__ composite action we expect to have **zip** file with packed and built extension at `env.ZIP_FILE_PATH` path.
5. We call [google-api-fetch-token-action](https://github.com/marketplace/actions/google-api-fetch-token-action) to retrieve Google API access token that is needed for "upload" and "publish" steps.
6. We use [webext-buildtools-chrome-webstore-upload-action](https://github.com/marketplace/actions/webext-buildtools-chrome-webstore-upload-action) action to upload a new version to Webstore. `continue-on-error: true` flag allows us not to fail immediately, but perform the next "dispatching" step and examine the error after it in a separate step (checking the action's [outputs](https://github.com/marketplace/actions/webext-buildtools-chrome-webstore-upload-action#outputs)).
7. We use [aurelien-baudet/workflow-dispatch](https://github.com/marketplace/actions/workflow-dispatch-and-wait) action to dispatch the workflow in case of `IN_REVIEW` error:
    * `workflow: ${{ github.workflow }}` points to the current workflow file
    * `token: ${{ secrets.WORKFLOWS_TOKEN }}` makes use of the personal access token we created at the preparation step
    * `inputs` is JSON containing values of inputs for _workflow_dispatch_ event:
        - `attemptNumber` is an incremented workflow input value read from the validation step.
        - `maxAttempts` is the workflow input value passed without changes.
        - `environment` is the name of the environment that will be used to delay the execution.
8. _"Abort on unrecoverable upload error"_ step complements the "upload" step validating errors and fails the job if we can't proceed with publishing because the new version was not uploaded. The case when the same version has been already uploaded (`sameVersionAlreadyUploadedError` output indicates that) is the exception - we still can publish it.
9. Finally, we call [webext-buildtools-chrome-webstore-publish-action](https://github.com/marketplace/actions/webext-buildtools-chrome-webstore-publish-action) action to publish the extension.

Finally, we are done. Keep in mind that in the sake of simplicity I omit some details and description of optional inputs of the used actions. There are a lot of things to tune up. Please, read the documentation for corresponding actions to learn more.

In the next part we are going to solve one small but annoying issue with Google API refresh token expiration.

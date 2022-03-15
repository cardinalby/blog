---
title: "Don't let Google refresh token expire"
date: 2022-02-10
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- devops
- google
series: Releasing WebExtension using GitHub Actions
image: "images/posts/github-actions/webext/title.png"
---

In this part we will finish setting up workflows related to publishing the extension on Google Web Store and create the workflow that isn't shown on [the workflow diagram](./2-workflows-diagram.md) because it stays aside and isn't included to the main pipeline.

Dealing with Google API credentials we should be aware of the fact that, according to [Google's guide](https://developers.google.com/identity/protocols/oauth2#expiration), refresh token (which we use in the workflow from the previous part) might stop working if it has not been used for six months. And I can assure you, it happens 😞.

To solve the issue we can use a great option GitHub offers called ["schedule event"](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) for workflows.  

_.github/workflows/touch-google-refresh-token.yml_ :

```yaml
name: Touch google token
on:
  schedule:
    - cron:  '0 3 2 * *' # At 03:00 on day-of-month 2
  workflow_dispatch:
jobs:
  fetchToken:
    runs-on: ubuntu-latest
    steps:
      - uses: cardinalby/google-api-fetch-token-action@v1
        with:
          clientId: ${{ secrets.G_CLIENT_ID }}
          clientSecret: ${{ secrets.G_CLIENT_SECRET }}
          refreshToken: ${{ secrets.G_REFRESH_TOKEN }}
```

Here I assume that you have already obtained and have added values required for Google API access to secrets (as it described at the previous post).

Once a month GitHub will run our workflow and perform the single step: fetching access token using the credentials that we have already added to _secrets_ (see the previous post). It will prevent refresh token from invalidation.

_**One note here:**_ GitHub will suspend the scheduled trigger for GitHub Action workflows if there is no commit in the repository for the past 60 days. The cron based triggers won't run unless a new commit is made. Probably, you can use the same trick (committing to the repo once a month by schedule) to circumvent this limitation.

---
title: "Workflows diagram"
date: 2022-02-05
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

# High level overview

In this part we will observe the high level architecture of the solution: the proposed workflows and the order in that they are called. We will also find duplicated steps and extract them to the composite actions.

## Workflows and events

Let's take a look at the vertical Ghant diagram of the pipeline triggered by pushing a tag.

![Vertical Ghant diagram](images/posts/github-actions/webext/workflows-ghant-vertical.png)

- The main _**publish-release-on-tag**_ workflow is triggered when a user pushes a tag.
- It triggers _**build-assets-on-release**_ implicitly by creating a release.
- The main workflow also explicitly triggers (emitting `workflow_dispatch`) event 3 other workflows responsible for publishing an extension on different stores.

Important thing here is that all of these workflows can be triggered by user directly, without triggering the main workflow:

- _**build-assets-on-release**_ is triggered when a user publishes a new release (it can not have a _zip_ asset).
- _**publish-on-chrome-webstore**_, _**publish-on-firefox-add-ons**_ and _**publish-on-edge-add-ons**_ can be triggered manually using `workflow_dispatch` event on any branch or tag that don't have a release.

Apart from this, we are going to create one more workflow that will build and test an extension on pushes to branches and on Pull Requests creation:

![Build and test workflow](images/posts/github-actions/webext/build-and-test-workflow.png)

Separating the whole pipeline into workflows:

- Prevents us from creating a monster workflow file.
- [Avoids code duplication](../dry-reusing-code-in-github-actions.md)
- Allows the separated workflows to be triggered, cancelled or repeated independently and executed in parallel.

## Composite actions

In terms of code duplication, we can do better. Look at the steps marked in green and to the duplicated grey block of the "publishing" workflows. We are going to extract them to the [Composite Actions](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action) that will be placed locally in the same repository:

![Extracted composite actions](images/posts/github-actions/webext/composite-actions.png)

From the workflows's point of view they are usual actions that use a runner's filesystem and a workflow context. You can also notice that one composite action can use another composite action as its step.

### Env constants

One more composite action that is absent on the diagram but should be called at the beginning of each job is the one that:
1. Calls `actions/checkout` to check out the repo.
2. Exports env variables from `constants.env` file to the job runner context.

## To be continued

In the following parts we will follow the "bottom-up"  approach and will implement workflows and composite actions shown on the diagram one by one.

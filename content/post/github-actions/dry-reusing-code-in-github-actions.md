---
title: "DRY: reusing code in GitHub Actions"
date: 2021-12-06
draft: false
categories:
- GitHub Actions
tags:
- github-actions
title_image: "images/posts/github-actions/dry-reusing-code-in-github-actions/title.png"
---

In this post I want to make a quick overview of the approaches of reusing steps of your workflow to avoid duplication of the same steps across different workflows or jobs.

## 🔸 Reusing workflows

The obvious option is using the ["Reusable workflows" feature](https://docs.github.com/en/actions/using-workflows/reusing-workflows) that allows you to call extract some steps into a separate "reusable" workflow and call this workflow as a job in other workflows.

### 🥡 Takeaways:

- Reusable workflows can't call other reusable workflows.
- The strategy property is not supported in any job that calls a reusable workflow.
- Env variables and secrets are not inherited.
- It's not convenient if you need to extract and reuse several steps inside one job.
- Since it runs as a separate job, you have to use [build artifacts](https://docs.github.com/en/actions/advanced-guides/storing-workflow-data-as-artifacts) to share files between reusable workflow and your main workflow.
- You can call reusable workflow in synchronous or asynchronous manner (managing it by jobs ordering using `needs` keys).
- A reusable workflow can define outputs that extract outputs/outcomes from performed steps. They can easily used to pass data to the "main" workflow.

## 🔸 Dispatched workflows

Another possibility that GitHub gives us is [workflow_dispatch](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow) event that can trigger a workflow run. Simply put, you can trigger a workflow manually or through GitHub API and provide its inputs.

There are [actions](https://github.com/marketplace?type=actions&query=dispatch+workflow+) available on the Marketplace which allow you to trigger a "dispatched" workflow as a step of "main" workflow.

[Some](https://github.com/marketplace/actions/workflow-dispatch-and-wait) of them also allow doing it in a synchronous manner (wait until dispatched workflow is finished). It is worth to say that this feature is implemented by polling statuses of repo workflows which is [not](https://github.com/aurelien-baudet/workflow-dispatch/blob/master/src/workflow-handler.ts#L122) very reliable, especially in a concurrent environment. Also, it is bounded by GitHub API usage limits and therefore has a delay in finding out a status of dispatched workflow.

### 🥡 Takeaways

- You can have multiple nested calls, triggering a workflow  from another triggered workflow. If done careless, can lead to an infinite loop.
- You need a special token with "workflows" permission; your usual `secrets.GITHUB_TOKEN` doesn't allow you to dispatch a workflow.
- You can call run multiple dispatched workflows inside one job.
- There is no easy way to get some data back from dispatched workflows to the main one.
- Works better in "fire and forget" scenario. Waiting for a finish of dispatched workflow has some limitations.
- You can observe dispatched workflows runs and cancel them manually.

## 🔸 Composite Actions

In this approach we extract steps to a distinct [composite action](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action), that can be located in the same or separate repository.

From your "main" workflow it looks as a usual action (a single step), but internally it comprises of multiple steps each of which can call own actions.

### 🥡 Takeaways:

- Supports nesting: each step of a composite action can use another composite action.
- Bad visualisation of internal steps run: in the "main" workflow it's displayed as a usual step run. In raw logs you can find details of internal steps execution, but it doesn't look very friendly.
- Shares environment variables with a parent job, but doesn't share secrets, which should be passed explicitly via inputs.
- Supports inputs and outputs. Outputs are prepared from outputs/outcomes of internal steps and can be easily used  to pass data from composite action to the "main" workflow.
- A composite action runs inside the job of the "main" workflow. Since they share a common file system, there is no need to use build artifacts to transfer files from the composite action to the "main" workflow.
- You can't use `continue-on-error` option inside a composite action.

## 👏 Thank you for reading

Any comments, critics and sharing your own experience would be appreciated!

If you are interested in developing own Actions, I also recommend you reading "[GitHub Actions Testing](https://dev.to/cardinalby/github-actions-testing-h3h)" post.
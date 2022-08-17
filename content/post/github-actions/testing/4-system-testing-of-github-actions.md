---
title: "System testing of GitHub Actions"
date: 2021-12-04
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- testing
series: Testing of GitHub Actions
image: "images/posts/github-actions/testing/title.png"
---

It's the last and the shortest part of the series. Testing the whole action as a [black box](https://en.wikipedia.org/wiki/Black-box_testing) can be done in 2 ways (as far as I can see).

# github-action-ts-run-api again

Use the same [tool](https://github.com/cardinalby/github-action-ts-run-api) as for integration test, but run tests against the whole action.

# Use _Act_ tool

This approach implies that you should create special testing workflows that can be naturally run on GitHub Actions runner or can be run locally using [Act](https://github.com/nektos/act).

> If you need to debug an action on actual GitHub hosted runner, take a look at [debugging-with-tmate](https://github.com/mxschmitt/action-tmate) action on the Marketplace.

Testing workflows can be located in the action repository and refer to the action using the local `./` path. It's especially convenient because each branch in the action repo will be tested against the version of the action stored in this branch.

Here is a fragment of the testing workflow for [git-get-release-action](https://github.com/cardinalby/git-get-release-action):

```yml
- name: Get 1.1.1 release by releaseId
  id: getByReleaseId
  # referring to the action in the current repo
  uses: ./  
  with:
    releaseId: 41301084

- name: Check getByReleaseId step result
  if: steps.getByReleaseId.outputs.tag_name != '1.1.1'
  shell: bash
  run: exit 1
```

Another option is creating a dedicated repo for testing workflows. It can also contain commits, releases, issues and other GitHub objects that can be read and modified by the action without bloating your main repository.

The drawback of this approach is that you have to specify an exact version of the action in `uses` key of each step:

```yaml
- name: Get 1.1.1 release by releaseId
  id: getByReleaseId
  # referring to the specific version (v1)
  uses: cardinalby/git-get-release-action@v1
  with:
    releaseId: 41301084
```

If you have multiple branches in the main repo and want to test them, you should create the same
branches in the tesing repo and change all `uses` keys to the appropriate version (`action-name@myBranch`).

## 👏 Thank you for reading

Any comments, critics and sharing your own experience would be appreciated!

---
title: "Testing of JavaScript Actions"
date: 2021-12-02
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- js
- testing
series: Testing of GitHub Actions
image: "images/posts/github-actions/testing/title.png"
---

Let's talk about JavaScript GitHub Actions and approaches that we can apply on the different levels of testing.

# Unit tests

From my point of view, unit testing of Actions doesn't have any differences from testing any other JavaScript code. In most of the examples of Actions available on the GitHub Marketplace authors don't care about [writing testable code](https://github.com/mawrkus/js-unit-testing-guide). But nothing prevents you from extracting abstractions and following [The Dependency Inversion Principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle) which will allow you to easily mock dependencies (such as `@actions/core` , `@actions/github`, `@actions/exec` packages).

You can use any of JavaScript testing frameworks and mocking libraries. I can advise taking a look at [actions-mocks](https://github.com/jonabc/actions-mocks) package.

# Integration tests

I'm not going to duplicate [the documentation](https://github.com/cardinalby/github-action-ts-run-api/blob/master/README.md) for the _github-action-ts-run-api_ package here, but I want to mention how it can be used.

## Test a separate [JS function](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets.md#single-function-target)

You can import the main function of your action or the function that implements a part of action's logic and run it in the same process as testing code (but still have all required isolation).
It's up to you to decide what granularity of testing you need.

As in unit tests you can mock external services, but all outputs, inputs and environment will be handled by the package, no mocks here.

Check out [the example](https://github.com/cardinalby/github-action-ts-run-api#testing-isolated-javascript-function) of testing a simple function.

### Remarks

🔻 `process.exit(...)` calls inside a function are not mocked and will lead to process termination without cleaning up test environment. Try to avoid them.

🔻 Keep in mind that `require("@actions/github").context` is cached inside the actions library which can cause troubles if you run multiple test cases. To get it around you can:

- Use `new (require("@actions/github/lib/context").Context)() ` instead.
- Call `jest.resetModules()` (or its analog) after each test case run.

## Test a [JS file](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets.md#js-file-target)

It's executed in a child node process. It can be the main packed file of an action (specified in `runs.main` section of _action.yml_ file) or one of source JS files. Normally, you pack a JS action to a single file using tools like
[ncc](https://github.com/vercel/ncc) before publishing.
It makes debugging difficult if you use run test agains the packed file.

Testing js files you can't directly mock classes and functions (which is ok for integration testing), but instead you should have the entire external services [stubs](https://en.wikipedia.org/wiki/Test_stub).

## Filesystem modifications

Working with a filesystem follows the common principle: don't use hardcoded paths, rely on [the environment variables](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets/docker.md#paths-in-container) provided by GitHub instead.

_github-action-ts-run-api_ allows you to prepare contents of all these dirs and files before the tested action run and examine their contents after it has finished. [By default](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-options.md#-setfakefsoptions), temporary directories and files are created and corresponding environment variables are set to point to these temporary paths.

## Stubbing external services

Don't hardcode URLs of external services in your code:
- For GitHub API use the dedicated `GITHUB_API_URL`, `GITHUB_SERVER_URL`, `GITHUB_GRAPHQL_URL` [environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables).
- For other external services introduce custom env variables that can be set in tests. In they are empty action just uses real production URLs.

It's easy to create a stub HTTP server right in the test suite and set these environment variables to `localhost` URLs.

Check out [the example](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets/js-file.md#-stubbing-github-api-by-local-nodejs-http-server) of stubbing GitHub API called using octokit library.

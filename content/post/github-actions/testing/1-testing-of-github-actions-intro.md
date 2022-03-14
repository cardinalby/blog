---
title: "Testing of GitHub Actions. Intro"
date: 2021-12-01
draft: false
tags:
- github-actions
- testing
categories:
- GitHub Actions
series: Testing of GitHub Actions
image: "images/posts/github-actions/testing/title.png"
---

# Introduction

In this post series I want to share my experience and approaches with testing of GitHub Actions. Not using them to test your application, but test actions itself. I will mostly talk about testing of individual actions, not workflows.

**Individual actions** (steps) are "bricks" that workflows are built from, and we can consider testing them as unit testing of workflows.

**One of the problems** of GitHub Actions as cloud-based service is that there is no out of the box way of test them locally. Also, support in developing tools is poor comparing to mainstream programming languages. These factors lead to the high errors rate and long feedback loop to find and fix these  errors.

That's why I believe it's important to adapt best practices we use in software testing for GitHub Actions, and I'm going to share my vision in it.

# Overview

In the first part I give a general information about GitHub Actions and testing levels. Then I formulate requirements for testing tools and tell about my choise.

If you want to see concrete recommendations and approaches, just jump to the next part.

## Action types

At the moment, GitHub supports 3 kinds of Actions which I will refer to in this post:

1. [JavaScript actions](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action)
2. [Docker container actions](https://docs.github.com/en/actions/creating-actions/creating-a-docker-container-action)
3. [Composite actions](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)

## Levels of testing and tools

### 🔸 Unit testing

> A Unit is a smallest testable portion of system or application which can be compiled, liked, loaded, and executed.

Depending on the action type, "unit" notion may have different meaning. I will cover it in
"Docker actions" and "JavaScript actions" parts.

For **composite actions**, individual steps can be considered units. If you don't hardcode `runs` commands in steps, but extract them to the separate actions instead (thankfully, they can be saved locally in the repo), then the unit testing approach reduces to the testing of individual actions. That's exactly what this post is about.

### 🔸 Integration testing

> In this testing phase, different software modules are combined and tested as a group to make sure that integrated system is ready for system testing. Integrating testing checks the data flow from one module to other modules.

To perform integration testing of a GitHub Action we need a tool that:
1. Runs locally and on CI runner (including GitHub runner).
2. Runs the whole action or its part.
3. Isolates running code and give testing code an access to action's inputs, outputs and environment.
4. Allows stubbing external services used by an action, such as GitHub API.

Let's list what exactly we expect from such tool:

- Parsing action config (action.yml file)
- Setting up action [inputs](https://docs.github.com/en/enterprise-cloud@latest/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswith) and [saved state](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#sending-values-to-the-pre-and-post-actions).
- Setting up [environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables): custom ones and service GitHub variables.
- Setting up `GITHUB_EVENT_PATH` variable and faking JSON file with an event payload.
- Faking [command files](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#environment-files) and setting up correspondent env variables (`GITHUB_ENV`, `GITHUB_PATH`).
- Faking temp and workspace directories (and corresponding `RUNNER_TEMP` and `GITHUB_WORKSPACE` variables)
- Intercepting and isolating stdout and stderr output. It's important, because being run on GitHub runner our tests can interfere with actual commands of test workflow.
- Parsing intercepted output and faked command files to extract [commands](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions) issued by tested code.

I haven't found any handy solution that meet these requirements and it made me write my own TypeScript package for testing JavaScript and Docker actions called [github-action-ts-run-api](https://github.com/cardinalby/github-action-ts-run-api). It has well typed JavaScript API with reasonable defaults, can be used with any JavaScript test framework or alone and covers all listed requirements.

In the following parts of the post I'm going to tell about the testing techniques that become
possible with this package. For **more code examples** take a look at the [package documentation](https://github.com/cardinalby/github-action-ts-run-api#documentation).

### 🔸 System testing

> System testing is performed on a complete, integrated system. It allows checking system’s compliance as per the requirements. It tests the overall interaction of components. It involves load, performance, reliability and security testing.

It can be debatable what to consider as system testing in case of GitHub Action.

#### Option 1

Testing the whole action behavior using the same tool as we use for integration testing, but exclude external services stubs if it possible.

#### Option 2

Testing action behavour in the workflow. The only existing solution for doing that locally is a great tool called [Act](https://github.com/nektos/act).
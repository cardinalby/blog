---
title: "GitHub Actions integration testing lib"
description: "JavaScript API for GitHub Action execution and integration/functional testing"
date: 2022-01-18
tags:
- js
- docker
- github-actions
- testing
---

## Check out

[https://github.com/cardinalby/github-action-ts-run-api](https://github.com/cardinalby/github-action-ts-run-api)

## Purpose

🔶 Executing your GitHub action **locally** (or at any other environment).

🔶 Writing integration and functional tests, run them locally and at CI.

🔶 Having a short feedback loop without pushing and checking it behaviour at
real GitHub runners every time.

## Features

✅ Supports executing JavaScript and Docker actions.

✅ Tested under Windows, Linux and macOS locally and on GitHub hosted runners.

✅ Works well with Docker Desktop under Windows and macOS (for Docker actions).

✅ Can be used with any JavaScript test frameworks or alone.

✅ Can execute an explicitly specified js file or _main_, _pre_, _post_ script from `action.yml`.

✅ If you need to mock dependencies in a JS action, it can execute and test a separate sync or async JS function,
isolating its environment (process env, exitCode and working dir), intercepting _stdout_ and _stderr_ output.

✅ Has a clear JavaScript API with TypeScript declarations and reasonable defaults

✅ Provides a uniform way of setting action run options which can be reused for different targets
---
title: "Testing of Docker Actions"
date: 2021-12-03
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- docker
- testing
series: Testing of GitHub Actions
image: "images/posts/github-actions/testing/title.png"
---

In this part I'm going to tell about approaches that can be used to test a Docker container Action.

# Unit tests

An approach here depends on what programming language you use inside a container. Each of them has own testing libraries that can be used to test an application in the container.

If you use bare bash script, you can divide a single _entrypoint.sh_ file into the several small scripts considering them as units and testing separately.

The following approaches can be used to isolate their effects:
- Redirecting scripts output to a temporary file.
- Interacting with the main script through environment variables.
- Don't hardcode path of filesystem that is modified by scripts, use env variables for that. It will allow you to use temp directories and files during testing.

Take a look at [bash_test_tools](https://thorsteinssonh.github.io/bash_test_tools/) - it's an analog of JavaScript test frameworks for bash scripts and executables.

It's better to use an environment similar to the production one in tests. Thankfully, it's not a problem with Docker containers. Just create a separate _Dockerfile_ that runs tests in the same environment that the main _Dockerfile_ defines.

# Integration tests

_github-action-ts-run-api_ [can run](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets.md#docker-target) Docker actions locally on Linux with native Docker, on MacOS and Windows via Docker Desktop and on any CI where Docker is installed (only Linux GitHub-hosted runners have docker support at the moment).

You still have the same TypeScript API for running, preparing all inputs, environment  and examining results of an action execution.

Actually, it looks more like a system test (because action is black-boxed and executed as a whole) run using TypeScript API instead of normal yml workflow syntax. If you want to perform an integration test of only of some part of your code, probably, you need to create a separate Dockerfile and use _github-action-ts-run-api_ to run it.

Working with a file system in a Docker action follows the common principle: don't use hardcoded paths, rely on [the environment variables](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets/docker.md#paths-in-container) provided by GitHub instead.

_github-action-ts-run-api_ allows you to prepare contents of all these dirs and files before the tested action run and examine their contents after it has finished. [By default](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-options.md#-setfakefsoptions), temporary directories and files are created and attached as volumes to the tested action container.Corresponding environment variables are set to point to the mounting points of these volumes.

# Stubbing external services

Advice here is similar to the one given for JavaScript actions. Don't hardcode URLs of external services in your code:
- For GitHub API use the dedicated `GITHUB_API_URL`, `GITHUB_SERVER_URL`, `GITHUB_GRAPHQL_URL` [environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables).
- For other external services introduce custom env variables that can be set in tests. In they are empty action just uses real production URLs.

## NodeJS server

As in the case of JavaScript actions testing you can easily create a stub HTTP server right in the test suite managed by NodeJS and pass a base URL of the created stub server through environment variables to the tested action.

In this case the base URL of stub server should be:
- `host.docker.internal` for Docker Desktop
- `172.17.0.1` for native Linux Docker

Check out [the example](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets/docker.md#-stubbing-github-api-by-local-nodejs-http-server).

## Docker container server

Since we test a docker container action it would be natural to spin up a stub HTTP server in a docker container that will run along with the tested docker action container.

The best way of doing it is to create a `docker-compose.yml` file that defines a service with the stub HTTP server and a named network:

```yaml
version: "3.5"
services:
  fake-server:
    build:
      # Image with stub GitHub API HTTP server
      context: httpServerDir
    ports:
      - "80:80"
networks:
  default:
    # Assign a name to the network to connect 
    # the tested action container to it
    name: testNet
```

1. Execute `docker compose up` before testing the action container.
2. Attach the action container to the named network (`testNet` in the example) and pass a base URL of the created stub server  through environment variables to the tested action (`fake-server` in the example).
3. Execute `docker compose down` after the action container finished.

There is convenient [`withDockerCompose()`](https://github.com/cardinalby/github-action-ts-run-api/blob/master/src/actionRunner/docker/utils/withDockerCompose.ts) utility function in _github-action-ts-run-api_ package for performing these steps:

```typescript
await withDockerCompose(
    'path/to/docker-compose.yml',
    async () => {
        const target = RunTarget.dockerAction(
            'path/to/action.yml', 
            // network name defined in docker-compose.yml    
            {network: 'testNet'}
        );
        const res = await target.run(RunOptions.create()
            // service name defined in docker-compose.yml
            .setGithubContext({apiUrl: `http://fake-server:80`})
        );
        assert(res.commands.outputs.out1 === 'fake_response');
    });
```
Check out [the example](https://github.com/cardinalby/github-action-ts-run-api/blob/master/docs/run-targets/docker.md#-stubbing-github-api-by-http-server-container).

# Remarks

🔻 Docker Desktop for Windows and MacOS behaves differently from native docker on Linux. Be aware!
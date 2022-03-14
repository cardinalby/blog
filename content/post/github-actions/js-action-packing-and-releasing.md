---
title: "JavaScript GitHub Action packing and releasing"
date: 2022-02-17
draft: false
categories:
- GitHub Actions
tags:
- github-actions
- js
- ncc
title_image: "images/posts/github-actions/js-action-packing-and-releasing/title.png"
---

## 🔭 Overview
In this article I want to share some undocumented details of creating **JavaScript GitHub Actions** related to the using of **ncc** packing tool.

It's not just a step-by-step instruction, but the story describing the problem, the proposed approach and the reasoning behind it.

If you are just looking for a quick code example, jump to [this one](https://github.com/cardinalby/git-get-release-action/blob/master/.github/workflows/build-pack.yml) and come back for an explanation 🙂

## 🎬 Basics that you already know
The basic approach is pretty easy and described in GitHub documentation [here](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action). Also, there are simple [JavaScript](https://github.com/actions/javascript-action) and [TypeScript](https://github.com/actions/typescript-action) action examples provided by GitHub. I will not focus on it here.

## 📦 What is ncc and why you should use it

The most unclear and confusing part is packing the code using [ncc](https://github.com/vercel/ncc). The necessity of this step is caused by GitHub’s approach to running your Action.

_There is no compiled artifact (container) for an action, GitHub instantiates it directly from your repository and runs. For Docker container action it means rebuilding the `dockerfile` each time, for JavaScript actions — a requirement **to have all your dependencies from `node_modules` under the version control**._

**The GitHub's proposed solution** is:
1. Pack all required dependencies from `node_modules` together with your code into a single JS file (artifact) using `ncc` library.
2. Commit this file instead of `node_modules` directory.

## 🤔 Why shouldn't you be satisfied with it?

Generally, it’s considered a bad practice to store build artifacts under the version control. It leads to the code duplication and requires you to keep both copies in sync:

1.  Don’t forget to build and commit the artifact each time you make changes.
2.  Be sure your build environment is compatible with the Actions runtime environment.
3.  All developers (or single developer who uses multiple machines) should have an identical build environment to avoid the difference in artifact built from the same source code.

**The third point** is the most problematic. I found that `ncc` can include your local paths to the packed file revealing information about your local machine and making build different on different machines.

## 💡 Let's automate it

I investigated and tested existing solutions and came with my own approach I want to share. I decided to utilize Actions for building and committing packed JS file after any changes in the code or its dependencies. That way we are going to solve all 3 issues mentioned above. We are going to create a workflow that will:

1.  Perform building and packing steps.
2.  Сhecks if built JS file differs from the old one in repo
3.  If so, commit new JS file

## 🚀 Creating workflow

1️⃣ Let’s start with creating `.github/workflows/build-and-pack.yml` file with standard steps:

```yaml
name: "build-and-pack"  
on:  
  push:  
    branches:  
      - master  
      - develop  
      - 'v*'  
  
jobs:  
  build:  
    env:  
      PACKED_JS_PATH: 'dist/index.js'  
    runs-on: ubuntu-latest  
    strategy:  
      matrix:  
        node-version: [12.x]  
    steps:  
      - uses: actions/checkout@v2        
      - name: Use Node.js ${{ matrix.node-version }}  
        uses: actions/setup-node@v1  
        with:  
          node-version: ${{ matrix.node-version }}  
    ...
```

Defined env variable `PACKED_JS_PATH` shows the destination path (relative to the repository) for a JS artifact.

2️⃣ **Please note,** our action will be run only on pushes to the listed branches. It means `GITHUB_REF` env variable (filled by Actions engine) will reflect the branch name. **But**, if you add “on push tags” event, it can contain a tag ref as well. To retrieve the branch name add the following step:

```yaml
- name: Extract branch name  
  id: extractBranch  
  shell: bash  
  run: echo "##[set-output name=branch;]$(echo ${GITHUB_REF#refs/heads/})"
```

3️⃣ Then add simple steps to install dependencies, build TypeScript code (if you use it) and pack your sources to `dist/index.js`.

```yaml
- name: Install dependencies  
  run: npm install  
- name: Build  
  run: npm run build  
- name: Pack  
  run: npm run pack
```

`build` and `pack` commands here are just scripts defined in `package.json` (as suggested in GitHub doc):

```json
"scripts": {  
  ...  
  "build": "tsc",  
  "pack": "ncc build",  
  ...  
}
```

4️⃣ Add a step to find if `dist/index.js` was changed after the build/pack steps using `git status` command:

```yaml
- name: Check packed JS changes  
  id: packedJsStatus  
  run: echo ::set-output name=changes::$(git status ${{ env.PACKED_JS_PATH }} --porcelain)
```

5️⃣ **If** it was changed we are going to commit it:

```yaml
- name: Commit packed JS  
  id: commitPackedJs  
  if: steps.packedJsStatus.outputs.changes  
  run: |  
    git config --local user.email "action@github.com"  
    git config --local user.name "GitHub Action"  
    git add ${{ env.PACKED_JS_PATH }}  
    git commit -m "Pack with dependencies to ${{ env.PACKED_JS_PATH }}"
```

6️⃣ ... and push to the current branch (its name we get from the `extractBranch` step):

```yaml
- name: Push packed JS  
  if: steps.commitPackedJs.outcome == 'success'  
  uses: ad-m/github-push-action@master  
  with:  
    github_token: ${{ secrets.GITHUB_TOKEN }}  
    tags: true  
    force: true  
    branch: ${{ steps.extractBranch.outputs.branch }}
```

## 🏷 Release management
The last note I want to make is about your Action’s versioning policy. Probably, you noticed that I use **branches** to mark releases in this example.

GitHub [recommends](https://docs.github.com/en/actions/creating-actions/about-actions#using-tags-for-release-management) using tags instead. If we go that way, we should keep in mind that:
1.  We should move a tag (or several tags) after committing a new packed JS file or wait until workflow finishes and do it manually.
2. Managing tags is trickier than managing branches. It requires additional command-line options in git commands and [not fully supported](https://youtrack.jetbrains.com/issue/IDEA-159572) by all GUI git clients.
3.  When `on push tags` event triggers a workflow, `GIT_REF` env variable points to the tag ref and we don’t have information about the branch. Pushing our changes (with packed JS) using tag ref as a target generally is a bad idea. It will work, but a new commit will be **detached** from branches and will not be shown properly by many GUI git tools.

**To simplify it**, I suggest sticking to managing branches instead:
1.  `master` branch for the last released version.
2.  `develop` branch for ongoing development and testing.
3.  `v1` , `v2` , … branches for stable versions with no breaking API changes

## 🏁 The end

You can still use tags to mark releases, but you should wait until workflow finishes, “Pack with dependencies to …” commit appears and mark it by the tag.

For an example of the result workflow file please check out [this one](https://github.com/cardinalby/git-get-release-action/blob/master/.github/workflows/build-pack.yml) from my own action.

## 👏 Thank you for reading

Any comments, critics and sharing your own experience would be appreciated!

If you are interested in developing own Actions, I also recommend you reading "[Testing of GitHub Actions](testing/1-testing-of-github-actions-intro.md)" post.
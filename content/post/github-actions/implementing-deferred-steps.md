---
title: "GitHub Actions: implementing deferred steps"
date: 2021-11-01
draft: false
categories:
- GitHub Actions
tags:
- github-actions
title_image: "../../../images/posts/github-actions/implementing-deferred-steps/title.png"
---

## ⚡️ GitHub Actions can do everything... but immediately

Sometimes you can’t finish your CI/CD job in a single run: you have to wait for some event or until an external long-running process finishes. To do that, we need a possibility to _delay/postpone/defer_ some steps and repeat them (probably multiple times until they succeed).

_For example, I faced the issue with WebExtension [publishing](https://dev.to/cardinalby/webextension-deployment-and-publishing-using-github-actions-522o). After calling the Web Store API I have to wait up to week or two until my extension gets reviewed and only then I will be able to download published and packed file and add it to a GitHub release._

In this post I want to review existing possibilities for delaying particular steps of your workflow in case they can't be completed immediately.

**If you are looking for a quick solution**, nowadays I recommend using the _"Dispatched workflow"_ approach. _"Scheduled workflow"_ approaches are taken here mostly for a historial reason, they were more relevant before the `workflow_dispatch` event was [announced](https://github.blog/changelog/2020-07-06-github-actions-manual-triggers-with-workflow_dispatch/).

## 💤 Getting some sleep

The most obvious way is adding a _sleep_ step to a workflow, wait for a while and continue your job.

Linux and macOS runners:

```yaml
- name: Sleep for 30 seconds
  run: sleep 30s
  shell: bash
```

Windows runners:

```yaml
- name: Sleep for 30 seconds
  run: Start-Sleep -s 30
  shell: powershell
```
### 🥡 Takeaways:

1. No extra workflows required
2. According to the [Actions Usage Limits](https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration#usage-limits) each job in a workflow can run for up to **6 hours** of execution time. If a job reaches this limit, the job is terminated and fails to complete.
3. It's difficult to implement multiple retries of a delayed steps.

## ♻️ Dispatched workflow calling itself + wait timer

The idea of this approach is based on extracting _delayed_ steps to the separate workflow that is triggered by the [workflow_dispatch](https://docs.github.com/en/actions/learn-github-actions/events-that-trigger-workflows#workflow_dispatch) event. It means, the workflow can be triggered manually or
using GitHub API.

At the end of the workflow run it will trigger itself in case it hasn't succeed to complete the job and the
attempts number hasn't reached the limit.

1️⃣ We create the _main workflow_ that triggers the _delayed workflow_ by emulating a _workflow_dispatch_ event using GitHub API (with help of [workflow-dispatch](https://github.com/marketplace/actions/workflow-dispatch) action):

```yaml
# place initial steps here

- uses: benc-uk/workflow-dispatch@v1
  if: ## need to run delayed steps
  with:
    ## It's the name defined in the delayed workflow file
    ## Context ref of the main workflow is passed to the 
    ## dispatched workflow by default
    workflow: delayed-dispatched-workflow 
    token: ${{ secrets.PERSONAL_TOKEN }}
```

2️⃣ `PERSONAL_TOKEN` [secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository) here is a [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with write access to the repo. The automatically provided token e.g. `secrets.GITHUB_TOKEN` can not be used, GitHub prevents this token from being able to fire the workflow_dispatch and repository_dispatch event.

3️⃣ The next step is [creating](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#creating-an-environment) an environment for the repository and setting ["wait timer"](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#wait-timer) to delay its start (1440 minutes for example). Let's call the created environment `oneDayDelay`.

4️⃣ Then we create `delayed-dispatched-workflow.yaml`:

```yaml
name: delayed-dispatched-workflow
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
        default: '5'
jobs:
  doTheRestOfTheWork:
    runs-on: ubuntu-latest  
    ## It reffers to the created environment with
    ## 1 day wait timer
    environment: oneDayDelay
    steps: 
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
      ## To be continued...
```

The `workflow_dispatch` event allows to pass the specified inputs to the workflow both by manual run and by API call. The first call from the main workflow is made with the default values.

To prevent infinite loops if invalid inputs are passed, at the first step we validate the inputs. If inputs are invalid, it will fail. Otherwise, it will set its `result` output equal to the next atempt number or an empty string if `maxAttempts` has been reached.

Next, add steps that try to perfrom an actual work and restart the workflow:

```yaml  
## Provided ref is used automatically
- uses: actions/checkout@v2

## Do your job here
- name: Fake work
  id: actualWorkStep
  continue-on-error: true
  run: 'exit 1'

## Call itself again
- uses: benc-uk/workflow-dispatch@v1
  ## If actualWorkStep failed and maxAttempts hasn't 
  ## been reached
  if: |
    steps.actualWorkStep.outcome != 'success' &&
    steps.getNextAttemptNumber.outputs.result
  with:
    ## Pass the name of this workflow
    workflow: ${{ github.workflow }}
    token: ${{ secrets.PERSONAL_TOKEN }}
    ## Pass increased attemptNumber and current maxAttempts
    inputs: |
      { 
        "attemptNumber":
            "${{steps.getNextAttemptNumber.outputs.result}}",
        "maxAttempts": 
            "${{github.event.inputs.maxAttempts}}"
      }
```

### 🥡 Takeaways:

1. It's logical, flexible and maintainble. Doesn't bloat actions history and git history (by special tags or commits).
2. Requires extracting delayed steps to the separate workflow.
3. Multiple _delayed workflow_ runs can be triggered concurently.
4. In a straightforward implementation there can be a duplication of the `actualWorkStep` in both _main workflow_ (attempt to complete the step immediatelly) and _delayed workflow_.
5. Instead of using the same _environment_ for the job in the _delayed workflow_ (`oneDayDelay` in my
   example) you can pass its name through workflow inputs. Thus, you can specify a delay at the moment of emitting `workflow_dispatch` event, either via API or manually.
6. Approach from the _point 5_ can solve the duplication mentioned in _point 4_. Use [this](https://github.com/marketplace/actions/workflow-dispatch-and-wait) to call the _delayed workflow_ from the _main one_ and wait until it finished.
7. Can be triggered manually with custom delay (see point 5).
8. Requires creating a new repo environment with the only purpose of setting a wait timer.
9. Environment's "wait timer" maximum value is 43200 minutes (**30 days**).
10. You can't share env variables between 2 workflows.

## ⏰ Scheduled workflow

GitHub Actions offers a [”schedule” event](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule) to schedule your workflow run using _cron_ syntax.

Going this way we will have 2 separate workflows:

**1️⃣ The main workflow** (triggered by pushing a tag or a commit) with initial steps and the final step with [adding](https://github.com/marketplace/actions/add-git-tag) a special  tag (let's call it `delayed-job-tag`) to the current commit (the one that triggered the workflow):
```yaml
# place initial steps here

- uses: cardinalby/git-tag-action@master
  if: ## need to run delayed steps
  env:
    TAG: 'delayed-job-tag'
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**2️⃣ The scheduled workflow** that will perform _delayed_ steps [if](https://stackoverflow.com/questions/60589373/how-to-force-to-exit-in-github-actions-step) `delayed-job-tag` tag exists in the repository and will delete the tag in case of success:
```yaml
name: "delayed-workflow"
on:
  schedule:
    - cron:  '*/15 * * * *' # At every 15th minute
jobs:
  doTheRestOfTheWork:
    runs-on: ubuntu-latest    
    steps:
      - name: Checkout by delayed-job-tag
        id: checkoutTag
        uses: actions/checkout@v2
        continue-on-error: true
        with:
          ref: 'delayed-job-tag'

      ## Do your job here if tag exists and was checked out
      - name: Fake work
        if: steps.checkoutTag.outcome != 'success'
        id: actualWorkStep
        run: echo "Hello"

      ## Delete the tag if work was done so that the next
      ## run will do nothing
      - name: Delete delayed-job-tag  
        if: steps.actualWorkStep.outcome == 'success'
        uses: dev-drprasad/delete-tag-and-release@v0.2.0
        with:
          tag_name: 'delayed-job-tag'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Using `continue-on-error: true` for `checkoutTag` step and condition for further steps will prevent the entire workflow to fail if tag wasn't found.

### 🥡 Takeaways:

1. You can repeat delayed steps multiple times (on each run of the scheduled workflow) until they succeed.
2. The schedule always remains the same, but a time span between the pushing the the `delayed-job-tag` tag by _main workflow_ and the first run of a _scheduled workflow_ may vary.
3. The _scheduled workflow_ will be triggered forever, bloating actions run history even if no actual steps have been done.
4. Triggering the main workflow again before the scheduled workflow has done its job can lead to:
    * If the main workflow added the tag **in the middle** of the scheduled workflow run, the tag will be just deleted at the last step of the scheduled workflow. Thus, the next scheduled run will not find the tag and will not perform a required work.
    * If the main workflow added the tag **before** the first run of the scheduled workflow, the scheduled workflow will run once and use the tag pointing to the commit marked at the last run of the main workflow. Thus, the work that should be done after the first run will not be performed.
5. If you need to pass any runtime values from the main workflow to the scheduled one, you can use GitHub API to [add](https://docs.github.com/en/rest/reference/actions#create-or-update-a-repository-secret) a repository secret and read it in the scheduled workflow.
6. You can't use `github.run_number` to limit attempts number. Probably, you have to store (and manage) it explicitly in secrets too.
7. Scheduled workflows run only in the default branch of a repository.

## 💡 Improving "Scheduled workflow" approach

The idea of beating the described cons of the previous approach is the following:

1. Create a new "delayed" scheduled workflow but save it as a template outside the `.github/workflows` directory.
2. Copy this template to the `.github/workflows` directory at one of the steps of the _main workflow_.
3. After the _scheduled workflow_ successfully finished its work, the workflow will remove itself from the `.github/workflows` directory at the last step.

I have implemented the idea explained above in form of [schedule-job-action](https://github.com/marketplace/actions/schedule-job-action) and [unschedule-job-action](https://github.com/marketplace/actions/unschedule-job-action) GitHub Actions to make the code reusable and make it possible for everybody to include them in their own workflows.

1️⃣ We have to [create](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) a new personal access token with `repo` and `workflow` permission for that, because the default `GITHUB_TOKEN` (available in every workflow) doesn’t contain the required `workflows` permission. Let's save it to the `PERSONAL_TOKEN` [secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository).

2️⃣ Add the following step to your _main workflow_'s job to create the copy of the _delayed workflow_ from the template:

```yaml
- uses: cardinalby/schedule-job-action@v1  
  with:  
    ghToken: ${{ secrets.PERSONAL_TOKEN }}  
    templateYmlFile: '.github-scheduled-workflows/example.yml'
```

It will read `.github-scheduled-workflows/example.yml` template, add the required metadata env variables to it and commit it to the `master` branch as a normal workflow file. We use this step instead of adding a new tag (in the initial "Scheduled workflow" approach). It's a minimalistic example. You can find [more](https://github.com/marketplace/actions/schedule-job-action#inputs) reading the documentation.

3️⃣ Let’s create the mentioned `.github-scheduled-workflows/example.yml` scheduled workflow template with the single job:

```yaml
name: "example-cron-action"  
on:  
  schedule:  
    - cron:  '*/15 * * * *'    # At every 15th minute
jobs:  
  singleJobName:  
    runs-on: ubuntu-latest    
    steps:       
      - uses: actions/checkout@v2  
        with:  
          ## We checkout not the head of the `master` branch 
          ## but the exact commit where the scheduling happened. 
          ## This env variable contains SHA (or tag name) of the 
          ## commit which triggered our main workflow.
          ref: ${{ env.DELAYED_JOB_CHECKOUT_REF }}  
      
      ## Do your job here
      - name: Fake work
        id: actualWorkStep
        continue-on-error: true
        run: 'exit 1'

      ## Remove the workflow file from `.github/workflows` 
      ## if work step has succeeded or attempts number 
      ## has reached the limit equal to 10
      - name: Remove scheduled job
        if: |
          steps.actualWorkStep.outcome == 'success' || 
          github.run_number > 10
        uses: cardinalby/unschedule-job-action@v1  
        with:  
          ghToken: ${{ secrets.PERSONAL_TOKEN }}
```

`DELAYED_JOB_CHECKOUT_REF` and other _env_ variables (required by the last “unschedule” step) will be added to the template at runtime on scheduling it from the main workflow. Additionally, using `copyEnvVariables` [input](https://github.com/marketplace/actions/schedule-job-action#inputs) of _schedule-job-action_ you can specify a list of _env_ variables whose values will be copied to the _delayed workflow_ file.

### Examine the outcome

When your main workflow gets triggered, the last step will add a new "Add delayed example-delayed-job.yml job" commit to the `master` with the `.github/workflows/example.yml` file created from the template. The contents of this file is identical to our template except for the `env` sections. In the result file it has been extended by the following values:

```yaml
env:
      DELAYED_JOB_CHECKOUT_REF: delayed-job
      DELAYED_JOB_CHECKOUT_REF_IS_TAG: 'true'
      DELAYED_JOB_WORKFLOW_FILE_PATH: | 
        .github/workflows/example-delayed-job.yml
      DELAYED_JOB_WORKFLOW_UNSCHEDULE_TARGET_BRANCH: master
```

### Infinite loop protection is there. Eventually

[schedule-job-action](https://github.com/marketplace/actions/schedule-job-action) contains a special check: it does nothing if a commit that triggered the run had been made by the action itself or by any other action. If I hadn't done it, it would have created the infinite loop once the action has added `example.yml` file to the repo and have triggered itself.

### Get the original release in the delayed job

If you want to modify your GitHub release (created during the _main workflow_ run) in your delayed workflow you should:

**1\.** Get the current commit SHA (the one we checked out by SHA or tag). **Remember**, you can’t use `github.sha` from the Actions context because for workflows triggered by schedule it points to the last commit in `master`:
```yaml
## You can’t use neither:
## 1. `github.sha` from the Actions context because it points 
## to the last commit in `master` for scheduled workflows.
## 2. `env.DELAYED_JOB_CHECKOUT_REF` because it can contain 
## either SHA or tag name
- name: Get checked out commit SHA  
  id: getCommitSha  
  run: echo "::set-output name=sha::$(git rev-parse HEAD)"

- id: getRelease  
  uses: cardinalby/git-get-release-action@v1  
  continue-on-error: true  
  with:  
    commitSha: ${{ steps.getCommitSha.outputs.sha }}  
  env:  
    GITHUB_TOKEN: ${{ github.token }}
  
## Use `steps.getRelease.outputs.upload_url` to 
## upload assets
```

### 🥡 Takeaways:

1. You can repeat delayed steps multiple times until they succeed.
2. "Scheduling" and "unscheduling" a delayed run bloats your git history.
3. Each scheduled run has its own workflow file, which allows us to check `github.run_number` to limit the attempts number.
4. The schedule always remains the same, but a time span between the creating a workflow from a template at the _main workflow_ and the first run of a _scheduled workflow_ still may vary.
5. A _scheduled workflow_ will not be triggered forever.
6. Scheduling multiple _scheduled workflows_ is possible. If they use different SHAs (passed by `DELAYED_JOB_CHECKOUT_REF` env variable), it shouldn't cause concurrency issues. Using a tag as a `DELAYED_JOB_CHECKOUT_REF` still has the issues described above for a regular "scheduled workflow" approach.
7. Passing runtime values from the _main workflow_ to the _scheduled_ one is easier with help of `jobPayload` and `copyEnvVariables` [inputs](https://github.com/cardinalby/schedule-job-action#inputs) of _schedule-job-action_.
8. Scheduled workflows still run only in the default branch of a repository.

## 👏 Thank you for reading

Any comments, critics and sharing your own experience would be appreciated!

If you are interested in developing own Actions, I also recommend you reading "[GitHub Actions Testing](https://dev.to/cardinalby/github-actions-testing-h3h)" post.

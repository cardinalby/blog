---
title: "VLC Sync Play"
description: "Multi-platform tool for synchronized playback of video files"
date: 2024-10-23
tags:
- go
- vlc
---

I created it to watch movies with my girlfriend on one screen but listening to 2 different audio tracks. Each of us has a pair of earphones and each listens to its own audio track.

The key feature is that they are synchronized.

I can pause, play, seek, and the other player will do the same.

![VLC sync play](images/projects/vlc-sync-play/promo.png)

### [See the Github repo](https://github.com/cardinalby/vlc-sync-play)

It's an experimental project, I wanted to show that it's possible to create such a tool using Golang, 
even though it's not the best language for GUI applications.

I had to develop the own [build toolset](https://github.com/cardinalby/xgo-pack) for delivering the app 
to the major platforms.
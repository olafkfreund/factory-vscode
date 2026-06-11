---
layout: post
title: "Bringing the pipeline into the editor: why we are building factory-vscode"
subtitle: "The PARR loop is finally visible without a browser tab."
date: 2026-06-11 08:00:00 +0000
author: Olaf Freund
description: Why factory-vscode exists, what it does, and the problems it solves for the Factory PARR pipeline.
---

The Factory suite runs work through a closed loop we call PARR: Prepare and plan in PFactory, Act
and build in AIFactory, Reflect and verify in TFactory, and Review and observe in CFactory. The loop
works. What has been missing is a place to *watch* it from where the work actually happens, the
editor.

This post explains why we are building `factory-vscode`, what it will do, and the specific problems
it solves.

## The problem: the loop is real, but you cannot see it from your desk

When a unit of work moves through the factories, there is a lot going on. A plan is signed in
PFactory. AIFactory picks it up and starts coding, often across several parallel subtasks. TFactory
verifies the result and sometimes hands it back. CFactory threads all of this together by a single
correlation key, the GitHub issue number, and shows it in a web cockpit.

That cockpit is good. The problem is where it lives: in a browser tab, away from the editor. So the
everyday questions, where is issue #142, what is it doing right now, did it get stuck, are
answered by alt-tabbing out of the place you are working. Every check is a context switch. For a
system whose whole point is a fast, observable loop, that last hop out of the IDE is friction we do
not need.

There was also no IDE integration of any kind. No extension surfaced pipeline state, no editor
notification told you a stage had failed or was awaiting your review. If you were not looking at the
browser, you did not know.

## The idea: do not rebuild the tower, consume it

The most important design decision came from looking at what already exists. CFactory is already the
aggregator. It already collects completion events from all three factories, joins them by the
correlation key, detects anomalies like stuck tasks and handback loops, and even re-streams the live
agent terminal in a token-safe way. It exposes all of this over a plain REST API, a live WebSocket,
and a console WebSocket.

So `factory-vscode` is not a fourth integration that talks to PFactory, AIFactory, and TFactory
separately. It is a consumer of CFactory. One connection, one correlation model, one source of
truth. That keeps the extension small, keeps the contract stable, and means everything the cockpit
knows, the editor can know too.

## What it will do

factory-vscode is a hybrid: native IDE surfaces for the things you want fast and always-on, and a
rich Webview for the things that benefit from motion and detail.

- A pipeline tree in the activity bar. Every work item, expanded into its Plan, Code, and Test
  stages, each with a status icon and live progress. This is the at-a-glance answer to "where is
  everything".

- An animated cockpit. A Webview where each work item visibly travels Plan to Code to Test, with
  progress rings and a running token and cost ticker. The animation is there to convey state change,
  not for decoration. When something moves, you see it move.

- A live agent console. Attach to the running agent's terminal stream, the same output the agent is
  producing as it works, embedded directly in the editor. No browser, no shell hunting for the right
  session. This consumes the console stream CFactory already proxies, so the upstream credentials
  never leave the server.

- Native notifications. Stage complete, failure, awaiting review, and anomaly nudges for stuck tasks
  or handback loops. Deduplicated so they do not spam, with buttons that take you straight to the
  console or the GitHub issue.

- A status bar and badge. Running and anomaly counts, always visible, so you have a pulse on the
  pipeline without opening anything.

Optionally, where the IDE supports it, the extension can register CFactory's pipeline tools with the
IDE's AI assistant, so you can simply ask "where is #142 and why is it stuck" in chat.

## The problems this solves

- No more context switch to check status. The pipeline lives next to your code.
- You learn about failures and review gates when they happen, in the editor, instead of when you
  next remember to open the cockpit.
- Stuck tasks and handback loops surface as nudges, not as something you have to go hunting for.
- The live agent console is one click away, so watching what the agent is actually doing no longer
  means finding and attaching to a terminal session by hand.

## Built to run everywhere you work

The extension is built on stable extension APIs and the standard Webview API, and it will be
published to both OpenVSX and the VS Marketplace. That means it runs in VSCode and in the growing
family of compatible editors, Antigravity, Cursor, Windsurf, and VSCodium, from the same package.

## Where we are

This is the start. The full design is written, the repository is up, and the work is broken into a
roadmap from foundation through the native UI, the animated cockpit, and the polish that makes it
genuinely pleasant to use. The build plan is public on the project board.

If you live in your editor and you run work through the factories, the goal is simple: never make
you leave the editor to know where your work is.

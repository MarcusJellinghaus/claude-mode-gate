# claude-mode-gate

A Claude Code mod with switchable permission profiles: a safe baseline, named profiles you switch on and off, and everything else still asks.

**Status:** design stage, nothing is built yet. See [docs/design.md](docs/design.md) for goals, decisions and open points.

## Goals

1. Limited by default: read access and a few undoable project writes.
2. Profiles: named bundles of rules you switch on and off, several at once.
3. Simple, visible control: one command per action, and the active profiles are always shown.
4. Tighter security: Bash asks unless an active rule allows that call, and a denied call says which tool to use instead.

## What it can reach

_To be written._

## What it allows

_To be written._

# fork-board

A Claude Code mod that keeps your main session on track. When an answer raises side topics, fork-board spins them off into their own background sessions, forked from the current one so they keep the full context.

- `/topics` picks out the open threads from the last answer. Press a number to fork one, `a` for all of them.
- `/dig <topic>` forks a topic you type yourself.
- The status line shows what is running, and a toast tells you when a fork is waiting for you.
- `/forks` opens a pane listing all the forks.
- `/harvest` brings the forks' conclusions back into the main session.

Every fork also shows up by name in the `claude agents` view.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install fork-board --marketplace yaronya/fork-board
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install fork-board --marketplace yaronya/fork-board
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `yaronya/fork-board`, then Add plugin.

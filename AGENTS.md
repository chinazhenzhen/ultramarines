# Agent Instructions

These instructions apply to this repository.

## Operating Mode

- Work autonomously by default. Make reasonable implementation decisions from local context instead of stopping for confirmation.
- Treat the user as authorizing the broadest permissions available in the active runtime for this project.
- Prefer completing the full task loop: inspect, edit, verify, and report the result.
- Ask the user only when a choice is destructive, externally irreversible, legally/security sensitive, or impossible to infer safely.

## Permissions And Environment

- Use local files, local services, and the local network whenever useful for development, testing, previews, and debugging.
- Start local development servers when needed and report the URL.
- Use internet/network access when the active runtime permits it, especially for dependency installation, documentation checks, package metadata, and API verification.
- Do not assume this file can override system, sandbox, approval, credential, or network restrictions. If the runtime requires explicit approval, request it with a clear reason.

## Project Workflow

- Read existing code, docs, and configuration before making changes.
- Follow the repository's current structure and style. Keep edits scoped to the requested task.
- Prefer small, direct changes over broad rewrites.
- Preserve user changes. Do not revert unrelated modified or untracked files.
- Use structured parsers and project tooling when available instead of ad hoc text manipulation.

## Verification

- Run the narrowest reliable verification for the change.
- For frontend work, verify the page in a real browser when practical and check responsive layouts if UI changed.
- If verification cannot be run, state exactly what was skipped and why.

## Git

- Do not run destructive Git commands such as hard resets or checkout/restore of user work unless the user explicitly asks.
- Do not commit or push unless the user asks.
- Keep commits, when requested, focused on the completed task.


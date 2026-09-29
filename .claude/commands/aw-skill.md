---
description: Package, import, attach, smoke, and audit a portable Agent Skill
---

Build and verify a portable Agent Skill on the configured AgentWorks cluster.

1. Read `.agentworks/context.md`,
   `.agentworks/bundle/cluster-context.json`, and
   `.agentworks/bundle/docs/how-to/package-and-govern-agent-skills.md`.
2. Confirm the relevant `skill.*` and deployment affordances are allowed.
   Stop and report the denial when they are not.
3. Author from `.agentworks/examples/research-brief-skill/`. Keep `SKILL.md`
   at the root and do not embed credentials or grant authority in metadata.
4. Run `agentworks skill pack <directory> -o <name>.skill`.
5. Call `import_skill_package` with the package bytes, or use
   `agentworks skill import`. Set `scope=workspace` with tenant and workspace
   IDs, or set `scope=tenant` with the tenant ID and omit the workspace ID.
6. Capture the returned skill ID, immutable version ID, and package digest.
7. Call `deploy_agent` with that exact version in `skill_version_ids` (or use
   repeatable `agentworks agent deploy --skill-version-id <uuid>`).
8. Invoke a minimal smoke request and inspect the run.
9. Call `audit_skill` with `all_pages=true`; confirm the import, exposure, use,
   and runtime evidence all correlate to the expected version and digest.
10. Record the exact skill evidence in
    `.agentworks/BUILD_REPORT.template.json` and submit the report when allowed.

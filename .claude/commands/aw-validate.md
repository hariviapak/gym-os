---
description: Validate an AgentWorks Agent Spec against the deployed cluster
---

Validate the Agent Spec in `$ARGUMENTS` (default
`.agentworks/examples/hello-agent.yaml`)
against the deployed AgentWorks cluster before creating anything.

Steps:
1. Call the `agentworks` MCP tool `cluster_context` and confirm the referenced
   `model_ref`, MCP server slugs, and `workspace_id` exist in the catalog.
2. Call `validate_agent` with the spec contents.
3. If validation fails, explain each failure and propose a concrete fix
   (missing model ref, missing MCP access, unknown node id, no terminal path,
   missing capability policy, or insufficient permission). Do not create the
   agent until validation passes.

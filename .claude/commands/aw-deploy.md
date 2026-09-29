---
description: Deploy a validated AgentWorks agent and run a smoke invocation
---

Deploy the agent named in `$ARGUMENTS` and run a smoke test on the deployed
AgentWorks cluster.

Steps:
1. Confirm the agent validates (`validate_agent`) and that the `deploy`
   affordance is `allowed` in `cluster_context`.
2. Call `deploy_agent` with the agent slug and a target `environment` from the
   catalog.
3. Call `invoke_agent` on the new deployment with a minimal smoke input and
   capture the run id.
4. Call `inspect_run` on that run id and report status, output, and any
   trace/debug references.
5. Summarize: agent + deployment ids, run id, smoke result, and remaining risk.
   Do not attempt to bypass any `denied` affordance.

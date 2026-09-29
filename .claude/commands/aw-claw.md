---
description: Stand up a governed Claw (sandboxed code-execution) agent end to end
---

Create, govern, deploy, and smoke-test a Claw agent (`$ARGUMENTS` = the agent's
task/goal) on the deployed AgentWorks cluster. Claw agents run real code in an
OpenShell-managed sandbox, so governance is mandatory.

Steps (stop and report if any precondition fails — do not try to work around a
denial):

1. Call `cluster_context`. Confirm the `capability_policies` and `deploy`
   affordances are `allowed` and the sandbox runtime is ready. If they are
   `denied`/`not_configured`, report that the cluster isn't set up to run Claw
   agents for this token and stop — enabling the sandbox runtime is an operator
   task, not a builder one.
2. Pick a PROVIDER-PREFIXED model from `list_models` (e.g. `openai/gpt-4o-mini`).
   A bare slug will fail with "unsupported inference provider".
3. Author/adapt `.agentworks/examples/capability-policy.json` — keep `models.allow`,
   `domains.allow`, `filesystem`, and `applications.allow` as narrow as the task
   needs (fail-closed). Use `simulate_policy` to dry-run a representative
   decision before relying on it. Create the policy and capture its id.
4. Author the agent from `.agentworks/examples/claw-coder.yaml`: set `model_ref`,
   `capability_policy_id` (from step 3), `memory_config`, and `claw_spec`.
   Run `validate_agent`, then `create_agent`.
5. `deploy_agent` with a **shell** surface binding; `invoke_agent` with
   `interaction_surface.kind = "shell"` and `input.prompt = <task>`; capture the
   run id.
6. `inspect_run` → report status, output, and trace refs. Fill in
   `.agentworks/BUILD_REPORT.template.json`, including the capability policy id and the
   exact model + domains the agent was allowed.

---
trigger: glob
globs: ".github/**/*,apigee/scripts/**/*,**/*.sh"
description: "Git conventions, CI/CD pipeline standards, and validation workflows for Apigee and Python assets."
---

# Git & CI/CD Workflow Standards

## 1. Directory Structure Rules
- Apigee proxies must always be kept under `apigee/proxies/<proxy-name>/apiproxy/`.
- Shared flows must be placed under `apigee/sharedflows/<flow-name>/sharedflowbundle/`.
- Python agent code resides under `agents/app/`.

## 2. Automated Quality Gates
Before packaging or deploying:
1. **Proxy Bundle Linting**: Validate XML well-formedness and policy references using `python apigee/scripts/validate_bundle.py <proxy-name>`.
2. **Python Linting & Tests**: Ensure all ADK endpoints pass unit tests (`pytest agents/tests`).
3. **Frontend Type Checking**: Ensure TypeScript compiles cleanly (`cd ui && npm run build`).

## 3. Deployment Flow
- Development/Feature testing -> Automated bundle package -> Apigee X Test/Eval environment -> Integration validation -> Production rollout.

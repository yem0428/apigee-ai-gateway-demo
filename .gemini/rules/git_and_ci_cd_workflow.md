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

## 3. Branching & Isolation Strategy
- **Dedicated Branches**: Always branch off `main` for changes (`git checkout -b <branch-name>`). Never commit or push unverified changes directly to `main`.
- **Live Demo Protection**: `prod` (both Apigee `prod` environment and live Cloud Run UI) is actively used for customer demos and must remain unbroken.

## 4. Staged Deployment Flow
1. **Develop on Branch**: Implement feature or fix on a feature branch.
2. **Local Validation**: Run linting, unit tests, and bundle validation (`npm run test:unit`, `validate_bundle.py`).
3. **Deploy to Dev (`dev`)**: Package and deploy proxy changes to Apigee `dev` environment first (`bash apigee/scripts/deploy_proxy.sh --env dev`).
4. **Dev UI Review**: Spin up or verify the dev UI targeting `dev` (`TEST_ENV=dev`) to review behavior end-to-end.
5. **PR & Approval**: Submit PR for review before merging to `main` and deploying to `prod`.


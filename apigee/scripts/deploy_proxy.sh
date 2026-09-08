#!/usr/bin/env bash
# Script to deploy Apigee proxy bundle to Apigee X using gcloud / apigeecli
set -e

# Default variables
ORG=""
ENV=""
PROXY_NAME=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --org) ORG="$2"; shift ;;
        --env) ENV="$2"; shift ;;
        --proxy) PROXY_NAME="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$ORG" ] || [ -z "$ENV" ] || [ -z "$PROXY_NAME" ]; then
    echo "Usage: $0 --org <APIGEE_ORG> --env <APIGEE_ENV> --proxy <PROXY_NAME>"
    exit 1
fi

echo "=== Packaging Proxy: $PROXY_NAME ==="
bash apigee/scripts/package_bundle.sh "$PROXY_NAME"

BUNDLE_ZIP="apigee/dist/${PROXY_NAME}.zip"

echo "=== Deploying $PROXY_NAME to Org: $ORG, Env: $ENV ==="
TOKEN=$(gcloud auth print-access-token)

# 1. Import proxy revision
echo "Importing proxy revision..."
IMPORT_RES=$(curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/apis?name=${PROXY_NAME}&action=import" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"${BUNDLE_ZIP}")

REVISION=$(echo "$IMPORT_RES" | grep -o '"revision": "[0-9]*"' | head -1 | cut -d'"' -f4)

if [ -z "$REVISION" ]; then
  echo "Import failed or returned unexpected response:"
  echo "$IMPORT_RES"
  exit 1
fi

echo "Imported Revision: $REVISION"

# 2. Deploy revision to environment
echo "Deploying Revision $REVISION to environment $ENV..."
DEPLOY_RES=$(curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/environments/${ENV}/apis/${PROXY_NAME}/revisions/${REVISION}/deployments?override=true" \
  -H "Authorization: Bearer ${TOKEN}")

echo "$DEPLOY_RES"
echo "=== Deployment Completed ==="

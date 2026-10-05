#!/usr/bin/env bash
# Script to package Apigee proxy bundles into deployable ZIP archives
set -e

PROXY_NAME="$1"
MODE="$2"

if [ -z "$PROXY_NAME" ]; then
  echo "Usage: $0 <proxy_name> [--template|--bundle]"
  echo "Available proxies / templates:"
  [ -d "apigee/proxies" ] && ls -1 apigee/proxies/
  [ -d "apigee/templates" ] && ls -1 apigee/templates/
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DIST_DIR="${ROOT_DIR}/apigee/dist"
PROXY_DIR="${ROOT_DIR}/apigee/proxies/${PROXY_NAME}"
TEMPLATE_DIR="${ROOT_DIR}/apigee/templates/${PROXY_NAME}"
if [ ! -f "${TEMPLATE_DIR}/apiproxy.yaml" ] && [ -f "${ROOT_DIR}/apigee/templates/ai-gateway/apiproxy.yaml" ] && [[ "${PROXY_NAME}" == ai-gateway* ]]; then
  TEMPLATE_DIR="${ROOT_DIR}/apigee/templates/ai-gateway"
fi

mkdir -p "$DIST_DIR"
BUNDLE_ZIP="${DIST_DIR}/${PROXY_NAME}.zip"

# Remove existing bundle
rm -f "$BUNDLE_ZIP"

if [ "$MODE" == "--template" ] && [ -f "${TEMPLATE_DIR}/apiproxy.yaml" ]; then
  echo "Rendering declarative proxy template for ${PROXY_NAME} using apigee-go-gen..."
  apigee-go-gen render apiproxy \
    --template "${TEMPLATE_DIR}/apiproxy.yaml" \
    --values "${TEMPLATE_DIR}/values.yaml" \
    --output "$BUNDLE_ZIP"
  echo "Successfully rendered and packaged: ${BUNDLE_ZIP}"
elif [ -d "${PROXY_DIR}/apiproxy" ]; then
  echo "Packaging proxy bundle ${PROXY_NAME} from ${PROXY_DIR} into ${BUNDLE_ZIP}..."
  (cd "$PROXY_DIR" && zip -r "$BUNDLE_ZIP" apiproxy -x "*.DS_Store*")
  echo "Successfully packaged: ${BUNDLE_ZIP}"
elif [ -f "${TEMPLATE_DIR}/apiproxy.yaml" ]; then
  echo "Rendering declarative proxy template for ${PROXY_NAME} using apigee-go-gen..."
  apigee-go-gen render apiproxy \
    --template "${TEMPLATE_DIR}/apiproxy.yaml" \
    --values "${TEMPLATE_DIR}/values.yaml" \
    --output "$BUNDLE_ZIP"
  echo "Successfully rendered and packaged: ${BUNDLE_ZIP}"
else
  echo "Error: Neither proxy directory ${PROXY_DIR}/apiproxy nor template ${TEMPLATE_DIR}/apiproxy.yaml found."
  exit 1
fi

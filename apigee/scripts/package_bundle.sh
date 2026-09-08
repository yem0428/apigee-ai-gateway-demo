#!/usr/bin/env bash
# Script to package Apigee proxy bundles into deployable ZIP archives
set -e

PROXY_NAME="$1"

if [ -z "$PROXY_NAME" ]; then
  echo "Usage: $0 <proxy_name>"
  echo "Available proxies:"
  ls -1 apigee/proxies/
  exit 1
fi

PROXY_DIR="apigee/proxies/${PROXY_NAME}"
DIST_DIR="apigee/dist"

if [ ! -d "$PROXY_DIR/apiproxy" ]; then
  echo "Error: Directory ${PROXY_DIR}/apiproxy not found."
  exit 1
fi

mkdir -p "$DIST_DIR"
BUNDLE_ZIP="${DIST_DIR}/${PROXY_NAME}.zip"

# Remove existing bundle
rm -f "$BUNDLE_ZIP"

echo "Packaging ${PROXY_NAME} into ${BUNDLE_ZIP}..."
(cd "$PROXY_DIR" && zip -r "../../${BUNDLE_ZIP}" apiproxy -x "*.DS_Store*")

echo "Successfully packaged: ${BUNDLE_ZIP}"

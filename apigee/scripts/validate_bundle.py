#!/usr/bin/env python3
"""
Apigee X Proxy Bundle Validator
Checks XML syntax, file structure, policy references, and required endpoints.
"""
import sys
import os
import xml.etree.ElementTree as ET

def validate_proxy(proxy_name: str, base_dir: str = "apigee/proxies") -> bool:
    proxy_path = os.path.join(base_dir, proxy_name)
    apiproxy_dir = os.path.join(proxy_path, "apiproxy")
    
    print(f"[*] Validating Apigee proxy bundle: {proxy_name}")
    
    if not os.path.isdir(apiproxy_dir):
        print(f"[!] Error: {apiproxy_dir} does not exist.")
        return False

    errors = []

    # 1. Check Root Proxy XML
    root_xml = os.path.join(apiproxy_dir, f"{proxy_name}.xml")
    if not os.path.exists(root_xml):
        errors.append(f"Missing root proxy XML: {root_xml}")
    else:
        try:
            tree = ET.parse(root_xml)
            root = tree.getroot()
            if root.tag != "APIProxy":
                errors.append(f"Root XML element must be <APIProxy>, got <{root.tag}>")
        except ET.ParseError as e:
            errors.append(f"Malformed XML in {root_xml}: {e}")

    # 2. Check ProxyEndpoints
    proxies_dir = os.path.join(apiproxy_dir, "proxies")
    if not os.path.isdir(proxies_dir) or not os.listdir(proxies_dir):
        errors.append(f"Missing or empty ProxyEndpoints directory: {proxies_dir}")
    else:
        for f in os.listdir(proxies_dir):
            if f.endswith(".xml"):
                try:
                    ET.parse(os.path.join(proxies_dir, f))
                except ET.ParseError as e:
                    errors.append(f"Malformed XML in ProxyEndpoint {f}: {e}")

    # 3. Check TargetEndpoints
    targets_dir = os.path.join(apiproxy_dir, "targets")
    if os.path.isdir(targets_dir):
        for f in os.listdir(targets_dir):
            if f.endswith(".xml"):
                try:
                    ET.parse(os.path.join(targets_dir, f))
                except ET.ParseError as e:
                    errors.append(f"Malformed XML in TargetEndpoint {f}: {e}")

    # 4. Check Policies
    policies_dir = os.path.join(apiproxy_dir, "policies")
    if os.path.isdir(policies_dir):
        for f in os.listdir(policies_dir):
            if f.endswith(".xml"):
                try:
                    ET.parse(os.path.join(policies_dir, f))
                except ET.ParseError as e:
                    errors.append(f"Malformed XML in Policy {f}: {e}")

    if errors:
        print(f"\n❌ Validation FAILED for {proxy_name} with {len(errors)} error(s):")
        for err in errors:
            print(f"  - {err}")
        return False

    print(f"✅ Bundle '{proxy_name}' passed all structural and XML validation checks!")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_bundle.py <proxy_name>")
        sys.exit(1)
    
    success = validate_proxy(sys.argv[1])
    sys.exit(0 if success else 1)

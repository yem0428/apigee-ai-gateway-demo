# MCP (Model Context Protocol) to REST Bridging Guide

## 1. Concept
The Model Context Protocol (MCP) provides a standard JSON-RPC schema for exposing tools, resources, and prompts. Apigee Tools Gateway acts as an enterprise bridge between agent MCP tool calls and underlying legacy/modern REST microservices.

## 2. Protocol Mapping
1. **Agent MCP Tool Call**:
   ```json
   {
     "jsonrpc": "2.0",
     "method": "tools/call",
     "params": {
       "name": "lookup_customer_profile",
       "arguments": {"customer_id": "CUST-1001"}
     }
   }
   ```
2. **Apigee Inbound Flow**:
   - Extract tool name and arguments.
   - Authorize caller key / token.
   - Enforce tool rate limits.
3. **Apigee Outbound Request**:
   - Dispatches REST HTTP request to backend internal API:
     `GET /api/v1/customers/CUST-1001`
4. **Apigee Response Transformation**:
   - Formats REST output back into MCP tool result structure:
     ```json
     {
       "content": [
         {"type": "text", "text": "{\"status\": \"success\", \"name\": \"Alice Johnson\"}"}
       ]
     }
     ```

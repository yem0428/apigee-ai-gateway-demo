# AI Gateway Model Routing & Failover Playbook

## 1. Dynamic Routing Header Pattern
Clients pass a routing hint header:
`x-target-model: gemini-1.5-flash` or `x-target-model: gemini-1.5-pro`

Apigee assigns the upstream URL dynamically in `AM-SetVertexTarget`:
```xml
<AssignVariable>
    <Name>targetModel</Name>
    <Ref>request.header.x-target-model</Ref>
    <Value>gemini-1.5-flash</Value>
</AssignVariable>
<AssignVariable>
    <Name>target.url</Name>
    <Template>https://us-central1-aiplatform.googleapis.com/v1/projects/{gcpProject}/locations/us-central1/publishers/google/models/{targetModel}:generateContent</Template>
</AssignVariable>
```

## 2. Automatic Failover Pattern
Using Apigee `RouteRule` with target fallback:
```xml
<RouteRule name="PrimaryModelRoute">
    <Condition>(request.header.x-target-model = "gemini-1.5-pro")</Condition>
    <TargetEndpoint>vertex-pro-target</TargetEndpoint>
</RouteRule>
<RouteRule name="FallbackModelRoute">
    <TargetEndpoint>vertex-flash-target</TargetEndpoint>
</RouteRule>
```

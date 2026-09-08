# Apigee Policy Reference Guide

## 1. VerifyAPIKey (`VAK-`)
```xml
<VerifyAPIKey async="false" continueOnError="false" enabled="true" name="VAK-VerifyApiKey">
    <DisplayName>VAK-VerifyApiKey</DisplayName>
    <APIKey ref="request.header.x-apikey"/>
</VerifyAPIKey>
```

## 2. SpikeArrest (`SA-`)
```xml
<SpikeArrest async="false" continueOnError="false" enabled="true" name="SA-SpikeArrest">
    <DisplayName>SA-SpikeArrest</DisplayName>
    <Rate>100ps</Rate>
    <UseEffectiveParamValues>true</UseEffectiveParamValues>
</SpikeArrest>
```

## 3. Quota with Dynamic Token Weighting (`Q-`)
```xml
<Quota async="false" continueOnError="false" enabled="true" name="Q-TokenQuota" type="calendar">
    <DisplayName>Q-TokenQuota</DisplayName>
    <Identifier ref="verifyapikey.VAK-VerifyApiKey.client_id"/>
    <Allow count="1000000"/>
    <Interval>1</Interval>
    <TimeUnit>month</TimeUnit>
    <Distributed>true</Distributed>
    <Synchronous>true</Synchronous>
    <Weight ref="totalTokens"/>
</Quota>
```

## 4. ExtractVariables (`EV-`)
```xml
<ExtractVariables async="false" continueOnError="true" enabled="true" name="EV-ExtractTokenUsage">
    <Source>response</Source>
    <JSONPayload>
        <Variable name="totalTokens">
            <JSONPath>$.usageMetadata.totalTokenCount</JSONPath>
        </Variable>
    </JSONPayload>
</ExtractVariables>
```

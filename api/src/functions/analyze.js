const { app } = require('@azure/functions');
const { getContainer } = require('../cosmosClient');

const META_PROMPTS = {
  flow: `You are a Salesforce Flow expert. Analyze the given Flow XML and produce a comprehensive structured report using Markdown:
# Flow Analysis Report
## 1. Overview (name, label, type, API version, status, purpose)
## 2. Flow Metadata (processType, startElement, runInMode)
## 3. Element Inventory (counts by type)
## 4. Flow Logic Walkthrough (step-by-step narrative)
## 5. Decision Logic & Branching (each decision node)
## 6. Data Operations (SOQL queries, DML operations)
## 7. Variables & Resources (all variables, formulas, constants)
## 8. Error Handling (fault connectors, missing fault paths)
## 9. Performance Considerations (SOQL in loops, bulk safety)
## 10. Best Practice Violations (specific element names)
## 11. Security Review (FLS, sharing mode, data exposure)
## 12. Recommendations (HIGH/MEDIUM/LOW priority)
## 13. Summary Score (1-10 with justification)`,

  apex: `You are a Salesforce Apex expert. Analyze the given Apex code and produce a comprehensive report using Markdown:
# Apex Class Analysis Report
## 1. Overview (class name, type, sharing model, purpose)
## 2. Class Structure (methods, inner classes, interfaces)
## 3. SOQL & DML Operations (all queries with fields/objects/filters)
## 4. Bulkification Analysis (SOQL/DML in loops, collection usage)
## 5. Governor Limits Risk (CPU time, heap, queries, DML rows)
## 6. Exception Handling (try/catch blocks, missing error handling)
## 7. Security Review (CRUD/FLS checks, sharing, injection risks)
## 8. Async Patterns (@future, Batch, Queueable, Schedulable)
## 9. Test Coverage Estimate (testable methods, mock recommendations)
## 10. Best Practice Violations
## 11. Recommendations (HIGH/MEDIUM/LOW priority)
## 12. Quality Score (1-10 with justification)`,

  validation: `You are a Salesforce admin expert. Analyze the given Validation Rule and produce a report using Markdown:
# Validation Rule Analysis Report
## 1. Overview (rule name, object, active status)
## 2. Error Condition Formula (breakdown, logic explanation)
## 3. Error Message & Location
## 4. Field Dependencies
## 5. Logic Analysis (when rule fires)
## 6. Edge Cases & Gaps
## 7. Performance Impact
## 8. User Experience Review
## 9. Recommendations
## 10. Quality Score (1-10)`,

  permission: `You are a Salesforce security expert. Analyze the given Permission Set and produce a report using Markdown:
# Permission Set Analysis Report
## 1. Overview (name, label, license)
## 2. Object Permissions
## 3. Field Permissions
## 4. Apex Class Access
## 5. Visualforce Page Access
## 6. System Permissions
## 7. Security Risk Assessment
## 8. Least Privilege Analysis
## 9. Recommendations (HIGH/MEDIUM/LOW priority)
## 10. Security Score (1-10)`,

  object: `You are a Salesforce data architect. Analyze the given Custom Object XML and produce a report using Markdown:
# Custom Object Analysis Report
## 1. Overview (object name, label, sharing model)
## 2. Fields Inventory
## 3. Relationships
## 4. Validation Rules
## 5. Record Types
## 6. Sharing & Security Model
## 7. Data Architecture Review
## 8. Index & Performance
## 9. Recommendations (HIGH/MEDIUM/LOW priority)
## 10. Architecture Score (1-10)`,

  workflow: `You are a Salesforce automation expert. Analyze the given Workflow Rule and produce a report using Markdown:
# Workflow Rule Analysis Report
## 1. Overview (rule name, object, trigger type)
## 2. Trigger Criteria
## 3. Immediate Actions
## 4. Time-Dependent Actions
## 5. Field Updates Analysis
## 6. Email Alerts Review
## 7. Outbound Messages
## 8. Migration to Flow Recommendation
## 9. Best Practice Violations
## 10. Recommendations (HIGH/MEDIUM/LOW priority)
## 11. Quality Score (1-10)`
};

app.http('analyze', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'analyze',
  handler: async (request, context) => {

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const body = await request.json();
      const { content, metaType = 'flow', fileName = 'unknown', sessionId } = body;

      if (!content) {
        return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'content is required' }) };
      }

      const systemPrompt = META_PROMPTS[metaType] || META_PROMPTS.flow;

      // Call Azure OpenAI
      const aoaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const aoaiKey = process.env.AZURE_OPENAI_KEY;
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'Suriya';
      const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

      const aoaiResponse = await fetch(
        `${aoaiEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': aoaiKey },
          body: JSON.stringify({
            max_tokens: 4000,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Analyze this Salesforce ${metaType} file named "${fileName}":\n\n${content}` }
            ]
          })
        }
      );

      const aoaiData = await aoaiResponse.json();
      const analysisText = aoaiData.choices?.[0]?.message?.content || aoaiData.error?.message || 'No result';

      // Save to Cosmos DB
      const analysisRecord = {
        id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        metaType,
        fileName,
        sessionId: sessionId || 'anonymous',
        fileContent: content.slice(0, 50000), // store up to 50KB of source
        analysisResult: analysisText,
        createdAt: new Date().toISOString(),
        model: deployment,
        tokens: aoaiData.usage?.total_tokens || 0
      };

      const container = await getContainer('analyses');
      await container.items.create(analysisRecord);

      context.log(`Analysis saved: ${analysisRecord.id} | type: ${metaType} | file: ${fileName}`);

      return {
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          analysisId: analysisRecord.id,
          result: analysisText,
          tokens: analysisRecord.tokens,
          savedAt: analysisRecord.createdAt
        })
      };

    } catch (err) {
      context.log.error('Analyze error:', err);
      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message })
      };
    }
  }
});

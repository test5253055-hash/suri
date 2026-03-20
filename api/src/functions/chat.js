const { app } = require('@azure/functions');
const { getContainer } = require('../cosmosClient');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

app.http('chat', {
  methods: ['POST', 'GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: async (request, context) => {

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    // GET - retrieve chat history for a session
    if (request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');
        const analysisId = url.searchParams.get('analysisId');

        if (!sessionId) {
          return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'sessionId required' }) };
        }

        const container = await getContainer('chats');
        const { resources } = await container.items.query({
          query: 'SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c.createdAt ASC',
          parameters: [{ name: '@sessionId', value: sessionId }]
        }).fetchAll();

        return {
          status: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, messages: resources })
        };
      } catch (err) {
        return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
      }
    }

    // POST - send a chat message and get AI response
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const { question, sessionId, analysisId, chatHistory = [], analysisContext = '' } = body;

        if (!question || !sessionId) {
          return { status: 400, headers: corsHeaders, body: JSON.stringify({ error: 'question and sessionId required' }) };
        }

        const systemPrompt = `You are a Salesforce expert. You have analyzed a Salesforce metadata file and provided a report. 
Answer follow-up questions about it specifically. Reference element names, line details, and values from the analysis when relevant.
${analysisContext ? `\n\nAnalysis context:\n${analysisContext.slice(0, 3000)}` : ''}`;

        // Build messages array
        const messages = [
          { role: 'system', content: systemPrompt },
          ...chatHistory.slice(-10), // last 10 messages for context
          { role: 'user', content: question }
        ];

        // Call Azure OpenAI
        const aoaiResponse = await fetch(
          `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': process.env.AZURE_OPENAI_KEY },
            body: JSON.stringify({ max_tokens: 2000, messages })
          }
        );

        const aoaiData = await aoaiResponse.json();
        const answer = aoaiData.choices?.[0]?.message?.content || 'No answer returned';

        // Save both question and answer to Cosmos DB
        const container = await getContainer('chats');
        const timestamp = new Date().toISOString();

        await container.items.create({
          id: `chat-q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sessionId,
          analysisId: analysisId || null,
          role: 'user',
          content: question,
          createdAt: timestamp
        });

        await container.items.create({
          id: `chat-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sessionId,
          analysisId: analysisId || null,
          role: 'assistant',
          content: answer,
          createdAt: new Date().toISOString()
        });

        return {
          status: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, answer, tokens: aoaiData.usage?.total_tokens || 0 })
        };

      } catch (err) {
        context.log.error('Chat error:', err);
        return { status: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
      }
    }
  }
});

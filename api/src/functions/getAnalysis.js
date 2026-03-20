const { app } = require('@azure/functions');
const { getContainer } = require('../cosmosClient');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

app.http('getAnalysis', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'analysis/{id}',
  handler: async (request, context) => {

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const id = request.params.id;
      const container = await getContainer('analyses');

      const { resources } = await container.items.query({
        query: 'SELECT * FROM c WHERE c.id = @id',
        parameters: [{ name: '@id', value: id }]
      }).fetchAll();

      if (resources.length === 0) {
        return { status: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Analysis not found' }) };
      }

      return {
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, analysis: resources[0] })
      };

    } catch (err) {
      context.log.error('GetAnalysis error:', err);
      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message })
      };
    }
  }
});

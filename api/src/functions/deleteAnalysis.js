const { app } = require('@azure/functions');
const { getContainer } = require('../cosmosClient');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

app.http('deleteAnalysis', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'analysis/{id}',
  handler: async (request, context) => {

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const id = request.params.id;
      const url = new URL(request.url);
      const metaType = url.searchParams.get('metaType') || 'flow';

      const container = await getContainer('analyses');
      await container.item(id, metaType).delete();

      return {
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, deleted: id })
      };

    } catch (err) {
      context.log.error('Delete error:', err);
      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message })
      };
    }
  }
});

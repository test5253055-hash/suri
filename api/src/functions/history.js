const { app } = require('@azure/functions');
const { getContainer } = require('../cosmosClient');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

app.http('history', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'history',
  handler: async (request, context) => {

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const url = new URL(request.url);
      const metaType = url.searchParams.get('metaType') || null;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const sessionId = url.searchParams.get('sessionId') || null;

      const container = await getContainer('analyses');

      let query = `SELECT c.id, c.metaType, c.fileName, c.sessionId, c.createdAt, c.tokens,
                   LEFT(c.analysisResult, 300) as preview
                   FROM c`;
      const params = [];

      const conditions = [];
      if (metaType) {
        conditions.push('c.metaType = @metaType');
        params.push({ name: '@metaType', value: metaType });
      }
      if (sessionId) {
        conditions.push('c.sessionId = @sessionId');
        params.push({ name: '@sessionId', value: sessionId });
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ` ORDER BY c.createdAt DESC OFFSET 0 LIMIT ${limit}`;

      const { resources } = await container.items.query({ query, parameters: params }).fetchAll();

      return {
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, count: resources.length, analyses: resources })
      };

    } catch (err) {
      context.log.error('History error:', err);
      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message })
      };
    }
  }
});

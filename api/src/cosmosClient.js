const { CosmosClient } = require('@azure/cosmos');

let client;
let database;

function getClient() {
  if (!client) {
    client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY
    });
  }
  return client;
}

async function getDatabase() {
  if (!database) {
    const { database: db } = await getClient()
      .databases.createIfNotExists({ id: process.env.COSMOS_DATABASE || 'SFAnalyzer' });
    database = db;
  }
  return database;
}

async function getContainer(containerId) {
  const db = await getDatabase();
  const { container } = await db.containers.createIfNotExists({
    id: containerId,
    partitionKey: {
      paths: [containerId === 'chats' ? '/sessionId' : containerId === 'users' ? '/userId' : '/metaType']
    }
  });
  return container;
}

module.exports = { getContainer };

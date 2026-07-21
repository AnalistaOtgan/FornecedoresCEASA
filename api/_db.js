const { createClient } = require('@libsql/client');
const path = require('path');

function db() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Produção: usar Turso remoto
  if (url && authToken) {
    return createClient({ url, authToken });
  }

  // Desenvolvimento local: usar arquivo SQLite local
  const localPath = path.join(__dirname, '..', 'fornecedores.db');
  return createClient({ url: `file:${localPath}` });
}

module.exports = { db };

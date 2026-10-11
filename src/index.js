import { createClient } from '@libsql/client/web';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function getDb(env) {
  const rawUrl = env.TURSO_DATABASE_URL || '';
  const url = rawUrl.replace(/^["']|["']$/g, '');
  const rawToken = env.TURSO_AUTH_TOKEN || '';
  const authToken = rawToken.replace(/^["']|["']$/g, '');

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN são obrigatórios');
  }

  return createClient({ url, authToken });
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleProdutos(request, env, url) {
  let method = request.method;
  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    body = await parseBody(request);
  }

  if (method === 'POST') {
    const override = url.searchParams.get('_method') || body?._method;
    if (override && ['PUT', 'DELETE'].includes(override.toUpperCase())) {
      method = override.toUpperCase();
    }
  }

  try {
    const client = getDb(env);

    if (method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const rs = await client.execute({
          sql: 'SELECT id, codigo, nome FROM produtos WHERE id = ?',
          args: [id],
        });
        if (rs.rows.length === 0) {
          return json({ error: 'Produto não encontrado' }, 404);
        }
        return json(rs.rows[0]);
      } else {
        const rs = await client.execute('SELECT id, codigo, nome FROM produtos ORDER BY id');
        return json(rs.rows);
      }
    }

    if (method === 'POST') {
      const { codigo, nome } = body || {};
      if (!codigo || !nome) {
        return json({ error: 'Código e nome são obrigatórios' }, 400);
      }

      const rs = await client.execute({
        sql: 'INSERT INTO produtos (codigo, nome) VALUES (?, ?)',
        args: [codigo, nome],
      });

      const selectRs = await client.execute({
        sql: 'SELECT id, codigo, nome FROM produtos WHERE id = ?',
        args: [rs.lastInsertRowid],
      });
      return json(selectRs.rows[0], 201);
    }

    if (method === 'PUT') {
      const id = url.searchParams.get('id');
      const { codigo, nome } = body || {};
      if (!id || id <= 0) return json({ error: 'ID inválido' }, 400);

      await client.execute({
        sql: 'UPDATE produtos SET codigo = ?, nome = ? WHERE id = ?',
        args: [codigo, nome, id],
      });

      const selectRs = await client.execute({
        sql: 'SELECT id, codigo, nome FROM produtos WHERE id = ?',
        args: [id],
      });
      return json(selectRs.rows[0]);
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id || id <= 0) return json({ error: 'ID inválido' }, 400);

      await client.execute({ sql: 'DELETE FROM fornecedor_produto WHERE produto_id = ?', args: [id] });
      await client.execute({ sql: 'DELETE FROM produtos WHERE id = ?', args: [id] });

      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);
  } catch (error) {
    console.error('Erro na API Produtos:', error);
    return json({ error: 'Erro interno no servidor', details: error.message }, 500);
  }
}

async function handleFornecedores(request, env, url) {
  let method = request.method;
  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    body = await parseBody(request);
  }

  if (method === 'POST') {
    const override = url.searchParams.get('_method') || body?._method;
    if (override && ['PUT', 'DELETE'].includes(override.toUpperCase())) {
      method = override.toUpperCase();
    }
  }

  try {
    const client = getDb(env);

    if (method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const rs = await client.execute({
          sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
          args: [id],
        });
        if (rs.rows.length === 0) {
          return json({ error: 'Fornecedor não encontrado' }, 404);
        }

        const fornecedor = rs.rows[0];
        const jRs = await client.execute({
          sql: `SELECT p.id, p.codigo, p.nome 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?`,
          args: [id],
        });

        fornecedor.produtos = jRs.rows.map((p) => p.nome).join(', ');
        fornecedor.produtoIds = jRs.rows.map((p) => Number(p.id));

        return json(fornecedor);
      } else {
        const rs = await client.execute(`
          SELECT f.id, f.codigo, f.nome, f.apelido, COALESCE(f.status, 'Ativo') AS status, p.id AS p_id, p.codigo AS p_codigo, p.nome AS p_nome
          FROM fornecedores f
          LEFT JOIN fornecedor_produto fp ON fp.fornecedor_id = f.id
          LEFT JOIN produtos p ON p.id = fp.produto_id
          ORDER BY f.id, p.id
        `);

        const map = new Map();
        for (const row of rs.rows) {
          if (!map.has(row.id)) {
            map.set(row.id, {
              id: row.id,
              codigo: row.codigo,
              nome: row.nome,
              apelido: row.apelido,
              status: row.status || 'Ativo',
              produtoList: [],
              produtoIdList: [],
            });
          }
          if (row.p_id) {
            map.get(row.id).produtoList.push(row.p_nome);
            map.get(row.id).produtoIdList.push(Number(row.p_id));
          }
        }

        const fornecedores = Array.from(map.values()).map((f) => ({
          id: f.id,
          codigo: f.codigo,
          nome: f.nome,
          apelido: f.apelido,
          status: f.status || 'Ativo',
          produtos: f.produtoList.join(', '),
          produtoIds: f.produtoIdList,
        }));

        return json(fornecedores);
      }
    }

    if (method === 'POST') {
      const { codigo, nome, apelido, status, produtoIds } = body || {};
      if (!codigo || !nome) {
        return json({ error: 'Código e nome são obrigatórios' }, 400);
      }

      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

      const stmts = [
        {
          sql: 'INSERT INTO fornecedores (codigo, nome, apelido, status) VALUES (?, ?, ?, ?)',
          args: [codigo, nome, apelido || '', fornecedorStatus],
        },
      ];

      const results = await client.batch(stmts, 'write');
      const fornecedorId = results[0].lastInsertRowid;

      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      if (ids.length > 0) {
        const insertRelStmts = ids.map((pid) => ({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id) VALUES (?, ?)',
          args: [fornecedorId, Number(pid)],
        }));
        await client.batch(insertRelStmts, 'write');
      }

      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
        args: [fornecedorId],
      });
      const f = fRs.rows[0];

      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?`,
        args: [fornecedorId],
      });
      f.produtos = pRs.rows.map((p) => p.nome).join(', ');
      f.produtoIds = pRs.rows.map((p) => Number(p.id));

      return json(f, 201);
    }

    if (method === 'PUT') {
      const id = url.searchParams.get('id');
      const { codigo, nome, apelido, status, produtoIds } = body || {};
      if (!id || id <= 0) return json({ error: 'ID inválido' }, 400);

      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

      const stmts = [
        {
          sql: 'UPDATE fornecedores SET codigo = ?, nome = ?, apelido = ?, status = ? WHERE id = ?',
          args: [codigo, nome, apelido || '', fornecedorStatus, id],
        },
        {
          sql: 'DELETE FROM fornecedor_produto WHERE fornecedor_id = ?',
          args: [id],
        },
      ];

      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      ids.forEach((pid) => {
        stmts.push({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id) VALUES (?, ?)',
          args: [id, Number(pid)],
        });
      });

      await client.batch(stmts, 'write');

      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
        args: [id],
      });
      const f = fRs.rows[0];

      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?`,
        args: [id],
      });
      f.produtos = pRs.rows.map((p) => p.nome).join(', ');
      f.produtoIds = pRs.rows.map((p) => Number(p.id));

      return json(f);
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id || id <= 0) return json({ error: 'ID inválido' }, 400);

      const stmts = [
        { sql: 'DELETE FROM fornecedor_produto WHERE fornecedor_id = ?', args: [id] },
        { sql: 'DELETE FROM fornecedores WHERE id = ?', args: [id] },
      ];

      await client.batch(stmts, 'write');
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);
  } catch (error) {
    console.error('Erro na API Fornecedores:', error);
    return json({ error: 'Erro interno no servidor', details: error.message }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/api/produtos') {
      return handleProdutos(request, env, url);
    }

    if (url.pathname === '/api/fornecedores') {
      return handleFornecedores(request, env, url);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};

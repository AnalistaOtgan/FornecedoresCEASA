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

function formatFornecedor(f, pRows) {
  const activeProds = (pRows || []).filter((p) => (p.status || 'Ativo') !== 'Inativo');
  return {
    id: f.id,
    codigo: f.codigo,
    nome: f.nome,
    apelido: f.apelido,
    status: f.status || 'Ativo',
    tipo: f.tipo || 'Comum',
    produtos: activeProds.map((p) => p.nome).join(', '),
    produtoIds: activeProds.map((p) => Number(p.id)),
    produtosDetalhes: (pRows || []).map((p) => ({
      id: Number(p.id),
      codigo: p.codigo,
      nome: p.nome,
      status: p.status || 'Ativo',
    })),
  };
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
    if (typeof request.text === 'function') {
      const text = await request.text();
      return text && text.trim() ? JSON.parse(text) : {};
    }
    if (typeof request.json === 'function') {
      return await request.json();
    }
    return {};
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
          sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status, COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
          args: [id],
        });
        if (rs.rows.length === 0) {
          return json({ error: 'Fornecedor não encontrado' }, 404);
        }

        const fornecedor = rs.rows[0];
        const jRs = await client.execute({
          sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?
                ORDER BY p.nome`,
          args: [id],
        });

        return json(formatFornecedor(fornecedor, jRs.rows));
      } else {
        const rs = await client.execute("SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status, COALESCE(tipo, 'Comum') AS tipo FROM fornecedores ORDER BY id");
        const fornecedores = rs.rows;

        const rels = await client.execute(`
          SELECT fp.fornecedor_id, p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status
          FROM fornecedor_produto fp
          JOIN produtos p ON p.id = fp.produto_id
          ORDER BY p.nome
        `);
        const mapByFornecedor = new Map();
        for (const rel of rels.rows) {
          if (!mapByFornecedor.has(rel.fornecedor_id)) {
            mapByFornecedor.set(rel.fornecedor_id, []);
          }
          mapByFornecedor.get(rel.fornecedor_id).push(rel);
        }

        const formatted = fornecedores.map((f) => {
          const prods = mapByFornecedor.get(f.id) || [];
          return formatFornecedor(f, prods);
        });

        return json(formatted);
      }
    }

    if (method === 'POST') {
      const { codigo, nome, apelido, status, tipo, produtoIds, produtosStatus } = body || {};
      if (!codigo || !nome) {
        return json({ error: 'Código e nome são obrigatórios' }, 400);
      }

      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';
      const fornecedorTipo = tipo === 'NF' ? 'NF' : 'Comum';

      const stmts = [
        {
          sql: 'INSERT INTO fornecedores (codigo, nome, apelido, status, tipo) VALUES (?, ?, ?, ?, ?)',
          args: [codigo, nome, apelido || '', fornecedorStatus, fornecedorTipo],
        },
      ];

      const results = await client.batch(stmts, 'write');
      const fornecedorId = results[0].lastInsertRowid;

      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      const prodStatusMap = produtosStatus || {};
      if (ids.length > 0) {
        const insertRelStmts = ids.map((pid) => ({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id, status) VALUES (?, ?, ?)',
          args: [fornecedorId, Number(pid), prodStatusMap[pid] === 'Inativo' ? 'Inativo' : 'Ativo'],
        }));
        await client.batch(insertRelStmts, 'write');
      }

      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status, COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
        args: [fornecedorId],
      });

      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?
              ORDER BY p.nome`,
        args: [fornecedorId],
      });

      return json(formatFornecedor(fRs.rows[0], pRs.rows), 201);
    }

    if (method === 'PUT') {
      const id = url.searchParams.get('id');
      if (!id || id <= 0) return json({ error: 'ID inválido' }, 400);

      const toggleProdutoId = url.searchParams.get('toggleProdutoId') || body?.toggleProdutoId;
      const novoStatusParam = url.searchParams.get('novoStatus') || body?.novoStatus;

      // Atalho para alternar status de produto específico para este fornecedor
      if (toggleProdutoId) {
        const pid = Number(toggleProdutoId);
        const cur = await client.execute({
          sql: "SELECT COALESCE(status, 'Ativo') AS status FROM fornecedor_produto WHERE fornecedor_id = ? AND produto_id = ?",
          args: [Number(id), pid],
        });
        const currentStatus = cur.rows[0]?.status || 'Ativo';
        const newStatus = novoStatusParam || (currentStatus === 'Inativo' ? 'Ativo' : 'Inativo');
        await client.execute({
          sql: 'UPDATE fornecedor_produto SET status = ? WHERE fornecedor_id = ? AND produto_id = ?',
          args: [newStatus, Number(id), pid],
        });

        const fRs = await client.execute({
          sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status, COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
          args: [Number(id)],
        });
        const pRs = await client.execute({
          sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?
                ORDER BY p.nome`,
          args: [Number(id)],
        });
        return json(formatFornecedor(fRs.rows[0], pRs.rows));
      }

      // Atalho para alternar tipo (NF / Comum) do fornecedor
      const toggleTipo = url.searchParams.get('toggleTipo') || body?.toggleTipo;
      if (toggleTipo) {
        const cur = await client.execute({
          sql: "SELECT COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
          args: [Number(id)],
        });
        const currentTipo = cur.rows[0]?.tipo || 'Comum';
        const newTipo = (url.searchParams.get('novoTipo') || body?.novoTipo) || (currentTipo === 'NF' ? 'Comum' : 'NF');
        await client.execute({
          sql: 'UPDATE fornecedores SET tipo = ? WHERE id = ?',
          args: [newTipo, Number(id)],
        });

        const fRs = await client.execute({
          sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status, COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
          args: [Number(id)],
        });
        const pRs = await client.execute({
          sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?
                ORDER BY p.nome`,
          args: [Number(id)],
        });
        return json(formatFornecedor(fRs.rows[0], pRs.rows));
      }

      const { codigo, nome, apelido, status, tipo, produtoIds, produtosStatus } = body || {};
      if (!codigo || !nome) {
        return json({ error: 'Código e nome são obrigatórios' }, 400);
      }
      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

      const curF = await client.execute({
        sql: "SELECT COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
        args: [Number(id)],
      });
      const existingTipo = curF.rows[0]?.tipo || 'Comum';
      const fornecedorTipo = (tipo === undefined) ? existingTipo : (tipo === 'NF' ? 'NF' : 'Comum');

      // Manter status anterior dos produtos caso produtosStatus não venha completo
      const existingRels = await client.execute({
        sql: "SELECT produto_id, COALESCE(status, 'Ativo') AS status FROM fornecedor_produto WHERE fornecedor_id = ?",
        args: [Number(id)],
      });
      const existingStatusMap = {};
      existingRels.rows.forEach((r) => { existingStatusMap[r.produto_id] = r.status; });

      const stmts = [
        {
          sql: 'UPDATE fornecedores SET codigo = ?, nome = ?, apelido = ?, status = ?, tipo = ? WHERE id = ?',
          args: [codigo, nome, apelido || '', fornecedorStatus, fornecedorTipo, Number(id)],
        },
        {
          sql: 'DELETE FROM fornecedor_produto WHERE fornecedor_id = ?',
          args: [Number(id)],
        },
      ];

      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      const prodStatusMap = produtosStatus || existingStatusMap;
      ids.forEach((pid) => {
        const itemStatus = prodStatusMap[pid] === 'Inativo' ? 'Inativo' : 'Ativo';
        stmts.push({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id, status) VALUES (?, ?, ?)',
          args: [id, Number(pid), itemStatus],
        });
      });

      await client.batch(stmts, 'write');

      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status, COALESCE(tipo, 'Comum') AS tipo FROM fornecedores WHERE id = ?",
        args: [id],
      });

      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?
              ORDER BY p.nome`,
        args: [id],
      });

      return json(formatFornecedor(fRs.rows[0], pRs.rows));
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

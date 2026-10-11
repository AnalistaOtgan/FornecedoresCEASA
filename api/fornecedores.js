const { db } = require('./_db.js');

function formatFornecedor(f, pRows) {
  const activeProds = (pRows || []).filter(p => (p.status || 'Ativo') !== 'Inativo');
  return {
    id: f.id,
    codigo: f.codigo,
    nome: f.nome,
    apelido: f.apelido,
    status: f.status || 'Ativo',
    produtos: activeProds.map(p => p.nome).join(', '),
    produtoIds: activeProds.map(p => Number(p.id)),
    produtosDetalhes: (pRows || []).map(p => ({
      id: Number(p.id),
      codigo: p.codigo,
      nome: p.nome,
      status: p.status || 'Ativo'
    }))
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = db();
  
  let method = req.method;
  if (method === 'POST') {
    const override = req.query._method || (req.body && req.body._method);
    if (override && ['PUT', 'DELETE'].includes(override.toUpperCase())) {
      method = override.toUpperCase();
    }
  }

  try {
    if (method === 'GET') {
      const id = req.query.id;
      if (id) {
        const rs = await client.execute({
          sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
          args: [id]
        });
        if (rs.rows.length === 0) {
          return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        const fornecedor = rs.rows[0];
        const jRs = await client.execute({
          sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?
                ORDER BY p.nome`,
          args: [id]
        });
        
        return res.status(200).json(formatFornecedor(fornecedor, jRs.rows));
      } else {
        const rs = await client.execute("SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores ORDER BY id");
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

        const formatted = fornecedores.map(f => {
          const prods = mapByFornecedor.get(f.id) || [];
          return formatFornecedor(f, prods);
        });
        
        return res.status(200).json(formatted);
      }
    }
    
    if (method === 'POST') {
      const { codigo, nome, apelido, status, produtoIds, produtosStatus } = req.body || {};
      if (!codigo || !nome) {
        return res.status(400).json({ error: 'Código e nome são obrigatórios' });
      }
      
      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

      const stmts = [];
      stmts.push({
        sql: 'INSERT INTO fornecedores (codigo, nome, apelido, status) VALUES (?, ?, ?, ?)',
        args: [codigo, nome, apelido || '', fornecedorStatus]
      });
      
      const results = await client.batch(stmts, 'write');
      const fornecedorId = results[0].lastInsertRowid;
      
      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      const prodStatusMap = produtosStatus || {};
      if (ids.length > 0) {
        const insertRelStmts = ids.map(pid => ({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id, status) VALUES (?, ?, ?)',
          args: [fornecedorId, Number(pid), prodStatusMap[pid] === 'Inativo' ? 'Inativo' : 'Ativo']
        }));
        await client.batch(insertRelStmts, 'write');
      }
      
      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
        args: [fornecedorId]
      });
      
      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?
              ORDER BY p.nome`,
        args: [fornecedorId]
      });
      
      return res.status(201).json(formatFornecedor(fRs.rows[0], pRs.rows));
    }
    
    if (method === 'PUT') {
      const id = req.query.id;
      if (!id || id <= 0) return res.status(400).json({ error: 'ID inválido' });

      const toggleProdutoId = req.query.toggleProdutoId || req.body?.toggleProdutoId;
      const novoStatusParam = req.query.novoStatus || req.body?.novoStatus;

      // Atalho para alternar status de produto específico para este fornecedor
      if (toggleProdutoId) {
        const pid = Number(toggleProdutoId);
        const cur = await client.execute({
          sql: "SELECT COALESCE(status, 'Ativo') AS status FROM fornecedor_produto WHERE fornecedor_id = ? AND produto_id = ?",
          args: [Number(id), pid]
        });
        const currentStatus = cur.rows[0]?.status || 'Ativo';
        const newStatus = novoStatusParam || (currentStatus === 'Inativo' ? 'Ativo' : 'Inativo');
        await client.execute({
          sql: 'UPDATE fornecedor_produto SET status = ? WHERE fornecedor_id = ? AND produto_id = ?',
          args: [newStatus, Number(id), pid]
        });
        
        const fRs = await client.execute({
          sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
          args: [Number(id)]
        });
        const pRs = await client.execute({
          sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?
                ORDER BY p.nome`,
          args: [Number(id)]
        });
        return res.status(200).json(formatFornecedor(fRs.rows[0], pRs.rows));
      }

      const { codigo, nome, apelido, status, produtoIds, produtosStatus } = req.body || {};
      if (!codigo || !nome) {
        return res.status(400).json({ error: 'Código e nome são obrigatórios' });
      }
      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

      // Manter status anterior dos produtos caso produtosStatus não venha completo
      const existingRels = await client.execute({
        sql: "SELECT produto_id, COALESCE(status, 'Ativo') AS status FROM fornecedor_produto WHERE fornecedor_id = ?",
        args: [id]
      });
      const existingStatusMap = {};
      existingRels.rows.forEach(r => { existingStatusMap[r.produto_id] = r.status; });

      const stmts = [];
      stmts.push({
        sql: 'UPDATE fornecedores SET codigo = ?, nome = ?, apelido = ?, status = ? WHERE id = ?',
        args: [codigo, nome, apelido || '', fornecedorStatus, id]
      });
      stmts.push({
        sql: 'DELETE FROM fornecedor_produto WHERE fornecedor_id = ?',
        args: [id]
      });
      
      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      const prodStatusMap = produtosStatus || existingStatusMap;
      ids.forEach(pid => {
        const itemStatus = prodStatusMap[pid] === 'Inativo' ? 'Inativo' : 'Ativo';
        stmts.push({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id, status) VALUES (?, ?, ?)',
          args: [id, Number(pid), itemStatus]
        });
      });
      
      await client.batch(stmts, 'write');
      
      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
        args: [id]
      });
      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome, COALESCE(fp.status, 'Ativo') AS status 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?
              ORDER BY p.nome`,
        args: [id]
      });
      
      return res.status(200).json(formatFornecedor(fRs.rows[0], pRs.rows));
    }
    
    if (method === 'DELETE') {
      const id = req.query.id;
      if (!id || id <= 0) return res.status(400).json({ error: 'ID inválido' });
      
      const stmts = [
        { sql: 'DELETE FROM fornecedor_produto WHERE fornecedor_id = ?', args: [id] },
        { sql: 'DELETE FROM fornecedores WHERE id = ?', args: [id] }
      ];
      
      await client.batch(stmts, 'write');
      return res.status(200).json({ ok: true });
    }
    
    return res.status(405).json({ error: 'Método não suportado' });
  } catch (error) {
    console.error('Erro na API Fornecedores:', error);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

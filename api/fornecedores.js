const { db } = require('./_db.js');

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
          sql: `SELECT p.id, p.codigo, p.nome 
                FROM fornecedor_produto fp 
                JOIN produtos p ON p.id = fp.produto_id 
                WHERE fp.fornecedor_id = ?`,
          args: [id]
        });
        
        fornecedor.produtos = jRs.rows.map(p => p.nome).join(', ');
        fornecedor.produtoIds = jRs.rows.map(p => Number(p.id));
        
        return res.status(200).json(fornecedor);
      } else {
        const rs = await client.execute("SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores ORDER BY id");
        const fornecedores = rs.rows;
        
        // Buscar produtos para cada fornecedor
        for (let i = 0; i < fornecedores.length; i++) {
          const f = fornecedores[i];
          const jRs = await client.execute({
            sql: `SELECT p.id, p.codigo, p.nome 
                  FROM fornecedor_produto fp 
                  JOIN produtos p ON p.id = fp.produto_id 
                  WHERE fp.fornecedor_id = ?`,
            args: [f.id]
          });
          f.produtos = jRs.rows.map(p => p.nome).join(', ');
          f.produtoIds = jRs.rows.map(p => Number(p.id));
        }
        
        return res.status(200).json(fornecedores);
      }
    }
    
    if (method === 'POST') {
      const { codigo, nome, apelido, status, produtoIds } = req.body || {};
      if (!codigo || !nome) {
        return res.status(400).json({ error: 'Código e nome são obrigatórios' });
      }
      
      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

      // Iniciar transação (batch no Turso)
      const stmts = [];
      stmts.push({
        sql: 'INSERT INTO fornecedores (codigo, nome, apelido, status) VALUES (?, ?, ?, ?)',
        args: [codigo, nome, apelido || '', fornecedorStatus]
      });
      
      const results = await client.batch(stmts, 'write');
      const fornecedorId = results[0].lastInsertRowid;
      
      const ids = Array.isArray(produtoIds) ? produtoIds : [];
      if (ids.length > 0) {
        const insertRelStmts = ids.map(pid => ({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id) VALUES (?, ?)',
          args: [fornecedorId, Number(pid)]
        }));
        await client.batch(insertRelStmts, 'write');
      }
      
      // Buscar o inserido
      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
        args: [fornecedorId]
      });
      const f = fRs.rows[0];
      
      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?`,
        args: [fornecedorId]
      });
      f.produtos = pRs.rows.map(p => p.nome).join(', ');
      f.produtoIds = pRs.rows.map(p => Number(p.id));
      
      return res.status(201).json(f);
    }
    
    if (method === 'PUT') {
      const id = req.query.id;
      const { codigo, nome, apelido, status, produtoIds } = req.body || {};
      if (!id || id <= 0) return res.status(400).json({ error: 'ID inválido' });
      
      const fornecedorStatus = status === 'Inativo' ? 'Inativo' : 'Ativo';

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
      ids.forEach(pid => {
        stmts.push({
          sql: 'INSERT INTO fornecedor_produto (fornecedor_id, produto_id) VALUES (?, ?)',
          args: [id, Number(pid)]
        });
      });
      
      await client.batch(stmts, 'write');
      
      // Buscar atualizado
      const fRs = await client.execute({
        sql: "SELECT id, codigo, nome, apelido, COALESCE(status, 'Ativo') AS status FROM fornecedores WHERE id = ?",
        args: [id]
      });
      const f = fRs.rows[0];
      
      const pRs = await client.execute({
        sql: `SELECT p.id, p.codigo, p.nome 
              FROM fornecedor_produto fp 
              JOIN produtos p ON p.id = fp.produto_id 
              WHERE fp.fornecedor_id = ?`,
        args: [id]
      });
      f.produtos = pRs.rows.map(p => p.nome).join(', ');
      f.produtoIds = pRs.rows.map(p => Number(p.id));
      
      return res.status(200).json(f);
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

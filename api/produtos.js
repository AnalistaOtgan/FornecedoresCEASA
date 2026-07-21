const { db } = require('./_db.js');

module.exports = async function handler(req, res) {
  // Configurar CORS básico caso necessário (embora mesma origem)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = db();
  
  // Tratamento de override de método (usado pelo frontend antigo)
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
          sql: 'SELECT id, codigo, nome FROM produtos WHERE id = ?',
          args: [id]
        });
        if (rs.rows.length === 0) {
          return res.status(404).json({ error: 'Produto não encontrado' });
        }
        return res.status(200).json(rs.rows[0]);
      } else {
        const rs = await client.execute('SELECT id, codigo, nome FROM produtos ORDER BY id');
        return res.status(200).json(rs.rows);
      }
    }
    
    if (method === 'POST') {
      const { codigo, nome } = req.body || {};
      if (!codigo || !nome) {
        return res.status(400).json({ error: 'Código e nome são obrigatórios' });
      }
      
      const rs = await client.execute({
        sql: 'INSERT INTO produtos (codigo, nome) VALUES (?, ?)',
        args: [codigo, nome]
      });
      
      const selectRs = await client.execute({
        sql: 'SELECT id, codigo, nome FROM produtos WHERE id = ?',
        args: [rs.lastInsertRowid]
      });
      return res.status(201).json(selectRs.rows[0]);
    }
    
    if (method === 'PUT') {
      const id = req.query.id;
      const { codigo, nome } = req.body || {};
      if (!id || id <= 0) return res.status(400).json({ error: 'ID inválido' });
      
      await client.execute({
        sql: 'UPDATE produtos SET codigo = ?, nome = ? WHERE id = ?',
        args: [codigo, nome, id]
      });
      
      const selectRs = await client.execute({
        sql: 'SELECT id, codigo, nome FROM produtos WHERE id = ?',
        args: [id]
      });
      return res.status(200).json(selectRs.rows[0]);
    }
    
    if (method === 'DELETE') {
      const id = req.query.id;
      if (!id || id <= 0) return res.status(400).json({ error: 'ID inválido' });
      
      // Remover relações na tabela pivô primeiro
      await client.execute({ sql: 'DELETE FROM fornecedor_produto WHERE produto_id = ?', args: [id] });
      await client.execute({ sql: 'DELETE FROM produtos WHERE id = ?', args: [id] });
      
      return res.status(200).json({ ok: true });
    }
    
    return res.status(405).json({ error: 'Método não suportado' });
  } catch (error) {
    console.error('Erro na API Produtos:', error);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

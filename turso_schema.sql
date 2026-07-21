-- Schema para SQLite (Turso)

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  apelido TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fornecedor_produto (
  fornecedor_id INTEGER NOT NULL,
  produto_id INTEGER NOT NULL,
  PRIMARY KEY (fornecedor_id, produto_id),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
);

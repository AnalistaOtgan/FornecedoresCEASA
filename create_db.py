import sqlite3
import csv
import os
import re

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fornecedores.db')

# Remover banco antigo se existir
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
conn.execute("PRAGMA journal_mode = WAL")
conn.execute("PRAGMA foreign_keys = ON")
cur = conn.cursor()

# Criar tabelas
cur.executescript("""
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
""")

# =============================================
# 1. Inserir PRODUTOS do CSV
# =============================================
produtos_map = {}  # nome_normalizado -> produto_id

with open('table-fb7c24a4-2d86-46a5-9389-e7e3eeca8f5d.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header = next(reader)  # pular cabeçalho
    for row in reader:
        codigo = row[0].strip()
        nome = row[1].strip()
        cur.execute('INSERT INTO produtos (codigo, nome) VALUES (?, ?)', (codigo, nome))
        pid = cur.lastrowid
        # Guardar mapeamento por nome normalizado (sem unidade, sem KG, etc.)
        nome_norm = re.sub(r'\s+(KG|UN|BDJ|PT|G|\d+G)$', '', nome, flags=re.IGNORECASE).strip().upper()
        produtos_map[nome_norm] = pid
        # Também guardar o nome completo
        produtos_map[nome.upper()] = pid

# Mapeamentos manuais para nomes que diferem entre os CSVs
manual = {
    'LIMA': None,  # Não existe no catálogo - será ignorado
    'LIMAO': 'LIMÃO KG',
    'PIMENTAO': 'PIMENTÃO KG',
    'MARACUJA': 'MARACUJÁ KG',
    'MAXIXE/JILO': 'MAXIXE/JILÓ KG',
    'MAMAO HAVAI': 'MAMÃO FORMOSA KG',  # Mais próximo disponível
    'MAMAO FORMOSA': 'MAMÃO FORMOSA KG',
    'MAMAO FORMOSA E HAVAI': 'MAMÃO FORMOSA KG',
    'AMENDOIM': None,  # Não existe no catálogo
    'UVAS': 'UVA VITÓRIA KG',
    'CEBOLAS': 'CEBOLA BRANCA KG',
    'MORANGO': 'MORANGO BDJ',
    'CEBOLA': 'CEBOLA BRANCA KG',
    'PRODUTOS QUE NAO TENHA FORNECEDOR ESPECIFICO': None,  # Ignorar
}
for alias, target in manual.items():
    if target and target.upper() in produtos_map:
        produtos_map[alias.upper()] = produtos_map[target.upper()]

print(f"Produtos inseridos: {len(produtos_map)} mapeamentos (incluindo aliases)")

# =============================================
# 2. Inserir FORNECEDORES do CSV e RELACIONAMENTOS
# =============================================
total_relacoes = 0

with open('table-5671dac9-6fc5-4fcf-96a8-4e309dce928a.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header = next(reader)  # pular cabeçalho
    for row in reader:
        codigo = row[0].strip()
        nome = row[1].strip()
        apelido = row[2].strip()
        if apelido == '-':
            apelido = ''
        produtos_texto = row[3].strip() if len(row) > 3 else ''

        cur.execute(
            'INSERT INTO fornecedores (codigo, nome, apelido) VALUES (?, ?, ?)',
            (codigo, nome, apelido)
        )
        forn_id = cur.lastrowid

        # Relacionar produtos
        if produtos_texto and produtos_texto != '-':
            itens = [p.strip().upper() for p in produtos_texto.split(',')]
            for item in itens:
                if not item:
                    continue
                # Tentar match direto
                matched_pid = None
                # 1) Match exato
                if item in produtos_map:
                    matched_pid = produtos_map[item]
                else:
                    # 2) Match parcial: procurar produto cujo nome normalizado contém o item
                    for pnome, pid in produtos_map.items():
                        # Verificar se o item está contido no nome do produto ou vice-versa
                        if item in pnome or pnome.startswith(item):
                            matched_pid = pid
                            break
                    if not matched_pid:
                        # 3) Match por palavra-chave
                        for pnome, pid in produtos_map.items():
                            # Pegar primeira palavra significativa do item
                            palavras_item = item.split()
                            if palavras_item and palavras_item[0] in pnome:
                                matched_pid = pid
                                break

                if matched_pid:
                    try:
                        cur.execute(
                            'INSERT OR IGNORE INTO fornecedor_produto (fornecedor_id, produto_id) VALUES (?, ?)',
                            (forn_id, matched_pid)
                        )
                        total_relacoes += 1
                    except:
                        pass
                else:
                    print(f"  [!] Produto não encontrado: '{item}' (fornecedor: {nome})")

conn.commit()

# Estatísticas finais
total_f = cur.execute('SELECT COUNT(*) FROM fornecedores').fetchone()[0]
total_p = cur.execute('SELECT COUNT(*) FROM produtos').fetchone()[0]
total_r = cur.execute('SELECT COUNT(*) FROM fornecedor_produto').fetchone()[0]

print(f"\n{'='*50}")
print(f"Banco criado com sucesso: {db_path}")
print(f"  -> {total_f} fornecedores")
print(f"  -> {total_p} produtos")
print(f"  -> {total_r} relações fornecedor<->produto")
print(f"{'='*50}")

# Mostrar amostra de relações
print("\nAmostra de relações:")
rows = cur.execute("""
    SELECT f.codigo, f.nome, GROUP_CONCAT(p.nome, ', ') as produtos
    FROM fornecedor_produto fp
    JOIN fornecedores f ON f.id = fp.fornecedor_id
    JOIN produtos p ON p.id = fp.produto_id
    GROUP BY f.id
    LIMIT 10
""").fetchall()
for r in rows:
    print(f"  {r[0]} - {r[1]}: {r[2]}")

conn.close()

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const fornecedoresHandler = require('./api/fornecedores.js');
const produtosHandler = require('./api/produtos.js');

const PORT = process.env.PORT || 9563;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Adaptar req/res do Node puro para o formato que as Serverless Functions esperam
function adaptRequest(req) {
  const parsed = url.parse(req.url, true);
  req.query = parsed.query;
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (body) {
        try { req.body = JSON.parse(body); } catch { req.body = {}; }
      } else {
        req.body = {};
      }
      resolve();
    });
  });
}

function adaptResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Rotas da API
  if (pathname === '/api/fornecedores') {
    await adaptRequest(req);
    adaptResponse(res);
    return fornecedoresHandler(req, res);
  }
  if (pathname === '/api/produtos') {
    await adaptRequest(req);
    adaptResponse(res);
    return produtosHandler(req, res);
  }

  // Arquivos estáticos
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(ROOT, filePath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(fullPath).pipe(res);
  } else {
    // SPA fallback
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║  🥬  Fornecedores CEASA - Servidor Local    ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  🌐  http://localhost:${PORT}                  ║`);
  console.log('  ║  📦  Banco: fornecedores.db (SQLite local)   ║');
  console.log('  ║  ⏹️   Ctrl+C para parar                      ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});

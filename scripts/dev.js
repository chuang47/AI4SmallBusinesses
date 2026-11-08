// Local stand-in for Vercel: serves static files and runs api/*.js handlers.
// Run: node --env-file-if-exists=.env.local scripts/dev.js   then open http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname.startsWith("/api/")) {
      const file = path.join(ROOT, url.pathname + ".js");
      if (!file.startsWith(path.join(ROOT, "api")) || !fs.existsSync(file)) return res.writeHead(404).end();
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try { req.body = JSON.parse(raw); } catch { req.body = raw; }
      res.status = (code) => ((res.statusCode = code), res);
      res.json = (obj) => res.setHeader("Content-Type", "application/json").end(JSON.stringify(obj));
      return require(file)(req, res);
    }

    const file = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));

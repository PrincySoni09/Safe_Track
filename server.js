// SafeTrack server. Run: node server.js   then open http://localhost:3000
// Keep this file in the same folder as safetrack_dashboard.html. No npm install needed.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;

const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f)); } catch { return d; } };
const save = (f, v) => fs.writeFile(f, JSON.stringify(v), () => {});

let history = load('history.json', []);
let alerts  = load('alerts.json', []);
let config  = load('config.json', { zones: [], route: [], lim: 40, dev: 50 });
let latest  = history[history.length - 1] || null;

function readBody(req, cb) {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 200000) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(b || '{}')); } catch { cb(null); } });
}
function send(res, code, data, type = 'application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, '');

  // the dashboard page
  if (req.method === 'GET' && (url === '/' || url === '/index.html'))
    return fs.readFile(path.join(__dirname, 'safetrack_dashboard.html'), (e, d) =>
      e ? send(res, 404, 'safetrack_dashboard.html must be next to server.js', 'text/plain')
        : send(res, 200, d, 'text/html; charset=utf-8'));

  // data from the tracker board
  if (req.method === 'POST' && url === '/api/telemetry') return readBody(req, j => {
    if (!j) return send(res, 400, 'bad json', 'text/plain');
    j.t = Date.now();
    latest = j;
    history.push(j);
    if (history.length > 5000) history.shift();
    save('history.json', history);
    console.log(new Date().toLocaleTimeString(), JSON.stringify(j));
    send(res, 200, 'ok', 'text/plain');
  });

  // data for the dashboard
  if (req.method === 'GET' && url === '/api/live')    return send(res, 200, latest || {});
  if (req.method === 'GET' && url === '/api/history') return send(res, 200, history);

  // zones, route and limits (shared by every browser that opens the dashboard)
  if (url === '/api/config') {
    if (req.method === 'POST') return readBody(req, j => { if (j) { config = j; save('config.json', config); } send(res, 200, config); });
    return send(res, 200, config);
  }

  // alerts
  if (req.method === 'GET' && url === '/api/alerts') return send(res, 200, alerts);
  if (req.method === 'POST' && url === '/api/alerts/ack') {
    alerts.forEach(a => a.ack = true); save('alerts.json', alerts);
    return send(res, 200, 'ok', 'text/plain');
  }
  if (req.method === 'POST' && url === '/api/alerts') return readBody(req, j => {
    if (j) {
      alerts.unshift({ type: j.type, text: String(j.text).slice(0, 300), t: j.t || Date.now(), ack: j.type === 'info' });
      alerts = alerts.slice(0, 300);
      save('alerts.json', alerts);
    }
    send(res, 200, 'ok', 'text/plain');
  });

  send(res, 404, 'not found', 'text/plain');
}).listen(PORT, '0.0.0.0', () => console.log('SafeTrack running: http://localhost:' + PORT));
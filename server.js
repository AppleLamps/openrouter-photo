require('dotenv').config();
const path = require('path');
const express = require('express');
const generateHandler = require('./api/generate');
const enhanceHandler = require('./api/enhance');
const testKeyHandler = require('./api/validate-openrouter-key');
const testXaiKeyHandler = require('./api/validate-xai-key');
const testEvolinkKeyHandler = require('./api/validate-evolink-key');
const randomPromptHandler = require('./api/random-prompt');
const generationStatusHandler = require('./api/generation-status');
const imageProxyHandler = require('./api/image-proxy');
const { API_CORS_ALLOW_HEADERS } = require('./api/_middleware');

const app = express();
const PORT = process.env.PORT || 3000;

const REQUEST_BODY_LIMIT = '4mb';

// Match Vercel's 4.5 MB function payload ceiling with headroom for JSON overhead.
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({
            code: 'REQUEST_PAYLOAD_TOO_LARGE',
            error: 'Attached images are too large for deployment. Use fewer or smaller reference images.',
        });
    }
    return next(err);
});

function getAllowedCorsOrigin(req) {
    const raw = process.env.ALLOWED_ORIGIN || '';
    const allowed = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
    const origin = req.headers.origin;
    if (!origin) return { origin: null, blocked: false };
    if (allowed.includes('*')) return { origin: '*', blocked: false };
    if (allowed.includes(origin)) return { origin, blocked: false };

    const hostOrigin = `${req.protocol}://${req.headers.host}`;
    if (allowed.length === 0 && origin === hostOrigin) {
        return { origin, blocked: false };
    }

    return { origin: allowed[0] || null, blocked: true };
}

// CORS + preflight handling for local dev (browser sends OPTIONS for custom headers like X-OpenRouter-Api-Key)
app.use('/api', (req, res, next) => {
    const cors = getAllowedCorsOrigin(req);
    if (cors.origin) {
        res.setHeader('Access-Control-Allow-Origin', cors.origin);
        if (cors.origin !== '*') {
            res.setHeader('Vary', 'Origin');
        }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', API_CORS_ALLOW_HEADERS);
    if (cors.blocked) {
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    return next();
});

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'public', 'vendor')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

app.get('/sw.js', (_req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname, 'sw.js'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/generate', (req, res) => {
    return generateHandler(req, res);
});

app.post('/api/enhance', (req, res) => {
    return enhanceHandler(req, res);
});

app.post('/api/test-key', (req, res) => {
    return testKeyHandler(req, res);
});

app.post('/api/test-xai-key', (req, res) => {
    return testXaiKeyHandler(req, res);
});

app.post('/api/test-evolink-key', (req, res) => {
    return testEvolinkKeyHandler(req, res);
});

app.post('/api/random-prompt', (req, res) => {
    return randomPromptHandler(req, res);
});

app.all('/api/generation-status', (req, res) => {
    return generationStatusHandler(req, res);
});

app.all('/api/video-status', (req, res) => {
    return generationStatusHandler(req, res);
});

app.get('/api/image-proxy', (req, res) => {
    return imageProxyHandler(req, res);
});

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            throw err;
        }
    });
}

startServer(PORT);

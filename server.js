require('dotenv').config();
const path = require('path');
const express = require('express');
const generateHandler = require('./api/generate');
const enhanceHandler = require('./api/enhance');
const testKeyHandler = require('./api/test-key');
const testXaiKeyHandler = require('./api/test-xai-key');
const testFalKeyHandler = require('./api/test-fal-key');
const randomPromptHandler = require('./api/random-prompt');
const videoStatusHandler = require('./api/video-status');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase body size limit to handle base64 image attachments (image-to-video can send 2 frames)
app.use(express.json({ limit: '20mb' }));

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Api-Key, X-XAI-Api-Key, X-FAL-Api-Key, X-App-Access-Token');
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

app.post('/api/test-fal-key', (req, res) => {
    return testFalKeyHandler(req, res);
});

app.post('/api/random-prompt', (req, res) => {
    return randomPromptHandler(req, res);
});

app.post('/api/video-status', (req, res) => {
    return videoStatusHandler(req, res);
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

require('dotenv').config();
const path = require('path');
const express = require('express');
const generateHandler = require('./api/generate');
const enhanceHandler = require('./api/enhance');
const testKeyHandler = require('./api/test-key');
const randomPromptHandler = require('./api/random-prompt');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase body size limit to handle base64 image attachments
// Note: Vercel has a hard limit of 4.5MB for serverless functions
app.use(express.json({ limit: '4.5mb' }));

// CORS + preflight handling for local dev (browser sends OPTIONS for custom headers like X-OpenRouter-Api-Key)
app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Api-Key, X-XAI-Api-Key');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    return next();
});

app.use('/public', express.static(path.join(__dirname, 'public')));
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

app.post('/api/random-prompt', (req, res) => {
    return randomPromptHandler(req, res);
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
const { afterEach, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const openRouterHandler = require('../api/validate-openrouter-key');
const xaiHandler = require('../api/validate-xai-key');
const evolinkHandler = require('../api/validate-evolink-key');

const originalFetch = global.fetch;
const providerEnvNames = ['OPENROUTER_API_KEY', 'XAI_API_KEY', 'EVOLINK_API_KEY'];
const originalProviderEnv = Object.fromEntries(providerEnvNames.map((name) => [name, process.env[name]]));

function createRequest(url, headers = {}) {
    return {
        method: 'POST',
        url,
        headers,
        body: {},
        socket: { remoteAddress: 'api-key-validation-test' },
    };
}

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        end() {
            return this;
        },
    };
}

beforeEach(() => {
    for (const name of providerEnvNames) delete process.env[name];
});

afterEach(() => {
    global.fetch = originalFetch;
    for (const name of providerEnvNames) {
        const value = originalProviderEnv[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe('API key validation handlers', () => {
    it('uses the documented provider validation endpoints', async () => {
        const requests = [];
        global.fetch = async (url, options) => {
            requests.push({ url, options });
            return { ok: true, status: 200, text: async () => '' };
        };

        const cases = [
            [openRouterHandler, '/api/test-key', 'x-openrouter-api-key', 'openrouter-key'],
            [xaiHandler, '/api/test-xai-key', 'x-xai-api-key', 'xai-key'],
            [evolinkHandler, '/api/test-evolink-key', 'x-evolink-api-key', 'evolink-key'],
        ];
        for (const [handler, url, header, key] of cases) {
            const res = createResponse();
            await handler(createRequest(url, { [header]: key }), res);
            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, { ok: true });
        }

        assert.deepEqual(requests.map(({ url }) => url), [
            'https://openrouter.ai/api/v1/key',
            'https://api.x.ai/v1/models',
            'https://api.evolink.ai/v1/credits',
        ]);
        assert.ok(requests.every(({ options }) => options.method === 'GET'));
    });

    it('returns provider authentication failures without exposing the key', async () => {
        const secret = 'sk-or-v1-super-secret-test-key';
        global.fetch = async () => ({
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ error: { message: `Invalid key ${secret}` } }),
        });

        const res = createResponse();
        await openRouterHandler(createRequest('/api/test-key-failure', {
            'x-openrouter-api-key': secret,
        }), res);

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.code, 'OPENROUTER_KEY_INVALID');
        assert.match(res.body.details, /\[REDACTED_API_KEY\]/);
        assert.doesNotMatch(res.body.details, new RegExp(secret));
    });

    it('returns a provider-specific missing-key response without making a request', async () => {
        let fetchCalled = false;
        global.fetch = async () => {
            fetchCalled = true;
            throw new Error('fetch should not be called');
        };

        const cases = [
            [openRouterHandler, '/api/test-key-missing', 'OPENROUTER_API_KEY_REQUIRED'],
            [xaiHandler, '/api/test-xai-key-missing', 'XAI_API_KEY_REQUIRED'],
            [evolinkHandler, '/api/test-evolink-key-missing', 'EVOLINK_API_KEY_REQUIRED'],
        ];
        for (const [handler, url, code] of cases) {
            const res = createResponse();
            await handler(createRequest(url), res);
            assert.equal(res.statusCode, 401);
            assert.equal(res.body.code, code);
        }
        assert.equal(fetchCalled, false);
    });
});

describe('API key validation error formatting', () => {
    it('extracts nested provider messages and ignores HTML error documents', async () => {
        const { formatApiTestErrorMessage } = await import('../js/api.js');

        assert.equal(
            formatApiTestErrorMessage({
                error: 'xAI API key test failed',
                details: JSON.stringify({ error: 'Incorrect API key provided.' }),
            }, 'Fallback'),
            'xAI API key test failed: Incorrect API key provided.'
        );
        assert.equal(
            formatApiTestErrorMessage({
                error: 'Evolink API key test failed',
                details: '<html>Bad gateway</html>',
            }, 'Fallback'),
            'Evolink API key test failed'
        );
    });
});

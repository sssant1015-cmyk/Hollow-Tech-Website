"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");
const apiSource = fs.readFileSync(path.join(repositoryRoot, "rafael-api.js"), "utf8");
const configSource = fs.readFileSync(
    path.join(repositoryRoot, "rafael-config.js"),
    "utf8"
);

function config(overrides = {}) {
    return {
        useMockApi: false,
        allowDevelopmentMockQuery: true,
        mockModeRequested: false,
        apiBaseUrl: "http://127.0.0.1:8000",
        requestTimeoutMs: 100,
        maxRetryAfterSeconds: 60,
        minSessionIdLength: 32,
        maxSessionIdLength: 64,
        developmentLogging: false,
        ...overrides
    };
}

function loadApi(fetchImplementation = async () => {
    throw new Error("network unavailable");
}) {
    const browserWindow = {
        fetch: fetchImplementation,
        setTimeout,
        clearTimeout,
        crypto: globalThis.crypto
    };
    const context = vm.createContext({
        window: browserWindow,
        console,
        AbortController,
        Uint8Array
    });
    vm.runInContext(apiSource, context, { filename: "rafael-api.js" });
    return browserWindow.RafaelApi;
}

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...headers
        }
    });
}

function loadConfig(hostname, search = "?mock=1") {
    const browserWindow = {
        location: { hostname, search }
    };
    vm.runInContext(configSource, vm.createContext({
        window: browserWindow,
        URLSearchParams
    }), { filename: "rafael-config.js" });
    return browserWindow.RAFAEL_CONFIG;
}

const sessionId = "a".repeat(43);
const successfulChat = {
    session_id: sessionId,
    reply: "public reply",
    command: "ask",
    success: true,
    error_code: null,
    conversation_turns: 2
};

test("chat sends only message and an existing valid session", async () => {
    const calls = [];
    const api = loadApi(async (url, options) => {
        calls.push({ url, options });
        return jsonResponse(successfulChat, 200, { "X-Request-ID": "b".repeat(32) });
    });
    const liveClient = api.createClient(config(), {
        fetchImplementation: async (url, options) => {
            calls.push({ url, options });
            return jsonResponse(successfulChat, 200, { "X-Request-ID": "b".repeat(32) });
        }
    });
    const result = await liveClient.chat({
        sessionId,
        message: "ordinary text",
        role: "admin",
        provider: "private",
        conversationHistory: ["forbidden"]
    });

    assert.equal(liveClient.constructor.name, "LiveRafaelClient");
    assert.equal(calls[0].url, "http://127.0.0.1:8000/chat");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        message: "ordinary text",
        session_id: sessionId
    });
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.reply, "public reply");
    assert.equal(result.requestId, "bbbbbbbb");
});

test("a first chat omits client-created session and accepts the server session", async () => {
    let sentBody;
    const api = loadApi();
    const client = api.createClient(config(), {
        fetchImplementation: async (_url, options) => {
            sentBody = JSON.parse(options.body);
            return jsonResponse(successfulChat);
        }
    });

    const result = await client.chat({ message: "help", sessionId: null });
    assert.deepEqual(sentBody, { message: "help" });
    assert.equal(result.sessionId, sessionId);
});

test("clear calls only the clear endpoint with the session ID", async () => {
    let call;
    const api = loadApi();
    const client = api.createClient(config(), {
        fetchImplementation: async (url, options) => {
            call = { url, body: JSON.parse(options.body) };
            return jsonResponse({
                session_id: sessionId,
                cleared: true,
                success: true,
                error_code: null
            });
        }
    });

    await client.clearSession(sessionId);
    assert.deepEqual(call, {
        url: "http://127.0.0.1:8000/session/clear",
        body: { session_id: sessionId }
    });
});

test("feedback contains only approved fields and excludes contact without permission", async () => {
    const bodies = [];
    const api = loadApi();
    const client = api.createClient(config(), {
        fetchImplementation: async (_url, options) => {
            bodies.push(JSON.parse(options.body));
            return jsonResponse({
                feedback_id: "feedback-id",
                accepted: true,
                category: "bug",
                received_at: "2026-01-01T00:00:00Z",
                error_code: null
            });
        }
    });

    await client.feedback({
        sessionId,
        category: "bug",
        message: "feedback",
        rating: 5,
        contactPermission: false,
        contact: "private@example.com",
        conversation: ["forbidden"]
    });
    await client.feedback({
        category: "usability",
        message: "feedback two",
        rating: null,
        contactPermission: true,
        contact: "allowed@example.com"
    });

    assert.deepEqual(bodies[0], {
        category: "bug",
        message: "feedback",
        contact_permission: false,
        session_id: sessionId,
        rating: 5
    });
    assert.deepEqual(bodies[1], {
        category: "usability",
        message: "feedback two",
        contact_permission: true,
        contact: "allowed@example.com"
    });
});

for (const [status, kind] of [
    [400, "invalid"],
    [404, "session"],
    [413, "tooLarge"],
    [429, "rateLimit"],
    [503, "unavailable"],
    [500, "internal"]
]) {
    test(`HTTP ${status} maps to ${kind}`, async () => {
        const api = loadApi();
        const client = api.createClient(config(), {
            fetchImplementation: async () => jsonResponse({
                success: false,
                error_code: status === 404 ? "session_expired" : "internal_error"
            }, status, {
                "X-Request-ID": "c".repeat(32),
                "Retry-After": status === 429 ? "17" : "0"
            })
        });

        await assert.rejects(
            client.chat({ message: "test" }),
            (error) => {
                assert.equal(error.kind, kind);
                assert.equal(error.requestId, "cccccccc");
                if (status === 429) {
                    assert.equal(error.retryAfterSeconds, 17);
                }
                return true;
            }
        );
    });
}

test("request timeout is distinct from network failure", async () => {
    const api = loadApi();
    const client = api.createClient(config({ requestTimeoutMs: 10 }), {
        fetchImplementation: async (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        })
    });

    await assert.rejects(
        client.health(),
        (error) => error.kind === "timeout"
    );
});

test("network failure does not fall back to mock mode", async () => {
    const api = loadApi();
    const client = api.createClient(config(), {
        fetchImplementation: async () => {
            throw new Error("offline");
        }
    });

    await assert.rejects(client.chat({ message: "hello" }), (error) => {
        assert.equal(error.kind, "network");
        return true;
    });
});

test("malformed successful responses are rejected", async () => {
    const api = loadApi();
    const client = api.createClient(config(), {
        fetchImplementation: async () => jsonResponse({ success: true })
    });

    await assert.rejects(client.chat({ message: "hello" }), (error) => {
        assert.equal(error.kind, "malformed");
        return true;
    });
});

test("explicit mock mode is visibly separate and makes no fetch call", async () => {
    let fetchCalled = false;
    const api = loadApi(async () => {
        fetchCalled = true;
        throw new Error("must not run");
    });
    const client = api.createClient(config({ mockModeRequested: true }), {
        fetchImplementation: async () => {
            fetchCalled = true;
        }
    });
    const result = await client.chat({ message: "version" });

    assert.match(result.reply, /Development mock/);
    assert.equal(fetchCalled, false);
});

test("mock query mode is restricted to loopback development hosts", () => {
    assert.equal(loadConfig("127.0.0.1").mockModeRequested, true);
    assert.equal(loadConfig("localhost").mockModeRequested, true);
    assert.equal(loadConfig("hollow.example").mockModeRequested, false);
});

test("UI source uses safe rendering and stores no conversation history", () => {
    const uiSource = fs.readFileSync(path.join(repositoryRoot, "rafael-chat.js"), "utf8");
    assert.doesNotMatch(uiSource, /innerHTML|localStorage|\beval\s*\(|new\s+Function/);
    assert.match(uiSource, /textContent\s*=/);
    assert.doesNotMatch(uiSource, /conversation_history|conversationHistory\s*:/);
});

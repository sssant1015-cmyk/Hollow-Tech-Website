"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "..");
const buildScript = path.join(repositoryRoot, "scripts", "build-production.js");
const productionOrigin = "https://api.hollow.example";

function read(relativePath, root = repositoryRoot) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("production URL validation fails closed", () => {
    const { productionApiOrigin } = require(buildScript);
    for (const value of [
        "",
        "http://api.hollow.example",
        "https://localhost:8000",
        "https://api.hollow.example/v1",
        "https://user:password@api.hollow.example"
    ]) {
        assert.throws(() => productionApiOrigin(value));
    }
    assert.equal(productionApiOrigin(productionOrigin), productionOrigin);
});

test("production artifact is reproducible and contains only runtime files", () => {
    const result = spawnSync(process.execPath, [buildScript], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, RAFAEL_API_BASE_URL: productionOrigin }
    });
    assert.equal(result.status, 0, result.stderr);

    const dist = path.join(repositoryRoot, "dist");
    const expected = [
        "_headers",
        "favicon.svg",
        "index.html",
        "rafael-api.js",
        "rafael-chat.js",
        "rafael-config.js",
        "rafael-public-config.js",
        "rafael.css",
        "rafael.html",
        "script.js",
        "style.css"
    ];
    assert.deepEqual(fs.readdirSync(dist).sort(), expected);

    const artifact = expected.map((file) => read(file, dist)).join("\n");
    assert.match(artifact, /"environment": "production"/);
    assert.match(artifact, /https:\/\/api\.hollow\.example/);
    assert.doesNotMatch(
        artifact,
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])|GEMINI_API_KEY/
    );
    assert.doesNotMatch(artifact, /unsafe-inline|unsafe-eval|C:\\Users\\/);
});

test("pages use local assets, baseline CSP, and no inline script", () => {
    const index = read("index.html");
    const rafael = read("rafael.html");
    for (const page of [index, rafael]) {
        assert.match(page, /Content-Security-Policy/);
        assert.doesNotMatch(page, /<script(?:\s[^>]*)?>\s*[^<\s]/i);
        assert.doesNotMatch(page, /src="https?:\/\//i);
        for (const match of page.matchAll(/(?:href|src)="([^"#]+)"/g)) {
            const target = match[1];
            if (/^(?:https?:|mailto:)/.test(target)) {
                continue;
            }
            assert.equal(path.isAbsolute(target), false, target);
            assert.equal(fs.existsSync(path.join(repositoryRoot, target)), true, target);
        }
    }
    assert.match(index, /action="https:\/\/formspree\.io\/f\/xkodlnlj"/);
    assert.match(index, /href="https:\/\/ko-fi\.com\/hollowtech"/);
    assert.match(rafael, /src="rafael-public-config\.js"[\s\S]*src="rafael-config\.js"/);
});

test("chat readiness is ordered and bounded, with safe session reset", () => {
    const source = read("rafael-chat.js");
    assert.match(source, /await apiClient\.health\(\);[\s\S]*await apiClient\.ready\(\);/);
    assert.match(source, /attempt < config\.healthMaxAttempts/);
    assert.match(source, /error\.kind === "session"[\s\S]*resetConversation\(\)/);
    assert.doesNotMatch(source, /innerHTML|localStorage|\beval\s*\(|new\s+Function/);
});

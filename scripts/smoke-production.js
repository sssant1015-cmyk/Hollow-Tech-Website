"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const repositoryRoot = path.resolve(__dirname, "..");
const dist = path.join(repositoryRoot, "dist");
const chromePath = process.env.CHROME_PATH;
const sessionId = "s".repeat(43);
const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml"
};

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function staticServer() {
    return http.createServer((request, response) => {
        const requestedPath = new URL(request.url, "http://127.0.0.1").pathname;
        const relativePath = requestedPath === "/"
            ? "index.html"
            : requestedPath.replace(/^\/+/, "");
        const filePath = path.resolve(dist, relativePath);
        if (!filePath.startsWith(`${dist}${path.sep}`) || !fs.existsSync(filePath)) {
            response.writeHead(404).end("Not found");
            return;
        }
        response.writeHead(200, {
            "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff"
        });
        fs.createReadStream(filePath).pipe(response);
    });
}

async function fulfillApi(route, requestedPaths) {
    const apiRequest = route.request();
    const url = new URL(apiRequest.url());
    requestedPaths.push(url.pathname);
    const responses = {
        "/health": {
            status: "ok",
            service: "rafael-public-api",
            version: "0.2.0",
            environment: "production",
            started_at: "2026-08-01T00:00:00Z",
            rate_limit_mode: "in-memory"
        },
        "/ready": {
            status: "ready",
            service: "rafael-public-api",
            version: "0.2.0"
        },
        "/chat": {
            session_id: sessionId,
            reply: "Production smoke reply",
            command: "ask",
            success: true,
            error_code: null,
            conversation_turns: 1
        },
        "/session/clear": {
            session_id: sessionId,
            cleared: true,
            success: true,
            error_code: null
        },
        "/feedback": {
            feedback_id: "smoke-feedback",
            accepted: true,
            category: "usability",
            received_at: "2026-08-01T00:00:00Z",
            error_code: null
        }
    };
    await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
            "Access-Control-Allow-Origin": apiRequest.headers().origin,
            "Access-Control-Expose-Headers": "X-Request-ID, Retry-After"
        },
        body: JSON.stringify(responses[url.pathname])
    });
}

async function run() {
    assert(fs.existsSync(path.join(dist, "rafael.html")), "Build dist/ before smoke testing.");
    assert(chromePath && fs.existsSync(chromePath), "CHROME_PATH must point to Chromium.");

    const server = staticServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const failures = [];
    const requestedPaths = [];

    try {
        for (const width of [320, 375, 768, 1024]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            page.on("console", (message) => {
                if (message.type() === "error") failures.push(`${width}px console: ${message.text()}`);
            });
            page.on("pageerror", (error) => failures.push(`${width}px page: ${error.message}`));
            await page.route("https://api.hollow.example/**", (route) =>
                fulfillApi(route, requestedPaths)
            );
            await page.goto(`http://127.0.0.1:${port}/rafael.html`, {
                waitUntil: "networkidle"
            });
            try {
                await page.waitForFunction(
                    () => document.getElementById("connection-status-text")?.textContent === "Ready",
                    null,
                    { timeout: 10000 }
                );
            } catch {
                const state = await page.evaluate(() => ({
                    configurationError: window.RAFAEL_CONFIG?.configurationError,
                    status: document.getElementById("connection-status-text")?.textContent,
                    visibleError: document.getElementById("chat-error")?.textContent
                }));
                throw new Error(
                    `Rafael did not become ready at ${width}px: ${JSON.stringify(state)}; ` +
                    `requests=${requestedPaths.join(",")}; console=${failures.join(" | ")}`
                );
            }
            const dimensions = await page.evaluate(() => ({
                body: document.body.scrollWidth,
                viewport: document.documentElement.clientWidth
            }));
            assert(
                dimensions.body <= dimensions.viewport,
                `Horizontal overflow at ${width}px (${dimensions.body} > ${dimensions.viewport}).`
            );
            assert(await page.locator("h1").isVisible(), `Rafael heading hidden at ${width}px.`);
            await page.keyboard.press("Tab");
            assert(
                await page.locator(":focus").evaluate((element) => element.matches("a, button, input, select, textarea")),
                `Keyboard focus did not reach an interactive control at ${width}px.`
            );

            if (width === 375) {
                await page.getByLabel("Message Rafael").fill("help");
                await page.locator("#send-message").click();
                await page.getByText("Production smoke reply").waitFor();
                assert(
                    requestedPaths.indexOf("/health") < requestedPaths.indexOf("/ready"),
                    "Readiness ran before liveness."
                );
                await page.getByRole("button", { name: "Clear chat" }).click();
                await page.getByText("No server session yet").waitFor();
            }
            await page.close();
        }

        const homepage = await browser.newPage({ viewport: { width: 375, height: 900 } });
        homepage.on("console", (message) => {
            if (message.type() === "error") failures.push(`home console: ${message.text()}`);
        });
        homepage.on("pageerror", (error) => failures.push(`home page: ${error.message}`));
        await homepage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
        assert(await homepage.locator("#contact-form").isVisible(), "Contact form is hidden.");
        assert(
            await homepage.locator("#contact-form").getAttribute("action") ===
                "https://formspree.io/f/xkodlnlj",
            "Contact form action changed."
        );
        await homepage.close();

        assert(failures.length === 0, failures.join("\n"));
        process.stdout.write(
            "Production browser smoke passed at 320, 375, 768, and 1024 pixels.\n"
        );
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
}

run().catch((error) => {
    process.stderr.write(`Production browser smoke failed: ${error.message}\n`);
    process.exitCode = 1;
});

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(repositoryRoot, "dist");
const developmentApiOrigin = "http://127.0.0.1:8000";
const releaseFiles = [
    "favicon.svg",
    "index.html",
    "rafael-api.js",
    "rafael-chat.js",
    "rafael-config.js",
    "rafael.css",
    "rafael.html",
    "script.js",
    "style.css"
];

function productionApiOrigin(rawValue) {
    if (!rawValue) {
        throw new Error("RAFAEL_API_BASE_URL is required for a production build.");
    }

    let parsed;
    try {
        parsed = new URL(rawValue);
    } catch {
        throw new Error("RAFAEL_API_BASE_URL must be a valid absolute URL.");
    }

    const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
    const exactOrigin = parsed.pathname === "/" && !parsed.search && !parsed.hash;
    if (
        parsed.protocol !== "https:" ||
        localHosts.has(parsed.hostname) ||
        parsed.username ||
        parsed.password ||
        !exactOrigin
    ) {
        throw new Error(
            "RAFAEL_API_BASE_URL must be a non-local HTTPS origin without credentials or a path."
        );
    }
    return parsed.origin;
}

function writeRuntimeConfig(apiOrigin) {
    const publicConfig = {
        environment: "production",
        apiBaseUrl: apiOrigin,
        useMockApi: false
    };
    const contents =
        `"use strict";\n\nwindow.RAFAEL_PUBLIC_CONFIG = Object.freeze(${JSON.stringify(publicConfig, null, 4)});\n`;
    fs.writeFileSync(path.join(outputDirectory, "rafael-public-config.js"), contents);
}

function listFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    });
}

function verifyArtifact(apiOrigin) {
    const expected = new Set([...releaseFiles, "rafael-public-config.js", "_headers"]);
    const actual = new Set(
        listFiles(outputDirectory).map((file) => path.relative(outputDirectory, file))
    );
    if (actual.size !== expected.size || [...expected].some((file) => !actual.has(file))) {
        throw new Error("Production artifact contains an unexpected file set.");
    }

    const combined = [...actual]
        .map((file) => fs.readFileSync(path.join(outputDirectory, file), "utf8"))
        .join("\n");
    const forbiddenPatterns = [
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])/i,
        /[A-Z]:\\Users\\/i,
        /__RAFAEL_API_ORIGIN__/,
        /GEMINI_API_KEY/,
        /unsafe-eval|unsafe-inline/
    ];
    for (const pattern of forbiddenPatterns) {
        if (pattern.test(combined)) {
            throw new Error(`Production artifact failed forbidden-pattern check: ${pattern}`);
        }
    }
    if (!combined.includes(apiOrigin)) {
        throw new Error("Production API origin was not written to the artifact.");
    }
}

function build() {
    const apiOrigin = productionApiOrigin(process.env.RAFAEL_API_BASE_URL);
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.mkdirSync(outputDirectory, { recursive: true });

    for (const file of releaseFiles) {
        fs.copyFileSync(path.join(repositoryRoot, file), path.join(outputDirectory, file));
    }

    const rafaelPagePath = path.join(outputDirectory, "rafael.html");
    const rafaelPage = fs.readFileSync(rafaelPagePath, "utf8");
    if (!rafaelPage.includes(developmentApiOrigin)) {
        throw new Error("The Rafael CSP development origin marker is missing.");
    }
    fs.writeFileSync(
        rafaelPagePath,
        rafaelPage.replace(developmentApiOrigin, apiOrigin)
    );

    writeRuntimeConfig(apiOrigin);
    const headers = fs
        .readFileSync(path.join(repositoryRoot, "security-headers.conf"), "utf8")
        .replaceAll("__RAFAEL_API_ORIGIN__", apiOrigin);
    fs.writeFileSync(path.join(outputDirectory, "_headers"), headers);
    verifyArtifact(apiOrigin);

    process.stdout.write(`Production artifact ready: ${outputDirectory}\n`);
}

if (require.main === module) {
    try {
        build();
    } catch (error) {
        process.stderr.write(`Production build failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { productionApiOrigin };

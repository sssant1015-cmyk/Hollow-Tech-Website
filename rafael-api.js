"use strict";

(() => {
    const ERROR_MESSAGES = Object.freeze({
        invalid:
            "Rafael could not accept that request. Review it and try again.",
        session:
            "Your temporary session is no longer available. Please try again to begin a new session.",
        tooLarge:
            "That message is too large. Shorten it and try again.",
        rateLimit:
            "Rafael is receiving many requests. Please wait before trying again.",
        unavailable:
            "Rafael is temporarily unavailable. Please try again shortly.",
        network:
            "Rafael could not be reached. Check your connection and try again.",
        timeout:
            "Rafael took too long to respond. Please try again.",
        malformed:
            "Rafael returned an unexpected response. Please try again shortly.",
        internal:
            "Rafael could not complete that request. Please try again."
    });

    class RafaelApiError extends Error {
        constructor(kind, options = {}) {
            super(ERROR_MESSAGES[kind] || ERROR_MESSAGES.internal);
            this.name = "RafaelApiError";
            this.kind = kind;
            this.status = options.status || 0;
            this.requestId = options.requestId || null;
            this.retryAfterSeconds = options.retryAfterSeconds || 0;
            this.errorCode = options.errorCode || null;
        }
    }

    function normalizeBaseUrl(value) {
        if (typeof value !== "string" || !value.trim()) {
            throw new Error("Rafael API base URL is not configured.");
        }

        return value.trim().replace(/\/+$/, "");
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function validSessionId(value, config) {
        if (typeof value !== "string") {
            return false;
        }

        const minimum = config.minSessionIdLength;
        const maximum = config.maxSessionIdLength;
        return (
            value.length >= minimum &&
            value.length <= maximum &&
            /^[A-Za-z0-9_-]+$/.test(value)
        );
    }

    function requestReference(value) {
        if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
            return null;
        }

        return value.slice(0, 8);
    }

    function retryAfterSeconds(headers, config) {
        const rawValue = headers.get("Retry-After");
        if (!rawValue || !/^\d+$/.test(rawValue.trim())) {
            return 0;
        }

        const parsed = Number(rawValue);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            return 0;
        }

        return Math.min(parsed, config.maxRetryAfterSeconds);
    }

    function errorKind(status, errorCode) {
        if (
            status === 404 ||
            errorCode === "invalid_session" ||
            errorCode === "session_expired"
        ) {
            return "session";
        }
        if (status === 400) {
            return "invalid";
        }
        if (status === 413) {
            return "tooLarge";
        }
        if (status === 429) {
            return "rateLimit";
        }
        if (status === 503) {
            return "unavailable";
        }
        return "internal";
    }

    function createRequestBody(payload, config) {
        const body = { message: payload.message };
        if (validSessionId(payload.sessionId, config)) {
            body.session_id = payload.sessionId;
        }
        return body;
    }

    function createFeedbackBody(payload, config) {
        const body = {
            category: payload.category,
            message: payload.message,
            contact_permission: payload.contactPermission === true
        };

        if (validSessionId(payload.sessionId, config)) {
            body.session_id = payload.sessionId;
        }
        if (Number.isInteger(payload.rating)) {
            body.rating = payload.rating;
        }
        if (
            body.contact_permission &&
            typeof payload.contact === "string" &&
            payload.contact.trim()
        ) {
            body.contact = payload.contact.trim();
        }

        return body;
    }

    class LiveRafaelClient {
        constructor(config, dependencies = {}) {
            this.config = config;
            this.baseUrl = normalizeBaseUrl(config.apiBaseUrl);
            this.fetchImplementation = dependencies.fetchImplementation || window.fetch.bind(window);
        }

        log(event, detail = {}) {
            if (this.config.developmentLogging) {
                console.info(`[Rafael API] ${event}`, detail);
            }
        }

        async request(path, options = {}) {
            const controller = new AbortController();
            let timedOut = false;
            const externalSignal = options.signal;
            const abortFromCaller = () => controller.abort();

            if (externalSignal) {
                if (externalSignal.aborted) {
                    controller.abort();
                } else {
                    externalSignal.addEventListener("abort", abortFromCaller, { once: true });
                }
            }

            const timeoutId = window.setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, this.config.requestTimeoutMs);

            let response;
            try {
                response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
                    method: options.method || "GET",
                    headers: options.body ? { "Content-Type": "application/json" } : undefined,
                    body: options.body ? JSON.stringify(options.body) : undefined,
                    signal: controller.signal,
                    credentials: "omit",
                    referrerPolicy: "no-referrer"
                });
            } catch (error) {
                if (timedOut) {
                    throw new RafaelApiError("timeout");
                }
                if (externalSignal && externalSignal.aborted) {
                    throw new RafaelApiError("cancelled");
                }
                throw new RafaelApiError("network");
            } finally {
                window.clearTimeout(timeoutId);
                if (externalSignal) {
                    externalSignal.removeEventListener("abort", abortFromCaller);
                }
            }

            const requestId = requestReference(response.headers.get("X-Request-ID"));
            let data = null;
            try {
                data = await response.json();
            } catch {
                if (response.ok) {
                    throw new RafaelApiError("malformed", {
                        status: response.status,
                        requestId
                    });
                }
            }

            if (!response.ok) {
                const errorCode = isPlainObject(data) && typeof data.error_code === "string"
                    ? data.error_code
                    : null;
                throw new RafaelApiError(errorKind(response.status, errorCode), {
                    status: response.status,
                    requestId,
                    retryAfterSeconds: retryAfterSeconds(response.headers, this.config),
                    errorCode
                });
            }

            if (!isPlainObject(data)) {
                throw new RafaelApiError("malformed", {
                    status: response.status,
                    requestId
                });
            }

            this.log("request-complete", { path, status: response.status, requestId });
            return { data, requestId };
        }

        async health(options = {}) {
            const result = await this.request("/health", options);
            if (
                result.data.status !== "ok" ||
                result.data.service !== "rafael-public-api"
            ) {
                throw new RafaelApiError("malformed", { requestId: result.requestId });
            }
            return result;
        }

        async chat(payload, options = {}) {
            const result = await this.request("/chat", {
                ...options,
                method: "POST",
                body: createRequestBody(payload, this.config)
            });
            if (
                result.data.success !== true ||
                typeof result.data.reply !== "string" ||
                !validSessionId(result.data.session_id, this.config) ||
                !Number.isInteger(result.data.conversation_turns)
            ) {
                throw new RafaelApiError("malformed", { requestId: result.requestId });
            }
            return {
                reply: result.data.reply,
                sessionId: result.data.session_id,
                conversationTurns: result.data.conversation_turns,
                requestId: result.requestId
            };
        }

        async clearSession(sessionId, options = {}) {
            if (!validSessionId(sessionId, this.config)) {
                throw new RafaelApiError("session");
            }
            const result = await this.request("/session/clear", {
                ...options,
                method: "POST",
                body: { session_id: sessionId }
            });
            if (result.data.success !== true || result.data.cleared !== true) {
                throw new RafaelApiError("malformed", { requestId: result.requestId });
            }
            return { cleared: true, requestId: result.requestId };
        }

        async feedback(payload, options = {}) {
            const result = await this.request("/feedback", {
                ...options,
                method: "POST",
                body: createFeedbackBody(payload, this.config)
            });
            if (result.data.accepted !== true || typeof result.data.feedback_id !== "string") {
                throw new RafaelApiError("malformed", { requestId: result.requestId });
            }
            return { accepted: true, requestId: result.requestId };
        }
    }

    class MockRafaelClient {
        constructor(config) {
            this.config = config;
            this.sessionId = null;
            this.turns = 0;
        }

        async wait(signal) {
            await new Promise((resolve, reject) => {
                const timeoutId = window.setTimeout(resolve, 450);
                if (signal) {
                    signal.addEventListener("abort", () => {
                        window.clearTimeout(timeoutId);
                        reject(new RafaelApiError("cancelled"));
                    }, { once: true });
                }
            });
        }

        createSessionId() {
            if (typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }
            const bytes = new Uint8Array(32);
            window.crypto.getRandomValues(bytes);
            return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
        }

        async health(options = {}) {
            await this.wait(options.signal);
            return { data: { status: "ok", service: "rafael-public-api" }, requestId: null };
        }

        async chat(payload, options = {}) {
            await this.wait(options.signal);
            this.sessionId = validSessionId(payload.sessionId, this.config)
                ? payload.sessionId
                : (this.sessionId || this.createSessionId());
            this.turns += 1;
            const normalized = payload.message.trim();
            const lowered = normalized.toLowerCase();
            let reply = "Development mock reply: Rafael's live API was not contacted.";
            if (lowered === "help") {
                reply = "Development mock: try help, version, calculate 2 + 2, or a general question.";
            } else if (lowered === "version") {
                reply = "Development mock: Rafael Public Beta interface v0.2.0.";
            } else {
                const calculation = normalized.match(/^calculate\s+(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/i);
                if (calculation) {
                    const left = Number(calculation[1]);
                    const right = Number(calculation[3]);
                    const operation = calculation[2];
                    const values = {
                        "+": left + right,
                        "-": left - right,
                        "*": left * right,
                        "/": right === 0 ? "undefined" : left / right
                    };
                    reply = `Development mock: ${left} ${operation} ${right} = ${values[operation]}`;
                }
            }
            return {
                reply,
                sessionId: this.sessionId,
                conversationTurns: this.turns,
                requestId: null
            };
        }

        async clearSession(_sessionId, options = {}) {
            await this.wait(options.signal);
            this.sessionId = null;
            this.turns = 0;
            return { cleared: true, requestId: null };
        }

        async feedback(_payload, options = {}) {
            await this.wait(options.signal);
            return { accepted: true, requestId: null };
        }
    }

    function createClient(config, dependencies = {}) {
        const mockEnabled = config.useMockApi || (
            config.allowDevelopmentMockQuery && config.mockModeRequested
        );
        return mockEnabled
            ? new MockRafaelClient(config)
            : new LiveRafaelClient(config, dependencies);
    }

    window.RafaelApi = Object.freeze({
        RafaelApiError,
        createClient,
        createRequestBody,
        createFeedbackBody,
        validSessionId,
        requestReference
    });
})();

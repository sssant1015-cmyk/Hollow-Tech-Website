"use strict";

(() => {
    const publicConfig = window.RAFAEL_PUBLIC_CONFIG;
    const developmentParameters = new URLSearchParams(window.location.search);
    const localDevelopmentHost = ["127.0.0.1", "localhost"].includes(
        window.location.hostname
    );

    function validatePublicConfig(value) {
        if (!value || typeof value !== "object") {
            return { error: "Rafael API configuration is missing.", apiBaseUrl: "" };
        }

        const environment = value.environment;
        if (!["development", "production"].includes(environment)) {
            return { error: "Rafael API environment is invalid.", apiBaseUrl: "" };
        }

        let apiUrl;
        try {
            apiUrl = new URL(value.apiBaseUrl);
        } catch {
            return { error: "Rafael API address is invalid.", apiBaseUrl: "" };
        }

        const loopbackApi = ["127.0.0.1", "localhost", "::1"].includes(apiUrl.hostname);
        const exactOrigin = apiUrl.pathname === "/" && !apiUrl.search && !apiUrl.hash;
        if (!exactOrigin || apiUrl.username || apiUrl.password) {
            return { error: "Rafael API address must be an origin only.", apiBaseUrl: "" };
        }
        if (environment === "production" && (apiUrl.protocol !== "https:" || loopbackApi)) {
            return { error: "Rafael API production configuration is unsafe.", apiBaseUrl: "" };
        }
        if (!loopbackApi && apiUrl.protocol !== "https:") {
            return { error: "Rafael API connections require HTTPS.", apiBaseUrl: "" };
        }

        return { error: null, apiBaseUrl: apiUrl.origin, environment };
    }

    const validated = validatePublicConfig(publicConfig);
    const developmentEnvironment = validated.environment === "development";
    const insecureProductionPage =
        validated.environment === "production" &&
        window.location.protocol !== "https:" &&
        !localDevelopmentHost;

    window.RAFAEL_CONFIG = Object.freeze({
        environment: validated.environment || "invalid",
        configurationError: validated.error || (
            insecureProductionPage
                ? "Rafael production pages require HTTPS."
                : null
        ),
        useMockApi: developmentEnvironment && publicConfig?.useMockApi === true,
        allowDevelopmentMockQuery: developmentEnvironment,
        mockModeRequested:
            developmentEnvironment &&
            localDevelopmentHost &&
            developmentParameters.get("mock") === "1",
        apiBaseUrl: validated.apiBaseUrl,
        requestTimeoutMs: 20000,
        healthRetryDelayMs: 3000,
        healthMaxAttempts: 3,
        maxRetryAfterSeconds: 60,
        maxMessageLength: 2048,
        maxFeedbackLength: 2000,
        maxFeedbackContactLength: 254,
        minSessionIdLength: 32,
        maxSessionIdLength: 64,
        duplicateWindowMs: 1800,
        developmentLogging: false,
        sessionStorageKey: "rafael_public_beta_session"
    });
})();

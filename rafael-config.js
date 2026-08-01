"use strict";

(() => {
    const developmentParameters = new URLSearchParams(window.location.search);
    const localDevelopmentHost = ["127.0.0.1", "localhost"].includes(
        window.location.hostname
    );

    window.RAFAEL_CONFIG = Object.freeze({
        useMockApi: false,
        allowDevelopmentMockQuery: true,
        mockModeRequested:
            localDevelopmentHost && developmentParameters.get("mock") === "1",
        apiBaseUrl: "http://127.0.0.1:8000",
        requestTimeoutMs: 20000,
        healthRetryDelayMs: 5000,
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

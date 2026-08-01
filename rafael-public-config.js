"use strict";

// Local-development defaults only. The production build replaces this file
// with values supplied through RAFAEL_API_BASE_URL.
window.RAFAEL_PUBLIC_CONFIG = Object.freeze({
    environment: "development",
    apiBaseUrl: "http://127.0.0.1:8000",
    useMockApi: false
});

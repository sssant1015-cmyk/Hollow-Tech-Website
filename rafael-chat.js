"use strict";

const RAFAEL_CONFIG = Object.freeze({
    useMockApi: true,
    apiBaseUrl: "",
    maxMessageLength: 2048,
    maxFeedbackLength: 2000,
    maxFeedbackContactLength: 254,
    uiTimeoutMs: 650,
    duplicateWindowMs: 1800,
    sessionStorageKey: "rafael_public_beta_session"
});

const WELCOME_MESSAGE =
    "Welcome. I'm Rafael, Hollow Tech's intelligent assistant. " +
    "This public beta supports general questions, calculations, help, " +
    "and version information.";

const PUBLIC_STATE_MESSAGES = Object.freeze({
    network:
        "Rafael could not connect right now. Please check your connection and try again.",
    "rate-limit":
        "This beta is receiving many requests. Please wait a moment and try again.",
    provider:
        "Rafael is temporarily unavailable. Please try again shortly.",
    "session-expired":
        "Your temporary session has expired. Clear the chat to begin a new session.",
    "invalid-input":
        "That message could not be accepted. Review it and try again."
});

function isValidTemporarySessionId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(value);
}

function createDevelopmentSessionId() {
    if (!window.crypto) {
        throw new Error("Secure session generation is unavailable.");
    }

    if (typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readTemporarySessionId() {
    try {
        const storedSessionId = window.sessionStorage.getItem(
            RAFAEL_CONFIG.sessionStorageKey
        );

        return isValidTemporarySessionId(storedSessionId)
            ? storedSessionId
            : null;
    } catch {
        return null;
    }
}

function writeTemporarySessionId(sessionId) {
    try {
        window.sessionStorage.setItem(
            RAFAEL_CONFIG.sessionStorageKey,
            sessionId
        );
    } catch {
        return false;
    }

    return true;
}

function clearTemporarySessionId() {
    try {
        window.sessionStorage.removeItem(RAFAEL_CONFIG.sessionStorageKey);
    } catch {
        return false;
    }

    return true;
}

function getOrCreateTemporarySessionId() {
    const existingSessionId = readTemporarySessionId();

    if (existingSessionId) {
        return existingSessionId;
    }

    const newSessionId = createDevelopmentSessionId();
    writeTemporarySessionId(newSessionId);
    return newSessionId;
}

function formatSessionId(sessionId) {
    if (!sessionId) {
        return "Temporary session unavailable";
    }

    return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function delay(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function calculateMockExpression(message) {
    const match = message.match(
        /^calculate\s+(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/i
    );

    if (!match) {
        return null;
    }

    const left = Number(match[1]);
    const operator = match[2];
    const right = Number(match[3]);

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
        return "I couldn't read that calculation. Try something like: calculate 2 + 2.";
    }

    if (operator === "/" && right === 0) {
        return "Division by zero is undefined. Try a different calculation.";
    }

    let result;

    switch (operator) {
        case "+":
            result = left + right;
            break;
        case "-":
            result = left - right;
            break;
        case "*":
            result = left * right;
            break;
        case "/":
            result = left / right;
            break;
        default:
            return null;
    }

    return `${left} ${operator} ${right} = ${result}`;
}

// DEVELOPMENT ONLY: replace this isolated mock in the API-connection phase.
async function getDevelopmentMockReply(message) {
    await delay(RAFAEL_CONFIG.uiTimeoutMs);

    const normalizedMessage = message.trim();
    const lowerMessage = normalizedMessage.toLowerCase();

    if (lowerMessage === "help") {
        return (
            "Available public-beta commands:\n" +
            "• help — show this guide\n" +
            "• version — show beta version information\n" +
            "• calculate 2 + 2 — try a simple calculation\n" +
            "• ask a general question — receive a development reply"
        );
    }

    if (lowerMessage === "version") {
        return "Rafael Public Beta interface v0.1.0 — development mock mode.";
    }

    if (lowerMessage.startsWith("calculate")) {
        return (
            calculateMockExpression(normalizedMessage) ||
            "For this mock, use two numbers and one operator. Example: calculate 2 + 2."
        );
    }

    return (
        "Development reply: I received your message. The public-beta interface is " +
        "working locally, but Rafael's live API is not connected yet."
    );
}

function initializeRafaelBeta() {
    const chatForm = document.getElementById("chat-form");
    const chatLog = document.getElementById("chat-log");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-message");
    const clearButton = document.getElementById("clear-chat");
    const characterCounter = document.getElementById("character-counter");
    const typingIndicator = document.getElementById("typing-indicator");
    const chatError = document.getElementById("chat-error");
    const connectionStatus = document.getElementById("connection-status");
    const connectionStatusText = document.getElementById("connection-status-text");
    const sessionDisplay = document.getElementById("session-display");
    const commandButtons = document.querySelectorAll("[data-prompt]");
    const feedbackForm = document.getElementById("feedback-form");
    const feedbackCategory = document.getElementById("feedback-category");
    const feedbackMessage = document.getElementById("feedback-message");
    const feedbackCounter = document.getElementById("feedback-counter");
    const feedbackRating = document.getElementById("feedback-rating");
    const contactPermission = document.getElementById("contact-permission");
    const feedbackContactGroup = document.getElementById("feedback-contact-group");
    const feedbackContact = document.getElementById("feedback-contact");
    const feedbackSubmit = document.getElementById("feedback-submit");
    const feedbackStatus = document.getElementById("feedback-status");
    const currentYear = document.getElementById("current-year");
    const devTools = document.getElementById("dev-tools");

    const requiredElements = [
        chatForm,
        chatLog,
        messageInput,
        sendButton,
        clearButton,
        characterCounter,
        typingIndicator,
        chatError,
        connectionStatus,
        connectionStatusText,
        sessionDisplay,
        feedbackForm,
        feedbackCategory,
        feedbackMessage,
        feedbackCounter,
        feedbackRating,
        contactPermission,
        feedbackContactGroup,
        feedbackContact,
        feedbackSubmit,
        feedbackStatus
    ];

    if (requiredElements.some((element) => !element)) {
        console.error("Rafael beta interface could not initialize.");
        return;
    }

    let isPending = true;
    let lastSubmittedMessage = "";
    let lastSubmittedAt = 0;
    let temporarySessionId = null;

    function setConnectionState(state, label) {
        connectionStatus.dataset.state = state;
        connectionStatusText.textContent = label;
    }

    function setPending(pending) {
        isPending = pending;
        sendButton.disabled = pending;
        clearButton.disabled = pending;
        commandButtons.forEach((button) => {
            button.disabled = pending;
        });
    }

    function showChatError(message) {
        chatError.textContent = message;
        chatError.hidden = false;
        messageInput.setAttribute("aria-invalid", "true");
    }

    function clearChatError() {
        chatError.textContent = "";
        chatError.hidden = true;
        messageInput.removeAttribute("aria-invalid");
    }

    function appendMessage(author, message) {
        const messageElement = document.createElement("article");
        const authorElement = document.createElement("span");
        const textElement = document.createElement("p");
        const isUser = author === "You";

        messageElement.classList.add(
            "message",
            isUser ? "message-user" : "message-rafael"
        );
        messageElement.setAttribute("aria-label", `Message from ${author}`);
        authorElement.className = "message-author";
        authorElement.textContent = author;
        textElement.textContent = message;

        messageElement.append(authorElement, textElement);
        chatLog.append(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    function resetConversation() {
        chatLog.replaceChildren();
        appendMessage("Rafael", WELCOME_MESSAGE);
    }

    function updateMessageCounter() {
        const length = messageInput.value.length;
        characterCounter.textContent = `${length} / ${RAFAEL_CONFIG.maxMessageLength}`;

        if (length >= RAFAEL_CONFIG.maxMessageLength) {
            characterCounter.dataset.limit = "reached";
        } else if (length >= RAFAEL_CONFIG.maxMessageLength * 0.9) {
            characterCounter.dataset.limit = "near";
        } else {
            delete characterCounter.dataset.limit;
        }
    }

    function updateSessionDisplay() {
        sessionDisplay.textContent = formatSessionId(temporarySessionId);
        sessionDisplay.title = temporarySessionId || "Temporary session unavailable";
    }

    function startNewTemporarySession() {
        clearTemporarySessionId();

        try {
            temporarySessionId = getOrCreateTemporarySessionId();
            updateSessionDisplay();
            return true;
        } catch {
            temporarySessionId = null;
            updateSessionDisplay();
            showChatError(
                "A secure temporary session could not be created in this browser."
            );
            setConnectionState("error", "Session unavailable");
            return false;
        }
    }

    function validateMessage() {
        const normalizedMessage = messageInput.value.trim();

        if (!normalizedMessage) {
            showChatError("Enter a message before sending.");
            setConnectionState("error", "Invalid input");
            return null;
        }

        if (normalizedMessage.length > RAFAEL_CONFIG.maxMessageLength) {
            showChatError(
                `Messages must be ${RAFAEL_CONFIG.maxMessageLength} characters or fewer.`
            );
            setConnectionState("error", "Invalid input");
            return null;
        }

        const now = Date.now();
        const isRecentDuplicate =
            normalizedMessage === lastSubmittedMessage &&
            now - lastSubmittedAt < RAFAEL_CONFIG.duplicateWindowMs;

        if (isRecentDuplicate) {
            showChatError("That message was just sent. Please wait before trying again.");
            setConnectionState("error", "Duplicate blocked");
            return null;
        }

        return normalizedMessage;
    }

    async function submitMessage() {
        if (isPending) {
            return;
        }

        clearChatError();
        const message = validateMessage();

        if (!message) {
            messageInput.focus();
            return;
        }

        lastSubmittedMessage = message;
        lastSubmittedAt = Date.now();
        setPending(true);
        setConnectionState("sending", "Sending");
        appendMessage("You", message);
        messageInput.value = "";
        updateMessageCounter();
        typingIndicator.hidden = false;

        try {
            const reply = await getDevelopmentMockReply(message);
            appendMessage("Rafael", reply);
            setConnectionState("ready", "Ready — mock mode");
        } catch {
            showChatError(PUBLIC_STATE_MESSAGES.network);
            setConnectionState("error", "Connection problem");
        } finally {
            typingIndicator.hidden = true;
            setPending(false);
            messageInput.focus();
        }
    }

    function clearConversation() {
        if (isPending) {
            return;
        }

        resetConversation();
        messageInput.value = "";
        updateMessageCounter();
        clearChatError();
        lastSubmittedMessage = "";
        lastSubmittedAt = 0;

        if (startNewTemporarySession()) {
            setConnectionState("ready", "Ready — new session");
        }

        messageInput.focus();
    }

    function setFeedbackStatus(message, status) {
        feedbackStatus.textContent = message;

        if (status) {
            feedbackStatus.dataset.status = status;
        } else {
            delete feedbackStatus.dataset.status;
        }
    }

    function clearFeedbackValidation() {
        [feedbackCategory, feedbackMessage, feedbackContact].forEach((field) => {
            field.removeAttribute("aria-invalid");
        });
        setFeedbackStatus("", "");
    }

    function updateFeedbackCounter() {
        feedbackCounter.textContent =
            `${feedbackMessage.value.length} / ${RAFAEL_CONFIG.maxFeedbackLength}`;
    }

    function updateContactPermission() {
        const permissionGranted = contactPermission.checked;
        feedbackContactGroup.hidden = !permissionGranted;
        feedbackContact.disabled = !permissionGranted;

        if (!permissionGranted) {
            feedbackContact.value = "";
            feedbackContact.removeAttribute("aria-invalid");
        }
    }

    function validateFeedback() {
        clearFeedbackValidation();
        const normalizedFeedback = feedbackMessage.value.trim();

        if (!feedbackCategory.value) {
            feedbackCategory.setAttribute("aria-invalid", "true");
            setFeedbackStatus("Choose a feedback category.", "error");
            feedbackCategory.focus();
            return false;
        }

        if (!normalizedFeedback) {
            feedbackMessage.setAttribute("aria-invalid", "true");
            setFeedbackStatus("Enter a feedback message.", "error");
            feedbackMessage.focus();
            return false;
        }

        if (normalizedFeedback.length > RAFAEL_CONFIG.maxFeedbackLength) {
            feedbackMessage.setAttribute("aria-invalid", "true");
            setFeedbackStatus(
                `Feedback must be ${RAFAEL_CONFIG.maxFeedbackLength} characters or fewer.`,
                "error"
            );
            feedbackMessage.focus();
            return false;
        }

        if (
            contactPermission.checked &&
            feedbackContact.value.trim().length >
                RAFAEL_CONFIG.maxFeedbackContactLength
        ) {
            feedbackContact.setAttribute("aria-invalid", "true");
            setFeedbackStatus("The contact detail is too long.", "error");
            feedbackContact.focus();
            return false;
        }

        return true;
    }

    async function submitDevelopmentFeedback() {
        if (!validateFeedback()) {
            return;
        }

        feedbackSubmit.disabled = true;
        setFeedbackStatus("Validating feedback locally…", "");
        await delay(RAFAEL_CONFIG.uiTimeoutMs);

        // DEVELOPMENT ONLY: no feedback is transmitted or persisted in this phase.
        feedbackForm.reset();
        updateContactPermission();
        updateFeedbackCounter();
        feedbackSubmit.disabled = false;
        setFeedbackStatus(
            "Thank you. This preview validated your feedback locally; nothing was sent or stored.",
            "success"
        );
    }

    function simulatePublicState(state) {
        if (state === "ready") {
            clearChatError();
            setConnectionState("ready", "Ready — mock mode");
            return true;
        }

        const message = PUBLIC_STATE_MESSAGES[state];

        if (!message) {
            return false;
        }

        showChatError(message);
        setConnectionState("error", state.replace("-", " "));

        if (state === "session-expired") {
            clearTemporarySessionId();
            temporarySessionId = null;
            updateSessionDisplay();
        }

        return true;
    }

    chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitMessage();
    });

    messageInput.addEventListener("input", () => {
        updateMessageCounter();

        if (!messageInput.value.trim()) {
            clearChatError();
        }
    });

    messageInput.addEventListener("keydown", (event) => {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing
        ) {
            event.preventDefault();
            chatForm.requestSubmit();
        }
    });

    clearButton.addEventListener("click", clearConversation);

    commandButtons.forEach((button) => {
        button.addEventListener("click", () => {
            messageInput.value = button.dataset.prompt || "";
            updateMessageCounter();
            clearChatError();
            messageInput.focus();
        });
    });

    feedbackMessage.addEventListener("input", updateFeedbackCounter);
    contactPermission.addEventListener("change", updateContactPermission);

    feedbackForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitDevelopmentFeedback();
    });

    if (currentYear) {
        currentYear.textContent = String(new Date().getFullYear());
    }

    resetConversation();
    updateMessageCounter();
    updateFeedbackCounter();
    updateContactPermission();

    try {
        temporarySessionId = getOrCreateTemporarySessionId();
        updateSessionDisplay();
    } catch {
        temporarySessionId = null;
        updateSessionDisplay();
        showChatError(
            "A secure temporary session could not be created in this browser."
        );
        setConnectionState("error", "Session unavailable");
    }

    const developmentModeEnabled =
        new URLSearchParams(window.location.search).get("dev") === "1";

    if (developmentModeEnabled && devTools) {
        devTools.hidden = false;
        devTools.querySelectorAll("[data-mock-state]").forEach((button) => {
            button.addEventListener("click", () => {
                simulatePublicState(button.dataset.mockState || "ready");
            });
        });
    }

    window.RafaelDevelopment = Object.freeze({
        config: RAFAEL_CONFIG,
        simulateState: simulatePublicState
    });

    window.setTimeout(() => {
        if (temporarySessionId) {
            setConnectionState("ready", "Ready — mock mode");
        }
        setPending(false);
    }, 350);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeRafaelBeta);
} else {
    initializeRafaelBeta();
}

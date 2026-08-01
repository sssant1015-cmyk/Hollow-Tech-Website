"use strict";

(() => {
    const WELCOME_MESSAGE =
        "Welcome. I'm Rafael, Hollow Tech's intelligent assistant. " +
        "This public beta supports general questions, calculations, help, " +
        "and version information.";

    function initializeRafaelBeta() {
        const config = window.RAFAEL_CONFIG;
        const apiFactory = window.RafaelApi;

        if (!config || !apiFactory) {
            console.error("Rafael's public interface could not initialize.");
            return;
        }

        const apiClient = apiFactory.createClient(config);
        const mockModeEnabled = config.useMockApi || (
            config.allowDevelopmentMockQuery && config.mockModeRequested
        );
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
        const commandTitle = document.getElementById("commands-title");
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
            console.error("Rafael's public interface is missing a required element.");
            return;
        }

        let temporarySessionId = readTemporarySessionId();
        let lastSubmittedMessage = "";
        let lastSubmittedAt = 0;
        let chatPending = false;
        let clearPending = false;
        let feedbackPending = false;
        let healthChecking = true;
        let healthAvailable = false;
        let activeChatController = null;
        let conversationEpoch = 0;
        let rateLimitUntil = 0;
        let rateLimitTimer = null;

        function readTemporarySessionId() {
            try {
                const stored = window.sessionStorage.getItem(config.sessionStorageKey);
                if (apiFactory.validSessionId(stored, config)) {
                    return stored;
                }
                window.sessionStorage.removeItem(config.sessionStorageKey);
            } catch {
                return null;
            }
            return null;
        }

        function saveTemporarySessionId(sessionId) {
            if (!apiFactory.validSessionId(sessionId, config)) {
                return false;
            }
            try {
                window.sessionStorage.setItem(config.sessionStorageKey, sessionId);
                temporarySessionId = sessionId;
                updateSessionDisplay();
                return true;
            } catch {
                return false;
            }
        }

        function removeTemporarySessionId() {
            try {
                window.sessionStorage.removeItem(config.sessionStorageKey);
            } catch {
                // The in-memory reference is still discarded if storage is unavailable.
            }
            temporarySessionId = null;
            updateSessionDisplay();
        }

        function updateSessionDisplay() {
            if (!temporarySessionId) {
                sessionDisplay.textContent = "No server session yet";
                sessionDisplay.removeAttribute("title");
                return;
            }
            sessionDisplay.textContent =
                `${temporarySessionId.slice(0, 8)}…${temporarySessionId.slice(-4)}`;
            sessionDisplay.title = "Temporary server session active";
        }

        function setConnectionState(state, label) {
            connectionStatus.dataset.state = state;
            connectionStatusText.textContent = label;
        }

        function updateChatControls() {
            const rateLimited = Date.now() < rateLimitUntil;
            sendButton.disabled = chatPending || healthChecking || rateLimited;
            clearButton.disabled = clearPending;
            commandButtons.forEach((button) => {
                button.disabled = chatPending || healthChecking || rateLimited;
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

        function messageWithReference(error) {
            const reference = apiFactory.requestReference(error.requestId);
            return reference
                ? `${error.message} Reference: ${reference}.`
                : error.message;
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
            return messageElement;
        }

        function resetConversation() {
            chatLog.replaceChildren();
            appendMessage("Rafael", WELCOME_MESSAGE);
        }

        function updateMessageCounter() {
            const length = messageInput.value.length;
            characterCounter.textContent = `${length} / ${config.maxMessageLength}`;
            if (length >= config.maxMessageLength) {
                characterCounter.dataset.limit = "reached";
            } else if (length >= config.maxMessageLength * 0.9) {
                characterCounter.dataset.limit = "near";
            } else {
                delete characterCounter.dataset.limit;
            }
        }

        function updateFeedbackCounter() {
            feedbackCounter.textContent =
                `${feedbackMessage.value.length} / ${config.maxFeedbackLength}`;
        }

        function validateMessage() {
            const normalizedMessage = messageInput.value.trim();
            if (!normalizedMessage) {
                showChatError("Enter a message before sending.");
                setConnectionState("error", "Invalid input");
                return null;
            }
            if (normalizedMessage.length > config.maxMessageLength) {
                showChatError(
                    `Messages must be ${config.maxMessageLength} characters or fewer.`
                );
                setConnectionState("error", "Invalid input");
                return null;
            }

            const now = Date.now();
            if (
                normalizedMessage === lastSubmittedMessage &&
                now - lastSubmittedAt < config.duplicateWindowMs
            ) {
                showChatError("That message was just sent. Please wait before trying again.");
                setConnectionState("error", "Duplicate blocked");
                return null;
            }
            return normalizedMessage;
        }

        function beginRateLimit(seconds) {
            const waitSeconds = Math.max(1, Math.min(
                seconds || 1,
                config.maxRetryAfterSeconds
            ));
            rateLimitUntil = Date.now() + waitSeconds * 1000;
            window.clearTimeout(rateLimitTimer);
            setConnectionState("error", `Wait ${waitSeconds}s before retrying`);
            updateChatControls();
            rateLimitTimer = window.setTimeout(() => {
                rateLimitUntil = 0;
                setConnectionState(
                    healthAvailable ? "ready" : "error",
                    healthAvailable
                        ? (mockModeEnabled ? "Ready — mock mode" : "Ready")
                        : "Rafael unavailable"
                );
                updateChatControls();
            }, waitSeconds * 1000);
        }

        function handleApiError(error) {
            if (!(error instanceof apiFactory.RafaelApiError)) {
                showChatError("Rafael could not complete that request. Please try again.");
                setConnectionState("error", "Request failed");
                return;
            }
            if (error.kind === "session") {
                removeTemporarySessionId();
            }
            if (error.kind === "rateLimit") {
                beginRateLimit(error.retryAfterSeconds);
            } else if (error.kind === "timeout") {
                setConnectionState("error", "Request timed out");
            } else if (error.kind === "network") {
                setConnectionState("error", "Connection problem");
            } else if (error.kind === "session") {
                setConnectionState("error", "Session expired");
            } else {
                setConnectionState("error", "Rafael unavailable");
            }
            showChatError(messageWithReference(error));
        }

        async function submitMessage() {
            if (chatPending || Date.now() < rateLimitUntil) {
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
            const requestEpoch = conversationEpoch;
            const controller = new AbortController();
            activeChatController = controller;
            chatPending = true;
            updateChatControls();
            setConnectionState("sending", "Sending");
            const userMessageElement = appendMessage("You", message);
            messageInput.value = "";
            updateMessageCounter();
            typingIndicator.hidden = false;

            try {
                const result = await apiClient.chat({
                    sessionId: temporarySessionId,
                    message
                }, { signal: controller.signal });
                if (requestEpoch !== conversationEpoch || controller.signal.aborted) {
                    return;
                }
                if (!saveTemporarySessionId(result.sessionId)) {
                    throw new apiFactory.RafaelApiError("malformed", {
                        requestId: result.requestId
                    });
                }
                appendMessage("Rafael", result.reply);
                healthAvailable = true;
                const modeLabel = mockModeEnabled ? "Mock" : "Ready";
                setConnectionState(
                    "ready",
                    `${modeLabel} · ${result.conversationTurns} ${result.conversationTurns === 1 ? "turn" : "turns"}`
                );
            } catch (error) {
                if (
                    error instanceof apiFactory.RafaelApiError &&
                    error.kind === "cancelled"
                ) {
                    return;
                }
                if (requestEpoch !== conversationEpoch) {
                    return;
                }
                userMessageElement.remove();
                if (!messageInput.value) {
                    messageInput.value = message;
                    updateMessageCounter();
                }
                lastSubmittedMessage = "";
                lastSubmittedAt = 0;
                handleApiError(error);
            } finally {
                if (activeChatController === controller) {
                    activeChatController = null;
                    chatPending = false;
                    typingIndicator.hidden = true;
                    updateChatControls();
                    messageInput.focus();
                }
            }
        }

        async function clearConversation() {
            if (clearPending) {
                return;
            }

            clearPending = true;
            conversationEpoch += 1;
            if (activeChatController) {
                activeChatController.abort();
                activeChatController = null;
            }
            chatPending = false;
            typingIndicator.hidden = true;
            const sessionToClear = temporarySessionId;
            removeTemporarySessionId();
            resetConversation();
            messageInput.value = "";
            updateMessageCounter();
            clearChatError();
            lastSubmittedMessage = "";
            lastSubmittedAt = 0;
            setConnectionState("connecting", "Clearing session");
            updateChatControls();

            try {
                if (sessionToClear) {
                    await apiClient.clearSession(sessionToClear);
                }
                setConnectionState(
                    healthAvailable ? "ready" : "error",
                    healthAvailable
                        ? (mockModeEnabled ? "Ready — mock mode" : "Ready — new session")
                        : "Chat cleared locally"
                );
            } catch (error) {
                const reference = error instanceof apiFactory.RafaelApiError
                    ? apiFactory.requestReference(error.requestId)
                    : null;
                showChatError(
                    "Chat cleared locally, but Rafael could not confirm the server reset." +
                    (reference ? ` Reference: ${reference}.` : "")
                );
                setConnectionState("error", "Chat cleared locally");
            } finally {
                clearPending = false;
                updateChatControls();
                messageInput.focus();
            }
        }

        function clearFeedbackValidation() {
            [feedbackCategory, feedbackMessage, feedbackContact].forEach((field) => {
                field.removeAttribute("aria-invalid");
            });
            setFeedbackStatus("", "");
        }

        function setFeedbackStatus(message, status) {
            feedbackStatus.textContent = message;
            if (status) {
                feedbackStatus.dataset.status = status;
            } else {
                delete feedbackStatus.dataset.status;
            }
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
            if (normalizedFeedback.length > config.maxFeedbackLength) {
                feedbackMessage.setAttribute("aria-invalid", "true");
                setFeedbackStatus(
                    `Feedback must be ${config.maxFeedbackLength} characters or fewer.`,
                    "error"
                );
                feedbackMessage.focus();
                return false;
            }
            if (
                contactPermission.checked &&
                feedbackContact.value.trim().length > config.maxFeedbackContactLength
            ) {
                feedbackContact.setAttribute("aria-invalid", "true");
                setFeedbackStatus("The contact detail is too long.", "error");
                feedbackContact.focus();
                return false;
            }
            return true;
        }

        async function submitFeedback() {
            if (feedbackPending || !validateFeedback()) {
                return;
            }
            feedbackPending = true;
            feedbackSubmit.disabled = true;
            setFeedbackStatus("Sending feedback…", "");
            const ratingValue = feedbackRating.value
                ? Number(feedbackRating.value)
                : null;
            try {
                await apiClient.feedback({
                    sessionId: temporarySessionId,
                    category: feedbackCategory.value,
                    message: feedbackMessage.value.trim(),
                    rating: ratingValue,
                    contactPermission: contactPermission.checked,
                    contact: contactPermission.checked
                        ? feedbackContact.value.trim()
                        : null
                });
                feedbackForm.reset();
                updateContactPermission();
                updateFeedbackCounter();
                setFeedbackStatus("Thank you. Your feedback was received.", "success");
            } catch (error) {
                if (
                    error instanceof apiFactory.RafaelApiError &&
                    error.kind === "session"
                ) {
                    removeTemporarySessionId();
                }
                const safeMessage = error instanceof apiFactory.RafaelApiError
                    ? messageWithReference(error)
                    : "Feedback could not be sent. Please try again.";
                setFeedbackStatus(safeMessage, "error");
            } finally {
                feedbackPending = false;
                feedbackSubmit.disabled = false;
            }
        }

        async function checkHealth(allowRetry = true) {
            if (chatPending || clearPending) {
                return;
            }
            healthChecking = true;
            setConnectionState("connecting", "Connecting");
            updateChatControls();
            try {
                await apiClient.health();
                healthAvailable = true;
                setConnectionState(
                    "ready",
                    mockModeEnabled ? "Ready — mock mode" : "Ready"
                );
            } catch {
                healthAvailable = false;
                setConnectionState("error", "Rafael unavailable");
                if (allowRetry) {
                    window.setTimeout(() => {
                        void checkHealth(false);
                    }, config.healthRetryDelayMs);
                }
            } finally {
                healthChecking = false;
                updateChatControls();
            }
        }

        function simulatePublicState(state) {
            const stateMessages = {
                network: "Rafael could not be reached. Check your connection and try again.",
                "rate-limit": "Rafael is receiving many requests. Please wait before trying again.",
                provider: "Rafael is temporarily unavailable. Please try again shortly.",
                "session-expired": "Your temporary session is no longer available. Please try again."
            };
            if (state === "ready") {
                clearChatError();
                setConnectionState("ready", mockModeEnabled ? "Ready — mock mode" : "Ready");
                return;
            }
            if (stateMessages[state]) {
                showChatError(stateMessages[state]);
                setConnectionState("error", state.replace("-", " "));
            }
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
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                chatForm.requestSubmit();
            }
        });
        clearButton.addEventListener("click", () => {
            void clearConversation();
        });
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
            void submitFeedback();
        });

        if (currentYear) {
            currentYear.textContent = String(new Date().getFullYear());
        }
        if (mockModeEnabled && commandTitle) {
            commandTitle.textContent = "Explore the development mock";
        }

        resetConversation();
        updateSessionDisplay();
        updateMessageCounter();
        updateFeedbackCounter();
        updateContactPermission();
        updateChatControls();

        const developmentModeEnabled =
            new URLSearchParams(window.location.search).get("dev") === "1";
        if (developmentModeEnabled && devTools) {
            devTools.hidden = false;
            devTools.querySelectorAll("[data-mock-state]").forEach((button) => {
                button.addEventListener("click", () => {
                    simulatePublicState(button.dataset.mockState || "ready");
                });
            });
            window.RafaelDevelopment = Object.freeze({
                config,
                mockModeEnabled,
                simulateState: simulatePublicState
            });
        }

        void checkHealth();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeRafaelBeta);
    } else {
        initializeRafaelBeta();
    }
})();

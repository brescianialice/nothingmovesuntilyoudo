/**
 * NOTHING MOVES UNTIL YOU DO — CONTROLLER JS
 * Core Mechanics:
 * - Direct gesture parsing for 3 AM tired swiping (swipe up to scroll)
 * - Touch ripple renderer for subtle visual feedback
 * - MQTT publisher utilizing WebSockets
 */

(function () {
    // Configuration
    const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
    const BASE_TOPIC = "nothingmoves/room/";

    // State variables
    let client = null;
    let roomCode = "";
    let isConnected = false;
    let scrollCount = 0;

    // Poetic B&W Italian whispers matching 'Senza titolo 5'
    const POETIC_PHRASES = [
        "all'impero del sonno preferisco l'impero del male",
        "questo mondo si è addormentato",
        "E magari le sue armonie non riesce a svilupparle perché è stanca, magari, perché è delusa dalla vita o dalla giornata",
        "ora sei solo te",
        "non c'è più niente da cercare",
        "hai consumato la tua giornata",
        "sei rimasto solo tu nella stanza",
        "il sonno è l'unica cosa vera",
        "non ti stanchi mai di guardare?",
        "lascia andare lo schermo",
        "è solo un altro riflesso",
        "chiudi gli occhi, il mondo continuerà a girare",
        "sei sveglio o stai solo aspettando?",
        "il buio fuori ha lo stesso rumore",
        "lo schermo si spegne, la stanza resta",
        "hai dato abbastanza a questo giorno",
        "un'altra ora consumata nel vuoto",
        "nessuno ti sta cercando a quest'ora",
        "il silenzio fa troppo rumore",
        "domani sarà uguale se non dormi",
        "scorrere non riempie il vuoto"
    ];
    let poeticInterval = null;
    let currentPoeticEl = null;

    // Gesture tracking variables
    let touchStartY = 0;
    let touchStartX = 0;
    const SWIPE_THRESHOLD = 60; // Min pixels to trigger scroll

    // UI elements
    const canvas = document.getElementById("touch-canvas");
    const rippleContainer = document.getElementById("ripple-container");
    const activePanel = document.getElementById("active-panel");
    const roomInputContainer = document.getElementById("room-input-container");
    const roomInput = document.getElementById("room-input");
    const connectBtn = document.getElementById("connect-btn");

    const roomTag = document.getElementById("room-tag");
    const connDot = document.getElementById("conn-dot");
    const swipeCounterLabel = document.getElementById("swipe-counter");
    const instructionLabel = document.getElementById("instruction-label");

    // 1. Initial Room Parsing from URL
    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get("room");

        if (urlRoom) {
            roomCode = urlRoom.trim().toLowerCase();
            roomInputContainer.classList.add("hidden");
            activePanel.classList.remove("hidden");
            connectMQTT();
        } else {
            // No room parameter, display entry form
            roomInputContainer.classList.remove("hidden");
            activePanel.classList.add("hidden");

            // Focus input for quick typing
            setTimeout(() => roomInput.focus(), 300);
        }

        setupTouchEvents();
    }

    // Connect Button listener
    connectBtn.addEventListener("click", () => {
        const val = roomInput.value.trim().toLowerCase();
        if (val) {
            roomCode = val;
            roomInputContainer.classList.add("hidden");
            activePanel.classList.remove("hidden");

            // Add room code to URL for easy refreshes
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?room=" + roomCode;
            window.history.pushState({ path: newUrl }, "", newUrl);

            connectMQTT();
        }
    });

    // Handle Enter key on input
    roomInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            connectBtn.click();
        }
    });

    // 2. Connect to MQTT Broker
    function connectMQTT() {
        roomTag.textContent = roomCode;

        console.log(`Connecting to MQTT broker at ${BROKER_URL}...`);

        // Generate a random client ID to avoid duplicates
        const clientId = "nm_ctrl_" + Math.random().toString(16).substring(2, 8);

        client = mqtt.connect(BROKER_URL, {
            clientId: clientId,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 2000
        });

        client.on("connect", () => {
            console.log("MQTT Connected!");
            isConnected = true;
            connDot.className = "conn-dot connected";

            // Publish pairing success notification to close the projection pairing overlay automatically!
            const topic = BASE_TOPIC + roomCode + "/control";
            client.publish(topic, JSON.stringify({ action: "pair_success", timestamp: Date.now() }));

            // Alert user briefly
            instructionLabel.textContent = "connected. swipe up";
            setTimeout(() => {
                if (instructionLabel.textContent === "connected. swipe up") {
                    instructionLabel.textContent = "swipe up to scroll";
                }
            }, 2000);

            // Launch poetic whispers B&W overlay loop on paired controller
            startPoeticWhispers();
        });

        client.on("close", () => {
            console.warn("MQTT Disconnected.");
            isConnected = false;
            connDot.className = "conn-dot disconnected";
        });

        client.on("error", (err) => {
            console.error("MQTT Error: ", err);
        });
    }

    // 3. Touch Gesture Handling
    function setupTouchEvents() {
        // Touch Start
        canvas.addEventListener("touchstart", (e) => {
            if (!isConnected || scrollCount >= 26) return;
            const touch = e.touches[0];
            touchStartY = touch.clientY;
            touchStartX = touch.clientX;

            // Create a gorgeous ripple at touch coordinates
            createRipple(touch.clientX, touch.clientY);
        }, { passive: true });

        // Touch Move (optional trail effects)
        canvas.addEventListener("touchmove", (e) => {
            // Prevent scrolling on mobile device browser viewport
            if (e.cancelable) e.preventDefault();
        }, { passive: false });

        // Touch End
        canvas.addEventListener("touchend", (e) => {
            if (!isConnected || scrollCount >= 26) return;

            const touch = e.changedTouches[0];
            const deltaY = touch.clientY - touchStartY;
            const deltaX = touch.clientX - touchStartX;

            // Perform direction validation (mainly vertical scrolling)
            if (Math.abs(deltaY) > SWIPE_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
                if (deltaY < 0) {
                    // Swipe UP (scrolls the feed DOWN / advances to next card)
                    handleSwipe("up");
                } else {
                    // Swipe DOWN (optional scroll backwards)
                    handleSwipe("down");
                }
            }
        }, { passive: true });
    }

    // 4. Send command to Projection
    function handleSwipe(direction) {
        if (!isConnected || !client || scrollCount >= 26) return;

        scrollCount++;
        swipeCounterLabel.textContent = `SCROLLS: ${scrollCount}`;

        // Check if we just reached the lock screen (scrollCount 26)
        if (scrollCount >= 26) {
            canvas.classList.add("final-state");
            instructionLabel.textContent = "nothing moves until you do";

            // Clean up poetic whispers loop
            if (poeticInterval) {
                clearInterval(poeticInterval);
                poeticInterval = null;
            }
            if (currentPoeticEl) {
                currentPoeticEl.remove();
                currentPoeticEl = null;
            }
            // Redirect back to pairing form without query parameter after 10 seconds
            setTimeout(() => {
                window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname;
            }, 10000);
        } else {
            // Dynamic messaging matching scroll fatigue
            if (scrollCount > 10 && scrollCount <= 20) {
                instructionLabel.textContent = "keep scrolling...";
            } else if (scrollCount > 20 && scrollCount <= 25) {
                instructionLabel.style.opacity = "0.5";
                instructionLabel.textContent = "tired yet?";
            }
        }

        // Haptic feedback micro-trigger (iOS/Android compatible where vibrating is unblocked)
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }

        const payload = JSON.stringify({
            action: "scroll",
            direction: direction,
            scrollIndex: scrollCount,
            timestamp: Date.now()
        });

        const topic = BASE_TOPIC + roomCode + "/control";
        console.log(`Publishing: ${topic} -> ${payload}`);

        client.publish(topic, payload, { qos: 1 }, (err) => {
            if (err) console.error("Publish failed:", err);
        });

        // Trigger flash element micro-animation
        triggerFlash();

        // 20% chance to dynamically trigger/refresh a poetic whisper on swipe
        if (scrollCount < 29 && Math.random() < 0.20) {
            setTimeout(() => {
                showPoeticPhrase();
            }, 600);
        }
    }

    // 5. Visual Ripples & Micro-interactions
    function createRipple(x, y) {
        const ripple = document.createElement("div");
        ripple.className = "ripple-dot";
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        rippleContainer.appendChild(ripple);

        // Remove after animation finishes
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    function triggerFlash() {
        activePanel.style.transform = "scale(0.96)";
        activePanel.style.transition = "transform 0.1s ease";
        setTimeout(() => {
            activePanel.style.transform = "scale(1)";
            activePanel.style.transition = "transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)";
        }, 100);
    }

    // 6. Poetic Low-contrast Whispers Overlay Loop
    function startPoeticWhispers() {
        if (poeticInterval) return;

        // Display first phrase after 3.5 seconds of starting pairing
        setTimeout(showPoeticPhrase, 3500);

        // Periodically refresh a whisper every 16 seconds (adds pure atmospheric dynamic text)
        poeticInterval = setInterval(() => {
            showPoeticPhrase();
        }, 16000);
    }

    function showPoeticPhrase(customText = "") {
        const overlay = document.getElementById("poetic-overlay");
        if (!overlay) return;

        // Clean up current active poetic text node if one is visible
        if (currentPoeticEl) {
            currentPoeticEl.classList.remove("visible");
            const oldEl = currentPoeticEl;
            setTimeout(() => oldEl.remove(), 1200);
        }

        // Get a random phrase or custom phrase
        const text = customText || POETIC_PHRASES[Math.floor(Math.random() * POETIC_PHRASES.length)];

        // Create new phrase text node
        const pEl = document.createElement("p");
        pEl.className = "poetic-phrase-text";
        pEl.textContent = text;
        overlay.appendChild(pEl);
        currentPoeticEl = pEl;

        // Animate fade in
        setTimeout(() => pEl.classList.add("visible"), 50);

        // Animate fade out after 5.5 seconds
        setTimeout(() => {
            if (currentPoeticEl === pEl) {
                pEl.classList.remove("visible");
                setTimeout(() => pEl.remove(), 1200);
                currentPoeticEl = null;
            }
        }, 5500);
    }

    // Start script
    window.addEventListener("DOMContentLoaded", init);
})();

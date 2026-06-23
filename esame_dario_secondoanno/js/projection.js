/**
 * NOTHING MOVES UNTIL YOU DO — PROJECTION SYSTEM
 * Core Mechanics:
 * - Dynamic QR pairing via Room ID
 * - Web Audio procedural synthesis (delta-wave drone + respiratory LFO)
 * - Cinematic timeline & State transitions (Phase 1, Phase 2, Phase 3)
 * - Multi-controller MQTT sync
 */

(function() {
    // Configurations
    const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
    const BASE_TOPIC = "nothingmoves/room/";
    
    // Video filenames (exactly matching local path e:\esame_dario_secondoanno\vid)
    const VIDEO_PATHS = [
        "vid/WhatsApp Video 2026-05-08 at 10.16.26.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.16.34.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.17.30.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.20.17.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.20.28.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.21.02.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.21.14.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.21.18.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.21.1e.mp4",
        "vid/WhatsApp Video 2026-05-08 at 10.21.1w8.mp4",
        "vid/f.mp4",
        "vid/hbb.mp4",
        "vid/230fd25d2fa8453fa5ed5f10e75be761.MP4",
        "vid/2c2345a4d9c0437a8f9efe11cc4cd187.MP4",
        "vid/357d45e65b8c43d4a5e4075817c98404.MP4",
        "vid/9980A15B-42E0-451D-84C7-EC36681DC40E.MOV",
        "vid/da661a713f6d4d9aa95508a279718306.MP4",
        "vid/f0bd17964a1046319e7df427463d5409.MP4",
        "vid/v15044gf0000d8e7jc7og65kg1s0k86g.MP4",
        "vid/v15044gf0000d8f42dvog65pe2n1n3jg.MP4",
        "vid/v24044gl0000cvi2kq7og65k6bqqcvhg.MP4",
        "vid/v24044gl0000d8e6phnog65o967mjdi0.MP4",
        "vid/v26044gc0000d86p02nog65qu2ont0cg.MP4"
    ];

    // Texts for Phase 2: The Depleted Body (Poetic English)
    const PHRASES = [
        "keep scrolling",
        "the body stopped asking",
        "battery depleted",
        "body depleted",
        "you can stop now",
        "there is no next video",
        "nothing moves until you do"
    ];

    // Sleeping room generator components
    const ADJECTIVES = ["nocturnal", "liminal", "dreamy", "silent", "tired", "sleepy", "quiet", "shadowy", "fragile", "heavy", "exhausted", "drifting"];
    const NOUNS = ["pillow", "void", "bedsheet", "mind", "shadow", "screen", "feed", "body", "breathing", "darkness", "haze", "sleep"];

    // State Variables
    let client = null;
    let roomCode = "";
    let activeTimelineIndex = 0;
    let isStarted = false;
    let timeline = [];
    
    // Audio Context & nodes
    let audioCtx = null;
    let mainGain = null;
    let droneGain = null;
    let breathingGain = null;
    let breathingFilter = null;
    let noiseNode = null;
    let lfoNode = null;
    
    // Audio nodes tracking for video stacking
    const videoAudioSources = [];
    const videoGainNodes = [];

    // DOM Elements
    const splashOverlay = document.getElementById("splash-overlay");
    const startBtn = document.getElementById("start-btn");
    const feedContainer = document.getElementById("feed-container");
    const pairingModal = document.getElementById("pairing-modal");
    const closeBtn = document.getElementById("close-modal-btn");
    const pairingToggleBtn = document.getElementById("pairing-toggle-btn");
    const roomIdDisplay = document.getElementById("room-id-display");
    const mqttStatus = document.getElementById("mqtt-status");

    // 1. Setup Pairing Room and Generate QR Code
    function init() {
        roomCode = generateRoomCode();
        roomIdDisplay.textContent = roomCode;

        const savedIP = localStorage.getItem("installation_custom_ip") || "";
        if (savedIP) {
            const ipInput = document.getElementById("ip-override-input");
            if (ipInput) ipInput.value = savedIP;
        }
        setupQRCode(savedIP);
        setupMQTT();
        setupTimeline();
        setupUIListeners();
    }

    function generateRoomCode() {
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        const num = Math.floor(Math.random() * 900) + 100;
        return `${adj}-${noun}-${num}`;
    }

    function setupQRCode(customIP = "") {
        let cleanURL = "";
        const isFileProtocol = window.location.protocol === "file:";

        if (customIP) {
            // Build custom URL resolving local server IP manually
            let protocol = window.location.protocol;
            if (isFileProtocol) {
                protocol = "http:"; // Force standard HTTP protocol when manual IP is specified
            }
            
            let hostAndPort = customIP.trim();
            // If manual IP doesn't contain a port and we were on file:// protocol, default to port :8080
            if (!hostAndPort.includes(":") && isFileProtocol) {
                hostAndPort += ":8080";
            }
            
            let path = "/";
            if (!isFileProtocol) {
                path = window.location.pathname.replace("index.html", "");
            }
            
            cleanURL = `${protocol}//${hostAndPort}${path}controller.html?room=${roomCode}`;
        } else {
            if (isFileProtocol) {
                // If using file:// directly, we default to the detected computer IP!
                cleanURL = `http://192.168.33.194:8080/controller.html?room=${roomCode}`;
            } else {
                // Detect current location to dynamically build matching controller url
                const controllerURL = window.location.href.replace("index.html", "") + "controller.html?room=" + roomCode;
                // If the host is 'localhost' or '127.0.0.1', replace it with the computer's actual Wi-Fi IP so the phone can connect!
                if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
                    const protocol = window.location.protocol;
                    const port = window.location.port ? `:${window.location.port}` : "";
                    const path = window.location.pathname.replace("index.html", "");
                    cleanURL = `${protocol}//192.168.33.194${port}${path}controller.html?room=${roomCode}`;
                } else {
                    cleanURL = controllerURL.split("?")[0] + "?room=" + roomCode;
                }
            }
        }
        
        console.log("Generating QR Code for Controller URL:", cleanURL);

        const qrContainer = document.getElementById("qrcode");
        qrContainer.innerHTML = ""; // Clear active QR Code frame

        new QRCode(qrContainer, {
            text: cleanURL,
            width: 180,
            height: 180,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        // If page is opened directly via file://, display a stark B&W local network warning notice
        if (isFileProtocol) {
            const tipEl = document.querySelector(".pairing-tip");
            if (tipEl && !document.getElementById("file-protocol-warning")) {
                const warningDiv = document.createElement("div");
                warningDiv.id = "file-protocol-warning";
                warningDiv.style.marginTop = "1.5rem";
                warningDiv.style.padding = "1rem";
                warningDiv.style.border = "1px dashed #ffffff";
                warningDiv.style.color = "#ffffff";
                warningDiv.style.background = "#0b0000";
                warningDiv.style.fontSize = "0.68rem";
                warningDiv.style.textAlign = "left";
                warningDiv.style.textTransform = "uppercase";
                warningDiv.style.lineHeight = "1.5";
                warningDiv.style.letterSpacing = "0.04em";
                warningDiv.innerHTML = `
                    <strong style="color: #ff3333; display: block; margin-bottom: 0.4rem;">⚠️ ATTENZIONE: FILE LOCALE RILEVATO</strong>
                    Stai eseguendo la pagina direttamente dal computer (file:///). Il telefono non può collegarsi a file locali.<br><br>
                    <strong>Per risolvere:</strong><br>
                    1. Avvia un server locale nella cartella del progetto: esegui <code style="background: rgba(255,255,255,0.15); padding: 2px 4px; font-family: monospace;">npx http-server</code> in PowerShell.<br>
                    2. Apri la pagina sul computer tramite l'IP locale (es. <code style="background: rgba(255,255,255,0.15); padding: 2px 4px; font-family: monospace;">http://192.168.1.113:8080/index.html</code>).<br>
                    3. Scansiona il nuovo QR code con il tuo telefono.
                `;
                tipEl.parentNode.insertBefore(warningDiv, tipEl);
            }
        }
    }

    // 2. Setup MQTT Client
    function setupMQTT() {
        const clientId = "nm_proj_" + Math.random().toString(16).substring(2, 8);
        
        client = mqtt.connect(BROKER_URL, {
            clientId: clientId,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 2000
        });

        client.on("connect", () => {
            console.log("MQTT Broker Connected!");
            mqttStatus.textContent = "ONLINE";
            mqttStatus.className = "status-badge connected";
            
            // Subscribe to room controller topic
            const topic = BASE_TOPIC + roomCode + "/control";
            client.subscribe(topic, { qos: 1 }, (err) => {
                if (err) console.error("Subscription failed:", err);
                else console.log(`Subscribed to topic: ${topic}`);
            });
        });

        client.on("close", () => {
            console.warn("MQTT disconnected.");
            mqttStatus.textContent = "OFFLINE";
            mqttStatus.className = "status-badge disconnected";
        });

        client.on("message", (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.action === "scroll") {
                    handleControllerScroll(data.direction);
                } else if (data.action === "pair_success") {
                    console.log("Controller paired successfully. Automatically hiding modal.");
                    pairingModal.classList.remove("visible");
                }
            } catch (err) {
                console.error("Failed to parse MQTT payload:", err);
            }
        });
    }

    // 3. Narrative Timeline Definition (3 Phases)
    function setupTimeline() {
        // --- PHASE 1: Doom Scrolling (Videos with interspersed ghost phrase overlays) ---
        // --- PHASE 1: Doom Scrolling (Videos with interspersed ghost phrase overlays) ---
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[0], phrase: "you are still awake" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[1], phrase: "five more minutes" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[2] });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[12], phrase: "nothing new is coming" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[3] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[13], phrase: "is anyone there?" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[4] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[14], phrase: "just one more swipe" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[10] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[15], phrase: "watching other lives" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[11] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[16], phrase: "it keeps going" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[5] });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[6], phrase: "almost sleep" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[7] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[8] });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[17], phrase: "the body wanted to sleep" });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[18], phrase: "attention depleted" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[19] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[20], phrase: "battery depleted" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[1] }); // Repeat of Video 1
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[21], phrase: "body depleted" });
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[22] });
        
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[3], phrase: "there is no next video" }); // Repeat of Video 3
        timeline.push({ phase: 1, type: "video", src: VIDEO_PATHS[12], phrase: "you can stop now" }); // Repeat of Video 12
        
        // Blank screen slide before Phase 2 transition
        timeline.push({ phase: 1, type: "blank" });

        // --- PHASE 2: The Depleted Body (Pure Text on Black Background) ---
        timeline.push({ phase: 2, type: "blank" });

        // Inject elements in DOM
        timeline.forEach((item, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = `feed-item feed-item-${index}`;
            wrapper.style.transform = `translateY(${index * 100}%)`;
            
            if (item.type === "video") {
                const video = document.createElement("video");
                video.src = item.src;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.setAttribute("webkit-playsinline", "true");
                video.crossOrigin = "anonymous";
                wrapper.appendChild(video);
                
                // Keep references to handle audio and shortloop hooks
                item.domVideo = video;
            } else if (item.type === "failed") {
                wrapper.className += " media-failed";
                const div = document.createElement("div");
                div.className = "media-failed-indicator";
                div.innerHTML = `
                    <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none">
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                        <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <div>${item.label}</div>
                `;
                wrapper.appendChild(div);
            } else if (item.type === "phrase") {
                const phraseDiv = document.createElement("div");
                phraseDiv.className = "phrase-wrapper";
                phraseDiv.innerHTML = `<h2 class="phrase-text">${item.text}</h2>`;
                wrapper.appendChild(phraseDiv);
            } else if (item.type === "blank") {
                // Keep wrapper empty for pure black screen
            }

            feedContainer.appendChild(wrapper);
        });

        // Initialize display state of first frame
        updateFeedViewport();
    }

    // 4. Web Audio Procedural Synthesis
    function initWebAudio() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Core Gain
            mainGain = audioCtx.createGain();
            mainGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
            mainGain.connect(audioCtx.destination);
            // Slowly open main gain to prevent pop
            mainGain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 2.0);

            // Layer A: Low Binaural delta sleep drone (55Hz / 55.4Hz)
            droneGain = audioCtx.createGain();
            droneGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // Soft base volume
            
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(120, audioCtx.currentTime); // Warm sleep filter

            const osc1 = audioCtx.createOscillator();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(55.0, audioCtx.currentTime); // A1 note
            
            const osc2 = audioCtx.createOscillator();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(55.4, audioCtx.currentTime); // Creates delta beat of 0.4Hz

            osc1.connect(droneGain);
            osc2.connect(droneGain);
            droneGain.connect(lowpass);
            lowpass.connect(mainGain);
            
            osc1.start();
            osc2.start();

            // Layer B: Respiration Wind LFO (Breath noise synthesizer)
            breathingFilter = audioCtx.createBiquadFilter();
            breathingFilter.type = "bandpass";
            breathingFilter.frequency.setValueAtTime(250, audioCtx.currentTime);
            breathingFilter.Q.setValueAtTime(3.0, audioCtx.currentTime); // Sharp wind sound

            breathingGain = audioCtx.createGain();
            breathingGain.gain.setValueAtTime(0.015, audioCtx.currentTime); // Subtle base wind

            // Synthesize programmatic white noise buffer
            const bufferSize = 2 * audioCtx.sampleRate;
            const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            noiseNode = audioCtx.createBufferSource();
            noiseNode.buffer = noiseBuffer;
            noiseNode.loop = true;

            // Breathing LFO: modulate bandpass frequency dynamically to simulate inhalation/exhalation
            // 0.15Hz rate (approx 9 breaths per minute, extremely relaxed state)
            lfoNode = audioCtx.createOscillator();
            lfoNode.type = "sine";
            lfoNode.frequency.setValueAtTime(0.15, audioCtx.currentTime); 
            
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.setValueAtTime(100, audioCtx.currentTime); // Modulates frequency range from 150Hz to 350Hz

            lfoNode.connect(lfoGain);
            lfoGain.connect(breathingFilter.frequency);
            
            noiseNode.connect(breathingGain);
            breathingGain.connect(breathingFilter);
            breathingFilter.connect(mainGain);

            noiseNode.start();
            lfoNode.start();

            // Loop and connect all unmuted video source audio channels
            timeline.forEach((item, index) => {
                if (item.type === "video") {
                    const video = item.domVideo;
                    
                    const source = audioCtx.createMediaElementSource(video);
                    const gainNode = audioCtx.createGain();
                    gainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
                    
                    source.connect(gainNode);
                    gainNode.connect(mainGain);
                    
                    videoAudioSources[index] = source;
                    videoGainNodes[index] = gainNode;
                }
            });

            console.log("Web Audio synth engine initialized successfully.");
            
            // Unmute and start the very first item
            playActiveItemMedia();
            
        } catch (err) {
            console.error("Failed to build Web Audio synthesize architecture:", err);
        }
    }

    // 5. Scroll Controller Transitions
    function handleControllerScroll(direction) {
        if (!isStarted) return;
        
        // Deactivate manual scrolling in final Phase 3 (Auto sleep takeover)
        if (activeTimelineIndex >= timeline.length) return;

        if (direction === "up") {
            // Scroll UP -> Advance forward
            activeTimelineIndex++;
            if (activeTimelineIndex >= timeline.length) {
                // Enter Phase 3: The Drift (Automatic Takeover)
                activeTimelineIndex = timeline.length - 1; // Keep viewport on the last item
                startPhase3Drift();
            } else {
                updateFeedViewport();
            }
        } else if (direction === "down" && activeTimelineIndex > 0) {
            // Scroll DOWN -> Step backward (only allowed in Phase 1 & 2)
            activeTimelineIndex--;
            updateFeedViewport();
        }
    }

    // Update viewport visuals and audio stacking
    function updateFeedViewport() {
        const itemElements = document.querySelectorAll(".feed-item");
        
        // Scroll the viewport using absolute coordinate offsets
        feedContainer.style.transform = `translateY(-${activeTimelineIndex * 100}%)`;

        itemElements.forEach((el, index) => {
            if (index === activeTimelineIndex) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        });

        if (!isStarted) return;

        // Perform Audio stacking & media controls
        playActiveItemMedia();
        stackAudioChannels();
        applyDynamicDistortion();

        // Check if we just reached the blank slide of Phase 2 to auto-trigger Phase 3 Drift
        const currentItem = timeline[activeTimelineIndex];
        if (currentItem && currentItem.phase === 2 && currentItem.type === "blank") {
            startPhase3Drift();
        }
    }

    // Unmute, trigger playback, and clean loops on active item
    function playActiveItemMedia() {
        timeline.forEach((item, index) => {
            if (item.type === "video") {
                const video = item.domVideo;
                
                if (index === activeTimelineIndex) {
                    // Activate current video
                    video.muted = false;
                    video.play().catch(e => console.warn("Video failed auto playback:", e));
                } else if (index < activeTimelineIndex) {
                    // Keep previously played videos running in background and unmuted so they keep overlapping
                    video.muted = false;
                    video.play().catch(() => {});
                } else {
                    // Future videos that are not yet reached remain paused/muted
                    video.muted = true;
                    video.pause();
                }
            }
        });
    }

    // Progressive infinite stacking algorithm
    function stackAudioChannels() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;

        timeline.forEach((item, index) => {
            if (item.type === "video") {
                const gainNode = videoGainNodes[index];
                if (!gainNode) return;

                if (index === activeTimelineIndex) {
                    // Active track is most prominent
                    gainNode.gain.setTargetAtTime(0.85, now, 0.5);
                } else if (index < activeTimelineIndex) {
                    // Accavallamento infinito: ALL previously scrolled video tracks continue 
                    // playing in the background at 0.32 volume, stacking up into a chaotic audio swarm!
                    gainNode.gain.setTargetAtTime(0.32, now, 2.5);
                } else {
                    // Unscrolled videos remain fully silent
                    gainNode.gain.setTargetAtTime(0.0, now, 0.5);
                }
            }
        });
    }

    // Modify audio synth parameters dynamically based on fatigue
    function applyDynamicDistortion() {
        if (!audioCtx) return;
        
        const now = audioCtx.currentTime;
        const totalSlides = timeline.length;
        const progress = Math.min(1.0, activeTimelineIndex / totalSlides);

        // 1. Double-Sine sleep drone: volume increases, filter cutoff lowers (deeper, warmer)
        const targetDroneVol = 0.08 + (progress * 0.15); // Stacks up to 0.23 volume
        droneGain.gain.setTargetAtTime(targetDroneVol, now, 2.0);

        // 2. Wind respiration: volume increases, respiration speed slows down slightly
        const targetWindVol = 0.015 + (progress * 0.04);
        breathingGain.gain.setTargetAtTime(targetWindVol, now, 2.0);
        
        // Slow respiratory breathing rate slightly as exhaustion sets in
        const lfoFrequency = 0.15 - (progress * 0.06); // Slows from 0.15Hz to 0.09Hz (very deep sleeping breaths)
        lfoNode.frequency.setTargetAtTime(lfoFrequency, now, 5.0);

        // 3. Short loops tick rate logic (monitored in global animation loop)
        const activeItem = timeline[activeTimelineIndex];
        if (activeItem && activeItem.type === "video" && activeItem.jitter) {
            const el = document.querySelector(`.feed-item-${activeTimelineIndex}`);
            if (el) el.classList.add("heavy-glitch");
        }
    }

    // 6. Global Animation loop (processes custom loops and glitches)
    function globalAnimationLoop() {
        if (isStarted) {
            // Process custom loops (Phase 1 progressive degradation)
            const activeItem = timeline[activeTimelineIndex];
            if (activeItem && activeItem.type === "video" && activeItem.shortLoop) {
                const video = activeItem.domVideo;
                if (video.currentTime >= activeItem.loopDuration) {
                    // Jitter repeat: programmatically truncate playback looping point
                    video.currentTime = 0.2;
                }
            }
        }
        
        requestAnimationFrame(globalAnimationLoop);
    }

    // 7. Phase 3: The Drift (Automatic Takeover)
    function startPhase3Drift() {
        console.log("Entering Phase 3: The Drift. Controller inputs deactivated. Takeover active.");
        
        // Close modal if open to clean screen
        pairingModal.classList.remove("visible");
        pairingToggleBtn.style.display = "none";

        // Slowly drop breathing synthesizer volume and pitch-drop drone (sleep effect)
        if (audioCtx) {
            const now = audioCtx.currentTime;
            breathingGain.gain.setTargetAtTime(0.005, now, 4.0);
            droneGain.gain.setTargetAtTime(0.04, now, 6.0);
        }

        // Trigger final fade-out
        triggerFinalFadeOut();
    }

    // Final fade-to-black, absolute silence
    function triggerFinalFadeOut() {
        console.log("Fading installation to black void.");
        
        // CSS class adds blur and brightness reduction over 8 seconds
        document.body.className = "sleep-fade-out";

        // Fade synthesizer gains fully to 0
        if (audioCtx) {
            const now = audioCtx.currentTime;
            mainGain.gain.setTargetAtTime(0.0, now, 7.0);
        }

        // Automatically reset the installation back to the splash screen after 9 seconds
        setTimeout(resetInstallation, 9000);
    }

    function resetInstallation() {
        console.log("Resetting installation back to normal.");
        
        isStarted = false;
        activeTimelineIndex = 0;
        
        document.body.className = "";
        
        feedContainer.style.transform = `translateY(0%)`;
        const itemElements = document.querySelectorAll(".feed-item");
        itemElements.forEach((el, index) => {
            if (index === 0) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        });

        // Mute and pause all videos
        timeline.forEach((item) => {
            if (item.type === "video" && item.domVideo) {
                const video = item.domVideo;
                video.muted = true;
                video.pause();
                video.currentTime = 0;
            }
        });

        // Reset gain nodes for videos
        videoGainNodes.forEach((gainNode) => {
            if (gainNode) gainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
        });

        // Reset main synth parameters to baseline
        if (audioCtx) {
            mainGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
            droneGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            breathingGain.gain.setValueAtTime(0.015, audioCtx.currentTime);
            lfoNode.frequency.setValueAtTime(0.15, audioCtx.currentTime);
        }

        // UI toggles
        splashOverlay.classList.remove("hidden");
        pairingModal.classList.add("visible");
        pairingToggleBtn.style.display = "flex";
        
        // Unsubscribe from old topic and pair a new room
        if (client) {
            const oldTopic = BASE_TOPIC + roomCode + "/control";
            client.unsubscribe(oldTopic);
            
            roomCode = generateRoomCode();
            roomIdDisplay.textContent = roomCode;
            setupQRCode();
            
            const newTopic = BASE_TOPIC + roomCode + "/control";
            client.subscribe(newTopic, { qos: 1 });
        }
    }

    // 8. Event Bindings and Setup listeners
    function setupUIListeners() {
        // Unlock experiences on click
        startBtn.addEventListener("click", () => {
            if (isStarted) return;
            
            splashOverlay.classList.add("hidden");
            isStarted = true;
            
            // Explicitly show the pairing modal AFTER the 'Senza titolo' splash overlay fades out
            pairingModal.classList.add("visible");
            
            // Build synthesizer audio nodes
            initWebAudio();
            
            // Run processing loop
            requestAnimationFrame(globalAnimationLoop);
        });

        // Dynamic IP override button listeners to help with local mobile connectivity
        const ipInput = document.getElementById("ip-override-input");
        const ipBtn = document.getElementById("ip-override-btn");
        if (ipInput && ipBtn) {
            ipBtn.addEventListener("click", () => {
                const val = ipInput.value.trim();
                localStorage.setItem("installation_custom_ip", val);
                setupQRCode(val);
            });
            ipInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    ipBtn.click();
                }
            });
        }

        // Modal triggers
        closeBtn.addEventListener("click", () => {
            pairingModal.classList.remove("visible");
        });

        pairingToggleBtn.addEventListener("click", () => {
            pairingModal.classList.toggle("visible");
        });

        // Key bindings
        window.addEventListener("keydown", (e) => {
            if (e.code === "KeyQ") {
                pairingModal.classList.toggle("visible");
            }
        });
    }

    window.addEventListener("DOMContentLoaded", init);
})();

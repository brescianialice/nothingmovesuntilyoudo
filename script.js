/* ==========================================================================
   THEME SWITCHER
   ========================================================================== */

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const toggleText = themeToggleBtn.querySelector('.toggle-text');

// Initialize theme from local storage or default to dark
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateToggleText(savedTheme);

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateToggleText(newTheme);
});

function updateToggleText(theme) {
    if (theme === 'dark') {
        toggleText.textContent = 'MODALITÀ CARTA';
    } else {
        toggleText.textContent = 'MODALITÀ GALLERIA';
    }
}

// Unmute hero background video on first interaction
const heroVideo = document.querySelector('.video-bg');
if (heroVideo) {
    document.addEventListener('click', () => {
        heroVideo.muted = false;
        heroVideo.volume = 0.5; // Enable sound at 50% volume
    }, { once: true });
}




/* ==========================================================================
   INTERACTIVE DUAL-DEVICE MQTT SIMULATOR
   ========================================================================== */

const phoneTrackpad = document.getElementById('phone-trackpad');
const projectionVideo = document.getElementById('projection-video');
const projectionOverlayText = document.getElementById('projection-overlay-text');
const projectionDarkOverlay = document.getElementById('projection-dark-overlay');
const scrollCounter = document.getElementById('scroll-counter');
const roomCodeEl = document.getElementById('room-code');
const whisperOverlay = document.getElementById('whisper-overlay');
const rippleContainer = document.getElementById('ripple-container');
const trackpadInstructionText = document.getElementById('trackpad-instruction-text');
const audioStackStatus = document.getElementById('audio-stack-status');
const resetSimBtn = document.getElementById('reset-sim-btn');

let scrollCount = 0;
const totalScrolls = 26;
let isLocked = false;
let isTrackpadDragging = false;
let startTouchY = 0;
let lastTouchY = 0;
let roomName = "";

// Audio Stacking Synthesizer variables (Web Audio API)
let audioCtx = null;
let masterGainNode = null;
let backgroundDroneOsc = null;
let stackedOscillators = [];
let noiseInterval = null;

// Pool of overlay texts for the projection during scrolling (WhatsApp vibe)
const overlayTexts = [
    "YOU ARE STILL AWAKE",
    "JUST ONE MORE SWIPE",
    "ARE YOU ALONE?",
    "GO TO SLEEP",
    "THE SCREEN FEEDS THE VOID",
    "NOBODY IS LOOKING FOR YOU",
    "STAY A LITTLE LONGER",
    "SCROLLING IS AN ILLUSION",
    "TIME ELAPSES",
    "ARE YOU SATISFIED?",
    "YOU CANNOT DETACH",
    "DARKNESS IS WAITING",
    "A BODY YIELDING TO THE BLUE LIGHT"
];

// Pool of floating whispers for the controller
const whispers = [
    "all'impero del sonno preferisco l'impero del male",
    "questo mondo si è addormentato",
    "scorrere non riempie il vuoto",
    "solo un altro scroll...",
    "le dita si muovono da sole",
    "la luce dello schermo scalda la stanza",
    "sono le 04:12 e sono ancora qui",
    "il vuoto risponde con un feed",
    "il corpo si arrende alla corrente"
];

// Generate room code on start
generateNewRoomCode();

// Periodic whispers (every 16 seconds if simulation is active and not locked)
setInterval(() => {
    if (scrollCount > 0 && !isLocked) {
        spawnWhisper();
    }
}, 16000);

// Simulator Drag/Swipe Events — mouse
phoneTrackpad.addEventListener('mousedown', startTrackpadDrag);
window.addEventListener('mousemove', moveTrackpadDrag);
window.addEventListener('mouseup', stopTrackpadDrag);

// Simulator Drag/Swipe Events — touch (non-passive so we can preventDefault inside the phone)
phoneTrackpad.addEventListener('touchstart', (e) => {
    startTrackpadDrag(e);
    // Prevent the page from scrolling while interacting with the phone trackpad
    e.preventDefault();
}, { passive: false });

phoneTrackpad.addEventListener('touchmove', (e) => {
    moveTrackpadDrag(e);
    e.preventDefault();
}, { passive: false });

phoneTrackpad.addEventListener('touchend', stopTrackpadDrag);
phoneTrackpad.addEventListener('touchcancel', stopTrackpadDrag);

resetSimBtn.addEventListener('click', resetSimulator);

function generateNewRoomCode() {
    const adjectives = ["nocturnal", "silent", "asleep", "dark", "heavy", "numb", "hollow", "empty", "dreamy", "liminal"];
    const nouns = ["pillow", "bed", "void", "shadow", "screen", "room", "device", "body", "chamber", "abyss"];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 900) + 100;
    
    roomName = `${randomAdj}-${randomNoun}-${number}`;
    roomCodeEl.textContent = `STANZA: ${roomName}`;
}

function startTrackpadDrag(e) {
    if (isLocked) return;
    
    isTrackpadDragging = true;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    
    startTouchY = clientY;
    lastTouchY = clientY;
    
    createRipple(e);
    initAudioContext();
    
    // Trigger navigator vibrate for tactile feedback
    if (navigator.vibrate) {
        navigator.vibrate(15);
    }
}

function moveTrackpadDrag(e) {
    if (!isTrackpadDragging || isLocked) return;
    
    if (e.cancelable) {
        e.preventDefault();
    }
    
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    lastTouchY = clientY;
}

function stopTrackpadDrag() {
    if (!isTrackpadDragging || isLocked) return;
    isTrackpadDragging = false;
    
    const deltaY = startTouchY - lastTouchY;
    
    // Check if it's a valid swipe up (at least 40px)
    if (deltaY > 40) {
        triggerSwipeUp();
    }
}

function triggerSwipeUp() {
    scrollCount++;
    if (scrollCount > totalScrolls) scrollCount = totalScrolls;
    
    // Update UI Counter
    scrollCounter.textContent = `SCROLL: ${String(scrollCount).padStart(2, '0')} / ${totalScrolls}`;
    
    // Update Projection video — advance time to simulate new content
    if (projectionVideo) {
        projectionVideo.style.opacity = "0.7";
        // Swipe is a user gesture — attempt unmuted play
        projectionVideo.muted = false;
        projectionVideo.volume = 0.6;
        projectionVideo.currentTime = (projectionVideo.currentTime + 8.5) % (projectionVideo.duration || 60);
        const playPromise = projectionVideo.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                // Mobile blocked unmuted audio — fallback to muted play
                projectionVideo.muted = true;
                projectionVideo.play().catch(() => {});
            });
        }
    }
    
    // Manage States based on timeline
    if (scrollCount <= 23) {
        // FASE 1: Doom Scrolling (No overlay text on top of video)
        updateDroneAudio();
        
        // Random whisper on controller (20% probability)
        if (Math.random() < 0.20) {
            spawnWhisper();
        }
    } else if (scrollCount === 24) {
        // FASE 2: Il Corpo Svuotato (Video disappears)
        if (projectionVideo) projectionVideo.style.opacity = "0";
        showProjectionMessage("BATTERY DEPLETED", true);
        updateDroneAudio();
    } else if (scrollCount === 25) {
        // FASE 2: Body Depleted
        if (projectionVideo) projectionVideo.style.opacity = "0";
        showProjectionMessage("BODY DEPLETED. THERE IS NO NEXT VIDEO.", true);
        updateDroneAudio();
    } else if (scrollCount === 26) {
        // FASE 3: Il Drift / Abbandono (System takes control)
        triggerFinalDrift();
    }
}

// Projection message overlays
let messageTimeout = null;
function showProjectionMessage(text, persistent = false) {
    if (messageTimeout) clearTimeout(messageTimeout);
    
    projectionOverlayText.textContent = text;
    projectionOverlayText.classList.add('visible');
    
    if (!persistent) {
        messageTimeout = setTimeout(() => {
            projectionOverlayText.classList.remove('visible');
        }, 2200);
    }
}

// Fade out and lock system in Phase 3
function triggerFinalDrift() {
    isLocked = true;
    phoneTrackpad.classList.add('locked');
    trackpadInstructionText.textContent = "nothing moves until you do";
    
    // Lock overlay message
    showProjectionMessage("NOTHING MOVES UNTIL YOU DO", true);
    projectionOverlayText.style.color = "#ff0033";
    
    // Trigger 9-second fade-out to dark and silent
    projectionDarkOverlay.classList.add('fading');
    
    // Slow down LFO audio to 0.09Hz and fade out volume to 0
    if (audioCtx) {
        const now = audioCtx.currentTime;
        masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, now);
        masterGainNode.gain.linearRampToValueAtTime(0, now + 9);
        audioStackStatus.textContent = "DRIFT: Fade-out sonoro in corso (9s)...";
    }
    
    if (projectionVideo) {
        // Linear fade out of video opacity
        let fadeInterval = setInterval(() => {
            let currentOpacity = parseFloat(projectionVideo.style.opacity || 0.7);
            if (currentOpacity > 0) {
                projectionVideo.style.opacity = (currentOpacity - 0.08).toString();
            } else {
                clearInterval(fadeInterval);
            }
        }, 800);
    }
    
    // Refresh page/reset simulation after 10 seconds total
    setTimeout(() => {
        resetSimulator();
    }, 10000);
}

// Reset Simulator to initial state
function resetSimulator() {
    scrollCount = 0;
    isLocked = false;
    isTrackpadDragging = false;
    
    phoneTrackpad.classList.remove('locked');
    trackpadInstructionText.textContent = "SWIPE UP PER SCORRERE";
    scrollCounter.textContent = `SCROLL: 00 / 26`;
    
    // Reset Projection display
    projectionOverlayText.classList.remove('visible');
    projectionOverlayText.style.color = "var(--color-accent)";
    projectionDarkOverlay.classList.remove('fading');
    
    if (projectionVideo) {
        projectionVideo.style.opacity = "0.35";
        projectionVideo.pause();
        projectionVideo.currentTime = 0;
    }
    
    generateNewRoomCode();
    
    // Reset Audio Stack
    resetAudio();
    audioStackStatus.textContent = "Disattivato (In attesa del primo swipe)";
}

// Custom touch ripples
function createRipple(e) {
    const rect = phoneTrackpad.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const ripple = document.createElement('div');
    ripple.classList.add('ripple-ring');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    rippleContainer.appendChild(ripple);
    
    // Clear ripple element after animation completes
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Spawn floating whispers on mobile controller mockup
function spawnWhisper() {
    const whisperText = whispers[Math.floor(Math.random() * whispers.length)];
    const whisperEl = document.createElement('span');
    whisperEl.classList.add('whisper-text');
    whisperEl.textContent = `« ${whisperText} »`;
    
    // Random horizontal position (within bounds) and slight scale/rotation
    const randomLeft = Math.floor(Math.random() * 40) + 10; // 10% to 50%
    const randomRotation = Math.floor(Math.random() * 10) - 5; // -5deg to 5deg
    
    whisperEl.style.left = `${randomLeft}%`;
    whisperEl.style.transform = `rotate(${randomRotation}deg)`;
    
    whisperOverlay.appendChild(whisperEl);
    
    // Remove after animation finishes
    setTimeout(() => {
        whisperEl.remove();
    }, 8000);
}

// Procedural Audio Synthesizer (Web Audio API)
function initAudioContext() {
    if (audioCtx) return; // Already running
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); // Low initial volume
        masterGainNode.connect(audioCtx.destination);
        
        // Start background drone oscillator (55Hz / A1)
        backgroundDroneOsc = audioCtx.createOscillator();
        backgroundDroneOsc.type = 'sawtooth';
        backgroundDroneOsc.frequency.setValueAtTime(55, audioCtx.currentTime);
        
        // Lowpass filter to make it a warm, dark background rumble
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, audioCtx.currentTime);
        
        // Connect drone
        backgroundDroneOsc.connect(filter);
        filter.connect(masterGainNode);
        backgroundDroneOsc.start();
        
        audioStackStatus.textContent = "SINTETIZZATORE INIZIALIZZATO: Drone di sottofondo attivo.";
    } catch (e) {
        console.error("Web Audio Context could not start:", e);
        audioStackStatus.textContent = "Audio non supportato dal browser.";
    }
}

function updateDroneAudio() {
    if (!audioCtx) return;
    
    const now = audioCtx.currentTime;
    
    // Audio Stacking simulation (adding stacked oscillator channels for each swipe)
    // Up to a max of 8 stacked oscillators to avoid digital clipping
    if (stackedOscillators.length < 8) {
        try {
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            
            // Random harmonics based on the 55Hz root to sound eerie but related (e.g. 110Hz, 165Hz, 220Hz...)
            const harmonics = [55, 110, 165, 220, 275, 330, 385, 440];
            const frequency = harmonics[Math.floor(Math.random() * harmonics.length)];
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency + (Math.random() * 4 - 2), now); // Detune slightly for chorus effect
            
            // Volume reduced to 0.32 per active stacking layer, as specified in the PDF!
            oscGain.gain.setValueAtTime(0.0, now);
            oscGain.gain.linearRampToValueAtTime(0.026, now + 1.5); // Fade in stack smoothly
            
            osc.connect(oscGain);
            oscGain.connect(masterGainNode);
            osc.start();
            
            stackedOscillators.push({ osc, gain: oscGain });
        } catch(e) {
            console.error(e);
        }
    }
    
    // Progressive degradation of sound parameters:
    // 1. Drone frequency becomes darker (shift root oscillator down or alter filter cutoff)
    // 2. LFO frequency slows down (simulating LFO rate shifting to 0.09 Hz)
    const completionRatio = scrollCount / totalScrolls;
    const lfoRate = Math.max(0.09, 0.6 - completionRatio * 0.51); // Slows down to 0.09 Hz
    
    // Dynamic noise pulses representing the "respiro" (breath volume increases)
    if (!noiseInterval && completionRatio > 0.15) {
        startRespiroNoise();
    }
    
    masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, now);
    // As completion ratio goes up, make drone overall volume slightly louder and darker
    masterGainNode.gain.linearRampToValueAtTime(0.08 + (completionRatio * 0.12), now + 0.5);
    
    audioStackStatus.textContent = `CANALI AUDIO ACCAVALLATI: ${stackedOscillators.length + 1} | LFO RATE: ${lfoRate.toFixed(2)} Hz`;
}

function startRespiroNoise() {
    if (!audioCtx) return;
    
    // Generate noise source buffer for breathing simulation
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    
    noiseInterval = setInterval(() => {
        if (!audioCtx || isLocked) return;
        
        const now = audioCtx.currentTime;
        const completionRatio = scrollCount / totalScrolls;
        
        // Breath rate matches the LFO slowing down
        const breathDuration = 2.0 + (completionRatio * 3.5); // Breaths get longer and slower
        const breathVolume = 0.015 + (completionRatio * 0.045); // Vol rises as body is depleted
        
        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        
        // Filter the noise to sound like heavy breath (bandpass)
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(350, now); // Low wind/breath frequency
        filter.Q.setValueAtTime(1.0, now);
        
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0, now);
        noiseGain.gain.linearRampToValueAtTime(breathVolume, now + (breathDuration * 0.4)); // Inhale
        noiseGain.gain.linearRampToValueAtTime(0, now + breathDuration); // Exhale
        
        whiteNoise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(masterGainNode);
        
        whiteNoise.start(now);
        whiteNoise.stop(now + breathDuration);
    }, 4500); // Trigger breath sweep periodically
}

function resetAudio() {
    if (noiseInterval) {
        clearInterval(noiseInterval);
        noiseInterval = null;
    }
    
    stackedOscillators.forEach(item => {
        try {
            item.osc.stop();
        } catch(e) {}
    });
    stackedOscillators = [];
    
    if (backgroundDroneOsc) {
        try {
            backgroundDroneOsc.stop();
        } catch(e) {}
        backgroundDroneOsc = null;
    }
    
    if (audioCtx) {
        try {
            audioCtx.close();
        } catch(e) {}
        audioCtx = null;
    }
}


/* ==========================================================================
   SCROLL REVEAL ANIMATIONS (INTERSECTION OBSERVER)
   ========================================================================== */

const revealElements = document.querySelectorAll(
    '.section-container, .editorial-heading, .quote-card, .text-column p, .process-card, .gallery-item, .lyric-line, .code-analysis-card'
);

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            // Unobserve once shown
            revealObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.05, // Trigger slightly earlier for sections
    rootMargin: '0px 0px -80px 0px' // Trigger slightly before element enters view
});

revealElements.forEach((el, index) => {
    // Add transition delays for consecutive elements
    if (el.classList.contains('process-card') || el.classList.contains('gallery-item') || el.classList.contains('code-analysis-card')) {
        el.style.transitionDelay = `${(index % 2) * 0.12}s`;
    }
    el.classList.add('reveal-init');
    revealObserver.observe(el);
});

// Dynamic lyric line highlights during scroll
const lyricLines = document.querySelectorAll('.lyric-line');
window.addEventListener('scroll', () => {
    const triggerBottom = window.innerHeight * 0.8;
    
    lyricLines.forEach(line => {
        const lineTop = line.getBoundingClientRect().top;
        if (lineTop < triggerBottom) {
            line.classList.add('active-line');
        } else {
            line.classList.remove('active-line');
        }
    });
});

# "Nothing Moves Until You Do" — Interactive Web Installation

An intimate, nocturnal interactive web installation that reflects on the fragile, liminal state of modern fatigue. Designed to be projected vertically onto a suspended bedsheet with a pillow, representing a smartphone feed viewed late at night in bed. The viewer controls the scrolling feed using gesture-only vertical swipes on their phone, simulating the repetitive, mindless mechanical scrolling at 3 AM.

---

## 🌌 Conceptual & Narrative Overview

The installation is not about social media. It is about the fragile moment when a tired body continues scrolling even after the mind has already left. 

The experience progresses through three distinct, immersive phases:

1. **Phase 1: Doom Scrolling (Scrolls 0 – 15)**
   - Displays a vertical feed of 12 looping videos (fragments of the internet: mundane, absurd, intimate).
   - *Deterioration*: As the user scrolls, loops become shorter, videos repeat, connection issues arise ("Media load error"), and blank screens interrupt the flow.
   - *Audio Layering*: Audio from previous clips does not stop when scrolling; instead, they stack in the background at low volume, creating an accumulated, overstimulated cognitive fatigue.
   
2. **Phase 2: The Depleted Body (Scrolls 16 – 27)**
   - The videos vanish completely with a glowing screen glitch.
   - Large, fragile, slightly blurred white text appears in the center of the dark projection.
   - One melancholic phrase per screen (e.g. *keep scrolling*, *the body stopped asking*, *nothing moves until you do*). Pacing slows down naturally.

3. **Phase 3: The Drift (Scrolls 28+)**
   - The user loses active swipe control.
   - The installation takes over, scrolling itself automatically at exponentially slowing intervals (simulating drifting off to sleep).
   - After final messages and a long pause (*you were never looking for anything... goodnight*), the entire projection blurs and slowly fades to absolute black, and the audio dissolves into silence.

---

## 🛠️ Architecture & Folder Structure

```
/e:/esame_dario_secondoanno
│
├── index.html              # Page 1: Main Projection Interface (Vertical screen)
├── controller.html         # Page 2: Mobile Swipe Controller
│
├── css/
│   ├── projection.css      # CRT scanlines, CRT glow, phone-frame styling
│   └── controller.css      # Touch gesture canvas and glowing tactile ripples
│
├── js/
│   ├── projection.js       # Narrative state machine & Web Audio breathing synthesizer
│   └── controller.js       # Touch gesture parsing & MQTT publishing
│
├── vid/
│   └── [12 WhatsApp videos] # Raw vertical video assets (local fragments)
│
└── audio/                  # Auxiliary audio assets folder
```

---

## 📡 Technology Stack & Communication

- **Dynamic Room Pairing (MQTT)**
  - Utilizes a secure WebSocket connection over the public MQTT broker (`wss://broker.emqx.io:8084/mqtt`).
  - No database or server installation required! The Projection page automatically generates a random room code on page load (e.g., `liminal-bedsheet-482`) and compiles it into a **pairing QR Code** using client-side `qrcode.js`.
  - Scanning the QR Code opens the Mobile Controller URL with the corresponding `?room=` query parameter.
  - The Controller publishes swipe commands to `nothingmoves/room/[ROOM-ID]/control`, and the Projection listens and acts in real-time. Multiple users can connect to the same screen simultaneously.
  - Pressing **`[Q]`** on the projection keyboard toggles the pairing overlay.

- **Web Audio API Synth Engine**
  - **Delta-Wave Drone**: Synthesizes a deep binaural beating drone (55Hz / 55.4Hz) matching slow delta-brainwaves associated with deep sleep.
  - **Respiratory Wind**: Uses a programmatic white noise buffer, filtered and modulated by a very slow `0.15Hz` LFO to simulate deep breathing.
  - As the installation progresses, the synthesizer volume, filter cutoff, and breathing rate dynamically scale, dragging the soundscape down to deep, quiet sleep.

---

## 🚀 How to Run the Installation

### Step 1: Start a Local Server
Because standard web browsers block local files (`file:///`) from accessing the camera, video autoplay, or loading local resources dynamically, **you must run a local web server**.

You can run any simple HTTP server in the project folder. For example, if you have Node.js installed, open terminal/command prompt in the directory and run:

```bash
npx http-server -p 8080
```
*(Or use VS Code's "Live Server" extension).*

### Step 2: Open Page 1 — Projection
1. Open a browser window and go to the local address: `http://localhost:8080/index.html` (or your Live Server port).
2. For the final gallery presentation, move the browser to your vertical projection monitor and set it to **Fullscreen** (Press `F11`).
3. Disconnect or hide your mouse cursor (the stylesheet automatically hides the cursor).

### Step 3: Connect Page 2 — Controller
1. Click **"Enter the Void"** on the splash screen (this activates the browser's audio permissions and autoplays).
2. Scan the dynamic QR code overlay with your mobile phone. Ensure your mobile phone is connected to the same local Wi-Fi network (or you can open the controller using your local network IP, e.g., `http://192.168.1.50:8080/controller.html?room=xxx`).
3. Press **`[Q]`** on the projection keyboard or click the toggle button in the bottom-left corner to hide the pairing modal once connected.
4. Swipe **UP** vertically on your phone screen to Doom Scroll and begin the experience.

---

## 🎨 Visual Aesthetics & Setup Tips
- **The Sheets Projection**: Suspend a clean, slightly wrinkled white bedsheet vertically in a dark room. Attach a white pillow to the upper-third of the sheet.
- **Projector Alignment**: Align the vertical smartphone frame (the centered white box) directly onto the suspended bedsheet, so the black border maps cleanly to the surrounding darkness.
- **Audio Output**: Connect the projection machine to a deep subwoofer or immersive room speakers to allow the low 55Hz delta-wave drone and respiration wind to fill the physical gallery space.

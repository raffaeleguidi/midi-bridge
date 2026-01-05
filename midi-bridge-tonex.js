const gboard = require('./gboard');       
const tonex = require('./tonexViaBLE');   

console.log('--- MIDI BRIDGE: G-Board <-> ToneX (BLE) ---');

// =============================================================================
// 1. FUNZIONE HELPER: RADIO TOGGLE GROUP
// =============================================================================

function toggleGroup(index, status, min, max, usbDevice, actionOn, actionOff) {
  // Se il tasto non fa parte del gruppo, esci
  if (index < min || index > max) return;

  // 1. Spegni SEMPRE tutti gli altri LED del gruppo
  for (let i = min; i <= max; i++) {
    if (i !== index) {
      usbDevice.set(i, false);
    }
  }

  // 2. Assicuriamoci che il led del tasto premuto sia coerente con lo status
  // (Anche se gboard.js lo ha già switchato, questo rinforza la logica visuale)
  usbDevice.set(index, status);

  // 3. ESECUZIONE CALLBACK MIDI
  if (status) {
    if (actionOn) actionOn(index);
  } else {
    if (actionOff) actionOff(index);
  }
}

// =============================================================================
// 2. LOGICA DI CONTROLLO (ON SWITCH)
// =============================================================================

// Questa funzione viene chiamata da gboard.js DOPO aver rilevato il cambio di stato
gboard.onSwitch = (index, status) => {
  console.log(`🎹 [USB] Switch ${index} -> ${status ? "ON" : "OFF"}`);

  // --- COMPRESSOR (Tasto 3) ---
  if (index == 3) {
    // COMP/ POWER 18 000: OFF 127: ON
    console.log("compressor", status ? "on" : "off");
    tonex.sendCC(18, status ? 127 : 0, 0);
  }

  // --- TAP TEMPO (Tasto 2) ---
  else if (index == 2) {
    // tap tempo (Momentaneo: manda il comando e spegni subito il led)
    console.log("taptempo", status ? "on" : "off");
    tonex.sendCC(10, 0, 0); // Come da tuo snippet
    gboard.set(index, false);
  }

  // --- GRUPPO DELAY (Tasti 0-1) ---
  else if (index >= 0 && index <= 1) {
    toggleGroup(index, status, 0, 1, gboard,
      // ACTION ON
      (idx) => {
        console.log(`DLY ${idx} -> ON type`, idx);
        tonex.sendCC(2, 127, 0);     // Power ON
        tonex.sendCC(3, idx, 0);     // Type (0 o 1)
      },
      // ACTION OFF
      (idx) => {
        console.log(`DLY ${idx} -> OFF`);
        tonex.sendCC(2, 0, 0);       // Power OFF
      }
    );
  }

  // --- GRUPPO MODULATION (Tasti 4-7) ---
  else if (index >= 4 && index <= 7) {
    toggleGroup(index, status, 4, 7, gboard,
      // ACTION ON
      (idx) => {
        console.log(`MOD ${idx} -> ON type`, idx - 3);
        tonex.sendCC(32, 127, 0);     // Power ON
        tonex.sendCC(33, idx - 3, 0); // Type (calcolo offset: 4->1, 5->2...)
      },
      // ACTION OFF
      (idx) => {
        console.log(`MOD ${idx} -> OFF`);
        tonex.sendCC(32, 0, 0);       // Power OFF
      }
    );
  }
};

// =============================================================================
// 3. GESTIONE EVENTI DI SISTEMA (CONNESSIONE/DISCONNESSIONE)
// =============================================================================

gboard.on('connected', () => {
    console.log("🎉 [MAIN] G-Board Rilevata! Reset LED...");
    gboard.allLeds(false);
});

gboard.on('disconnected', () => {
    console.log("⚠️ [MAIN] G-Board Scollegata.");
});

tonex.onMessage = (msg) => {
    // Filtro Bank Select per pulizia log
    if (msg.type === 'cc' && (msg.controller === 0 || msg.controller === 32)) return;
    console.log("⬅️ [BLE IN]", msg);
};

// =============================================================================
// 4. AVVIO
// =============================================================================

gboard.start();

process.stdin.resume();
process.on('SIGINT', () => {
    console.log('\n🛑 Chiusura applicazione...');
    gboard.disconnect();
    process.exit();
});
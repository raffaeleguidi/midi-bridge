const gboard = require('./gboard');       
const tonex = require('./tonexViaBLE');   

console.log('--- MIDI BRIDGE: G-Board <-> ToneX (BLE) ---');

// =============================================================================
// 0. GESTIONE STATO E BLINKING (FEEDBACK VISIVO CONNESSIONE)
// =============================================================================

let isBleConnected = false;
let blinkInterval = null;
let ledStateBackup = [false, false, false, false, false, false, false, false]; // Backup dello stato

function startBlinking() {
    if (blinkInterval) return; // Stiamo già lampeggiando
    
    // 1. SALVA LO STATO CORRENTE (BACKUP)
    if (gboard.isConnected) {
        for(let i=0; i<8; i++) {
            ledStateBackup[i] = gboard.get(i);
        }
        console.log("💾 [SYSTEM] Stato LED salvato:", ledStateBackup);
    }

    console.log("⏳ [SYSTEM] In attesa di BLE... Avvio lampeggio.");
    
    let state = false;
    blinkInterval = setInterval(() => {
        state = !state;
        // Lampeggia tutti i led
        if (gboard.isConnected) {
            gboard.allLeds(state);
        }
    }, 500); // Velocità lampeggio: 500ms
}

function stopBlinking() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        console.log("🔗 [SYSTEM] BLE Connesso. Stop lampeggio e ripristino.");
        
        // 2. RIPRISTINA LO STATO DAL BACKUP
        if (gboard.isConnected) {
            // Invece di spegnere tutto, rimettiamo com'era prima
            ledStateBackup.forEach((status, index) => {
                gboard.set(index, status);
            });
            console.log("📂 [SYSTEM] Stato LED ripristinato.");
        }
    }
}

// =============================================================================
// 1. FUNZIONE HELPER: RADIO TOGGLE GROUP
// =============================================================================

function toggleGroup(index, status, min, max, usbDevice, actionOn, actionOff) {
  if (index < min || index > max) return;

  // Spegni SEMPRE tutti gli altri LED del gruppo
  for (let i = min; i <= max; i++) {
    if (i !== index) {
      usbDevice.set(i, false);
    }
  }

  // Setta il led corrente
  usbDevice.set(index, status);

  // Esecuzione Callback
  if (status) {
    if (actionOn) actionOn(index);
  } else {
    if (actionOff) actionOff(index);
  }
}

// =============================================================================
// 2. LOGICA DI CONTROLLO (PULSANTI G-BOARD)
// =============================================================================

gboard.onSwitch = (index, status) => {
  // Se il BLE non è connesso, ignoriamo i comandi (o continuiamo a lampeggiare)
  if (!isBleConnected) {
      console.log("⚠️ Comando ignorato: BLE non connesso.");
      return;
  }

  console.log(`🎹 [USB] Switch ${index} -> ${status ? "ON" : "OFF"}`);

  // --- COMPRESSOR (Tasto 3) ---
  if (index == 3) {
    console.log("compressor", status ? "on" : "off");
    tonex.sendCC(18, status ? 127 : 0, 0);
  }

  // --- TAP TEMPO (Tasto 2) ---
  else if (index == 2) {
    console.log("taptempo", status ? "on" : "off");
    tonex.sendCC(10, 0, 0); 
    gboard.set(index, false); // Momentaneo: spegni subito
  }

  // --- GRUPPO DELAY (Tasti 0-1) ---
  else if (index >= 0 && index <= 1) {
    toggleGroup(index, status, 0, 1, gboard,
      (idx) => { // ON
        console.log(`DLY ${idx} -> ON type`, idx);
        tonex.sendCC(2, 127, 0);     // Power ON
        tonex.sendCC(3, idx, 0);     // Type
      },
      (idx) => { // OFF
        console.log(`DLY ${idx} -> OFF`);
        tonex.sendCC(2, 0, 0);       // Power OFF
      }
    );
  }

  // --- GRUPPO MODULATION (Tasti 4-7) ---
  else if (index >= 4 && index <= 7) {
    toggleGroup(index, status, 4, 7, gboard,
      (idx) => { // ON
        console.log(`MOD ${idx} -> ON type`, idx - 3);
        tonex.sendCC(32, 127, 0);     // Power ON
        tonex.sendCC(33, idx - 3, 0); // Type
      },
      (idx) => { // OFF
        console.log(`MOD ${idx} -> OFF`);
        tonex.sendCC(32, 0, 0);       // Power OFF
      }
    );
  }
};

// =============================================================================
// 3. GESTIONE EVENTI SISTEMA
// =============================================================================

// --- G-BOARD (USB) ---
gboard.on('connected', () => {
    console.log("🎉 [USB] G-Board Rilevata.");
    // Se il BLE non è ancora pronto, inizia a lampeggiare
    if (!isBleConnected) {
        startBlinking();
    } else {
        // Se il BLE c'è, ripristina lo stato salvato (utile se si ricollega l'USB mentre il BLE era attivo)
        ledStateBackup.forEach((s, i) => gboard.set(i, s));
    }
});

gboard.on('disconnected', () => {
    console.log("⚠️ [USB] G-Board Scollegata.");
});


// --- TONEX (BLE) ---

// Mappiamo gli eventi del driver BLE (callback -> logica nostra)
tonex.onConnect = (name) => {
    console.log(`✅ [BLE] Connesso a ${name}!`);
    isBleConnected = true;
    stopBlinking(); // Connessione avvenuta: FERMA il lampeggio e ripristina
};

tonex.onDisconnect = () => {
    console.log("🔴 [BLE] Disconnesso.");
    isBleConnected = false;
    startBlinking(); // Connessione persa: SALVA stato e INIZIA a lampeggiare
};

tonex.onMessage = (msg) => {
    if (msg.type === 'cc' && (msg.controller === 0 || msg.controller === 32)) return;
    console.log("⬅️ [BLE IN]", msg);
};

// =============================================================================
// 4. AVVIO
// =============================================================================

// Avvia gestione USB
gboard.start();

// Avvia lampeggio preventivo (inizialmente lo stato salvato è tutto OFF)
startBlinking();

// Keep alive
process.stdin.resume();
process.on('SIGINT', () => {
    console.log('\n🛑 Chiusura...');
    if (blinkInterval) clearInterval(blinkInterval);
    gboard.disconnect();
    process.exit();
});
const gboard = require('./gboard');       
const tonex = require('./tonexViaBLE');   

console.log('--- MIDI BRIDGE: G-Board <-> ToneX (BLE) ---');

// =============================================================================
// 0. GESTIONE STATO, BACKUP E BLINKING
// =============================================================================

let isBleConnected = false;
let blinkInterval = null;
let ledStateBackup = [false, false, false, false, false, false, false, false]; 

function saveLedState() {
    if (!blinkInterval) {
        for(let i=0; i<8; i++) {
            ledStateBackup[i] = gboard.get(i);
        }
        // console.log("💾 [SYSTEM] Stato LED salvato."); // Scommenta per debug
    }
}

function restoreLedState() {
    if (gboard.isConnected) {
        ledStateBackup.forEach((status, index) => {
            gboard.set(index, status);
        });
        console.log("📂 [SYSTEM] Stato LED ripristinato.");
    }
}

function startBlinking() {
    if (blinkInterval) return; 
    
    saveLedState(); // Salva prima di lampeggiare

    console.log("⏳ [SYSTEM] In attesa di BLE... Avvio lampeggio.");
    
    let state = false;
    blinkInterval = setInterval(() => {
        state = !state;
        if (gboard.isConnected) {
            gboard.allLeds(state);
        }
    }, 500); 
}

function stopBlinking() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        console.log("🔗 [SYSTEM] BLE Connesso. Stop lampeggio.");
        restoreLedState(); // Ripristina dopo il lampeggio
    }
}

// =============================================================================
// 1. FUNZIONE HELPER: RADIO TOGGLE GROUP
// =============================================================================

function toggleGroup(index, status, min, max, usbDevice, actionOn, actionOff) {
  if (index < min || index > max) return;

  for (let i = min; i <= max; i++) {
    if (i !== index) {
      usbDevice.set(i, false);
      ledStateBackup[i] = false; // Teniamo aggiornato il backup in tempo reale per i gruppi
    }
  }

  usbDevice.set(index, status);

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
  if (!isBleConnected) {
      console.log("⚠️ Comando ignorato: BLE non connesso.");
      return;
  }

  console.log(`🎹 [USB] Switch ${index} -> ${status ? "ON" : "OFF"}`);

  // Aggiorniamo il backup del singolo tasto
  ledStateBackup[index] = status; 

  // --- COMPRESSOR (Tasto 3) ---
  if (index == 3) {
    console.log("compressor", status ? "on" : "off");
    tonex.sendCC(18, status ? 127 : 0, 0);
  }

  // --- TAP TEMPO (Tasto 2) ---
  else if (index == 2) {
    console.log("taptempo", status ? "on" : "off");
    tonex.sendCC(10, 0, 0); 
    gboard.set(index, false); 
    ledStateBackup[index] = false; // È momentaneo, quindi nel backup deve restare spento
  }

  // --- GRUPPO DELAY (Tasti 0-1) ---
  else if (index >= 0 && index <= 1) {
    toggleGroup(index, status, 0, 1, gboard,
      (idx) => { 
        console.log(`DLY ${idx} -> ON type`, idx);
        tonex.sendCC(2, 127, 0);     
        tonex.sendCC(3, idx, 0);     
      },
      (idx) => { 
        console.log(`DLY ${idx} -> OFF`);
        tonex.sendCC(2, 0, 0);       
      }
    );
  }

  // --- GRUPPO MODULATION (Tasti 4-7) ---
  else if (index >= 4 && index <= 7) {
    toggleGroup(index, status, 4, 7, gboard,
      (idx) => { 
        console.log(`MOD ${idx} -> ON type`, idx - 3);
        tonex.sendCC(32, 127, 0);    
        tonex.sendCC(33, idx - 3, 0); 
      },
      (idx) => { 
        console.log(`MOD ${idx} -> OFF`);
        tonex.sendCC(32, 0, 0);       
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
    
    if (!isBleConnected) {
        startBlinking();
    } else {
        restoreLedState();
    }
});

gboard.on('disconnected', () => {
    console.log("⚠️ [USB] G-Board Scollegata.");
    saveLedState();
});


// --- TONEX (BLE) ---
tonex.onConnect = (name) => {
    console.log(`✅ [BLE] Connesso a ${name}!`);
    isBleConnected = true;
    stopBlinking(); 
};

tonex.onDisconnect = () => {
    console.log("🔴 [BLE] Disconnesso.");
    isBleConnected = false;
    startBlinking(); 
};

tonex.onMessage = (msg) => {
    // Filtro Bank Select
    if (msg.type === 'cc' && (msg.controller === 0 || msg.controller === 32)) return;
    
    console.log("⬅️ [BLE IN]", msg);
    
    // --- RESET SU PROGRAM CHANGE ---
    if (msg.type === 'program') {
        console.log(`🔄 [SYNC] ToneX PC ${msg.number} -> Reset LED Pedaliera.`);
        
        // 1. Spegni fisicamente i LED
        gboard.allLeds(false);
        
        // 2. IMPORTANTE: Resetta anche il backup, così è coerente
        for(let i=0; i<8; i++) ledStateBackup[i] = false;
    }
};

// =============================================================================
// 4. AVVIO
// =============================================================================

gboard.start();
startBlinking(); // Parte lampeggiando finché non trova il BLE

process.stdin.resume();
process.on('SIGINT', () => {
    console.log('\n🛑 Chiusura...');
    if (blinkInterval) clearInterval(blinkInterval);
    gboard.disconnect();
    process.exit();
});
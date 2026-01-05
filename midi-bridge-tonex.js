const gboard = require('./gboard');       
const tonex = require('./tonexViaBLE');   

console.log('--- MIDI BRIDGE: G-Board <-> ToneX (BLE) ---');

// =============================================================================
// 0. GESTIONE STATO, BACKUP E BLINKING
// =============================================================================

let isBleConnected = false;
let blinkInterval = null;
let ledStateBackup = [false, false, false, false, false, false, false, false]; 

/**
 * Salva lo stato attuale dei LED della GBoard nell'array di backup
 */
function saveLedState() {
    // Salviamo solo se non stiamo già lampeggiando (altrimenti salveremmo il lampeggio!)
    if (!blinkInterval) {
        for(let i=0; i<8; i++) {
            ledStateBackup[i] = gboard.get(i);
        }
        console.log("💾 [SYSTEM] Stato LED salvato");
    }
}

/**
 * Ripristina lo stato dei LED dal backup alla GBoard fisica
 */
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
    
    // Prima di iniziare a lampeggiare, salviamo come eravamo messi
    saveLedState();

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
        
        // Quando il BLE torna, ripristiniamo lo stato salvato prima del lampeggio
        restoreLedState();
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

  // Aggiorniamo anche il backup in tempo reale, così se stacchi l'USB ORA, 
  // abbiamo l'ultimo stato salvato.
  ledStateBackup[index] = status; 
  // Nota: per i gruppi radio bisognerebbe aggiornare tutto l'array, 
  // ma saveLedState() alla disconnessione ci copre le spalle.

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
    
    // Se il BLE non è pronto, lampeggia
    if (!isBleConnected) {
        startBlinking();
    } else {
        // Se il BLE c'è, RIPRISTINIAMO lo stato che avevamo prima della disconnessione USB
        // perché la GBoard si accende sempre con tutti i led spenti.
        restoreLedState();
    }
});

gboard.on('disconnected', () => {
    console.log("⚠️ [USB] G-Board Scollegata.");
    // ⚠️ CRITICO: Salviamo lo stato un attimo prima che la logica interna 
    // consideri il device perso del tutto (o per essere pronti alla riconnessione)
    saveLedState();
});


// --- TONEX (BLE) ---
tonex.onConnect = (name) => {
    console.log(`✅ [BLE] Connesso a ${name}!`);
    isBleConnected = true;
    stopBlinking(); // Questo chiamerà internamente restoreLedState()
};

tonex.onDisconnect = () => {
    console.log("🔴 [BLE] Disconnesso.");
    isBleConnected = false;
    startBlinking(); // Questo chiamerà internamente saveLedState()
};

tonex.onMessage = (msg) => {
    if (msg.type === 'cc' && (msg.controller === 0 || msg.controller === 32)) return;
    console.log("⬅️ [BLE IN]", msg);
    
    // (Opzionale) Se arrivano feedback dal ToneX, aggiorna anche il backup
    /*
    if (msg.type === 'cc' && msg.controller === 18) {
       ledStateBackup[3] = (msg.value > 63);
       gboard.set(3, msg.value > 63);
    }
    */
};

// =============================================================================
// 4. AVVIO
// =============================================================================

gboard.start();

// Avvia lampeggio (in attesa di BLE)
startBlinking();

process.stdin.resume();
process.on('SIGINT', () => {
    console.log('\n🛑 Chiusura...');
    if (blinkInterval) clearInterval(blinkInterval);
    gboard.disconnect();
    process.exit();
});
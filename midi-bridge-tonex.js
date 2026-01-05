const gboard = require('./gboard');       // Gestisce la pedaliera USB (con watchdog)
const tonex = require('./tonexViaBLE');   // Gestisce il ToneX via Bluetooth (ex ble.js)

console.log('--- MIDI BRIDGE: G-Board <-> ToneX (BLE) ---');

// =============================================================================
// 1. FUNZIONI UTILI (HELPER)
// =============================================================================

/**
 * Gestisce un gruppo di pulsanti con logica "Radio Toggle" (Esclusiva).
 * - Pulisce gli altri LED del gruppo.
 * - Esegue actionOn se il tasto viene attivato.
 * - Esegue actionOff se il tasto viene disattivato.
 */
function toggleGroup(index, newStatus, min, max, usbDevice, actionOn, actionOff) {
  // Se siamo fuori dal range, esci
  if (index < min || index > max) return;

  // 1. PULIZIA: Spegni SEMPRE tutti gli altri LED del gruppo
  for (let i = min; i <= max; i++) {
    if (i !== index) {
      usbDevice.set(i, false);
    }
  }

  // 2. GESTIONE STATO CORRENTE
  // Aggiorniamo il LED del tasto premuto sulla pedaliera
  usbDevice.set(index, newStatus);

  // 3. ESECUZIONE LOGICA MIDI VERSO TONEX
  if (newStatus) {
    if (actionOn) actionOn(index);
  } else {
    if (actionOff) actionOff(index);
  }
}


// =============================================================================
// 2. GESTIONE EVENTI G-BOARD (USB)
// =============================================================================

// EVENTO: Quando la G-Board viene connessa fisicamente (rilevata dal watchdog)
gboard.on('connected', () => {
    console.log("🎉 [MAIN] G-Board Rilevata! Inizializzazione...");
    
    // Piccolo gioco di luci all'avvio per confermare connessione
    let i = 0;
    const interval = setInterval(() => {
        if (i > 0) gboard.set(i - 1, false);
        if (i < 4) gboard.set(i, true);
        i++;
        if (i > 4) {
            clearInterval(interval);
            gboard.allLeds(false); // Spegni tutto alla fine
            console.log("✅ [MAIN] Sistema Pronto. Premi un tasto.");
        }
    }, 100);
});

// EVENTO: Quando la G-Board viene scollegata o persa
gboard.on('disconnected', () => {
    console.log("⚠️ [MAIN] G-Board Scollegata. Il Watchdog sta cercando...");
});

// EVENTO: Ricezione messaggi dalla pedaliera (USB -> BLE)
gboard.onMessage = (msg) => {
    // msg.number contiene l'indice del pulsante premuto (0-7)
    // Se la tua GBoard è configurata per mandare Note invece di PC, usa msg.note
    const index = msg.number; 
    
    // Calcoliamo il nuovo stato (invertendo quello attuale del LED)
    const currentLedStatus = gboard.get(index);
    const newStatus = !currentLedStatus;

    console.log(`🎹 [USB IN] Tasto: ${index} | Nuovo Stato: ${newStatus ? 'ON' : 'OFF'}`);

    // --- GRUPPO 1: PRESET (Tasti 0-3) ---
    // Logica: "Radio Button Puro" (Uno attivo, gli altri spenti. Non si spegne se ripremuto).
    if (index >= 0 && index <= 3) {
        // Passiamo 'true' fisso perché un preset si attiva e basta
        toggleGroup(index, true, 0, 3, gboard, 
            (idx) => {
                console.log(`➡️ [BLE OUT] Cambio Preset: ${idx}`);
                tonex.sendProgram(idx, 0); 
            },
            null // Nessuna azione OFF per i preset
        );
    }

    // --- GRUPPO 2: EFFETTI/MODULATION (Tasti 4-7) ---
    // Logica: "Radio Toggle" (Uno attivo alla volta, ma si può spegnere ripremendo).
    else if (index >= 4 && index <= 7) {
        toggleGroup(index, newStatus, 4, 7, gboard,
            (idx) => {
                // ACTION ON: Attiva effetto
                console.log(`➡️ [BLE OUT] Mod ON, Type: ${idx - 3}`);
                tonex.sendCC(32, 127, 0);       // CC 32: Power ON
                tonex.sendCC(33, idx - 3, 0);   // CC 33: Type (4->1, 5->2...)
            },
            (idx) => {
                // ACTION OFF: Disattiva effetto
                console.log(`➡️ [BLE OUT] Mod OFF`);
                tonex.sendCC(32, 0, 0);         // CC 32: Power OFF
            }
        );
    }
};


// =============================================================================
// 3. GESTIONE EVENTI TONEX (BLE)
// =============================================================================

// Ricezione messaggi dal ToneX (BLE -> USB Feedback)
tonex.onMessage = (msg) => {
    // Filtriamo i messaggi di Bank Select (CC 0 e 32) per pulire il log
    if (msg.type === 'cc' && (msg.controller === 0 || msg.controller === 32)) {
        return; 
    }

    console.log("⬅️ [BLE IN]", msg);

    // FEEDBACK: Se cambi preset direttamente dal ToneX (manopola),
    // aggiorniamo i LED della G-Board per riflettere la realtà.
    if (msg.type === 'program') {
        const preset = msg.number;
        if (preset >= 0 && preset <= 3) {
            console.log(`💡 [SYNC] ToneX ha cambiato preset a: ${preset}. Aggiorno LED.`);
            // Aggiorna solo i LED, senza rieseguire la logica MIDI
            for(let i=0; i<=3; i++) {
                gboard.set(i, (i === preset));
            }
        }
    }
};

// =============================================================================
// 4. AVVIO
// =============================================================================

// Avvia il Watchdog USB della GBoard
gboard.start();

// Il modulo tonexViaBLE parte da solo (costruttore) appena importato.
// Assicurati che nel costruttore di tonexViaBLE.js ci sia noble.startScanning().

// Mantieni vivo il processo
process.stdin.resume();

// Gestione chiusura pulita (CTRL+C)
process.on('SIGINT', () => {
    console.log('\n🛑 Chiusura applicazione...');
    gboard.disconnect(); // Spegne i LED e chiude le porte USB
    process.exit();
});
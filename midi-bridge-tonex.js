const gboard = require('./gboard');
const tonex = require('./tonexViaBLE');
const easymidi = require('easymidi'); // Necessario qui per la lista USB

// --- FUNZIONE DI ELENCO DISPOSITIVI ---
function listDevices() {
  console.log('\n🔍 --- SCANSIONE DISPOSITIVI MIDI ---');

  // 1. ELENCO USB (Istantaneo)
  const usbInputs = easymidi.getInputs();
  const usbOutputs = easymidi.getOutputs();

  if (usbInputs.length === 0 && usbOutputs.length === 0) {
    console.log('❌ [USB] Nessun dispositivo trovato.');
  } else {
    usbInputs.forEach(name => console.log(`🔌 [USB] INPUT:  ${name}`));
    usbOutputs.forEach(name => console.log(`🔌 [USB] OUTPUT: ${name}`));
  }

  // 2. ELENCO BLE (Asincrono - apparirà man mano che vengono trovati)
  // Non possiamo "elencarli" tutti subito, dobbiamo aspettare che la scansione parta.
  console.log('📡 [BLE] In attesa di advertisement Bluetooth...\n');
}

// Variabile globale per gestire il timer del lampeggio
let intervalloLampeggio = null;

/**
 * Funzione da chiamare all'avvio dello script.
 * Fa lampeggiare i LED finché non viene fermata.
 */
function avviaAttesaBLE() {
    console.log("In attesa di BLE: avvio lampeggio...");
    
    // Stato iniziale
    let acceso = false;

    // Imposta un intervallo che scatta ogni 500ms
    intervalloLampeggio = setInterval(() => {
        acceso = !acceso; // Inverte lo stato (true -> false -> true...)
        
        // Chiama la tua funzione usb
        if (gboard && typeof gboard.allLeds === 'function') {
            gboard.allLeds(acceso);
        }
    }, 500);
}

/**
 * Funzione da chiamare DENTRO la callback di connessione BLE riuscita.
 * Ferma il lampeggio e spegne (o accende fisso) i LED.
 */
function fermaAttesaBLE() {
    if (intervalloLampeggio) {
        clearInterval(intervalloLampeggio); // Stoppa il timer
        intervalloLampeggio = null;
        
        console.log("BLE Connesso: stop lampeggio.");
        
        // Assicurati che alla fine i LED siano spenti (o true se preferisci accesi fissi)
        if (gboard && typeof gboard.allLeds === 'function') {
            gboard.allLeds(false); 
        }
    }
}

// --- ESEMPIO DI UTILIZZO ---

// 1. Alla partenza chiami:


// 2. Simulazione della logica BLE (inserisci questo nel tuo evento 'connect')
// noble.on('stateChange', ... scan ...)
// noble.on('discover', ... connect ...)

/* Esempio ipotetico di callback:
   device.connect((error) => {
       if (!error) {
           // APPENA CONNESSO, FERMI IL LAMPEGGIO
           fermaAttesaBLE();
           
           // Procedi con il resto...
       }
   });
*/

console.log('--- Node.js MIDI Bridge Started ---');

// Esegui la lista all'avvio
// listDevices();

// ... il resto del tuo codice main.js (usb.start, routing, ecc.) ...
gboard.start('iCON G_Boar V1.03');

avviaAttesaBLE();

tonex.onConnect = (device) => {
  console.log(`✅ [BLE] Connected to ${device}`);
  fermaAttesaBLE()
}

tonex.onDisconnect = (device) => {
  console.log(`✅ [BLE] Disonnected to ${device}`);
  avviaAttesaBLE();
}

// 2. Start BLE Interface (automatically scans when BLE is ready)
// (No manual call needed, the require('./ble') initializes the listeners)

// --- ROUTING LOGIC ---

/**
 * Gestisce un gruppo di pulsanti con logica "Radio Toggle".
 * Pulisce sempre gli altri LED. Esegue actionOn se acceso, actionOff se spento.
 * * @param {number} index - Indice del pulsante premuto
 * @param {boolean} status - Stato del pulsante (true=premuto/on, false=rilasciato/off)
 * @param {number} min - Inizio range gruppo
 * @param {number} max - Fine range gruppo
 * @param {object} usb - Oggetto usb per spegnere/accendere i LED
 * @param {function} actionOn - Callback se il tasto viene ACCESO (riceve index)
 * @param {function} actionOff - Callback se il tasto viene SPENTO (riceve index)
 */
function toggleGroup(index, status, min, max, usb, actionOn, actionOff) {
  // Se siamo fuori dal range, esci subito
  if (index < min || index > max) return;

  // 1. PULIZIA: Spegni SEMPRE tutti gli altri LED del gruppo
  for (let i = min; i <= max; i++) {
    if (i !== index) {
      usb.set(i, false);
    }
  }

  // 2. GESTIONE STATO CORRENTE
  // Aggiorniamo il LED del tasto premuto in base allo status
  usb.set(index, status);

  // 3. ESECUZIONE CALLBACK
  if (status) {
    actionOn(index);
  } else {
    actionOff(index);
  }
}

gboard.onSwitch = (index, status) => {
  console.log("usb switch", index, status ? "on" : "off");
  if (index == 3) {
    // COMP/ POWER 18 000: OFF
    console.log("compressor", status ? "on" : "off");
    tonex.sendCC(18, status ? 127 : 0, 0);
  }
  if (index == 2) {
    // tap tempo
    console.log("taptempo", status ? "on" : "off");
    tonex.sendCC(10, 0, 0);
    gboard.set(index, false)
  }

// ... dentro la callback usb ...

// Gruppo MODULATION (Tasti 4-7)
toggleGroup(index, status, 4, 7, gboard,
  // ACTION ON: Cosa fare quando attivi un effetto
  (idx) => {
    console.log(`MOD ${idx} -> ON type`, idx-3);
    tonex.sendCC(32, 127, 0);     // Power ON
    tonex.sendCC(33, idx - 3, 0); // Seleziona Tipo (4->1, 5->2...)
  },
  // ACTION OFF: Cosa fare quando disattivi lo stesso effetto premendolo di nuovo
  (idx) => {
    console.log(`MOD ${idx} -> OFF`);
    tonex.sendCC(32, 0, 0);       // Power OFF
    // Non serve mandare il CC 33 (Type) quando spegni
  }
);

// Gruppo DELAY (Tasti 0-2)
toggleGroup(index, status, 0, 1, gboard,
  // ACTION ON: Cosa fare quando attivi un effetto
  (idx) => {
    console.log(`DLY ${idx} -> ON type`, idx);
    tonex.sendCC(2, 127, 0);     // Power ON
    tonex.sendCC(3, idx, 0); // Seleziona Tipo (4->1, 5->2...)
  },
  // ACTION OFF: Cosa fare quando disattivi lo stesso effetto premendolo di nuovo
  (idx) => {
    console.log(`DLY ${idx} -> OFF`);
    tonex.sendCC(2, 0, 0);       // Power OFF
    // Non serve mandare il CC 33 (Type) quando spegni
  }
);

  // if (index >= 4 && index <= 7) {
  //   // MOD/ POWER 32 000: OFF 127: ON
  //   for(var n=4;n<=7;n++){
  //     if (index != n) {
  //       console.log("n", n, false)
  //       usb.set(n, false);
  //     }
  //   }
  //   console.log("mod", index, status ? "on" : "off")
  //   ble.sendCC(32, status ? 127 : 0, 0);          
  //   // MOD/ TYPE 33 000: CHORUS - no
  //           // 001: TREMOLO
  //           // 002: PHASER
  //           // 003: FLANGER
  //           // 004: ROTARY
  //   ble.sendCC(33, index -3, 0);     
  // }
// tonex cc
// PRESET DOWN 86 Toggle
// PRESET UP 87 Toggle

// TUNER 9 Toggle

// TAPTEMPO 10 Toggle

// Route USB -> BLE
}

gboard.onMessage = (msg) => {

};

// Route BLE -> USB
tonex.onMessage = (msg) => {
  if (msg.type == "cc" && msg.controller == 0) return
  if (msg.type == "program" ){
    gboard.allLeds(false)
  }
  console.log("ble", msg)
};

// Keep the process alive
process.stdin.resume();


// 🔍 --- SCANSIONE DISPOSITIVI MIDI ---
// 🔌 [USB] INPUT:  SE49 MIDI1
// 🔌 [USB] INPUT:  SE49 MIDI2
// 🔌 [USB] INPUT:  iCON G_Boar V1.03
// 🔌 [USB] INPUT:  Uscita virtuale GarageBand
// 🔌 [USB] OUTPUT: SE49 MIDI1
// 🔌 [USB] OUTPUT: iCON G_Boar V1.03
// 🔌 [USB] OUTPUT: Ingresso virtuale GarageBand
// 🔵 [BLE] TROVATO: MidiPortA (UUID: c333104b07f21a7ea9dbb99e126fa282)

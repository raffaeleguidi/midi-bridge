const easymidi = require('easymidi');
const EventEmitter = require('events');

class GBoardUSBMidi extends EventEmitter {
  constructor() {
    super();
    
    // Configurazione
    this.targetDeviceName = 'iCON G_Boar V1.03';
    this.checkInterval = 2000; // Controlla ogni 2 secondi
    
    // Stato interno
    this.input = null;
    this.output = null;
    this.isConnected = false;
    this.watchdogTimer = null;
    
    // Stato LED (cache)
    this.leds = [false, false, false, false, false, false, false, false];
    
    // Callback esterna (per compatibilità col tuo main attuale)
    this.onMessage = null; 
  }

  // --- PUNTO DI INGRESSO ---
  start() {
    console.log(`🕵️ [GBoard] Avvio Watchdog USB per: "${this.targetDeviceName}"`);
    
    // Eseguiamo subito un controllo
    this.checkConnection();

    // Avviamo il loop infinito di controllo (Watchdog)
    this.watchdogTimer = setInterval(() => {
      this.checkConnection();
    }, this.checkInterval);
  }

  // --- LOGICA CENTRALE DI CONTROLLO ---
  checkConnection() {
    const inputs = easymidi.getInputs();
    const outputs = easymidi.getOutputs();

    // Cerchiamo se il dispositivo è fisicamente presente nel sistema
    const foundInput = inputs.find(name => name.includes(this.targetDeviceName));
    const foundOutput = outputs.find(name => name.includes(this.targetDeviceName));
    const isPhysicallyPresent = foundInput && foundOutput;

    // CASO 1: Dispositivo c'è ma noi non siamo connessi -> CONNETTI
    if (isPhysicallyPresent && !this.isConnected) {
      this.connect(foundInput, foundOutput);
    }
    
    // CASO 2: Dispositivo non c'è più ma noi pensiamo di essere connessi -> DISCONNETTI
    else if (!isPhysicallyPresent && this.isConnected) {
      console.warn("⚠️ [GBoard] Dispositivo perso fisicamente!");
      this.disconnect();
    }
  }

  // --- GESTIONE CONNESSIONE ---
  connect(inputName, outputName) {
    try {
      console.log(`🔌 [GBoard] Tentativo di connessione...`);
      
      this.input = new easymidi.Input(inputName);
      this.output = new easymidi.Output(outputName);
      this.isConnected = true;

      // Setup Listeners
      this.input.on('cc', (msg) => {
        if (this.onMessage) this.onMessage(msg);
      });

      this.input.on('program', (msg) => {
        if (this.onMessage) this.onMessage(msg);
        this.switch(msg.number);
      });

      // Reset iniziale
      this.allLeds(false);

      console.log(`✅ [GBoard] Connesso e pronto.`);
      this.emit('connected'); // Avvisa il main.js

    } catch (err) {
      console.error(`❌ [GBoard] Errore in connessione: ${err.message}`);
      this.disconnect(); // Pulisci subito in caso di fallimento parziale
    }
  }

  // --- GESTIONE DISCONNESSIONE E PULIZIA ---
  disconnect() {
    if (!this.isConnected && !this.input && !this.output) return; // Già pulito

    console.log("🧹 [GBoard] Chiusura porte e pulizia...");

    // Chiudiamo le porte C++ per evitare l'errore N-API
    if (this.input) {
      try { this.input.close(); } catch (e) { console.error("Err close input:", e.message); }
      this.input = null;
    }
    
    if (this.output) {
      try { this.output.close(); } catch (e) { console.error("Err close output:", e.message); }
      this.output = null;
    }

    this.isConnected = false;
    this.emit('disconnected'); // Avvisa il main.js
  }

  // --- METODI OPERATIVI (PROTETTI) ---
  
  get(index) {
    return this.leds[index];
  }

  set(index, status) {
    if (!this.isConnected || !this.output) return;
    this.leds[index] = status;
    try {
      this.output.send("noteon", { note: index, velocity: (status ? 127 : 0), channel: 0 });
    } catch (e) {
      console.error("❌ Errore invio LED (set):", e.message);
      // Se l'invio fallisce, è probabile che il device sia stato staccato.
      // Il watchdog se ne accorgerà al prossimo giro, ma possiamo anticiparlo:
      this.disconnect();
    }
  }

  allLeds(on) {
    if (!this.isConnected || !this.output) return;
    this.leds.forEach((_, index) => {
      this.leds[index] = on;
      try {
        this.output.send("noteon", { note: index, velocity: (on ? 127 : 0), channel: 0 });
      } catch (e) {
        // Ignoriamo errori singoli qui, verranno catturati dal watchdog o dalla prossima set()
      }
    });
  }

  switch(index) {
    if (!this.isConnected || !this.output) return;
    try {
      this.leds[index] = !this.leds[index];
      this.output.send("noteon", { note: index, velocity: (this.leds[index] ? 127 : 0), channel: 0 });
      if (this.onSwitch) this.onSwitch(index, this.leds[index]);
    } catch (error) {
      console.error("❌ Errore switch:", error.message);
      this.disconnect();
    }
  }

  send(type, msg) {
    if (this.isConnected && this.output) {
      try {
        this.output.send(type, msg);
      } catch (e) {
        console.error("❌ Errore send:", e.message);
        this.disconnect();
      }
    }
  }
}

// Esportiamo un'istanza singola (Singleton)
module.exports = new GBoardUSBMidi();
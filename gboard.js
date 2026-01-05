const easymidi = require('easymidi');
const EventEmitter = require('events');
const fs = require('fs'); // Necessario per leggere lo stato su Linux

class GBoardUSBMidi extends EventEmitter {
  constructor() {
    super();
    
    // Configurazione
    this.targetDeviceName = 'iCON G_Boar V1.03';
    this.checkInterval = 3000; // Aumentiamo a 3 secondi per sicurezza
    
    // Stato interno
    this.input = null;
    this.output = null;
    this.isConnected = false;
    this.watchdogTimer = null;
    
    // Stato LED (cache)
    this.leds = [false, false, false, false, false, false, false, false];
    
    // Callback esterna
    this.onMessage = null; 
  }

  // --- PUNTO DI INGRESSO ---
  start() {
    console.log(`🕵️ [GBoard] Avvio Watchdog USB (Linux Safe) per: "${this.targetDeviceName}"`);
    
    this.checkConnection();

    this.watchdogTimer = setInterval(() => {
      this.checkConnection();
    }, this.checkInterval);
  }

  // --- LOGICA CENTRALE DI CONTROLLO (OTTIMIZZATA) ---
  checkConnection() {
    try {
        let isPhysicallyPresent = false;

        // METODO 1: LINUX NATIVE (Leggerissimo, zero memory leak)
        if (process.platform === 'linux') {
            try {
                // Leggiamo la lista delle schede audio registrate dal kernel
                const cards = fs.readFileSync('/proc/asound/cards', 'utf8');
                // Cerchiamo una parte univoca del nome (es. "iCON" o "V1.03")
                // Nota: su Linux i nomi potrebbero apparire leggermente diversi, "iCON" è sicuro.
                if (cards.includes("iCON") || cards.includes("G_Boar")) {
                    isPhysicallyPresent = true;
                }
            } catch (fsErr) {
                // Se fallisce la lettura file (es. permessi), fallback al metodo 2
                console.warn("⚠️ Lettura /proc/asound/cards fallita, uso metodo MIDI standard.");
                isPhysicallyPresent = this.checkViaMidiLib();
            }
        } 
        // METODO 2: MAC/WINDOWS (O Fallback)
        else {
            isPhysicallyPresent = this.checkViaMidiLib();
        }

        // --- LOGICA DI CONNESSIONE ---
        
        // CASO 1: Dispositivo c'è ma noi non siamo connessi -> CONNETTI
        if (isPhysicallyPresent && !this.isConnected) {
            // Dobbiamo trovare i nomi esatti delle porte per connetterci
            const inputs = easymidi.getInputs();
            const outputs = easymidi.getOutputs();
            
            const foundInput = inputs.find(name => name.includes(this.targetDeviceName));
            const foundOutput = outputs.find(name => name.includes(this.targetDeviceName));

            if (foundInput && foundOutput) {
                this.connect(foundInput, foundOutput);
            }
        }
        
        // CASO 2: Dispositivo non c'è più ma noi siamo connessi -> DISCONNETTI
        else if (!isPhysicallyPresent && this.isConnected) {
            console.warn("⚠️ [GBoard] Dispositivo perso fisicamente!");
            this.disconnect();
        }

    } catch (criticalErr) {
        // Questo catch impedisce al programma di crashare se ALSA dà errore "Cannot allocate memory"
        console.error("⚠️ Errore Watchdog (ignorato):", criticalErr.message);
    }
  }

  // Helper per il controllo standard (pesante per ALSA, ok per Mac)
  checkViaMidiLib() {
      const inputs = easymidi.getInputs();
      const outputs = easymidi.getOutputs();
      const hasIn = inputs.some(name => name.includes(this.targetDeviceName));
      const hasOut = outputs.some(name => name.includes(this.targetDeviceName));
      return hasIn && hasOut;
  }

  // --- GESTIONE CONNESSIONE ---
  connect(inputName, outputName) {
    try {
      console.log(`🔌 [GBoard] Tentativo di connessione MIDI...`);
      
      this.input = new easymidi.Input(inputName);
      this.output = new easymidi.Output(outputName);
      this.isConnected = true;

      // Listeners
      this.input.on('cc', (msg) => { if (this.onMessage) this.onMessage(msg); });
      this.input.on('program', (msg) => { 
          if (this.onMessage) this.onMessage(msg);
          this.switch(msg.number);
      });

      // Reset iniziale
      this.allLeds(false);

      console.log(`✅ [GBoard] Connesso e pronto.`);
      this.emit('connected'); 

    } catch (err) {
      console.error(`❌ [GBoard] Errore critico apertura porte: ${err.message}`);
      this.disconnect(); 
    }
  }

  // --- GESTIONE DISCONNESSIONE E PULIZIA ---
  disconnect() {
    if (!this.isConnected && !this.input && !this.output) return; 

    console.log("🧹 [GBoard] Pulizia risorse ALSA...");

    if (this.input) {
      try { this.input.close(); } catch (e) {}
      this.input = null;
    }
    
    if (this.output) {
      try { this.output.close(); } catch (e) {}
      this.output = null;
    }

    this.isConnected = false;
    this.emit('disconnected'); 
  }

  // --- METODI OPERATIVI ---
  get(index) { return this.leds[index]; }

  set(index, status) {
    if (!this.isConnected || !this.output) return;
    this.leds[index] = status;
    try {
      this.output.send("noteon", { note: index, velocity: (status ? 127 : 0), channel: 0 });
    } catch (e) {
      console.error("❌ Send Error (Set):", e.message);
      this.disconnect();
    }
  }

  allLeds(on) {
    if (!this.isConnected || !this.output) return;
    this.leds.forEach((_, index) => {
      this.leds[index] = on;
      try {
        this.output.send("noteon", { note: index, velocity: (on ? 127 : 0), channel: 0 });
      } catch (e) { /* silent fail per bulk ops */ }
    });
  }

  switch(index) {
    if (!this.isConnected || !this.output) return;
    try {
      this.leds[index] = !this.leds[index];
      this.output.send("noteon", { note: index, velocity: (this.leds[index] ? 127 : 0), channel: 0 });
      if (this.onSwitch) this.onSwitch(index, this.leds[index]);
    } catch (error) {
      console.error("❌ Switch Error:", error.message);
      this.disconnect();
    }
  }
}

module.exports = new GBoardUSBMidi();
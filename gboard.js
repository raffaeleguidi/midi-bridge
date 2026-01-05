const easymidi = require('easymidi');

class GBoardUSBMidi {
  constructor() {
    this.input = null;
    this.output = null;
    this.onMessage = null; 
    this.leds = [false, false, false, false, false, false, false, false];
    
    this.targetDeviceName = 'iCON G_Boar V1.03';
    this.isConnected = false;
    this.retryTimer = null;
  }

  // NUOVO METODO: Chiude le porte vecchie per evitare errori N-API
  cleanup() {
    if (this.input) {
      try {
        this.input.close(); // Chiude la porta input C++
      } catch (e) { console.error("Err closing input:", e.message); }
      this.input = null;
    }
    
    if (this.output) {
      try {
        this.output.close(); // Chiude la porta output C++
      } catch (e) { console.error("Err closing output:", e.message); }
      this.output = null;
    }
    
    this.isConnected = false;
  }

  start(deviceNameFilter = this.targetDeviceName) {
    // 1. Pulisci timer pendenti
    if (this.retryTimer) clearTimeout(this.retryTimer);

    // 2. IMPORTANTE: Chiudi eventuali connessioni "zombie" prima di riprovare
    // Questo previene il DeprecationWarning N-API
    this.cleanup();

    console.log(`🔍 [USB] Cerco "${deviceNameFilter}"...`);

    // Ottieni lista device
    const inputs = easymidi.getInputs();
    const outputs = easymidi.getOutputs();

    const foundInput = inputs.find(name => name.includes(deviceNameFilter));
    const foundOutput = outputs.find(name => name.includes(deviceNameFilter));

    // --- SE NON TROVA IL DISPOSITIVO ---
    if (!foundInput || !foundOutput) {
      console.warn(`⚠️ [USB] Dispositivo non trovato Chiusura del programma`);
      process.exit(1);
    }

    // --- SE LO TROVA ---
    try {
      console.log(`✅ [USB] Connesso a: ${foundInput}`);
      
      // Istanziazione nuove porte
      this.input = new easymidi.Input(foundInput);
      this.output = new easymidi.Output(foundOutput);
      this.isConnected = true;

      this.allLeds(false);

      // Gestione Input
      this.input.on('cc', (msg) => {
          if (this.onMessage) this.onMessage(msg);
      });

      this.input.on('program', (msg) => {
          if (this.onMessage) this.onMessage(msg);
          this.switch(msg.number);
      });

      if (this.onConnect) this.onConnect()

    } catch (err) {
      console.error("❌ [USB] Errore apertura porta:", err.message);
      this.cleanup(); // Pulisci tutto se fallisce l'apertura
      this.retryTimer = setTimeout(() => this.start(deviceNameFilter), 5000);
    }
  }

  get(index) {
    return this.leds[index];
  }

  set(index, status) {
    if (!this.isConnected || !this.output) return; 
    this.leds[index] = status;
    try {
        this.output.send("noteon", { note: index, velocity: (this.leds[index] ? 127: 0), channel: 0});
    } catch (e) { 
        console.error("Errore set LED (Device perso?)");
        this.cleanup(); // Se fallisce l'invio, consideriamo il device perso
        this.start();   // Riavvia la ricerca
    }
  }

  allLeds(on) {
    if (!this.isConnected || !this.output) return; 
    
    this.leds.forEach((_, index) => {
      this.leds[index] = on;
      try {
        this.output.send("noteon", { note: index, velocity: (on ? 127: 0), channel: 0})
      } catch (e) { 
          // Ignoriamo errori singoli qui per non spammare il log, 
          // tanto il prossimo comando fallirà e riavvierà il ciclo
      }
    });
  }

  switch(index){
    if (!this.isConnected || !this.output) return;
    try {          
        this.leds[index] = !this.leds[index];
        this.output.send("noteon", { note: index, velocity: (this.leds[index] ? 127: 0), channel: 0});
        if (this.onSwitch) this.onSwitch(index, this.leds[index]);
    } catch (error) {
        console.error("Errore switch:", error.message);
    }
  }

  send(type, msg) {
    if (this.isConnected && this.output) {
      try {
        this.output.send(type, msg);
      } catch (e) { console.error("Errore send:", e.message); }
    }
  }
}

module.exports = new GBoardUSBMidi();

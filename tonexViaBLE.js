const noble = require('@abandonware/noble');

// Standard MIDI Service & Characteristic UUIDs
const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const MIDI_CHAR_UUID    = '7772e5db-3868-4112-a1a9-f2669d106bf3';

class TonexViaBLE {

  constructor() {
    this.peripheral = null;
    this.characteristic = null;
    
    // Callbacks per l'applicazione principale
    this.onMessage = null;
    this.onConnect = null;
    this.onDisconnect = null; // <--- NUOVO: Callback per la disconnessione

    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        noble.startScanning([MIDI_SERVICE_UUID], false);
      } else {
        noble.stopScanning();
      }
    });

    noble.on('discover', (peripheral) => {
      const localName = peripheral.advertisement.localName || 'Sconosciuto';
      console.log(`🔵 [BLE] TROVATO: ${localName} (UUID: ${peripheral.uuid})`);
      
      // Procediamo alla connessione
      this.connect(peripheral);
    });
  }

  connect(peripheral) {
    console.log(`🔎 [BLE] Found device: ${peripheral.advertisement.localName}`);
    noble.stopScanning(); // Stop scanning to save resources

    peripheral.connect((err) => {
      if (err) { console.error('Connection error', err); return; }
      
      // Salviamo il riferimento alla periferica
      this.peripheral = peripheral;

      // ---------------------------------------------------------
      // GESTIONE DISCONNESSIONE
      // ---------------------------------------------------------
      peripheral.once('disconnect', () => {
        console.log(`🔴 [BLE] Disconnesso da: ${peripheral.advertisement.localName}`);
        
        // Pulizia variabili interne
        this.characteristic = null;
        this.peripheral = null;

        // 1. Lancia evento upstream (per fermare i LED, ecc.)
        if (this.onDisconnect) this.onDisconnect();

        // 2. Rimettiti automaticamente in ascolto (Riavvia scansione)
        console.log('📡 [BLE] Riavvio scansione per riconnessione...');
        noble.startScanning([MIDI_SERVICE_UUID], false);
      });
      // ---------------------------------------------------------

      if (this.onConnect) this.onConnect(peripheral.advertisement.localName)

      peripheral.discoverServices([MIDI_SERVICE_UUID], (err, services) => {
        // Controllo se i servizi esistono (per evitare crash se il device non è MIDI compliant al 100%)
        if (!services || services.length === 0) {
            console.warn("⚠️ [BLE] Nessun servizio MIDI trovato.");
            return;
        }

        services[0].discoverCharacteristics([MIDI_CHAR_UUID], (err, chars) => {
          if (!chars || chars.length === 0) {
            console.warn("⚠️ [BLE] Caratteristica MIDI non trovata.");
            return;
          }
          this.characteristic = chars[0];
          this.subscribe();
        });
      });
    });
  }

  subscribe() {
    if (!this.characteristic) return;

    this.characteristic.subscribe((err) => {
      if (err) console.error('Subscription error');
    });

    this.characteristic.on('data', (data, isNotification) => {
      this.parsePacket(data);
    });
  }

  parsePacket(buffer) {
    if (buffer.length < 3) return;

    // Helper: controlla se un byte è un dato valido (0-127)
    const isDataByte = (b) => (b & 0x80) === 0;

    // Scansioniamo il buffer byte per byte (saltando Header e primo Timestamp)
    for (let i = 2; i < buffer.length; i++) {
      const statusByte = buffer[i];

      // Ci interessano solo i byte di Stato (>= 128)
      if ((statusByte & 0x80) === 0x80) {
        
        const messageType = statusByte & 0xF0;
        const channel = statusByte & 0x0F;

        // --- PROGRAM CHANGE (0xC0) ---
        if (messageType === 0xC0 && (i + 1) < buffer.length && isDataByte(buffer[i + 1])) {
          const program = buffer[i + 1];
          console.log(`💾 [BLE IN] PC: ${program} Ch: ${channel + 1}`);
          if (this.onMessage) this.onMessage({ type: 'program', number: program, channel });
          i += 1; 
        }

        // --- CONTROL CHANGE (0xB0) ---
        else if (messageType === 0xB0 && (i + 2) < buffer.length && isDataByte(buffer[i + 1]) && isDataByte(buffer[i + 2])) {
          const controller = buffer[i + 1];
          const value = buffer[i + 2];
          console.log(`🎛️ [BLE IN] CC: ${controller} Val: ${value} Ch: ${channel + 1}`);
          if (this.onMessage) this.onMessage({ type: 'cc', controller, value, channel });
          i += 2; 
        }

        // --- NOTE ON (0x90) ---
        else if (messageType === 0x90 && (i + 2) < buffer.length && isDataByte(buffer[i + 1]) && isDataByte(buffer[i + 2])) {
          const note = buffer[i + 1];
          const velocity = buffer[i + 2];
          if (velocity > 0) {
            if (this.onMessage) this.onMessage({ type: 'noteon', note, velocity, channel });
          } else {
            if (this.onMessage) this.onMessage({ type: 'noteoff', note, velocity: 0, channel });
          }
          i += 2;
        }

        // --- NOTE OFF (0x80) ---
        else if (messageType === 0x80 && (i + 2) < buffer.length && isDataByte(buffer[i + 1]) && isDataByte(buffer[i + 2])) {
          const note = buffer[i + 1];
          if (this.onMessage) this.onMessage({ type: 'noteoff', note, velocity: 0, channel });
          i += 2;
        }
      }
    }
  }

  sendCC(controller, value, channel = 0) {
    if (!this.characteristic) {
      console.warn('⚠️ [BLE] Nessun dispositivo connesso per inviare CC.');
      return;
    }
    const status = 0xB0 + channel;
    const packet = Buffer.from([0x80, 0x80, status, controller, value]);
    this.characteristic.write(packet, true);
    console.log(`📡 [BLE OUT] CC: ${controller} Val: ${value} Ch: ${channel + 1}`);
  }

  sendProgram(program, channel = 0) {
    if (!this.characteristic) {
      console.warn('⚠️ [BLE] Nessun dispositivo connesso per inviare PC.');
      return;
    }
    const status = 0xC0 + channel;
    const packet = Buffer.from([0x80, 0x80, status, program]);
    this.characteristic.write(packet, true);
    console.log(`📡 [BLE OUT] PC: ${program} Ch: ${channel + 1}`);
  }

  sendNoteOn(note, velocity) {
    if (!this.characteristic) return;
    const packet = Buffer.from([0x80, 0x80, 0x90, note, velocity]);
    this.characteristic.write(packet, true); 
  }
}

module.exports = new TonexViaBLE();
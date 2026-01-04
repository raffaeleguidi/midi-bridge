const noble = require('@abandonware/noble');

// Standard MIDI Service & Characteristic UUIDs
const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const MIDI_CHAR_UUID    = '7772e5db-3868-4112-a1a9-f2669d106bf3';

class BleMidi {

  constructor() {
    this.peripheral = null;
    this.characteristic = null;
    this.onMessage = null;

    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        // console.log('📡 [BLE] Scanning for MIDI devices...'); // Rimuoviamo questo log generico
        noble.startScanning([MIDI_SERVICE_UUID], false);
      } else {
        noble.stopScanning();
      }
    });

    noble.on('discover', (peripheral) => {
      // QUI AGGIUNGIAMO IL LOG PER LA LISTA
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
      console.log(`✅ [BLE] Connected to ${peripheral.advertisement.localName}`);

      peripheral.discoverServices([MIDI_SERVICE_UUID], (err, services) => {
        services[0].discoverCharacteristics([MIDI_CHAR_UUID], (err, chars) => {
          this.characteristic = chars[0];
          this.subscribe();
        });
      });
    });
  }

  subscribe() {
    this.characteristic.subscribe((err) => {
      if (err) console.error('Subscription error');
    });

    this.characteristic.on('data', (data, isNotification) => {
      this.parsePacket(data);
    });
  }

  // ... dentro la classe BleMidi in ble.js ...

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
        // Richiede 1 byte di dati valido successivo
        if (messageType === 0xC0 && (i + 1) < buffer.length && isDataByte(buffer[i + 1])) {
          const program = buffer[i + 1];
          console.log(`💾 [BLE IN] PC: ${program} Ch: ${channel + 1}`);
          if (this.onMessage) this.onMessage({ type: 'program', number: program, channel });
          i += 1; // Avanziamo di 1
        }

        // --- CONTROL CHANGE (0xB0) ---
        // Richiede 2 byte di dati validi successivi
        else if (messageType === 0xB0 && (i + 2) < buffer.length && isDataByte(buffer[i + 1]) && isDataByte(buffer[i + 2])) {
          const controller = buffer[i + 1];
          const value = buffer[i + 2];
          console.log(`🎛️ [BLE IN] CC: ${controller} Val: ${value} Ch: ${channel + 1}`);
          if (this.onMessage) this.onMessage({ type: 'cc', controller, value, channel });
          i += 2; // Avanziamo di 2
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
        // Questa è la correzione critica: controlliamo isDataByte!
        // Se buffer[i+1] è 0xC0 (192), isDataByte darà false e entreremo nell'else (ignorando questo 0x80 come Timestamp)
        else if (messageType === 0x80 && (i + 2) < buffer.length && isDataByte(buffer[i + 1]) && isDataByte(buffer[i + 2])) {
          const note = buffer[i + 1];
          if (this.onMessage) this.onMessage({ type: 'noteoff', note, velocity: 0, channel });
          i += 2;
        }
        
        // Se nessuno dei precedenti IF è vero, significa che 'statusByte' era un Timestamp o un byte spurio.
        // Il ciclo 'for' semplicemente continuerà al prossimo byte (i++), che sarà il vero Status Byte (es. 0xC0).
      }
    }
  }

  /**
   * Invia un Control Change (CC)
   * @param {number} controller - Il numero del controller (0-127)
   * @param {number} value - Il valore (0-127)
   * @param {number} channel - Il canale MIDI (0-15, default 0)
   */
  sendCC(controller, value, channel = 0) {
    if (!this.characteristic) {
      console.warn('⚠️ [BLE] Nessun dispositivo connesso per inviare CC.');
      return;
    }

    // Costruzione del pacchetto BLE MIDI
    // Byte 0: 0x80 (Header - Start of packet)
    // Byte 1: 0x80 (Timestamp - "Adesso")
    // Byte 2: Status Byte (0xB0 = CC + canale)
    // Byte 3: Controller Number
    // Byte 4: Value
    
    const status = 0xB0 + channel; // 0xB0 è il codice base per i CC
    const packet = Buffer.from([0x80, 0x80, status, controller, value]);

    // Scrittura senza risposta (writeWithoutResponse) per bassa latenza
    this.characteristic.write(packet, true);
    console.log(`📡 [BLE OUT] CC: ${controller} Val: ${value} Ch: ${channel + 1}`);
  }

  /**
   * Invia un Program Change (PC)
   * @param {number} program - Il numero del programma/patch (0-127)
   * @param {number} channel - Il canale MIDI (0-15, default 0)
   */
  sendProgram(program, channel = 0) {
    if (!this.characteristic) {
      console.warn('⚠️ [BLE] Nessun dispositivo connesso per inviare PC.');
      return;
    }

    // Costruzione del pacchetto BLE MIDI per Program Change
    // Il Program Change ha solo 2 byte di dati MIDI (Status + Programma), non 3.
    
    const status = 0xC0 + channel; // 0xC0 è il codice base per i PC
    const packet = Buffer.from([0x80, 0x80, status, program]);

    this.characteristic.write(packet, true);
    console.log(`📡 [BLE OUT] PC: ${program} Ch: ${channel + 1}`);
  }

  sendNoteOn(note, velocity) {
    if (!this.characteristic) return;

    // Construct a basic BLE MIDI Packet
    // Byte 0: 0x80 (Header)
    // Byte 1: 0x80 (Timestamp)
    // Byte 2: 0x90 (Note On)
    // Byte 3: Note
    // Byte 4: Velocity
    const packet = Buffer.from([0x80, 0x80, 0x90, note, velocity]);
    
    // Write without response for speed
    this.characteristic.write(packet, true); 
  }
}

module.exports = new BleMidi();
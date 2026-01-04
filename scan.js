const easymidi = require('easymidi');
const noble = require('@abandonware/noble');

const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';

console.log('--- INVENTARIO DISPOSITIVI MIDI ---\n');

// 1. USB
const usbIn = easymidi.getInputs();
const usbOut = easymidi.getOutputs();
console.log('--- USB (Cablati) ---');
usbIn.forEach(d => console.log(`🔌 INPUT:  ${d}`));
usbOut.forEach(d => console.log(`🔌 OUTPUT: ${d}`));
if (usbIn.length === 0) console.log('   (Nessun input USB)');

console.log('\n--- BLE (Bluetooth) ---');
console.log('📡 Scansione in corso per 5 secondi...');

// 2. BLE
noble.on('stateChange', (state) => {
  if (state === 'poweredOn') {
    noble.startScanning([MIDI_SERVICE_UUID], false);
    
    // Ferma tutto dopo 5 secondi
    setTimeout(() => {
        noble.stopScanning();
        console.log('\n✅ Scansione completata.');
        process.exit(0);
    }, 5000);
  }
});

noble.on('discover', (peripheral) => {
    const name = peripheral.advertisement.localName || 'Device senza nome';
    console.log(`🔵 DEVICE: ${name} | UUID: ${peripheral.uuid} | RSSI: ${peripheral.rssi}`);
});


// --- INVENTARIO DISPOSITIVI MIDI ---

// --- USB (Cablati) ---
// 🔌 INPUT:  SE49 MIDI1
// 🔌 INPUT:  SE49 MIDI2
// 🔌 INPUT:  iCON G_Boar V1.03
// 🔌 INPUT:  Uscita virtuale GarageBand
// 🔌 OUTPUT: SE49 MIDI1
// 🔌 OUTPUT: iCON G_Boar V1.03
// 🔌 OUTPUT: Ingresso virtuale GarageBand

// --- BLE (Bluetooth) ---
// 📡 Scansione in corso per 5 secondi...
// 🔵 DEVICE: Device senza nome | UUID: c333104b07f21a7ea9dbb99e126fa282 | RSSI: -57
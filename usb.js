const easymidi = require('easymidi');

class UsbMidi {
  constructor() {
    this.input = null;
    this.output = null;
    this.onMessage = null; // Callback for main.js
    this.leds = [false, false, false, false, false, false, false, false]
  }

  

  start(deviceNameFilter = '') {
    // Get all connected devices
    const inputs = easymidi.getInputs();
    const outputs = easymidi.getOutputs();

    // Find a device that matches the name (e.g., "Keystation") or pick the first one
    const foundInput = inputs.find(name => name.includes(deviceNameFilter)) || inputs[0];
    const foundOutput = outputs.find(name => name.includes(deviceNameFilter)) || outputs[0];

    if (!foundInput) {
      console.log('⚠️ [USB] No USB MIDI device found.');
      return;
    }

    console.log(`✅ [USB] Connected to: ${foundInput}`);

    // Open Input
    this.input = new easymidi.Input(foundInput);
    
    // Open Output
    this.output = new easymidi.Output(foundOutput);

    this.allLights(false)

    this.input.on('cc', (msg) => {
        if (this.onMessage) this.onMessage(msg);
    })
    this.input.on('program', (msg) => {
        // console.log(`🎹 [USB IN]:`, msg);
        if (this.onMessage) this.onMessage(msg);
        this.switch(msg.number)
    })

  }

  get(index) {
    return this.leds[index];
  }

  set(index, status) {
    this.leds[index] = status;
    this.output.send("noteon", { note: index, velocity: (this.leds[index] ? 127: 0), channel: 0});
  }

  allLights(on) {
    this.leds.forEach((led, index) => {
      led = on;
      this.leds[index] = on;
      this.output.send("noteon", { note: index, velocity: (led ? 127: 0), channel: 0})
    });
  }

  switch(index){
    try { // gboard could not be connected            
        this.leds[index] = !this.leds[index];
        // console.log("turning led", index, this.leds[index] ? "on" : "off")
        this.output.send("noteon", { note: index, velocity: (this.leds[index] ? 127: 0), channel: 0});
        if (this.onSwitch) this.onSwitch(index, this.leds[index]);
    } catch (error) {
        // noop
    }
}

  send(type, msg) {
    if (this.output) {
      this.output.send(type, msg);
    }
  }
}

module.exports = new UsbMidi();
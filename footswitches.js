const Gpio = require('onoff').Gpio;
var shell = require('shelljs');

console.log(new Date(), 'initializing gpio');
if (shell.exec('raspi-gpio set 17 pu').code !== 0 ||       // Pin 17: Input, Pull Up (Resistenza interna attivata)
    shell.exec('raspi-gpio set 27 pu').code !== 0 ||       // Pin 27: Input, Pull Up
    shell.exec('raspi-gpio set 4  pu').code !== 0 ||       // Pin 4:  Input, Pull Up
    shell.exec('raspi-gpio set 22 pu').code !== 0 ||       // Pin 22: Input, Pull Up
    shell.exec('raspi-gpio set 18 op pn dh').code !== 0) { // Pin 18: Output, Pull None (No resistenza), Drive High (Livello alto)
    console.error(new Date(), 'Error: init failed');
    shell.exit(1);
}

const button1 = new Gpio(4, 'in', 'both', {debounceTimeout: 10});
const button2 = new Gpio(27, 'in', 'both', {debounceTimeout: 10});
const button3 = new Gpio(17, 'in', 'both', {debounceTimeout: 10});
const button4 = new Gpio(22, 'in', 'both', {debounceTimeout: 10});


var held = {
  number: null,
  since: null
};

function checkClose(one, another, cb){
  if (one -1 == another || another -1 == one) {
    cb(Math.min(one, another))
  }
}

const led = new Gpio(18, 'out');
function setLeds(number, value){ // 0=on
    led.writeSync(value); 
}


// function remap(number){
//   switch(number){
//     case 0: 
//     case 1: 
//     case 2: 
//     case 3: 
//         setLights(0,3,number);
//         setLights(4,6, 4);
//         mg30Out.send("program", {channel: 0, number: (number + bank*4) });
//         console.log("sent PC", held.number)
//         break;
//     case 4:
//     case 5:
//     case 6:
//         setLights(4,6,number);
//         setScene(number-4);
//         break; 
//     case 7:
//         setLights(4,6,4);
//         setLights(0,3,0);
//         setLights(7,7,7);
//         setTimeout(function(){
//             setLights(7,7,8);
//         }, 1000)
//         bank = 0;
//         mg30Out.send("program", {channel: 0, number: 0});
//         console.log("going home")
//         break; 
//     case 1: 
//     case 2: 
//     case 3: 
//     default:
//         console.log("unused switch", number)
//   }
// }

function handle(number){
  const lag = Date.now() - held.since;
    // check correlations
  if ( lag <= 3) {
    checkClose(number, held.number, function(combo){
      // handle two footswitches pushed at once
      console.log("combo", combo);
      if (combo == 0) { 
        // do something...
      } else if (combo == 2) {
        // do something else...
      }
    });
    held.number = null;
  } else {
    setTimeout(function(){
      if (held.number != null) {
        remap(held.number)
        held.number=null; held.since=null;
      }
    }, 3)
    held.number = number;
    held.since = Date.now();
  }
}


function resetPeripherals(){
    try {
        setLights(4,6,4);
        setLights(0,3,0);
        setLights(7,7,8);
    } catch (error) {
        // noop        
    }
}


function init(){
  try {
    setLeds(0, 0);
  } catch (error) {
    console.log("not there yet")
    setTimeout(init, 1000);  
  }
}


function handleFootswitch(button, value){
  console.log(new Date(), "button", button, value == 0 ? "down": "up");
  if (value == 0){ // down
      console.log("pushed", value)
      setLeds(button, 1);
      switch(button){
          case 0:
            // do something
            break;
          case 1:
            // do something else 
            break;
          case 2:
            // do something else again
              break;
          case 3:
            // do something else again and again
            break;
        }
  } else {
      setLeds(button, 1);
  }
}

button1.watch((err, value) => handleFootswitch(0,value));
button2.watch((err, value) => handleFootswitch(1,value));
button4.watch((err, value) => handleFootswitch(2,value));
button3.watch((err, value) => handleFootswitch(3,value));

init();

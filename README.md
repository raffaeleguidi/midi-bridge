**MIDI-Bridge** nasce con l'obiettivo di creare un footswitch intelligente per **Tonex**, sfruttando hardware già disponibile in casa.

Il progetto integra diversi dispositivi per ottenere un controllo flessibile e potente:
*   ✅ **G-Board** e **M-Vave MS1**: Utilizzati come controller fisici.
*   ✅ **Raspberry Pi**: Il cuore del sistema che gestisce i segnali.
*   ✅ **Node.js**: L'ambiente di esecuzione per la logica "intelligente" del footswitch.

---

## 🛠 Tecnologie e Librerie

Questo progetto è stato costruito utilizzando le seguenti tecnologie e librerie open source:

### Core
*   **Node.js**: Runtime JavaScript per l'orchestrazione MIDI e GPIO.
*   **Raspberry Pi**: Piattaforma hardware.

### Librerie Principali
Ecco l'elenco delle dipendenze chiave utilizzate:

| Libreria | Scopo |
| :--- | :--- |
| **onoff** | Gestione GPIO per i footswitch e LED |
| **shelljs** | Esecuzione comandi di sistema (es. configurazione pin) |
| **@abandonware/noble** | Gestione Bluetooth LE per M-Vave MS1 |
| **yargs** | Parsing degli argomenti da riga di comando |

> *Per l'elenco completo delle dipendenze, consultare il file `package.json`.*

---

## 💻 Installazione

Segui questi passaggi per configurare l'ambiente di sviluppo:

### Prerequisiti
*   Assicurati di avere installato **Node.js** e **npm** sul Raspberry Pi.

### Passaggi

1.  **Clona la repository**
    ```bash
    git clone https://github.com/tuo-username/midi-bridge.git
    ```

2.  **Entra nella cartella del progetto**
    ```bash
    cd midi-bridge
    ```

3.  **Installa le dipendenze**
    ```bash
    npm install
    ```

---

## 🚀 Utilizzo

Ecco come avviare il progetto:

```bash
# Comando per avviare l'applicazione
npm start

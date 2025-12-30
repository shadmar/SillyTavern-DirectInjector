# ⚡ Direct Injector & Scenario Chains
### A SillyTavern Extension

**Direct Injector** is a powerful floating control panel for SillyTavern that allows you to act as the "Director" of your roleplay. It lets you inject specific instructions, narrative cues, or logic into the prompt on-the-fly, without needing to edit the character card or manually type system commands.

It features a **Scenario Chain** system that automates complex interactions, loops, and "slow burn" sequences.

![Preview](https://via.placeholder.com/800x400?text=Direct+Injector+Preview+Image) 
*(Replace with an actual screenshot of your panel)*

---

## ⚠️ Requirements

This extension **requires** the following library to function:

* **[SillyTavern-LALib](https://github.com/LenAnderson/SillyTavern-LALib)** *(LenAnderson's Library)*

**Why?** This extension relies on the advanced slash command handling (specifically `/flushinject` and robust injection management) provided by LALib. **Please install LALib via the SillyTavern "Download Extensions" menu before using this tool.**

---

## ✨ Key Features

* **⚡ Direct Injection Buttons:** Instant access to a grid of custom buttons. Click one to inject specific text (e.g., combat moves, narrative changes, behavior overrides) into the chat context.
* **🔗 Scenario Chains (New!):** Script a sequence of events that automatically advance after every AI reply.
    * Create loops (e.g., `Attack` -> `Block` -> `Attack`).
    * Build "Slow Burn" narratives that repeat tension-building steps before a climax.
* **🛠️ Fully Configurable:** Create, edit, and reorder buttons and chains directly within the extension settings. No JSON editing required.
* **👻 Ephemeral vs. Permanent:**
    * **Ephemeral:** Instructions are sent once and disappear (invisible to chat history). Perfect for steering the AI.
    * **Permanent:** Instructions stay in the context until you flush them.
* **🧹 Smart Flush:** Instantly clear your injections. If using Permanent mode, the extension intelligently cleans up the specific text it added.

---

## 🚀 Scenario Chains: The Power of Repetition

The standout feature of this extension is the **Chain System**. Instead of clicking a button every turn, you can define a "playlist" of instructions.

### How it works:
1.  **Start:** Click a Chain (e.g., "Boss Fight"). The first instruction is injected.
2.  **Interact:** You roleplay as normal.
3.  **Auto-Advance:** As soon as the AI replies, the extension automatically queues the *next* instruction in the list for your next turn.

### The "Slow Burn" Technique
You can add the same button to a chain multiple times to create pacing.

**Example: The "Long Quest" Chain**
You can configure a chain that forces exploration multiple times before allowing a resolution:
1.  `Explore Area`
2.  `Find Clue`
3.  `Explore Area` (Repeat)
4.  `Explore Area` (Repeat)
5.  `Encounter Miniboss`
6.  `Explore Area` (Repeat)
7.  `Find Final Boss`
8.  `Epic Victory`

This ensures the AI doesn't rush to the ending immediately, forcing a longer, more immersive narrative arc.

---

## 📦 Installation

1.  Ensure you have installed **SillyTavern-LALib**.
2.  Open your SillyTavern installation folder.
3.  Navigate to `public/scripts/extensions/third-party/`.
4.  Clone this repository or create a folder named `Lorebook-Keys` and paste the files there.
    ```bash
    git clone [https://github.com/YOUR_USERNAME/SillyTavern-Direct-Injector.git](https://github.com/YOUR_USERNAME/SillyTavern-Direct-Injector.git)
    ```
5.  Restart SillyTavern.
6.  The **Direct Injector** icon (⚡) will appear in the top bar.

---

## 📖 Usage Guide

### 1. The Floating Panel
* **Tabs:** Switch between **Buttons** (Single action) and **Chains** (Sequences).
* **Minus (-):** Minimizes the panel to a header bar so it doesn't block your view.
* **Footer Controls:**
    * **Level (Depth):** How far back in the prompt the text is inserted. `0` = End of prompt (Strongest).
    * **Eph (Ephemeral):** If checked, the text vanishes after one turn.
    * **Flush:** Clears active injections.

### 2. Creating Buttons
1.  Open the Extensions Settings menu (top of SillyTavern).
2.  Select **Injector Settings**.
3.  Enter a **Label** (short name for the button).
4.  Enter the **Content** (the actual text prompt to send to the AI).
    * *Tip:* Use brackets for system instructions, e.g., `[System: The enemy is now enraged and attacks recklessly.]`
5.  Click **Add Button**.

### 3. Creating Chains
1.  In Settings, scroll to **Create Chain**.
2.  Give the chain a **Name**.
3.  Use the dropdown to select a button and click **(+)**.
4.  **Repeat as needed:** You can add the same button multiple times!
    * *Sequence:* `Tease` -> `Tease` -> `Tease` -> `Action`.
5.  Click **Save Chain**.

---

## 🔧 Technical Notes

* This extension utilizes LALib's command infrastructure.
* **Ephemeral Mode:** Uses `/flushinject` to clear the buffer.
* **Permanent Mode:** The extension tracks the IDs of buttons you pressed and manually clears them via empty injections when you click Flush.
* **Sanitization:** Input text is automatically escaped to prevent command errors, so feel free to use quotes (`"`) and newlines in your instructions.

---

## 📜 License

[MIT License](LICENSE)
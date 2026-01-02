import { getContext, extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

const extensionName = "Lorebook Keys";
const extensionKey = "lorebook_keys";

// --- GLOBAL VARIABLES ---
let editingIndex = null;
let editingChainIndex = null;
let activeChain = null;       
let pausedChainState = null;  
let currentChainSteps = [];   
let lastInjectedBtn = null;   
let isRetrying = false;       
const activePerms = new Set();
const activeEphs = new Set();

// --- DEFAULTS ---
const DEFAULT_BUTTONS = [
    { label: "Slash", content: "[Attack with your main weapon, aiming for a weak point.]", defaultDepth: 0, ephemeral: true },
    { label: "Block", content: "[Raise your defense to deflect the incoming attack.]", defaultDepth: 1, ephemeral: true },
    { label: "Dodge", content: "[Roll to the side to evade the attack completely.]", defaultDepth: 1, ephemeral: true },
    { label: "Fireball", content: "[Cast a powerful Fireball spell at the enemy.]", defaultDepth: 1, ephemeral: true },
    { label: "Heal", content: "[Drink a potion or cast a spell to restore health.]", defaultDepth: 1, ephemeral: true },
    { label: "Buff", content: "[Cast a spell to increase your strength and speed.]", defaultDepth: 1, ephemeral: true },
    { label: "Scout", content: "[Look around carefully for traps, hidden enemies, or clues.]", defaultDepth: 1, ephemeral: true },
    { label: "Stealth", content: "[Move silently and hide in the shadows to avoid detection.]", defaultDepth: 1, ephemeral: true },
    { label: "Taunt", content: "[Yell a challenge to draw the enemy's attention.]", defaultDepth: 1, ephemeral: true },
    { label: "Loot", content: "[Search the defeated enemy or the area for valuable items.]", defaultDepth: 1, ephemeral: true },
    { label: "Persuade", content: "[Attempt to reason with the creature or NPC.]", defaultDepth: 1, ephemeral: true },
    { label: "Finisher", content: "[Unleash your ultimate technique to end the fight.]", defaultDepth: 1, ephemeral: true }
];

const DEFAULT_CHAINS = [
    { name: "Standard Combat", steps: ["Buff", "Taunt", "Slash", "Block", "Slash", "Loot"] },
    { name: "Dungeon Crawl", steps: ["Stealth", "Scout", "Stealth", "Scout", "Loot"] },
    { name: "Epic Boss", steps: ["Scout", "Buff", "Taunt", "Slash", "Block", "Dodge", "Fireball", "Heal", "Finisher", "Loot"] }
];

// --- COMMAND EXECUTION ---

async function executeCommand(command) {
    try {
        if (window.slashCommandParser && typeof window.slashCommandParser.parse === 'function') {
            await window.slashCommandParser.parse(command).execute();
            return;
        }
        const context = getContext();
        if (context && context.slashCommandParser) {
            await context.slashCommandParser.parse(command).execute();
            return;
        }
        await new SlashCommandParser().parse(command).execute();
    } catch (error) {
        console.error(`[${extensionName}] Execution Error:`, error);
        if (!command.includes('flush') && window.toastr) toastr.error("Command failed: " + error.message);
    }
}

// --- INJECTION LOGIC ---

async function injectButton(btnData, isAuto = false) {
    if (!btnData || !btnData.label) return;

    lastInjectedBtn = btnData; 

    const depth = parseInt($('#lb-global-depth').val()) || 0;
    const role = $('#lb-global-role').val() || 'system';
    
    // --- FORCE EPHEMERAL FOR CHAINS ---
    // If a chain is active, we force ephemeral. 
    // Otherwise, we respect the user's checkbox setting for manual buttons.
    let isEphemeral = $('#lb-global-eph').is(':checked');
    if (activeChain) {
        isEphemeral = true;
    }

    const id = String(btnData.label).replace(/[^a-zA-Z0-9]/g, '_');
    let rawContent = String(btnData.content || `[${btnData.label}]`);
    const safeContent = rawContent.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    const command = `/inject id="${id}" ephemeral="${isEphemeral}" depth=${depth} role="${role}" position="chat" "${safeContent}"`;

    await executeCommand(command);

    if (isAuto) toastr.info(`Chain: ${btnData.label}`);
    else toastr.success(`Injected: ${btnData.label}`, "", { timeOut: 1000 });

    if (isEphemeral) {
        activeEphs.add(id);
        activePerms.delete(id);
    } else {
        activePerms.add(id);
        activeEphs.delete(id);
    }
    updateVisualState();
}

async function clearEphemeralOnly() {
    await executeCommand('/flushinject');
    activeEphs.clear();
    updateVisualState();
}

async function flushInjections() {
    const isEphemeralMode = $('#lb-global-eph').is(':checked');

    if (activeChain) {
        activeChain = null;
        pausedChainState = null;
        toastr.info("Chain Stopped.");
        refreshUI(); 
    }

    // Always clear ephemeral if we are stopping a chain or if checkbox is checked
    if (isEphemeralMode || activeChain === null) {
        await clearEphemeralOnly();
        if(isEphemeralMode) toastr.info("Flushed ephemeral.");
    } 
    
    // Only clear permanent if we are NOT in ephemeral mode and NO chain was running
    if (!isEphemeralMode && !activeChain) {
        const settings = getSettings();
        const buttons = settings.buttons || [];
        for (const btn of buttons) {
            if(btn.label) {
                const id = btn.label.replace(/[^a-zA-Z0-9]/g, '_');
                await executeCommand(`/inject id="${id}" ""`);
            }
        }
        activePerms.clear();
        toastr.info("Cleared permanent.");
    }
    lastInjectedBtn = null;
    updateVisualState();
}

async function reapplyAndSwipe() {
    isRetrying = true;
    
    if (activeChain && activeChain.index > 0) {
        const currentStepLabel = activeChain.steps[activeChain.index - 1];
        const settings = getSettings();
        const prevBtn = settings.buttons.find(b => b.label === currentStepLabel);
        if (prevBtn) lastInjectedBtn = prevBtn;
    }

    if (!lastInjectedBtn) {
        toastr.warning("Nothing to retry.");
        isRetrying = false;
        return;
    }
    
    toastr.info(`Retrying: ${lastInjectedBtn.label}`);
    
    try {
        await clearEphemeralOnly();
        await executeCommand('/delete 1');
        await new Promise(r => setTimeout(r, 200));
        await injectButton(lastInjectedBtn, true);
        await executeCommand('/trigger');
    } catch (e) {
        console.error(e);
        toastr.error("Retry failed.");
    } finally {
        setTimeout(() => { isRetrying = false; }, 2000);
    }
}

// --- CHAIN LOGIC ---

async function toggleChain(chainIndex) {
    const settings = getSettings();
    const chain = settings.chains[chainIndex];
    if (!chain) return;

    if (activeChain && activeChain.originIndex === chainIndex) {
        pausedChainState = { ...activeChain };
        activeChain = null;
        await clearEphemeralOnly(); 
        toastr.info("Chain Paused");
        updateVisualState();
        refreshUI();
        return;
    }

    if (pausedChainState && pausedChainState.originIndex === chainIndex) {
        activeChain = { ...pausedChainState };
        pausedChainState = null;
        if (activeChain.index > 0) activeChain.index--; 
        executeChainStep();
        return;
    }

    startChain(chainIndex);
}

function startChain(chainIndex) {
    const settings = getSettings();
    const chain = settings.chains[chainIndex];
    if (!chain || !chain.steps || chain.steps.length === 0) return;

    pausedChainState = null; 

    activeChain = { 
        name: chain.name, 
        steps: [...chain.steps], 
        originIndex: chainIndex, 
        index: 0 
    };
    
    console.log(`[${extensionName}] Starting Chain: ${chain.name}`);
    executeChainStep();
}

function executeChainStep() {
    if (!activeChain) return;

    if (activeChain.index >= activeChain.steps.length) {
        toastr.success(`Chain "${activeChain.name}" Completed!`);
        activeChain = null;
        updateVisualState();
        refreshUI();
        return;
    }

    const label = activeChain.steps[activeChain.index];
    const settings = getSettings();
    const btnData = settings.buttons.find(b => b.label === label);

    if (btnData) {
        injectButton(btnData, true);
        activeChain.index++; 
        updateVisualState();
        refreshUI();
    } else {
        toastr.error(`Chain Error: Button "${label}" not found.`);
        activeChain = null;
        updateVisualState();
        refreshUI();
    }
}

function adjustChainStep(delta) {
    if (!activeChain) return;
    
    const newIndex = activeChain.index + delta;
    if (newIndex < 0 || newIndex > activeChain.steps.length) {
        toastr.warning("Limit reached.");
        return;
    }
    
    clearEphemeralOnly();
    activeChain.index = newIndex;
    
    if(newIndex > 0) {
        const label = activeChain.steps[newIndex - 1];
        const settings = getSettings();
        const btnData = settings.buttons.find(b => b.label === label);
        if(btnData) {
            injectButton(btnData, true);
            lastInjectedBtn = btnData;
        }
    }

    updateVisualState();
    const currentLabel = activeChain.steps[activeChain.index] || "Finish";
    toastr.info(`Next up: ${currentLabel}`);
}

// --- VISUAL UPDATES ---

function updateVisualState() {
    const pCount = activePerms.size;
    const eCount = activeEphs.size;
    
    let statusHtml = `<span style="color:${pCount > 0 ? '#ff8888' : '#aaa'}">${pCount} Perm</span> | <span style="color:${eCount > 0 ? '#88ff88' : '#aaa'}">${eCount} Eph</span>`;
    
    if (activeChain) {
        const currentStepLabel = (activeChain.index > 0) ? activeChain.steps[activeChain.index - 1] : "Start";
        const nextStepLabel = activeChain.steps[activeChain.index] || "Finish";
        
        statusHtml = `
            <div style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%;">
                <i class="fa-solid fa-backward lb-nav-btn" id="lb-chain-prev" title="Previous Step"></i>
                <span style="color:#4dbf00; font-weight:bold; font-size:0.85em; text-align:center; line-height:1.2;">
                    ${activeChain.name} (${activeChain.index}/${activeChain.steps.length})<br>
                    <span style="color:#fff; opacity:0.9;">Curr: ${currentStepLabel}</span> <span style="opacity:0.5;">|</span> <span style="color:#aaa;">Next: ${nextStepLabel}</span>
                </span>
                <i class="fa-solid fa-forward lb-nav-btn" id="lb-chain-next" title="Skip Step"></i>
            </div>`;
    }
    
    $('#lb-counter-display').html(statusHtml);

    if (activeChain) {
        $('#lb-chain-prev').off('click').on('click', () => adjustChainStep(-1));
        $('#lb-chain-next').off('click').on('click', () => adjustChainStep(1));
    }

    $('.lb-action-btn').each(function() {
        const btnLabel = $(this).data('label');
        if (!btnLabel) return;
        const id = String(btnLabel).replace(/[^a-zA-Z0-9]/g, '_');
        if (activePerms.has(id) || activeEphs.has(id)) {
            $(this).addClass('lb-active-btn');
        } else {
            $(this).removeClass('lb-active-btn');
        }
    });
}

// --- UI HELPERS ---

function togglePanel() {
    const panel = $('#lb-injector-panel');
    if (panel.is(':visible')) panel.fadeOut(200);
    else panel.fadeIn(200).css('display', 'flex');
}

// --- DATA ---

function getSettings() {
    if (!extension_settings[extensionKey]) {
        extension_settings[extensionKey] = {
            buttons: JSON.parse(JSON.stringify(DEFAULT_BUTTONS)),
            chains: JSON.parse(JSON.stringify(DEFAULT_CHAINS))
        };
        saveSettingsDebounced();
    }
    if (!extension_settings[extensionKey].chains) {
        extension_settings[extensionKey].chains = [];
    }
    return extension_settings[extensionKey];
}

function sanitizeSettings() {
    const settings = getSettings();
    if (!settings.buttons) return;
    let changed = false;
    settings.buttons.forEach(btn => {
        if (btn.content === undefined) {
            btn.content = btn.key ? `[Legacy: ${btn.key}]` : `[${btn.label}]`;
            changed = true;
        }
    });
    if (changed) saveSettingsDebounced();
}

// --- SETTINGS VIEW MANAGEMENT ---

function showSettingsView(viewId) {
    $('.lb-settings-view').hide();
    $(`#${viewId}`).show();
}

// --- SETTINGS LOGIC ---

function saveButton(btnData) {
    const settings = getSettings();
    if (editingIndex !== null) {
        settings.buttons[editingIndex] = btnData;
        toastr.success("Updated!");
    } else {
        settings.buttons.push(btnData);
        toastr.success("Added!");
    }
    closeButtonEditor();
    saveSettingsDebounced();
    refreshUI();
    refreshSettingsUI();
}

function removeButton(index) {
    const settings = getSettings();
    settings.buttons.splice(index, 1);
    saveSettingsDebounced();
    refreshUI();
    refreshSettingsUI();
}

function openButtonEditor(index = null) {
    const settings = getSettings();
    editingIndex = index;
    
    if (index !== null) {
        const btn = settings.buttons[index];
        $('#lb_new_label').val(btn.label);
        $('#lb_new_content').val(btn.content || "");
        $('#lb_btn_form_title').text("Edit Button");
        $('#lb_add_btn').text("Update Button");
    } else {
        $('#lb_new_label').val('');
        $('#lb_new_content').val('');
        $('#lb_btn_form_title').text("Create New Button");
        $('#lb_add_btn').text("Create Button");
    }
    showSettingsView('lb-view-editor-button');
}

function closeButtonEditor() {
    editingIndex = null;
    showSettingsView('lb-view-main-list');
}

// --- CHAIN EDITOR LOGIC ---

function saveChain(chainName) {
    const settings = getSettings();
    if (!currentChainSteps || currentChainSteps.length === 0) {
        toastr.warning("Chain must have steps.");
        return;
    }
    
    const newChain = { 
        name: chainName, 
        steps: [...currentChainSteps],
        ephemeral: true // ALWAYS TRUE FOR CHAINS
    };

    if (editingChainIndex !== null) {
        settings.chains[editingChainIndex] = newChain;
        toastr.success("Chain Updated!");
    } else {
        settings.chains.push(newChain);
        toastr.success("Chain Created!");
    }
    closeChainEditor();
    saveSettingsDebounced();
    refreshUI();
    refreshSettingsUI();
}

function removeChain(index) {
    const settings = getSettings();
    settings.chains.splice(index, 1);
    saveSettingsDebounced();
    refreshUI();
    refreshSettingsUI();
}

function openChainEditor(index = null) {
    const settings = getSettings();
    editingChainIndex = index;
    
    if (index !== null) {
        const chain = settings.chains[index];
        $('#lb_chain_name').val(chain.name);
        currentChainSteps = [...chain.steps];
        $('#lb_chain_form_title').text("Edit Chain");
        $('#lb_save_chain_btn').text("Update Chain");
    } else {
        $('#lb_chain_name').val('');
        currentChainSteps = [];
        $('#lb_chain_form_title').text("Create New Chain");
        $('#lb_save_chain_btn').text("Create Chain");
    }
    
    renderChainPreview();
    showSettingsView('lb-view-editor-chain');
}

function closeChainEditor() {
    editingChainIndex = null;
    showSettingsView('lb-view-main-list');
}

function resetDefaults() {
    extension_settings[extensionKey] = {
        buttons: JSON.parse(JSON.stringify(DEFAULT_BUTTONS)),
        chains: JSON.parse(JSON.stringify(DEFAULT_CHAINS))
    };
    saveSettingsDebounced();
    refreshUI();
    refreshSettingsUI();
    toastr.success("Reset defaults.");
}

function renderChainPreview() {
    const container = $('#lb_chain_preview');
    container.empty();
    if (!currentChainSteps.length) {
        container.append('<div style="opacity:0.5; padding:5px;">No steps...</div>');
        return;
    }
    currentChainSteps.forEach((label, idx) => {
        const step = $(`
            <div class="lb-step-pill">
                <b>${idx + 1}.</b> ${label} <i class="fa-solid fa-times lb-remove-step"></i>
            </div>
        `);
        step.find('.lb-remove-step').on('click', () => {
            currentChainSteps.splice(idx, 1);
            renderChainPreview();
        });
        container.append(step);
    });
}

// --- UI GENERATORS ---

function buildFloatingPanel() {
    if ($('#lb-injector-panel').length) return;

    const panelHtml = `
    <div id="lb-injector-panel" style="display:none;">
        <div class="lb-header">
            <h3>Direct Injector</h3>
            <div class="lb-header-tools">
                <div id="lb-min-btn" class="lb-icon-btn"><i class="fa-solid fa-minus"></i></div>
                <div id="lb-close-btn" class="lb-icon-btn"><i class="fa-solid fa-times"></i></div>
            </div>
        </div>
        
        <div id="lb-panel-content">
            <div class="lb-tabs">
                <div class="lb-tab active" data-tab="buttons">Buttons</div>
                <div class="lb-tab" data-tab="chains">Chains</div>
            </div>

            <div id="lb-view-buttons" class="lb-view active">
                <div class="lb-grid-container" id="lb-buttons-list"></div>
            </div>

            <div id="lb-view-chains" class="lb-view">
                <div class="lb-chain-list" id="lb-chains-list"></div>
            </div>

            <div class="lb-separator"></div>

            <div class="lb-footer">
                <div class="lb-footer-row" style="justify-content:space-between;">
                    <div style="flex:1">
                        <label style="font-size:0.8em; display:block;">Position in Chat</label>
                        <input id="lb-global-depth" type="number" class="lb-small-input" value="0" min="0" max="99" style="width:100%">
                    </div>
                    <div style="flex:1; margin-left:5px;">
                        <label style="font-size:0.8em; display:block;">Role</label>
                        <select id="lb-global-role" class="lb-small-input" style="width:100%; text-align:left;">
                            <option value="system">System</option>
                            <option value="assistant">Assistant</option>
                            <option value="user">User</option>
                        </select>
                    </div>
                </div>

                <div class="lb-footer-row">
                    <label class="lb-checkbox-container" style="flex:1;">
                        <input id="lb-global-eph" type="checkbox" checked> <span style="margin-left:4px">Ephemeral</span>
                    </label>
                    <div style="flex:1; display:flex; gap:2px;">
                        <button id="lb-flush-btn" class="menu_button lb-flush-btn" style="flex:1" title="Flush"><i class="fa-solid fa-broom"></i></button>
                        <button id="lb-swipe-btn" class="menu_button lb-swipe-btn" style="flex:1" title="Retry"><i class="fa-solid fa-rotate-right"></i></button>
                    </div>
                </div>

                <div id="lb-counter-display" class="lb-counter-row">
                    <span style="color:#aaa">0 Perm</span> | <span style="color:#aaa">0 Eph</span>
                </div>
            </div>
        </div>
    </div>`;

    $('body').append(panelHtml);
    
    $('#lb-close-btn').on('click', () => $('#lb-injector-panel').fadeOut(200));
    $('#lb-min-btn').on('click', () => $('#lb-panel-content').slideToggle(200));
    $('#lb-flush-btn').on('click', flushInjections);
    $('#lb-swipe-btn').on('click', reapplyAndSwipe);
    
    $('.lb-tab').on('click', function() {
        $('.lb-tab').removeClass('active');
        $(this).addClass('active');
        const target = $(this).data('tab');
        $('.lb-view').removeClass('active');
        $(`#lb-view-${target}`).addClass('active');
    });

    try { $('#lb-injector-panel').draggable({ handle: ".lb-header", containment: "window" }); } catch(e) {}
}

function injectSettingsMenu() {
    const container = $('#extensions_settings');
    if (!container.length) return;
    $('#lorebook-keys-settings-wrapper').remove();

    const settingsHtml = `
    <div id="lorebook-keys-settings-wrapper" class="lorebook-keys-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Injector Settings</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="objective_block flex-container" style="margin-bottom: 15px; gap: 10px;">
                    <input id="lb-force-open-btn" class="menu_button" type="button" value="Open Panel" style="flex:1" />
                    <input id="lb-reset-pos-btn" class="menu_button" type="button" value="Reset Position" style="flex:1" />
                </div>
                <hr class="sysHR">

                <div id="lb-view-main-list" class="lb-settings-view">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <h4>Buttons</h4>
                        <button id="lb-create-btn-go" class="menu_button" style="width:auto; padding:2px 8px;"><i class="fa-solid fa-plus"></i> New Button</button>
                    </div>
                    <div id="lb_settings_buttons_list" class="lb-settings-list" style="margin-bottom:20px;"></div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <h4>Chains (Always Ephemeral)</h4>
                        <button id="lb-create-chain-go" class="menu_button" style="width:auto; padding:2px 8px;"><i class="fa-solid fa-plus"></i> New Chain</button>
                    </div>
                    <div id="lb_settings_chains_list" class="lb-settings-list"></div>

                    <div style="margin-top:20px; text-align:right;">
                        <button id="lb_reset_btn" class="menu_button" style="background:#7a2e2e;">Reset Defaults</button>
                    </div>
                </div>

                <div id="lb-view-editor-button" class="lb-settings-view" style="display:none;">
                    <h4 id="lb_btn_form_title">Edit Button</h4>
                    <div class="lb-settings-form">
                        <div class="lb-form-row">
                            <label>Label</label>
                            <input type="text" id="lb_new_label" class="text_pole" placeholder="e.g. Attack">
                        </div>
                        <div class="lb-form-row">
                            <label>Content</label>
                            <textarea id="lb_new_content" class="text_pole lb-big-textarea" rows="6"></textarea>
                        </div>
                        <div class="lb-form-row flex-row">
                            <button id="lb_add_btn" class="menu_button" style="flex:2">Save Button</button>
                            <button id="lb_cancel_btn" class="menu_button" style="flex:1; background:#777;">Cancel</button>
                        </div>
                    </div>
                </div>

                <div id="lb-view-editor-chain" class="lb-settings-view" style="display:none;">
                    <h4 id="lb_chain_form_title">Edit Chain</h4>
                    <div class="lb-settings-form">
                        <div class="lb-form-row">
                            <label>Chain Name</label>
                            <input type="text" id="lb_chain_name" class="text_pole" placeholder="e.g. Dungeon Loop">
                        </div>
                        
                        <div class="lb-form-row flex-row">
                            <div style="flex:3">
                                <label>Add Step</label>
                                <select id="lb_chain_source" class="text_pole"></select>
                            </div>
                            <div style="flex:1; display:flex; align-items:flex-end;">
                                <button id="lb_add_step_btn" class="menu_button" title="Add Step"><i class="fa-solid fa-plus"></i></button>
                            </div>
                        </div>
                        <div class="lb-form-row">
                            <label>Steps Sequence</label>
                            <div id="lb_chain_preview" class="lb-chain-preview-box"></div>
                        </div>
                        <div class="lb-form-row flex-row">
                            <button id="lb_save_chain_btn" class="menu_button" style="flex:2">Save Chain</button>
                            <button id="lb_cancel_chain_btn" class="menu_button" style="flex:1; background:#777;">Cancel</button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>`;

    container.append(settingsHtml);

    // NAVIGATION
    $('#lb-create-btn-go').on('click', () => openButtonEditor(null));
    $('#lb-create-chain-go').on('click', () => openChainEditor(null));
    $('#lb_cancel_btn').on('click', closeButtonEditor);
    $('#lb_cancel_chain_btn').on('click', closeChainEditor);

    // BUTTON EDITOR
    $('#lb_add_btn').on('click', () => {
        const label = $('#lb_new_label').val().trim();
        const content = $('#lb_new_content').val().trim();
        if (label && content) saveButton({ label, content });
        else toastr.warning("Label and Content required");
    });

    // CHAIN EDITOR
    $('#lb_add_step_btn').on('click', () => {
        const val = $('#lb_chain_source').val();
        if(val) {
            currentChainSteps.push(val);
            renderChainPreview();
        }
    });

    $('#lb_save_chain_btn').on('click', () => {
        const name = $('#lb_chain_name').val().trim();
        if (name && currentChainSteps.length > 0) {
            saveChain(name);
        } else {
            toastr.warning("Name and at least 1 step required");
        }
    });

    $('#lb_reset_btn').on('click', () => { if(confirm("Reset all?")) resetDefaults(); });
    $('#lb-force-open-btn').on('click', togglePanel);
    $('#lb-reset-pos-btn').on('click', () => { $('#lb-injector-panel').css({ top: '100px', left: '100px', display: 'flex' }); });
}

function refreshUI() {
    const settings = getSettings();
    const buttons = settings.buttons || [];
    const chains = settings.chains || [];
    
    const panelList = $('#lb-buttons-list');
    panelList.empty();
    buttons.forEach(btn => {
        const actionBtn = $(`<button class="menu_button lb-action-btn" data-label="${btn.label}" title="${btn.content}">${btn.label}</button>`);
        actionBtn.on('click', () => injectButton(btn));
        panelList.append(actionBtn);
    });

    const chainList = $('#lb-chains-list');
    chainList.empty();
    if(chains.length === 0) chainList.append('<div style="padding:10px; opacity:0.5; text-align:center">No chains created.</div>');
    chains.forEach((chain, idx) => {
        const isActive = activeChain && activeChain.originIndex === idx;
        const isPaused = pausedChainState && pausedChainState.originIndex === idx;
        
        let btnClass = 'lb-chain-btn';
        let icon = '<i class="fa-solid fa-play"></i>';
        
        if (isActive) {
            btnClass += ' lb-active-chain';
            icon = '<i class="fa-solid fa-pause"></i>';
        } else if (isPaused) {
            btnClass += ' lb-paused-chain'; 
            icon = '<i class="fa-solid fa-rotate-right"></i>';
        }
        
        const row = $(`<div class="lb-chain-row"></div>`);
        const btn = $(`<button class="menu_button ${btnClass}" title="${chain.steps.join(' -> ')}"><span style="margin-right:10px;">${icon}</span>${chain.name}</button>`);
        btn.on('click', () => toggleChain(idx));
        row.append(btn);
        chainList.append(row);
    });

    updateVisualState();
}

function refreshSettingsUI() {
    const settings = getSettings();
    const buttons = settings.buttons || [];
    const chains = settings.chains || [];

    // CHAIN STEPS DROPDOWN
    const sourceSelect = $('#lb_chain_source');
    sourceSelect.empty();
    buttons.forEach(btn => {
        sourceSelect.append(`<option value="${btn.label}">${btn.label}</option>`);
    });

    // BUTTONS LIST
    const btnList = $('#lb_settings_buttons_list');
    btnList.empty();
    buttons.forEach((btn, index) => {
        const item = $(`
            <div class="lb-settings-item">
                <div style="flex:1; overflow:hidden; font-weight:bold;">${btn.label}</div>
                <div class="lb-tools">
                    <div class="lb-edit-btn"><i class="fa-solid fa-pencil"></i></div>
                    <div class="lb-delete-btn"><i class="fa-solid fa-trash"></i></div>
                </div>
            </div>
        `);
        item.find('.lb-edit-btn').on('click', () => openButtonEditor(index));
        item.find('.lb-delete-btn').on('click', () => { if(confirm(`Remove?`)) removeButton(index); });
        btnList.append(item);
    });

    // CHAINS LIST
    const chainList = $('#lb_settings_chains_list');
    chainList.empty();
    chains.forEach((chain, index) => {
        const item = $(`
            <div class="lb-settings-item">
                <div style="flex:1; overflow:hidden;"><b>${chain.name}</b> <small>(${chain.steps.length} steps)</small></div>
                <div class="lb-tools">
                    <div class="lb-edit-chain-btn" style="color:var(--smart-accent); cursor:pointer;"><i class="fa-solid fa-pencil"></i></div>
                    <div class="lb-delete-chain-btn" style="color:#ff4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></div>
                </div>
            </div>
        `);
        item.find('.lb-edit-chain-btn').on('click', () => openChainEditor(index));
        item.find('.lb-delete-chain-btn').on('click', () => { if(confirm(`Remove Chain?`)) removeChain(index); });
        chainList.append(item);
    });
}

// --- INIT ---

jQuery(async () => {
    sanitizeSettings();
    buildFloatingPanel(); 
    injectSettingsMenu();
    refreshSettingsUI();

    if ($('#lb-injector-icon').length === 0) {
        $('#top-bar-right').prepend(`
            <div id="lb-injector-icon" class="drawer-content-item" title="Direct Injector">
                <i class="fa-solid fa-bolt"></i>
            </div>
        `);
        $('#lb-injector-icon').on('click', togglePanel);
    }

    if(eventSource) {
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
            activeEphs.clear();
            if (activeChain) {
                console.log(`[${extensionName}] Advancing Chain...`);
                executeChainStep();
            } else {
                updateVisualState();
            }
        });

        eventSource.on(event_types.CHAT_CHANGED, () => {
            if (isRetrying) return;
            activeEphs.clear();
            activePerms.clear();
            activeChain = null;
            pausedChainState = null;
            updateVisualState();
        });
    }

    refreshUI();
    console.log(`[${extensionName}] Loaded.`);
    
    setTimeout(() => {
        const panel = $('#lb-injector-panel');
        if (!panel.is(':visible')) panel.fadeIn(200).css('display', 'flex');
    }, 800);
});
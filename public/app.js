// ===== TOAST (disabled) =====
function showToast(msg) { /* no-op */ }

// ===== API =====
const API_BASE = 'https://cubelib-855446834879.us-central1.run.app';

async function api(endpoint, body = {}) {
  const res = await fetch(API_BASE + '/api/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.success === false) throw new Error(data.error || data.stderr || 'Server error');
  // Cloud API returns 'output', local returns 'result' — normalize
  if (data.output !== undefined && data.result === undefined) {
    data.result = data.output;
  }
  return data;
}

// ===== LOADING =====
function setLoading(btn, loading) {
  btn.disabled = loading;
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loading');
  if (text) text.style.display = loading ? 'none' : '';
  if (loader) loader.style.display = loading ? '' : 'none';
}

// ===============================================================
// ===== PIPELINE BUILDER =====
// ===============================================================

// Step definitions with descriptions and available params
const STEP_DEFS = {
  EO: {
    name: 'EO',
    title: 'Edge Orientation',
    desc: 'Orient edges on at least one axis. The first step in FMC.',
    params: {
      niss:  { type: 'select', label: 'NISS', desc: 'When to allow switching between normal and inverse solving', options: ['', 'none', 'before', 'always'], default: 'always' },
      max:   { type: 'number', label: 'Max Length', desc: 'Maximum number of moves for this step' },
      min:   { type: 'number', label: 'Min Length', desc: 'Minimum number of moves for this step' },
    }
  },
  RZP: {
    name: 'RZP',
    title: 'Random Positioning',
    desc: 'Random preparation moves between EO and DR. Helps find better DR.',
    params: {
      niss: { type: 'select', label: 'NISS', desc: 'When to allow switching', options: ['', 'none', 'before', 'always'], default: 'none' },
    }
  },
  DR: {
    name: 'DR',
    title: 'Domino Reduction',
    desc: 'Orient corners and edges on the second axis. Reduces the cube to the domino group.',
    params: {
      niss:     { type: 'select', label: 'NISS', desc: 'When to allow switching', options: ['', 'none', 'before', 'always'], default: 'before' },
      triggers: { type: 'trigger-chips', label: 'Triggers', desc: "Restrict allowed move sequences. Click presets or type custom triggers.", presets: ['R', 'RF2R', 'RF2U2R', 'RL', 'RUL', 'RUR', "RU'L", "RU'R", 'RU2F2R', 'RU2L', 'RU2R'] },
      subsets:  { type: 'chips', label: 'Subsets', desc: 'Click to select DR subsets to restrict to', chips: ['0c0','4a1','4b2','4a2','2c3','4a3','4b3','0c3','2c4','0c4','4a4','4b4','2c5','4b5'] },
      eslice:   { type: 'chips', label: 'E-Slice', desc: 'Filter by number of bad edges', chips: ['0e','2e','4e','6e','8e'] },
      max:      { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
      min:      { type: 'number', label: 'Min Length', desc: 'Minimum number of moves' },
    }
  },
  HTR: {
    name: 'HTR',
    title: 'Half-Turn Reduction',
    desc: 'Reduce to 180\u00B0 turns only. After this step, no more quarter turns.',
    params: {
      niss:  { type: 'select', label: 'NISS', desc: 'When to allow switching', options: ['', 'none', 'before', 'always'], default: 'before' },
      max:   { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
      min:   { type: 'number', label: 'Min Length', desc: 'Minimum number of moves' },
    }
  },
  FR: {
    name: 'FR',
    title: 'Floppy Reduction',
    desc: 'Constrain half turns on two axes. Requires HTR before.',
    params: {
      max: { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
      min: { type: 'number', label: 'Min Length', desc: 'Minimum number of moves' },
    }
  },
  FIN: {
    name: 'FIN',
    title: 'Finish',
    desc: 'Complete the solve. Fully solves the cube from HTR or DR.',
    params: {
      niss:         { type: 'select', label: 'NISS', desc: 'When to allow switching', options: ['', 'none', 'before', 'always'], default: 'before' },
      'htr-breaking': { type: 'select', label: 'HTR-Breaking', desc: 'Allow solutions that temporarily break HTR then recover', options: ['', 'true', 'false'] },
      max:          { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
    }
  },
  FRLS: {
    name: 'FRLS',
    title: 'Floppy Reduction Leave Slice',
    desc: 'Like FR but leaves one slice unsolved. Requires HTR.',
    params: {
      max: { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
    }
  },
  FINLS: {
    name: 'FINLS',
    title: 'Finish Leave Slice',
    desc: 'Solves everything except one slice. Requires HTR.',
    params: {
      niss: { type: 'select', label: 'NISS', desc: 'When to allow switching', options: ['', 'none', 'before', 'always'], default: 'before' },
      max:  { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
    }
  },
  VR: {
    name: 'VR',
    title: 'Virtual Reduction',
    desc: 'New step (v2.5.0) for special step orders like FINLS > VR > FIN.',
    params: {
      max: { type: 'number', label: 'Max Length', desc: 'Maximum number of moves' },
    }
  },
};

// Pipeline state: array of { type: string, config: { key: value } }
let pipelineSteps = [];

// Presets
const PRESETS = {
  'default':     [{ type: 'EO' }, { type: 'RZP' }, { type: 'DR', config: { triggers: "R,RU2R,RF2R,RUR,RU'R" } }, { type: 'HTR' }, { type: 'FIN' }],
  'with-vr':     [{ type: 'EO' }, { type: 'RZP' }, { type: 'DR', config: { triggers: "R,RU2R,RF2R,RUR,RU'R" } }, { type: 'HTR' }, { type: 'FINLS' }, { type: 'VR' }, { type: 'FIN' }],
  'custom':      [],
};

let currentPreset = 'default';

function loadPreset(name) {
  currentPreset = name;
  // Update active chip
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  const chips = document.querySelectorAll('.preset-chip');
  chips.forEach(c => {
    if (c.textContent.trim() === getPresetLabel(name) || c.onclick.toString().includes("'" + name + "'")) {
      c.classList.add('active');
    }
  });
  // event-based active
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');

  pipelineSteps = (PRESETS[name] || []).map(s => ({
    type: s.type,
    config: s.config ? { ...s.config } : {}
  }));
  renderPipeline();
}

function getPresetLabel(name) {
  const labels = { 'default': 'Default', 'with-vr': 'With VR', 'custom': 'Custom' };
  return labels[name] || name;
}

function addPipelineStep(type) {
  pipelineSteps.push({ type, config: {} });
  // Mark as custom
  currentPreset = 'custom';
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  renderPipeline();
}

function removePipelineStep(index) {
  pipelineSteps.splice(index, 1);
  renderPipeline();
}

// ===== DRAG & DROP FOR PIPELINE =====
let draggedStepIndex = -1;
// Touch drag state
let touchDragIndex = -1;
let touchCloneEl = null;
let touchStartX = 0;
let touchStartY = 0;
let touchDragging = false;

function reorderPipelineStep(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= pipelineSteps.length || toIndex >= pipelineSteps.length) return;
  const [moved] = pipelineSteps.splice(fromIndex, 1);
  pipelineSteps.splice(toIndex, 0, moved);
  currentPreset = 'custom';
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  renderPipeline();
}

function getDropIndex(track, clientX) {
  const stepEls = track.querySelectorAll('.pipe-step');
  for (let i = 0; i < stepEls.length; i++) {
    const rect = stepEls[i].getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (clientX < mid) return i;
  }
  return stepEls.length - 1;
}

function renderPipeline() {
  const track = document.getElementById('pipeline-track');
  track.innerHTML = '';

  pipelineSteps.forEach((step, i) => {
    // Arrow before (except first)
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'pipe-arrow';
      arrow.textContent = '\u279C';
      track.appendChild(arrow);
    }

    const stepEl = document.createElement('div');
    stepEl.className = 'pipe-step';
    stepEl.dataset.index = i;

    // Make draggable
    stepEl.draggable = true;

    // --- Desktop drag & drop ---
    stepEl.addEventListener('dragstart', (e) => {
      draggedStepIndex = i;
      stepEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      // Slight delay so the dragging class takes effect visually
      requestAnimationFrame(() => stepEl.classList.add('dragging'));
    });

    stepEl.addEventListener('dragend', () => {
      stepEl.classList.remove('dragging');
      draggedStepIndex = -1;
      track.querySelectorAll('.pipe-step').forEach(el => {
        el.classList.remove('drag-over-left', 'drag-over-right');
      });
    });

    stepEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedStepIndex < 0 || draggedStepIndex === i) return;
      const rect = stepEl.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      // Show indicator on which side
      stepEl.classList.remove('drag-over-left', 'drag-over-right');
      if (e.clientX < mid) {
        stepEl.classList.add('drag-over-left');
      } else {
        stepEl.classList.add('drag-over-right');
      }
    });

    stepEl.addEventListener('dragleave', () => {
      stepEl.classList.remove('drag-over-left', 'drag-over-right');
    });

    stepEl.addEventListener('drop', (e) => {
      e.preventDefault();
      stepEl.classList.remove('drag-over-left', 'drag-over-right');
      const fromIndex = draggedStepIndex;
      if (fromIndex < 0 || fromIndex === i) return;
      const rect = stepEl.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      let toIndex = i;
      // Adjust: if dragging right and dropping on left side, or vice versa
      if (fromIndex < i && e.clientX < mid) toIndex = i - 1;
      if (fromIndex > i && e.clientX >= mid) toIndex = i + 1;
      if (toIndex < 0) toIndex = 0;
      if (toIndex >= pipelineSteps.length) toIndex = pipelineSteps.length - 1;
      reorderPipelineStep(fromIndex, toIndex);
    });

    // --- Touch drag & drop ---
    stepEl.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchDragIndex = i;
      touchDragging = false;
    }, { passive: true });

    stepEl.addEventListener('touchmove', (e) => {
      if (touchDragIndex < 0) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);

      // Start dragging after 8px horizontal movement
      if (!touchDragging && dx > 8 && dx > dy) {
        touchDragging = true;
        stepEl.classList.add('dragging');
        // Create floating clone
        if (!touchCloneEl) {
          touchCloneEl = stepEl.cloneNode(true);
          touchCloneEl.className = 'pipe-step touch-drag-clone';
          document.body.appendChild(touchCloneEl);
        }
      }

      if (touchDragging) {
        e.preventDefault();
        if (touchCloneEl) {
          touchCloneEl.style.left = (touch.clientX - 40) + 'px';
          touchCloneEl.style.top = (touch.clientY - 20) + 'px';
        }
        // Highlight drop target
        track.querySelectorAll('.pipe-step').forEach(el => {
          el.classList.remove('drag-over-left', 'drag-over-right');
        });
        const targetIdx = getDropIndex(track, touch.clientX);
        const targetEl = track.querySelectorAll('.pipe-step')[targetIdx];
        if (targetEl && targetIdx !== touchDragIndex) {
          const rect = targetEl.getBoundingClientRect();
          const mid = rect.left + rect.width / 2;
          if (touch.clientX < mid) {
            targetEl.classList.add('drag-over-left');
          } else {
            targetEl.classList.add('drag-over-right');
          }
        }
      }
    }, { passive: false });

    stepEl.addEventListener('touchend', (e) => {
      if (touchDragging && touchDragIndex >= 0) {
        const touch = e.changedTouches[0];
        const toIndex = getDropIndex(track, touch.clientX);
        if (toIndex !== touchDragIndex) {
          reorderPipelineStep(touchDragIndex, toIndex);
        }
      }
      // Clean up
      stepEl.classList.remove('dragging');
      track.querySelectorAll('.pipe-step').forEach(el => {
        el.classList.remove('drag-over-left', 'drag-over-right');
      });
      if (touchCloneEl) {
        touchCloneEl.remove();
        touchCloneEl = null;
      }
      touchDragIndex = -1;
      touchDragging = false;
    });

    // Chip
    const chip = document.createElement('div');
    chip.className = 'pipe-step-chip';
    chip.setAttribute('data-type', step.type);
    chip.addEventListener('click', (e) => {
      // Don't open modal if clicking remove button or if we were dragging
      if (e.target.classList.contains('remove-step')) return;
      if (touchDragging) return;
      openStepModal(i);
    });

    const nameSpan = document.createElement('span');
    nameSpan.textContent = step.type;
    chip.appendChild(nameSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-step';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove step';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePipelineStep(i);
    });
    chip.appendChild(removeBtn);

    stepEl.appendChild(chip);

    // Show params if any set
    const paramStr = buildParamString(step.config);
    if (paramStr) {
      const paramsEl = document.createElement('div');
      paramsEl.className = 'pipe-step-params';
      paramsEl.textContent = paramStr;
      paramsEl.title = paramStr;
      stepEl.appendChild(paramsEl);
    }

    track.appendChild(stepEl);
  });
}

function buildParamString(config) {
  if (!config) return '';
  const parts = [];
  // Merge subsets + eslice into a single subsets param
  let subsets = config.subsets || '';
  const eslice = config.eslice || '';
  if (eslice && subsets) {
    // Append e-slice to subsets: "4a1,2c3" + "4e" => "4a1,2c3,4e"
    subsets = subsets + ',' + eslice;
  } else if (eslice) {
    subsets = eslice;
  }
  for (const [k, v] of Object.entries(config)) {
    if (k === 'eslice') continue; // merged into subsets
    if (v !== '' && v !== undefined && v !== null) {
      if (k === 'subsets') {
        parts.push('subsets=' + subsets);
      } else {
        parts.push(k + '=' + v);
      }
    }
  }
  // If only eslice was set (no subsets key in config)
  if (eslice && !config.subsets) {
    parts.push('subsets=' + eslice);
  }
  return parts.join(';');
}

function buildFullPipelineString() {
  if (pipelineSteps.length === 0) return '';
  return pipelineSteps.map(s => {
    const params = buildParamString(s.config);
    return params ? s.type + '[' + params + ']' : s.type;
  }).join(' > ');
}

// ===== STEP MODAL =====
let editingStepIndex = -1;
let editingStepTempConfig = {};

function openStepModal(index) {
  editingStepIndex = index;
  const step = pipelineSteps[index];
  const def = STEP_DEFS[step.type];
  if (!def) return;

  editingStepTempConfig = step.config ? { ...step.config } : {};

  document.getElementById('modal-title').textContent = def.name + ' - ' + def.title;

  const body = document.getElementById('modal-body');
  body.innerHTML = '';

  // Param fields
  for (const [key, paramDef] of Object.entries(def.params)) {
    const field = document.createElement('div');
    field.className = 'modal-field';

    const label = document.createElement('label');
    label.textContent = paramDef.label;
    field.appendChild(label);

    const descP = document.createElement('div');
    descP.className = 'modal-field-desc';
    descP.textContent = paramDef.desc;
    field.appendChild(descP);

    const currentVal = editingStepTempConfig[key] || '';

    if (paramDef.type === 'trigger-chips') {
      // Trigger presets + custom text input
      const wrapper = document.createElement('div');
      wrapper.id = 'modal-param-' + key;

      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'subset-chips-container';
      chipsContainer.style.marginBottom = '8px';

      // Parse current triggers
      const currentTriggers = currentVal ? currentVal.split(',').map(s => s.trim()).filter(Boolean) : [];
      const currentSet = new Set(currentTriggers);

      (paramDef.presets || []).forEach(preset => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'subset-chip' + (currentSet.has(preset) ? ' active' : '');
        chip.textContent = preset;
        chip.dataset.value = preset;
        chip.addEventListener('click', () => {
          chip.classList.toggle('active');
          syncTriggerInput(wrapper);
        });
        chipsContainer.appendChild(chip);
      });
      wrapper.appendChild(chipsContainer);

      // Custom trigger chips area
      const customChipsContainer = document.createElement('div');
      customChipsContainer.className = 'subset-chips-container custom-triggers-area';
      customChipsContainer.style.marginBottom = '6px';
      const presetSet = new Set(paramDef.presets || []);
      const customTriggers = currentTriggers.filter(t => !presetSet.has(t));
      customTriggers.forEach(t => {
        addCustomTriggerChip(customChipsContainer, t);
      });
      wrapper.appendChild(customChipsContainer);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'trigger-custom-input';
      input.dir = 'ltr';
      input.placeholder = "Type trigger and press Enter (e.g. RU2R)";
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = input.value.trim();
          if (val) {
            // Support comma-separated too
            val.split(',').map(s => s.trim()).filter(Boolean).forEach(t => {
              addCustomTriggerChip(customChipsContainer, t);
            });
            input.value = '';
          }
        }
      });
      wrapper.appendChild(input);

      field.appendChild(wrapper);
    } else if (paramDef.type === 'chips') {
      // Multi-select clickable chips
      const container = document.createElement('div');
      container.className = 'subset-chips-container';
      container.id = 'modal-param-' + key;
      const selectedSet = new Set(currentVal ? currentVal.split(',').map(s => s.trim()).filter(Boolean) : []);
      (paramDef.chips || []).forEach(chipVal => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'subset-chip' + (selectedSet.has(chipVal) ? ' active' : '');
        chip.textContent = chipVal;
        chip.dataset.value = chipVal;
        chip.addEventListener('click', () => {
          chip.classList.toggle('active');
        });
        container.appendChild(chip);
      });
      field.appendChild(container);
    } else if (paramDef.type === 'select') {
      const select = document.createElement('select');
      select.id = 'modal-param-' + key;
      (paramDef.options || []).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        if (opt === '') {
          option.textContent = 'Default' + (paramDef.default ? ' (' + paramDef.default + ')' : '');
        } else {
          option.textContent = opt;
        }
        if (opt === currentVal) option.selected = true;
        select.appendChild(option);
      });
      field.appendChild(select);
    } else if (paramDef.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.id = 'modal-param-' + key;
      input.min = 0;
      input.placeholder = 'Default';
      input.value = currentVal;
      field.appendChild(input);
    } else {
      // text
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'modal-param-' + key;
      input.dir = 'ltr';
      input.placeholder = paramDef.desc || '';
      input.value = currentVal;
      field.appendChild(input);
    }

    body.appendChild(field);
  }

  document.getElementById('step-modal').style.display = 'flex';
}

function closeStepModal() {
  document.getElementById('step-modal').style.display = 'none';
  editingStepIndex = -1;
}

function addCustomTriggerChip(container, value) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'subset-chip active custom-trigger-chip';
  chip.dataset.value = value;
  const text = document.createElement('span');
  text.textContent = value;
  chip.appendChild(text);
  const removeX = document.createElement('span');
  removeX.textContent = ' \u00D7';
  removeX.style.marginLeft = '4px';
  removeX.style.opacity = '0.7';
  chip.appendChild(removeX);
  chip.addEventListener('click', () => {
    chip.remove();
  });
  container.appendChild(chip);
}

function syncTriggerInput(wrapper) {
  // Visual only
}

function saveStepConfig() {
  if (editingStepIndex < 0) return;
  const step = pipelineSteps[editingStepIndex];
  const def = STEP_DEFS[step.type];
  if (!def) return;

  const newConfig = {};
  for (const [key, paramDef] of Object.entries(def.params)) {
    const el = document.getElementById('modal-param-' + key);
    if (!el) continue;
    if (paramDef.type === 'trigger-chips') {
      // Collect active preset chips
      const presetChips = el.querySelectorAll('.subset-chips-container:first-child .subset-chip.active');
      const presetVals = Array.from(presetChips).map(c => c.dataset.value);
      // Collect custom trigger chips
      const customChips = el.querySelectorAll('.custom-trigger-chip');
      const customVals = Array.from(customChips).map(c => c.dataset.value);
      // Also collect anything typed but not yet Enter'd
      const customInput = el.querySelector('.trigger-custom-input');
      const typedVals = customInput && customInput.value.trim() ? customInput.value.split(',').map(s => s.trim()).filter(Boolean) : [];
      const allVals = [...presetVals, ...customVals, ...typedVals];
      if (allVals.length > 0) {
        newConfig[key] = allVals.join(',');
      }
    } else if (paramDef.type === 'chips') {
      // Collect active chip values
      const activeChips = el.querySelectorAll('.subset-chip.active');
      const vals = Array.from(activeChips).map(c => c.dataset.value);
      if (vals.length > 0) {
        newConfig[key] = vals.join(',');
      }
    } else {
      const val = el.value.trim();
      if (val !== '') {
        newConfig[key] = val;
      }
    }
  }

  step.config = newConfig;
  closeStepModal();
  renderPipeline();
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.id === 'step-modal') {
    closeStepModal();
  }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStepModal();
});

// ===== SWITCH LABEL UPDATE =====
document.addEventListener('DOMContentLoaded', () => {
  const allCheckbox = document.getElementById('solve-all');
  if (allCheckbox) {
    const updateLabel = () => {
      const label = allCheckbox.closest('.switch').querySelector('.switch-label');
      if (label) label.textContent = allCheckbox.checked ? 'On' : 'Off';
    };
    allCheckbox.addEventListener('change', updateLabel);
  }
});

// ===== GLOBAL NISS TOGGLE =====
let nissDisabled = false;
let savedNissValues = {}; // step index -> original niss value

function toggleGlobalNiss(checked) {
  nissDisabled = checked;
  if (checked) {
    // Save current NISS values and set all to 'none'
    savedNissValues = {};
    pipelineSteps.forEach((step, i) => {
      const def = STEP_DEFS[step.type];
      if (def && def.params && def.params.niss) {
        savedNissValues[i] = step.config.niss || '';
        step.config.niss = 'none';
      }
    });
  } else {
    // Restore saved NISS values
    pipelineSteps.forEach((step, i) => {
      const def = STEP_DEFS[step.type];
      if (def && def.params && def.params.niss) {
        if (savedNissValues[i] !== undefined) {
          if (savedNissValues[i] === '') {
            delete step.config.niss;
          } else {
            step.config.niss = savedNissValues[i];
          }
        }
      }
    });
    savedNissValues = {};
  }
  renderPipeline();
}

document.addEventListener('DOMContentLoaded', () => {
  const nissToggle = document.getElementById('niss-disable-all');
  if (nissToggle) {
    nissToggle.addEventListener('change', (e) => {
      toggleGlobalNiss(e.target.checked);
      const label = nissToggle.closest('.switch').querySelector('.switch-label');
      if (label) label.textContent = e.target.checked ? 'On' : 'Off';
    });
  }
});

// ===============================================================
// ===== SOLVE =====
// ===============================================================

let solveController = null;

async function solve() {
  const scramble = document.getElementById('solve-scramble').value.trim();
  if (!scramble) return;

  const btn = document.getElementById('solve-btn');
  const stopBtn = document.getElementById('stop-btn');
  setLoading(btn, true);
  if (stopBtn) stopBtn.style.display = '';

  // Create abort controller for timeout
  solveController = new AbortController();
  const timeoutId = setTimeout(() => {
    solveController.abort();
    stopSolve();
  }, 240000); // 4 minutes

  try {
    const format = document.querySelector('input[name="format"]:checked').value;
    const solutions = parseInt(document.getElementById('solve-count').value) || 1;
    const minVal = document.getElementById('solve-min').value;
    const maxVal = document.getElementById('solve-max').value;
    const min = minVal !== '' ? parseInt(minVal) : null;
    const max = maxVal !== '' ? parseInt(maxVal) : null;
    const quality = parseInt(document.getElementById('solve-quality').value);
    const showAll = document.getElementById('solve-all').checked || undefined;
    const backend = document.getElementById('solve-backend').value;

    // Build pipeline from visual builder
    const steps = buildFullPipelineString() || undefined;

    const res = await fetch(API_BASE + '/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scramble, solutions, min, max, quality, format, showAll, backend, steps }),
      signal: solveController.signal
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || data.stderr || 'Server error');

    const result = data.output || data.result || '';
    document.getElementById('solve-output').textContent = result;
    document.getElementById('solve-result').style.display = 'block';

    setupSolutionPlayer(result, scramble, format);

  } catch (err) {
    if (err.name === 'AbortError') {
      document.getElementById('solve-output').textContent = 'Stopped (4 minute timeout reached)';
      document.getElementById('solve-result').style.display = 'block';
    } else {
      const msg = err.message || 'Unknown error';
      document.getElementById('solve-output').textContent = 'Error: ' + msg;
      document.getElementById('solve-result').style.display = 'block';
    }
  } finally {
    clearTimeout(timeoutId);
    setLoading(btn, false);
    if (stopBtn) stopBtn.style.display = 'none';
    solveController = null;
  }
}

async function stopSolve() {
  // Abort frontend request
  if (solveController) solveController.abort();
  // Tell server to stop calculation
  try { await fetch(API_BASE + '/api/stop', { method: 'POST' }); } catch(e) {}
}

// ===== SOLUTION PLAYER =====
let playerMoves = [];
let playerStep = 0;
let playerScramble = '';
let playerPlaying = false;
let playerTimer = null;

function getPlayerSpeed() {
  const slider = document.getElementById('player-speed');
  return slider ? parseInt(slider.value) : 600;
}

function setupSolutionPlayer(result, scramble, format) {
  let solutionStr = '';
  if (format === 'plain') {
    solutionStr = result.split('\n')[0].trim();
  } else if (format === 'compact') {
    const match = result.match(/^(.+?)\s*\(\d+\)/m);
    if (match) solutionStr = match[1].trim();
  } else {
    const match = result.match(/Solution\s*\(\d+\):\s*(.+)/);
    if (match) solutionStr = match[1].trim();
  }

  if (!solutionStr) {
    document.getElementById('solution-player').style.display = 'none';
    return;
  }

  playerMoves = parseMoves(solutionStr);
  playerScramble = scramble;
  playerStep = 0;
  playerPlaying = false;
  clearInterval(playerTimer);

  if (playerMoves.length === 0) {
    document.getElementById('solution-player').style.display = 'none';
    return;
  }

  document.getElementById('solution-player').style.display = 'block';
  document.getElementById('player-total').textContent = playerMoves.length;
  document.getElementById('player-play-btn').textContent = '\u25B6';
  renderPlayerMoves();
  renderPlayerCube();
}

function renderPlayerMoves() {
  const container = document.getElementById('player-moves');
  container.innerHTML = '';
  playerMoves.forEach((move, i) => {
    const el = document.createElement('span');
    el.className = 'player-move';
    if (i < playerStep) el.classList.add('done');
    if (i === playerStep && playerStep < playerMoves.length) el.classList.add('current');
    el.textContent = move;
    el.addEventListener('click', () => { playerStep = i + 1; renderPlayerMoves(); renderPlayerCube(); });
    container.appendChild(el);
  });
  document.getElementById('player-step').textContent = playerStep;
}

function renderPlayerCube() {
  // No 3D cube — player step tracking only via renderPlayerMoves
}

function playerNext() { if (playerStep < playerMoves.length) { playerStep++; renderPlayerMoves(); renderPlayerCube(); } }
function playerPrev() { if (playerStep > 0) { playerStep--; renderPlayerMoves(); renderPlayerCube(); } }
function playerFirst() { playerStep = 0; renderPlayerMoves(); renderPlayerCube(); }
function playerLast() { playerStep = playerMoves.length; renderPlayerMoves(); renderPlayerCube(); }

function playerToggle() {
  playerPlaying = !playerPlaying;
  const btn = document.getElementById('player-play-btn');
  if (playerPlaying) {
    btn.textContent = '\u23F8';
    if (playerStep >= playerMoves.length) { playerStep = 0; renderPlayerMoves(); renderPlayerCube(); }
    playerTimer = setInterval(() => {
      if (playerStep >= playerMoves.length) { playerPlaying = false; btn.textContent = '\u25B6'; clearInterval(playerTimer); return; }
      playerStep++; renderPlayerMoves(); renderPlayerCube();
    }, getPlayerSpeed());
  } else {
    btn.textContent = '\u25B6';
    clearInterval(playerTimer);
  }
}

// ===== SCRAMBLE GENERATOR (client-side using cubing.js) =====
async function generateAndFillScramble() {
  try {
    const { randomScrambleForEvent } = await import('https://cdn.cubing.net/v0/js/cubing/scramble');
    const scramble = await randomScrambleForEvent('333');
    const scrambleStr = scramble.toString();
    document.getElementById('solve-scramble').value = scrambleStr;
  } catch (err) {
    // Fallback: generate a basic random scramble
    const moves = ['R','L','U','D','F','B'];
    const mods = ['', "'", '2'];
    let scramble = [];
    let lastFace = '';
    for (let i = 0; i < 20; i++) {
      let face;
      do { face = moves[Math.floor(Math.random() * moves.length)]; } while (face === lastFace);
      lastFace = face;
      scramble.push(face + mods[Math.floor(Math.random() * mods.length)]);
    }
    const scrambleStr = scramble.join(' ');
    document.getElementById('solve-scramble').value = scrambleStr;
  }
}

function copySolution() { navigator.clipboard.writeText(document.getElementById('solve-output').textContent); showToast('Copied!'); }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Load default preset
  pipelineSteps = PRESETS['default'].map(s => ({ type: s.type, config: s.config ? { ...s.config } : {} }));
  renderPipeline();

  // Keyboard
  document.getElementById('solve-scramble').addEventListener('keydown', (e) => { if (e.key === 'Enter') solve(); });

  // Speed slider
  const speedSlider = document.getElementById('player-speed');
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      if (playerPlaying) {
        clearInterval(playerTimer);
        playerTimer = setInterval(() => {
          if (playerStep >= playerMoves.length) { playerPlaying = false; document.getElementById('player-play-btn').textContent = '\u25B6'; clearInterval(playerTimer); return; }
          playerStep++; renderPlayerMoves(); renderPlayerCube();
        }, getPlayerSpeed());
      }
    });
  }
});

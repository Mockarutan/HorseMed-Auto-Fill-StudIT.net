<!-- HorseMed Auto-Fill v4.1 – Visible treatment type + safe Vue modal -->

let config = { defaultQuantity: 1, administrationRoutes: [], treatmentTypes: [] };

async function loadConfig() {
  try {
    const url = chrome.runtime.getURL('config.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    config = await res.json();
    console.log('Config loaded – ' + config.administrationRoutes.length + ' routes, ' + config.treatmentTypes.length + ' treatments');
  } catch (e) {
    console.error('Could not load config.json', e);
  }
}

const MARKER = '~MP1~';

function encodeData(data) {
  return MARKER + JSON.stringify(data) + MARKER;
}

function decodeData(comment) {
  const regex = new RegExp(MARKER + '(.*?)' + MARKER, 's');
  const match = comment.match(regex);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch (e) { return null; }
}

function dispatchEvents(element) {
  if (!element) return;
  const events = ['input', 'change', 'blur', 'focus'];
  events.forEach(ev => element.dispatchEvent(new Event(ev, { bubbles: true })));
}

// ================================================================
// Diagnoskod modal
// ================================================================
let diagnosModal = null;

function createDiagnosModal() {
  if (diagnosModal) return diagnosModal;
  diagnosModal = document.createElement('div');
  diagnosModal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:none;align-items:center;justify-content:center;`;
  diagnosModal.innerHTML = `
    <div style="width:90%;max-width:820px;background:white;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,0.4);max-height:92vh;display:flex;flex-direction:column;">
      <div style="padding:15px 20px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">
        <h4 style="margin:0;">Diagnoskod</h4>
        <button type="button" class="close-modal" style="font-size:28px;font-weight:bold;cursor:pointer;border:none;background:none;">×</button>
      </div>
      <div style="padding:15px 20px;flex:1;overflow:auto;">
        <input id="plugin-search-input" type="text" placeholder="Sök..." style="width:100%;padding:10px;font-size:15px;border:1px solid #ccc;border-radius:4px;">
        <div id="plugin-results" style="margin-top:15px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(diagnosModal);
  diagnosModal.querySelector('.close-modal').addEventListener('click', () => diagnosModal.style.display = 'none');
  const searchInput = diagnosModal.querySelector('#plugin-search-input');
  let timeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => performSearch(searchInput.value.trim()), 300);
  });
  return diagnosModal;
}

async function performSearch(query) {
  const resultsDiv = diagnosModal.querySelector('#plugin-results');
  if (query.length < 3) {
    resultsDiv.innerHTML = `<p style="padding:15px;color:#777;">Skriv minst 3 tecken för att söka...</p>`;
    return;
  }
  try {
    const res = await fetch(`https://studit.net/api/i/integrations/jordbruksverket/treatment-reasons?search=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error();
    const json = await res.json();
    if (!json.data || json.data.length === 0) {
      resultsDiv.innerHTML = `<p style="padding:15px;color:#777;">Inga träffar.</p>`;
      return;
    }
    let html = `<table class="table table-striped" style="width:100%;"><thead><tr><th>Kod</th><th>Beskrivning</th></tr></thead><tbody>`;
    json.data.forEach(item => {
      html += `<tr data-code="${item.code}" data-desc="${item.description.replace(/"/g,'&quot;')}" style="cursor:pointer;">
                 <td><strong>${item.code}</strong></td>
                 <td>${item.description}</td>
               </tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;

    resultsDiv.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const code = row.getAttribute('data-code');
        const desc = row.getAttribute('data-desc');
        const table = document.querySelector('table.add-planned-event[data-med-plugin-added="true"]');
        if (table) {
          const diagInput = table.querySelector('.med-diagnoskod');
          const reasonInput = table.querySelector('.med-reason');
          if (diagInput) { diagInput.value = code; dispatchEvents(diagInput); }
          if (reasonInput) { reasonInput.value = desc; dispatchEvents(reasonInput); }
        }
        diagnosModal.style.display = 'none';
      });
    });
  } catch (e) {
    resultsDiv.innerHTML = `<p style="color:red;padding:15px;">Kunde inte hämta sökresultat.</p>`;
  }
}

// ================================================================
// 1. Advanced fields – route dropdown
// ================================================================
function handlePlannedEventForms() {
  const tables = document.querySelectorAll('table.add-planned-event');
  tables.forEach(function(table) {
    if (table.dataset.medPluginAdded) return;
    table.dataset.medPluginAdded = 'true';

    const rows = table.querySelectorAll('tr');
    let commentRow = null;
    let commentInput = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].textContent.includes('Kommentar')) {
        commentRow = rows[i];
        commentInput = commentRow.querySelector('input[name^="planned_events["][name$="][comments]"]');
      }
    }
    if (!commentInput) return;

    const newRow = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', '2');
    td.style.padding = '15px 20px 15px 25px';
    td.style.borderTop = '3px solid #5cb85c';
    td.style.backgroundColor = '#f8fff8';

    const title = document.createElement('strong');
    title.textContent = 'Advanced medication details (plugin)';
    td.appendChild(title);
    td.appendChild(document.createElement('br'));
    td.appendChild(document.createElement('br'));

    function addField(labelText, element) {
      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = '16px';
      const label = document.createElement('label');
      label.style.position = 'static';
      label.style.display = 'block';
      label.style.marginBottom = '6px';
      label.style.fontWeight = '600';
      label.textContent = labelText;
      wrapper.appendChild(label);
      wrapper.appendChild(element);
      td.appendChild(wrapper);
    }

    const qtyInput = document.createElement('input'); qtyInput.type = 'number'; qtyInput.className = 'med-quantity form-control'; qtyInput.value = config.defaultQuantity || 1; qtyInput.step = '0.001'; qtyInput.style.width = '100%';
    addField('Quantity / Mängd:', qtyInput);

    const unitSelect = document.createElement('select'); unitSelect.className = 'med-unit form-control'; unitSelect.style.width = '100%';
    ['ml','g','pc','kg_horse'].forEach(u => { const opt = document.createElement('option'); opt.value = u; opt.textContent = u; unitSelect.appendChild(opt); });
    addField('Unit / Enhet:', unitSelect);

    // Route dropdown from config
    const routeSelect = document.createElement('select'); 
    routeSelect.className = 'med-route form-control'; 
    routeSelect.style.width = '100%';
    const defaultOpt = document.createElement('option'); defaultOpt.value = ''; defaultOpt.textContent = 'Välj...';
    routeSelect.appendChild(defaultOpt);
    config.administrationRoutes.forEach(route => {
      const opt = document.createElement('option'); 
      opt.value = route; 
      opt.textContent = route; 
      routeSelect.appendChild(opt);
    });
    addField('Administrationssätt:', routeSelect);

    const diagWrapper = document.createElement('div'); diagWrapper.style.display = 'flex'; diagWrapper.style.gap = '8px';
    const diagInput = document.createElement('input'); diagInput.type = 'text'; diagInput.className = 'med-diagnoskod form-control'; diagInput.style.flex = '1'; diagInput.placeholder = 't.ex. XP15';
    const searchBtn = document.createElement('button'); searchBtn.type = 'button'; searchBtn.className = 'btn btn-default'; searchBtn.style.fontSize = '0.8rem'; searchBtn.style.padding = '4px 8px'; searchBtn.innerHTML = '<i class="glyphicon glyphicon-search"></i>';
    searchBtn.onclick = () => { const modal = createDiagnosModal(); modal.style.display = 'flex'; const input = modal.querySelector('#plugin-search-input'); input.focus(); performSearch(input.value.trim()); };
    diagWrapper.appendChild(diagInput); diagWrapper.appendChild(searchBtn);
    addField('Diagnoskod:', diagWrapper);

    const reasonInput = document.createElement('input'); reasonInput.type = 'text'; reasonInput.className = 'med-reason form-control'; reasonInput.style.width = '100%'; reasonInput.placeholder = 't.ex. Antibiotikabehandling, profylax';
    addField('Anledning till behandling:', reasonInput);

    newRow.appendChild(td);

    function bakeData() {
      const nativeTreatmentHidden = table.querySelector('input[name^="planned_events["][name$="][parameter]"]');
      const treatmentId = nativeTreatmentHidden ? parseInt(nativeTreatmentHidden.value) : null;

      const quantity = parseFloat(qtyInput.value) || 0;
      const unit = unitSelect.value;
      const routeStr = routeSelect.value;
      const routeIndex = config.administrationRoutes.indexOf(routeStr);
      const diagnosisCode = diagInput.value.trim();
      const reasonText = reasonInput.value.trim();

      const baked = { t: treatmentId, q: quantity, u: unit };
      if (routeIndex >= 0) baked.r = routeIndex;
      if (diagnosisCode) baked.d = diagnosisCode;
      if (reasonText) baked.reason = reasonText;

      let current = commentInput.value || '';
      const clean = current.replace(new RegExp(MARKER + '.*?' + MARKER, 's'), '').trim();
      commentInput.value = clean ? clean + '\n' + encodeData(baked) : encodeData(baked);

      console.log('✅ Baked compressed →', baked);
    }

    qtyInput.addEventListener('input', bakeData);
    unitSelect.addEventListener('change', bakeData);
    routeSelect.addEventListener('change', bakeData);
    diagInput.addEventListener('input', bakeData);
    reasonInput.addEventListener('input', bakeData);

    if (commentRow.nextSibling) {
      commentRow.parentNode.insertBefore(newRow, commentRow.nextSibling);
    } else {
      commentRow.parentNode.appendChild(newRow);
    }
  });
}

// ================================================================
// Green Apply button
// ================================================================
function handlePlannedEventList() {
  const tables = document.querySelectorAll('table.event-details-table');
  tables.forEach(function(table) {
    if (!table.textContent.includes(MARKER) || table.dataset.medButtonAdded) return;
    table.dataset.medButtonAdded = 'true';
    const data = decodeData(table.textContent);
    if (!data) return;
    const headingContainer = table.querySelector('.heading-container');
    if (!headingContainer) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-success btn-sm';
    btn.style.marginLeft = '8px';
    btn.style.fontWeight = 'bold';
    btn.innerHTML = 'Apply';
    btn.onclick = function() { autoFillApplyForm(data); };
    headingContainer.appendChild(btn);
  });
}

// ================================================================
// Helper: wait for treatment and select via UI
// ================================================================
function waitForTreatmentAndSelect(treatmentName, onDone, attempts = 15) {
  const items = document.querySelectorAll('.item-container');

  if (items.length > 0) {
    for (const item of items) {
      const header = item.querySelector('.item-header');
      if (!header) continue;

      if (header.textContent.trim() === treatmentName) {
        item.click();
        console.log('✅ Selected treatment via UI:', treatmentName);

        // Let Vue settle before continuing
        setTimeout(() => onDone && onDone(), 200);
        return;
      }
    }
  }

  if (attempts > 0) {
    setTimeout(() => waitForTreatmentAndSelect(treatmentName, onDone, attempts - 1), 100);
  } else {
    console.warn('❌ Could not find treatment in modal:', treatmentName);
    onDone && onDone();
  }
}

// ================================================================
// Helper: fill remaining fields
// ================================================================
function fillOtherFields(data) {
  const qtyInput = document.querySelector('input[name^="events["][name$="][quantity]"]');
  if (qtyInput) { qtyInput.value = data.q || 1; dispatchEvents(qtyInput); }

  const unitSelect = document.querySelector('select[name^="events["][name$="][unit]"]');
  if (unitSelect && data.u) { unitSelect.value = data.u; dispatchEvents(unitSelect); }

  const routeInput = document.querySelector('input[name^="events["][name$="][route_of_administration]"]');
  if (routeInput && typeof data.r === 'number') {
    const routeStr = config.administrationRoutes[data.r];
    if (routeStr) { routeInput.value = routeStr; dispatchEvents(routeInput); }
  }

  const diagInput = document.querySelector('input[name="events[0][jv_reason_code]"]');
  if (diagInput && data.d) { diagInput.value = data.d; dispatchEvents(diagInput); }

  const reasonInput = document.querySelector('input[name="events[0][reason]"]');
  if (reasonInput && data.reason) { reasonInput.value = data.reason; dispatchEvents(reasonInput); }
}

// ================================================================
// 3. Auto-fill – FIXED (Vue-safe)
// ================================================================
function autoFillApplyForm(data) {
  console.log('Starting apply with data:', data);

  // Step 1: open form
  const behandlingBtn = Array.from(document.querySelectorAll('button')).find(el =>
    el.textContent && el.textContent.trim() === 'Behandling'
  );
  if (behandlingBtn) behandlingBtn.click();

  // Step 2: wait for form render
  setTimeout(() => {

    const selectTypeTd = document.querySelector('.select-type');
    if (!selectTypeTd) {
      console.warn('.select-type not found');
      return;
    }

    // Step 3: select treatment via UI (NO DOM hacking)
    if (data.t != null) {
      const treatment = config.treatmentTypes.find(t => t.id === data.t);

      if (!treatment) {
        console.warn('❌ No treatment found for id:', data.t);
        fillOtherFields(data);
        return;
      }

      const selectBtn = selectTypeTd.querySelector('button');
      if (!selectBtn) {
        console.warn('❌ Select button not found');
        fillOtherFields(data);
        return;
      }

      selectBtn.click();

      waitForTreatmentAndSelect(treatment.name, () => {
        fillOtherFields(data);
      });

    } else {
      fillOtherFields(data);
    }

    // Visual feedback
    const formContainer = document.querySelector('.add-events-content') || document.querySelector('form');
    if (formContainer) {
      formContainer.scrollIntoView({ behavior: 'smooth' });
      formContainer.style.transition = 'background-color 0.8s';
      formContainer.style.backgroundColor = '#d4edda';
      setTimeout(() => { formContainer.style.backgroundColor = ''; }, 1400);
    }

    console.log('✅ Apply completed (Vue-safe)');
  }, 1300);
}

// ================================================================
// Watcher + CSS
// ================================================================
function startWatcher() {
  handlePlannedEventForms();
  handlePlannedEventList();
  const observer = new MutationObserver(() => { handlePlannedEventForms(); handlePlannedEventList(); });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(() => { handlePlannedEventForms(); handlePlannedEventList(); }, 800);
}

function injectCommentCSS() {
  const style = document.createElement('style');
  style.textContent = `
    table.event-details-table td[colspan="12"] span {
      word-break: break-word;
      white-space: pre-wrap;
      display: block;
    }
  `;
  document.head.appendChild(style);
}

async function init() {
  await loadConfig();
  injectCommentCSS();
  startWatcher();
  console.log('HorseMed Auto-Fill v4.1 loaded');
}

init();
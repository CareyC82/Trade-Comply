let incotermData = null;
let incotermAnswers = {};

async function loadIncotermData() {
    try {
        const res = await fetch('data/incoterms.json');
        incotermData = await res.json();
        renderFindPanel();
        renderCalcPanel();
    } catch (err) {
        console.error('Failed to load incoterms.json:', err);
    }
}

function switchIncotermTab(tab) {
    document.getElementById('tab-find').classList.toggle('active', tab === 'find');
    document.getElementById('tab-calc').classList.toggle('active', tab === 'calc');
    document.getElementById('incoterm-find-panel').style.display = tab === 'find' ? 'block' : 'none';
    document.getElementById('incoterm-calc-panel').style.display = tab === 'calc' ? 'block' : 'none';
}

function renderFindPanel() {
    const panel = document.getElementById('incoterm-find-panel');
    if (!panel || !incotermData) return;
    const tree = incotermData.decisionTree;
    incotermAnswers = {};
    panel.innerHTML = `<p style="margin-bottom:16px;color:var(--color-text-secondary);">${tree.description}</p>
        <div id="decision-questions"></div>
        <div id="decision-result" style="display:none;"></div>`;
    renderDecisionQuestions();
}

function renderDecisionQuestions() {
    const container = document.getElementById('decision-questions');
    if (!container || !incotermData) return;
    const tree = incotermData.decisionTree;
    let html = '';
    tree.questions.forEach((q, index) => {
        const answered = incotermAnswers[q.id] !== undefined;
        html += `<div style="background:white;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="font-weight:600;color:var(--color-primary);margin-bottom:10px;">${index + 1}. ${q.text}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">`;
        q.options.forEach(opt => {
            const selected = incotermAnswers[q.id] === opt.value;
            html += `<button class="decision-option" data-question="${q.id}" data-value="${opt.value}"
                style="padding:8px 14px;border:2px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'};
                border-radius:20px;background:${selected ? 'var(--color-primary)' : 'white'};
                color:${selected ? 'white' : 'var(--color-text-secondary)'};
                font-size:0.85rem;cursor:pointer;transition:all 0.15s;">
                ${opt.label}</button>`;
        });
        html += `</div></div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.decision-option').forEach(btn => {
        btn.addEventListener('click', () => {
            incotermAnswers[btn.dataset.question] = btn.dataset.value;
            renderDecisionQuestions();
            checkAllAnswered();
        });
    });
}

function checkAllAnswered() {
    const tree = incotermData.decisionTree;
    if (tree.questions.every(q => incotermAnswers[q.id] !== undefined)) {
        showDecisionResult();
    }
}

function showDecisionResult() {
    const container = document.getElementById('decision-result');
    if (!container) return;
    const tree = incotermData.decisionTree;
    const key = `${incotermAnswers.transport}_${incotermAnswers.responsibility}_${incotermAnswers.customs}`;
    const ruleKey = Object.keys(tree.rules).find(k => k.startsWith(key)) || Object.keys(tree.rules)[0];
    const incotermCode = tree.rules[ruleKey] || 'FOB';
    const termData = incotermData.terms[incotermCode];
    if (!termData) return;
    container.style.display = 'block';
    container.innerHTML = `<div style="background:#f0faf0;border:2px solid var(--color-matched);border-radius:12px;padding:20px;margin-top:16px;">
        <div style="font-size:1.3rem;font-weight:700;color:var(--color-matched);margin-bottom:8px;">✅ Recommended: ${incotermCode} — ${termData.name}</div>
        <p style="color:var(--color-text-secondary);margin-bottom:16px;">${termData.description}</p>
        ${termData.complianceRisks && termData.complianceRisks.length > 0 ? `<div style="background:#fff8f0;border-radius:8px;padding:14px;margin-bottom:16px;">
            <div style="font-weight:600;color:#E67E22;margin-bottom:8px;">⚠️ Compliance Risks to Watch:</div>
            <ul style="margin:0;padding-left:20px;color:var(--color-text-secondary);font-size:0.9rem;">
                ${termData.complianceRisks.map(r => `<li style="margin-bottom:4px;">${r}</li>`).join('')}</ul></div>` : ''}
        <div style="margin-top:12px;display:flex;gap:10px;">
            <button onclick="resetDecisionTree()" style="padding:8px 18px;background:white;border:1px solid var(--color-border);border-radius:8px;cursor:pointer;font-size:0.85rem;">🔄 Start Over</button>
            <button onclick="switchIncotermTab('calc')" style="padding:8px 18px;background:var(--color-primary);color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;">🧮 Go to Calculator</button></div></div>`;
    document.getElementById('decision-questions').style.display = 'none';
}

function resetDecisionTree() {
    incotermAnswers = {};
    document.getElementById('decision-result').style.display = 'none';
    document.getElementById('decision-questions').style.display = 'block';
    renderDecisionQuestions();
}

function renderCalcPanel() {
    const panel = document.getElementById('incoterm-calc-panel');
    if (!panel || !incotermData) return;
    const terms = incotermData.terms;
    const termOptions = Object.keys(terms).map(code => `<option value="${code}">${code} — ${terms[code].name}</option>`).join('');
    panel.innerHTML = `<div style="background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <div style="margin-bottom:16px;">
            <label style="display:block;font-weight:600;color:var(--color-primary);margin-bottom:6px;">Select Incoterm</label>
            <select id="calc-incoterm" style="width:100%;padding:10px 12px;border:2px solid var(--color-border);border-radius:8px;font-size:0.95rem;">${termOptions}</select></div>
        <div style="margin-bottom:16px;">
            <label style="display:block;font-weight:600;color:var(--color-primary);margin-bottom:6px;">Invoice Amount</label>
            <input type="number" id="calc-invoice" placeholder="e.g. 10000" style="width:100%;padding:10px 12px;border:2px solid var(--color-border);border-radius:8px;font-size:0.95rem;"></div>
        <div style="margin-bottom:16px;">
            <label style="display:block;font-weight:600;color:var(--color-primary);margin-bottom:6px;">Freight Cost</label>
            <input type="number" id="calc-freight" placeholder="e.g. 500" style="width:100%;padding:10px 12px;border:2px solid var(--color-border);border-radius:8px;font-size:0.95rem;"></div>
        <div style="margin-bottom:20px;">
            <label style="display:block;font-weight:600;color:var(--color-primary);margin-bottom:6px;">Insurance Cost</label>
            <input type="number" id="calc-insurance" placeholder="e.g. 50" style="width:100%;padding:10px 12px;border:2px solid var(--color-border);border-radius:8px;font-size:0.95rem;"></div>
        <button onclick="calculateCompliance()" style="width:100%;padding:12px;background:var(--color-primary);color:white;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">Calculate</button>
        <div id="calc-result" style="margin-top:16px;display:none;"></div></div>`;
}

function calculateCompliance() {
    const code = document.getElementById('calc-incoterm').value;
    const invoice = parseFloat(document.getElementById('calc-invoice').value) || 0;
    const freight = parseFloat(document.getElementById('calc-freight').value) || 0;
    const insurance = parseFloat(document.getElementById('calc-insurance').value) || 0;
    const termData = incotermData.terms[code];
    if (!termData || invoice <= 0) { alert('Please enter a valid invoice amount.'); return; }
    let customsValue = invoice, rebateBase = invoice;
    if (code === 'EXW' || code === 'FOB' || code === 'FCA') { customsValue = invoice + freight + insurance; rebateBase = invoice; }
    else if (code === 'CIF' || code === 'CIP') { customsValue = invoice; rebateBase = invoice - freight - insurance; }
    else if (code === 'CFR' || code === 'CPT') { customsValue = invoice + insurance; rebateBase = invoice - freight; }
    else if (code === 'DAP' || code === 'DDP') { customsValue = invoice; rebateBase = invoice - freight - insurance; }
    if (rebateBase < 0) rebateBase = 0;
    const resultDiv = document.getElementById('calc-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<div style="background:#f0f4fa;border-radius:10px;padding:16px;margin-top:12px;">
        <div style="margin-bottom:12px;"><div style="font-size:0.8rem;color:var(--color-text-secondary);">Customs Dutiable Value (CIF basis)</div>
            <div style="font-size:1.3rem;font-weight:700;color:var(--color-primary);">${customsValue.toFixed(2)}</div></div>
        <div style="margin-bottom:12px;"><div style="font-size:0.8rem;color:var(--color-text-secondary);">Export Tax Rebate Basis (FOB equivalent)</div>
            <div style="font-size:1.3rem;font-weight:700;color:var(--color-matched);">${rebateBase.toFixed(2)}</div></div>
        ${termData.complianceRisks ? `<div style="background:#fff8f0;border-radius:8px;padding:12px;margin-top:12px;">
            <div style="font-weight:600;color:#E67E22;margin-bottom:6px;font-size:0.85rem;">⚠️ ${code} Compliance Notes:</div>
            <ul style="margin:0;padding-left:18px;color:var(--color-text-secondary);font-size:0.8rem;">
                ${termData.complianceRisks.map(r => `<li style="margin-bottom:3px;">${r}</li>`).join('')}</ul></div>` : ''}</div>`;
}

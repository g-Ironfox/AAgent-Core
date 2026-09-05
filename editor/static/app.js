const types = {
  input: { label: 'Input', symbol: 'IN' },
  output: { label: 'Output', symbol: 'OUT' },
  llm: { label: 'LLM', symbol: 'AI' },
  construct_message: { label: '构造 Message', symbol: 'M' },
  construct_content: { label: '构造 Content', symbol: 'C' },
  construct_list: { label: '构造列表', symbol: 'L' },
  foreach: { label: '遍历列表', symbol: 'FE' },
  router: { label: 'Router', symbol: 'R' },
  tool: { label: 'Tool', symbol: 'T' },
};

const state = { workflow: [], positions: {}, selected: 0, pending: null, dirty: false };
const el = {
  canvas: document.querySelector('#canvas'), nodes: document.querySelector('#nodes'), wires: document.querySelector('#wires'),
  library: document.querySelector('#library'), inspector: document.querySelector('#inspector'), title: document.querySelector('#inspector-title'),
  status: document.querySelector('#status'), meta: document.querySelector('#meta'), file: document.querySelector('#file'),
};

const inputTypes = { llm: [{ label: 'prompt', type: 'content', value: '处理输入并返回结果。' }, { label: 'model', type: 'content', value: 'deepseek-flash-v4' }, { label: 'think', type: 'boolean', value: false }, { label: 'tools', type: 'list-json', value: [] }], construct_message: [{ label: 'content', type: 'content', value: '' }], construct_content: [{ label: 'content', type: 'content', value: '' }], construct_list: [{ label: 'item', type: 'content', value: '' }], foreach: [{ label: 'list', type: 'list-content', value: [] }], router: [{ label: 'content', type: 'content', value: '' }], tool: [{ label: 'parameter', type: 'content', value: '' }], output: [{ label: 'content', type: 'content', value: '' }] };

function defaults(type) {
  const specs = inputTypes[type] || [];
  return { type, name: types[type].label, input: specs.map((item) => ({ label: item.label, source: 'const', const: item.value, type: item.type })), output: type === 'output' ? [] : [{ label: 'output', source: 'port', port: null, type: 'content' }], input_value: specs.map((item) => item.value), arguments: {}, control_predecessors: [], control_successors: [] };
}

function nodePosition(index) { return state.positions[index] || (state.positions[index] = { x: 70 + (index % 4) * 240, y: 70 + Math.floor(index / 4) * 190 }); }
function setStatus(text, dirty = state.dirty) { el.status.textContent = text; state.dirty = dirty; }
function markDirty() { setStatus('未保存', true); }
function portClass(type) { return type === 'control' ? 'control' : type.includes('message') ? 'message' : type === 'boolean' ? 'boolean' : 'content'; }

function outputPorts(node) {
  return [{ label: '下一步', type: 'control', index: -1 }, ...(node.output || []).map((port, index) => ({ label: port.label, type: port.type, index }))];
}
function inputPorts(node) {
  return [{ label: '触发', type: 'control', index: -1 }, ...(node.input || []).map((port, index) => ({ label: port.label, type: port.type, index }))];
}

function renderLibrary() {
  el.library.replaceChildren(...Object.entries(types).map(([type, meta]) => {
    const button = document.createElement('button'); button.className = 'library-item';
    button.innerHTML = `<span class="symbol">${meta.symbol}</span><span><b>${meta.label}</b><small>添加到画布</small></span>`;
    button.addEventListener('click', () => { state.workflow.push(defaults(type)); nodePosition(state.workflow.length - 1); state.selected = state.workflow.length - 1; markDirty(); render(); });
    return button;
  }));
}

function render() { renderNodes(); renderInspector(); renderWires(); el.meta.textContent = `${state.workflow.length} 个节点 / ${state.workflow.reduce((sum, node) => sum + node.input.filter((port) => port.source === 'port').length, 0)} 条数据连接`; }

function renderNodes() {
  el.nodes.replaceChildren(...state.workflow.map((node, index) => {
    const box = document.createElement('div'); box.className = `flow-node${index === state.selected ? ' selected' : ''}`; box.dataset.index = index;
    const meta = types[node.type] || { label: node.type, symbol: '?' }; const head = document.createElement('div'); head.className = 'node-head'; head.innerHTML = `<span class="symbol">${meta.symbol}</span><span><strong></strong><small>${node.type.toUpperCase()}</small></span>`; head.querySelector('strong').textContent = node.name;
    const ports = document.createElement('div'); ports.className = 'ports'; const inPorts = inputPorts(node); const outPorts = outputPorts(node); const rows = Math.max(inPorts.length, outPorts.length);
    for (let row = 0; row < rows; row += 1) { const line = document.createElement('div'); line.className = 'port-line';
      if (inPorts[row]) { const port = inPorts[row]; const input = document.createElement('span'); input.className = 'port-row input'; input.innerHTML = `<span class="dot ${portClass(port.type)}"></span><span class="port-label"></span>`; input.querySelector('.port-label').textContent = port.label; const dot = input.querySelector('.dot'); dot.dataset.side = 'input'; dot.dataset.port = port.index; dot.dataset.type = port.type; line.append(input); }
      if (outPorts[row]) { const port = outPorts[row]; const out = document.createElement('span'); out.className = 'port-row output'; out.innerHTML = `<span class="port-label"></span><span class="dot ${portClass(port.type)}"></span>`; out.querySelector('.port-label').textContent = port.label; const dot = out.querySelector('.dot'); dot.dataset.side = 'output'; dot.dataset.port = port.index; dot.dataset.type = port.type; line.append(out); }
      ports.append(line);
    }
    box.append(head, ports); const pos = nodePosition(index); box.style.left = `${pos.x}px`; box.style.top = `${pos.y}px`; box.addEventListener('click', () => { state.selected = index; render(); }); bindDrag(box, index); box.querySelectorAll('.dot').forEach((dot) => dot.addEventListener('click', (event) => { event.stopPropagation(); selectPort(index, dot); })); return box;
  }));
}

function bindDrag(box, index) { let drag; box.addEventListener('pointerdown', (event) => { if (event.target.closest('.dot')) return; const pos = nodePosition(index); drag = { pointerX: event.clientX, pointerY: event.clientY, nodeX: pos.x, nodeY: pos.y }; box.setPointerCapture(event.pointerId); }); box.addEventListener('pointermove', (event) => { if (!drag) return; const pos = nodePosition(index); pos.x = Math.max(12, drag.nodeX + event.clientX - drag.pointerX); pos.y = Math.max(12, drag.nodeY + event.clientY - drag.pointerY); box.style.left = `${pos.x}px`; box.style.top = `${pos.y}px`; renderWires(); }); box.addEventListener('pointerup', () => { if (drag) markDirty(); drag = null; }); }

function selectPort(nodeIndex, dot) { const port = Number(dot.dataset.port); const pending = { node: nodeIndex, port, type: dot.dataset.type, side: dot.dataset.side }; if (!state.pending) { state.pending = pending; setStatus('请选择匹配端口'); return; } const first = state.pending; state.pending = null; if (first.type !== pending.type || first.side === pending.side || first.node === pending.node) { setStatus('端口类型或方向不匹配'); return; } const output = first.side === 'output' ? first : pending; const input = first.side === 'input' ? first : pending; connect(output, input); markDirty(); render(); }

function connect(output, input) { const target = state.workflow[input.node]; if (input.type === 'control') { target.control_predecessors = [...new Set([...target.control_predecessors, output.node])]; state.workflow[output.node].control_successors = [...new Set([...state.workflow[output.node].control_successors, input.node])]; return; } target.input[input.port].source = 'port'; target.input[input.port].port = [output.node, Math.max(0, output.port)]; target.input_value[input.port] = null; }

function renderWires() { const rect = el.canvas.getBoundingClientRect(); el.wires.setAttribute('viewBox', `0 0 ${Math.max(el.canvas.scrollWidth, 1800)} ${Math.max(el.canvas.scrollHeight, 1200)}`); const lines = []; state.workflow.forEach((node, targetIndex) => { node.input.forEach((port, inputIndex) => { if (port.source !== 'port' || !Array.isArray(port.port)) return; lines.push(drawWire(port.port[0], port.port[1], targetIndex, inputIndex, port.type)); }); node.control_predecessors.forEach((sourceIndex) => lines.push(drawWire(sourceIndex, -1, targetIndex, -1, 'control'))); }); el.wires.innerHTML = lines.join(''); }
function center(nodeIndex, side, portIndex) { const node = el.nodes.querySelector(`[data-index="${nodeIndex}"]`); const dots = [...(node?.querySelectorAll('.dot') || [])].filter((dot) => dot.dataset.side === side && Number(dot.dataset.port) === portIndex); const dot = dots[0]; if (!dot) return null; const a = dot.getBoundingClientRect(); return { x: a.left - el.canvas.getBoundingClientRect().left + el.canvas.scrollLeft + a.width / 2, y: a.top - el.canvas.getBoundingClientRect().top + el.canvas.scrollTop + a.height / 2 }; }
function drawWire(sourceNode, sourcePort, targetNode, targetPort, type) { const start = center(sourceNode, 'output', sourcePort); const end = center(targetNode, 'input', targetPort); if (!start || !end) return ''; const curve = Math.max(45, Math.abs(end.x - start.x) * .4); return `<path class="wire ${portClass(type)}" d="M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}"/>`; }

function renderInspector() { const node = state.workflow[state.selected]; if (!node) { el.title.textContent = '选择节点'; el.inspector.innerHTML = '<div class="section">从左侧添加节点</div>'; return; } el.title.textContent = node.name; const form = document.createElement('div'); form.className = 'form'; form.innerHTML = `<label>节点名称<input data-name value=""></label><label>类型<input value="${node.type}" disabled></label>`; form.querySelector('[data-name]').value = node.name; form.querySelector('[data-name]').addEventListener('input', (event) => { node.name = event.target.value; markDirty(); renderNodes(); el.title.textContent = node.name; }); el.inspector.replaceChildren(form);
  const section = document.createElement('div'); section.className = 'section'; section.innerHTML = '<h3>INPUT / 强类型</h3>'; node.input.forEach((port, index) => { const row = document.createElement('div'); row.className = 'port-config'; row.innerHTML = `<input value=""><select><option value="content">content</option><option value="message">message</option><option value="boolean">boolean</option><option value="list-json">list-json</option></select>`; row.querySelector('input').value = port.source === 'const' ? JSON.stringify(port.const) : `port ${port.port.join(':')}`; row.querySelector('select').value = port.type; row.querySelector('input').addEventListener('change', (event) => { if (port.source !== 'const') return; try { port.const = JSON.parse(event.target.value); node.input_value[index] = port.const; } catch { port.const = event.target.value; node.input_value[index] = event.target.value; } markDirty(); }); row.querySelector('select').addEventListener('change', (event) => { port.type = event.target.value; markDirty(); render(); }); section.append(row); }); el.inspector.append(section); if (node.type !== 'input') { const controls = document.createElement('div'); controls.className = 'section'; controls.innerHTML = '<button class="danger">删除节点</button>'; controls.querySelector('button').addEventListener('click', () => { if (state.workflow.length <= 1) return; const deletedIndex = state.selected; state.workflow.splice(deletedIndex, 1); state.selected = Math.max(0, deletedIndex - 1); state.workflow.forEach((item) => { item.control_predecessors = item.control_predecessors.flatMap((value) => value === deletedIndex ? [] : [value > deletedIndex ? value - 1 : value]); item.control_successors = item.control_successors.flatMap((value) => value === deletedIndex ? [] : [value > deletedIndex ? value - 1 : value]); item.input.forEach((port) => { if (port.source !== 'port' || !Array.isArray(port.port)) return; if (port.port[0] === deletedIndex) { port.source = 'const'; delete port.port; } else if (port.port[0] > deletedIndex) { port.port[0] -= 1; } }); }); markDirty(); render(); }); el.inspector.append(controls); } }

function normalize(items) { return items.map((node) => ({ ...node, input: node.input || [], output: node.output || [], input_value: node.input_value || [], arguments: node.arguments || {}, control_predecessors: node.control_predecessors || [], control_successors: node.control_successors || [] })); }
async function load(url = '/api/workflow') { const response = await fetch(url); if (!response.ok) throw new Error('读取失败'); state.workflow = normalize(await response.json()); state.positions = {}; state.selected = 0; setStatus('已载入', false); render(); }
async function save() { const response = await fetch('/api/workflow', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.workflow) }); if (!response.ok) { setStatus('保存失败'); return; } setStatus('已保存', false); }
document.querySelector('#save').addEventListener('click', save); document.querySelector('#reset').addEventListener('click', async () => { if (window.confirm('重置为种子 workflow？')) await load('/api/workflow/reset').catch(() => setStatus('重置失败')); }); document.querySelector('#import').addEventListener('click', () => el.file.click()); el.file.addEventListener('change', async () => { const [file] = el.file.files; if (!file) return; try { state.workflow = normalize(JSON.parse(await file.text())); state.positions = {}; state.selected = 0; markDirty(); render(); } catch { setStatus('JSON 格式无效'); } el.file.value = ''; }); document.querySelector('#export').addEventListener('click', () => { const blob = new Blob([`${JSON.stringify(state.workflow, null, 2)}\n`], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'workflow.json'; link.click(); URL.revokeObjectURL(link.href); });
renderLibrary(); load().catch((error) => setStatus(error.message)); window.addEventListener('resize', renderWires); setInterval(() => { if (state.dirty) localStorage.setItem('aagent-editor-draft', JSON.stringify(state.workflow)); }, 1500);
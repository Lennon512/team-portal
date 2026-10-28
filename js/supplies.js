// ---------- Supplies ----------
let sp = { items: [], reqs: [], counts: [], thr: [], studio: '', tab: 'list' };
const okUrl = u => /^https?:\/\//i.test(u || '');
const spNum = v => v === null || v === undefined || v === '' ? null : +v;

function spState(sid, it, X) {
  X = X || sp;
  const t = X.thr.find(x => x.studio_id === sid && x.item_id === it.id), c = X.counts.find(x => x.studio_id === sid && x.item_id === it.id);
  const min = t && spNum(t.min_qty) !== null ? spNum(t.min_qty) : spNum(it.min_qty), tgt = spNum(it.target_qty), have = c ? +c.on_hand : null;
  const days = c ? Math.floor((Date.now() - new Date(c.counted_at)) / DAY) : null;
  return { min, tgt, have, days, at: c ? c.counted_at : null, low: min !== null && have !== null && have <= min, stale: days !== null && days > 14, sug: tgt !== null && have !== null && tgt > have ? tgt - have : null };
}
const spQ = (it, st) => st.sug !== null ? `Order ${st.sug}${it.unit ? ' ' + it.unit : ''} (have ${st.have})` : `Low: have ${st.have}`;

async function suppliesBadge() {
  if (!ME || ME.role !== 'owner') return;
  const { data } = await db.from('supply_requests').select('item_id').eq('status', 'needed');
  const n = (data || []).length;
  $('navSup').textContent = 'Supplies' + (n ? ` (${n})` : '');
}

async function loadSupplies() {
  const own = ME.role === 'owner';
  if (own) { if (!sp.studio) sp.studio = (locs[0] || {}).id; } else { sp.studio = ME.location_id; sp.tab = 'list'; }
  $('spTabs').hidden = !own; $('spManage').hidden = !own;
  if (own) $('spStudio').innerHTML = locs.map(l => `<option value="${l.id}" ${l.id === sp.studio ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  if (!sp.studio) { $('spBody').innerHTML = '<p class="lead">You have not been assigned to a studio yet. Ask the owner.</p>'; return; }
  const [i, r, c, t] = await Promise.all([db.from('supply_items').select('*').eq('active', true).order('category').order('sort_order').order('name'), db.from('supply_requests').select('*'), db.from('supply_counts').select('*'), db.from('supply_thresholds').select('*')]);
  sp.items = i.data || []; sp.reqs = r.data || []; sp.counts = c.data || []; sp.thr = t.data || []; drawSupplies();
}

function drawSupplies() {
  const own = ME.role === 'owner';
  document.querySelectorAll('#spTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === sp.tab));
  $('spStudio').hidden = !own || sp.tab !== 'list';
  if (own && sp.tab === 'mins') return drawMins();
  const byItem = Object.fromEntries(sp.items.map(x => [x.id, x])), mine = Object.fromEntries(sp.reqs.filter(r => r.studio_id === sp.studio).map(r => [r.item_id, r]));
  const pill = st => `<span class="pill ${st === 'ordered' ? 'ice' : 'need'}" style="margin:0">${st === 'ordered' ? 'Ordered' : 'Needed'}</span>`;
  const link = it => okUrl(it.order_url) ? ` \u2022 <a href="${esc(it.order_url)}" target="_blank" rel="noopener">Order</a>` : '';
  const open = sp.reqs.filter(r => byItem[r.item_id]).sort((a, b) => a.status === b.status ? 0 : a.status === 'needed' ? -1 : 1);
  let html = '';
  if (own) {
    const lows = []; locs.forEach(l => sp.items.forEach(it => { const st = spState(l.id, it); if (st.low && !sp.reqs.some(r => r.studio_id === l.id && r.item_id === it.id)) lows.push({ l, it, st }); }));
    html += '<h3 class="sub">Open requests, all studios</h3>' + (open.map(r => { const it = byItem[r.item_id];
      return `<div class="req"><div><b>${esc(it.name)}</b> \u2022 ${esc(studio(r.studio_id))}${r.qty ? ' \u2022 ' + esc(r.qty) : ''}${link(it)}</div><div class="acts" style="margin:0;align-items:center">${pill(r.status)}${r.status === 'needed' ? `<button data-sp="ordered" data-s="${r.studio_id}" data-i="${r.item_id}">Mark ordered</button>` : ''}<button class="quiet" data-sp="got" ${r.status === 'ordered' ? 'data-done="1"' : ''} data-s="${r.studio_id}" data-i="${r.item_id}">${r.status === 'ordered' ? 'Received' : 'Remove'}</button></div></div>`; }).join('') || '<p class="lead">Nothing requested right now.</p>');
    if (lows.length) html += '<h3 class="sub" style="margin-top:1.5rem">Below minimum, not requested yet</h3>' + lows.map(({ l, it, st }) => `<div class="req low"><div><b>${esc(it.name)}</b> \u2022 ${esc(l.name)} \u2022 have ${st.have}, minimum ${st.min}${link(it)}</div><div class="acts" style="margin:0"><button data-sp="need" data-s="${l.id}" data-i="${it.id}" data-q="${esc(spQ(it, st))}">Add to needs</button></div></div>`).join('');
  }
  const cats = [...new Set(sp.items.map(x => x.category || 'Other'))];
  const row = it => {
    const r = mine[it.id], st = spState(sp.studio, it), unit = it.unit ? ' ' + esc(it.unit) : '';
    const meta = [st.min !== null ? `Minimum ${st.min}${unit}` : '', st.at ? `counted ${fmt(st.at.slice(0, 10))}` : (st.min !== null ? 'not counted yet' : ''), st.stale ? '<span style="color:var(--accent)">count is over 2 weeks old</span>' : ''].filter(Boolean).join(' \u2022 ');
    const right = r ? pill(r.status) + `<button class="quiet" data-sp="got" ${r.status === 'ordered' ? 'data-done="1"' : ''} data-s="${sp.studio}" data-i="${it.id}">${r.status === 'ordered' ? 'Got it' : 'Cancel'}</button>`
      : st.min !== null ? (st.low ? '<span class="pill warn" style="margin:0">Below minimum</span>' : '') + `<input class="qty" type="number" min="0" step="any" placeholder="On hand" aria-label="On hand for ${esc(it.name)}" value="${st.have ?? ''}"><button class="quiet" data-sp="count" data-i="${it.id}">Save count</button>` + (st.low ? `<button data-sp="need" data-i="${it.id}" data-q="${esc(spQ(it, st))}">Need this</button>` : '')
      : `<input class="qty" placeholder="How many?" maxlength="40" aria-label="How many ${esc(it.name)}"><button data-sp="need" data-i="${it.id}">Need this</button>`;
    return `<div class="req ${st.low && !r ? 'low' : ''}"><div><b>${esc(it.name)}</b>${link(it)}${r && r.qty ? `<div style="font-size:.85rem;margin-top:.15rem">${esc(r.qty)}</div>` : ''}${meta ? `<div class="lead" style="margin:.15rem 0 0;font-size:.85rem">${meta}</div>` : ''}</div><div class="acts" style="margin:0;align-items:center;flex-wrap:wrap">${right}</div></div>`;
  };
  const list = cats.map(c => `<h3 class="sub" style="margin-top:1.25rem">${esc(c)}</h3>` + sp.items.filter(x => (x.category || 'Other') === c).map(row).join('')).join('');
  $('spBody').innerHTML = html + `<h3 class="sub" style="margin-top:1.75rem">${esc(studio(sp.studio))} supply list</h3>` + (list || '<p class="lead">No supplies on the list yet.' + (own ? ' Click Manage supply list to add them.' : ' Ask the owner to add them.') + '</p>');
}

function drawMins() {
  const inp = (f, v, ph, w) => `<input class="qty" type="number" min="0" step="any" data-f="${f}" value="${v ?? ''}" placeholder="${ph ?? ''}" style="width:${w || '5rem'}">`;
  $('spBody').innerHTML = `<p class="lead">Default minimum applies to every studio. Fill in a studio column only where that studio needs a different minimum. Order up to is the level a reorder should bring a studio back to.</p>
    <div class="table-wrap"><table class="mt"><thead><tr><th>Item</th><th>Unit</th><th>Default min</th><th>Order up to</th>${locs.map(l => `<th>${esc(l.name)}</th>`).join('')}</tr></thead><tbody>` +
    sp.items.map(it => `<tr data-it="${it.id}" style="cursor:default"><td><b>${esc(it.name)}</b></td><td><input class="qty" data-f="unit" value="${esc(it.unit)}" maxlength="20" style="width:6rem"></td><td>${inp('min', it.min_qty)}</td><td>${inp('tgt', it.target_qty)}</td>` +
      locs.map(l => { const t = sp.thr.find(x => x.studio_id === l.id && x.item_id === it.id); return `<td>${inp('s:' + l.id, t ? t.min_qty : '', it.min_qty)}</td>`; }).join('') + '</tr>').join('') +
    `</tbody></table></div><div class="err" id="spErr" role="alert" style="margin-top:.5rem"></div><div class="acts"><button id="spSaveMins">Save minimums</button></div>`;
}

async function spSaveMins() {
  const num = v => { v = String(v).trim(); return v === '' || isNaN(+v) || +v < 0 ? null : +v; }, items = [], up = [], del = [];
  document.querySelectorAll('#spBody tr[data-it]').forEach(tr => {
    const it = sp.items.find(x => x.id === tr.dataset.it), g = f => tr.querySelector(`[data-f="${f}"]`).value;
    items.push({ ...it, unit: g('unit').trim() || null, min_qty: num(g('min')), target_qty: num(g('tgt')) });
    locs.forEach(l => { const v = num(g('s:' + l.id)), had = sp.thr.some(x => x.studio_id === l.id && x.item_id === it.id); if (v !== null) up.push({ studio_id: l.id, item_id: it.id, min_qty: v }); else if (had) del.push([l.id, it.id]); });
  });
  const errs = [];
  if (items.length) errs.push((await db.from('supply_items').upsert(items, { onConflict: 'id' })).error);
  if (up.length) errs.push((await db.from('supply_thresholds').upsert(up, { onConflict: 'studio_id,item_id' })).error);
  for (const [sid, iid] of del) errs.push((await db.from('supply_thresholds').delete().eq('studio_id', sid).eq('item_id', iid)).error);
  const e = errs.find(Boolean); if (e) { $('spErr').textContent = 'Could not save. ' + e.message; return; }
  await loadSupplies(); $('spBody').insertAdjacentHTML('afterbegin', '<p class="lead"><b>Saved.</b></p>');
}

function spManage() {
  $('dlgBody').innerHTML = `<h2>Manage supply list</h2><p class="lead" style="margin:.25rem 0 1rem">Every studio uses this same list. Set per-studio minimums on the Minimums tab.</p>
    <label>Add supplies, one per line: Name | Category | Order link | Unit | Minimum | Order up to (everything after the name is optional)<textarea id="spNew" rows="5" placeholder="Massage oil | Treatment room | https://... | bottles | 4 | 10"></textarea></label>
    <div class="err" id="spErr" role="alert"></div><div class="acts"><button data-act="spAdd">Add to list</button></div>
    <h3 class="sub" style="margin-top:1.25rem">Current list</h3>` + (sp.items.map(x => `<div class="req"><div>${esc(x.name)} <span class="lead">${esc(x.category || 'Other')}</span></div><button class="quiet sm" data-act="spRm" data-id="${x.id}">Remove</button></div>`).join('') || '<p class="lead">Nothing yet.</p>') + '<div class="acts"><button class="quiet" data-act="close">Close</button></div>';
  if (!$('dlg').open) $('dlg').showModal();
}

$('spTabs').onclick = e => { const b = e.target.closest('button'); if (b) { sp.tab = b.dataset.t; drawSupplies(); } };
$('spStudio').onchange = e => { sp.studio = e.target.value; drawSupplies(); };
$('spManage').onclick = spManage;
$('spBody').onclick = async e => {
  if (e.target.id === 'spSaveMins') return spSaveMins();
  const b = e.target.closest('[data-sp]'); if (!b) return;
  const a = b.dataset.sp, iid = b.dataset.i, sid = b.dataset.s || sp.studio, now = new Date().toISOString(), ops = [];
  if (a === 'count') {
    const v = parseFloat(b.previousElementSibling.value); if (isNaN(v) || v < 0) { alert('Type how many you have on hand.'); return; }
    ops.push(db.from('supply_counts').upsert({ studio_id: sid, item_id: iid, on_hand: v, counted_at: now, counted_by: ME.id }, { onConflict: 'studio_id,item_id' }));
  } else if (a === 'need') {
    const q = b.dataset.q !== undefined ? b.dataset.q : (b.previousElementSibling.value || '').trim();
    ops.push(db.from('supply_requests').upsert({ studio_id: sid, item_id: iid, status: 'needed', qty: q || null, requested_by: ME.id, updated_at: now }, { onConflict: 'studio_id,item_id' }));
  } else if (a === 'ordered') ops.push(db.from('supply_requests').update({ status: 'ordered', updated_at: now }).eq('studio_id', sid).eq('item_id', iid));
  else { ops.push(db.from('supply_requests').delete().eq('studio_id', sid).eq('item_id', iid)); if (b.dataset.done) ops.push(db.from('supply_counts').delete().eq('studio_id', sid).eq('item_id', iid)); }
  const err = (await Promise.all(ops)).map(x => x.error).find(Boolean); if (err) { alert('That did not work: ' + err.message); return; }
  loadSupplies(); suppliesBadge();
};
$('dlgBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'), a = b && b.dataset.act;
  if (a === 'spAdd') {
    const n = v => { v = String(v || '').trim(); return v === '' || isNaN(+v) ? null : +v; };
    const rows = $('spNew').value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map((p, i) => ({ name: p[0], category: p[1] || null, order_url: okUrl(p[2]) ? p[2] : null, unit: p[3] || null, min_qty: n(p[4]), target_qty: n(p[5]), sort_order: sp.items.length + i }));
    if (!rows.length) { $('spErr').textContent = 'Type at least one supply.'; return; }
    const { error } = await db.from('supply_items').insert(rows);
    if (error) { $('spErr').textContent = 'Could not save. ' + error.message; return; }
    $('dlg').close(); loadSupplies();
  } else if (a === 'spRm') {
    const { error } = await db.from('supply_items').update({ active: false }).eq('id', b.dataset.id);
    if (error) { alert(error.message); return; }
    $('dlg').close(); loadSupplies();
  }
});

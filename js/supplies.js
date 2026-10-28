// ---------- Supplies ----------
let sp = { items: [], reqs: [], counts: [], thr: [], people: [], studio: '', tab: '', draft: {} };
const okUrl = u => /^https?:\/\//i.test(u || '');
const spNum = v => v === null || v === undefined || v === '' ? null : +v;

function spState(sid, it, X) {
  X = X || sp;
  const t = X.thr.find(x => x.studio_id === sid && x.item_id === it.id), c = X.counts.find(x => x.studio_id === sid && x.item_id === it.id);
  const min = t && spNum(t.min_qty) !== null ? spNum(t.min_qty) : spNum(it.min_qty), tgt = spNum(it.target_qty), have = c ? +c.on_hand : null;
  const days = c ? Math.floor((Date.now() - new Date(c.counted_at)) / DAY) : null;
  return { min, tgt, have, days, at: c ? c.counted_at : null, low: min !== null && have !== null && have <= min, stale: days !== null && days > 14, sug: tgt !== null && have !== null && tgt > have ? tgt - have : null };
}

// Status of one item at a studio: ok / low / out / unset (no minimum) / none (never counted)
const spStatus = st => st.have === null ? 'none' : st.have <= 0 ? 'out' : st.min === null ? 'unset' : st.low ? 'low' : 'ok';
const SP_LBL = { ok: 'In stock', low: 'Low', out: 'Out', unset: 'Counted', none: 'Not counted' };
// Text saved on an automatic request; starts with "Have" so it can be cleared if a recount comes back up
const spAutoQty = (it, have, st) => `Have ${have}` + (st.tgt !== null && st.tgt > have ? ` • order ${st.tgt - have}${it.unit ? ' ' + it.unit : ''}` : '');
const spWho = id => { const p = (sp.people || []).find(x => x.id === id); return p ? p.full_name.split(' ')[0] : ''; };

async function suppliesBadge() {
  if (!ME || ME.role !== 'owner') return;
  const { data } = await db.from('supply_requests').select('item_id').eq('status', 'needed');
  const n = (data || []).length;
  $('navSup').textContent = 'Supplies' + (n ? ` (${n})` : '');
}

async function loadSupplies() {
  const own = ME.role === 'owner';
  if (own) { if (!sp.studio) sp.studio = (locs[0] || {}).id; if (!['order', 'count', 'grid', 'mins'].includes(sp.tab)) sp.tab = 'order'; } else { sp.studio = ME.location_id; sp.tab = 'count'; }
  $('spTabs').hidden = !own; $('spManage').hidden = !own;
  if (own) $('spStudio').innerHTML = locs.map(l => `<option value="${l.id}" ${l.id === sp.studio ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  if (!sp.studio) { $('spBody').innerHTML = '<p class="lead">You have not been assigned to a studio yet. Ask the owner.</p>'; return; }
  const [i, r, c, t, pp] = await Promise.all([db.from('supply_items').select('*').eq('active', true).order('category').order('sort_order').order('name'), db.from('supply_requests').select('*'), db.from('supply_counts').select('*'), db.from('supply_thresholds').select('*'), db.from('team_directory').select('id,full_name')]);
  sp.items = i.data || []; sp.reqs = r.data || []; sp.counts = c.data || []; sp.thr = t.data || []; sp.people = pp.data || []; sp.draft = {};
  drawSupplies();
}

function drawSupplies() {
  const own = ME.role === 'owner';
  document.querySelectorAll('#spTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === sp.tab));
  $('spStudio').hidden = !own || sp.tab !== 'count';
  $('spLead').textContent = { order: 'What each studio needs, grouped so you can order once. Mark items ordered, and studios tap Arrived when they come in.', count: 'Tap − / + to set how many you have, then Save count. Anything at or below its minimum is requested automatically.', grid: 'Every item at every studio. Colors show stock against each minimum.', mins: '' }[sp.tab] || '';
  if (sp.tab === 'mins') return drawMins();
  if (sp.tab === 'grid') return spDrawGrid();
  if (sp.tab === 'order') return spDrawOrder();
  spDrawCount();
}

const reqStep = r => `<span class="spsteps"><span class="on">Requested</span><span class="${r.status === 'ordered' ? 'on' : ''}">Ordered</span><span>Arrived</span></span>`;
const orderLink = it => okUrl(it.order_url) ? `<a class="splink" href="${esc(it.order_url)}" target="_blank" rel="noopener">Order link ↗</a>` : '';
const arriveForm = (sid, iid) => `<span class="sparrive"><input type="number" min="0" step="any" class="qty" placeholder="New count" aria-label="How many now"><button class="sm" data-sp="arrived" data-s="${sid}" data-i="${iid}">Save</button></span>`;

// ----- Count: the studio's list with steppers and one Save button -----
function spDrawCount() {
  const sid = sp.studio, byItem = Object.fromEntries(sp.items.map(x => [x.id, x])), reqs = sp.reqs.filter(r => r.studio_id === sid && byItem[r.item_id]);
  const cats = [...new Set(sp.items.map(x => x.category || 'Other'))];
  const row = it => {
    const st = spState(sid, it), d = sp.draft[it.id], have = d !== undefined ? d : st.have, live = spState(sid, it, { thr: sp.thr, counts: have === null ? [] : [{ studio_id: sid, item_id: it.id, on_hand: have, counted_at: st.at || new Date().toISOString() }] });
    const status = spStatus(live), r = reqs.find(x => x.item_id === it.id), unit = it.unit && isNaN(+it.unit) ? ' ' + esc(it.unit) : '';
    const meta = [st.min !== null ? `min ${st.min}${unit}` : 'no minimum set', st.at ? `counted ${fmt(st.at.slice(0, 10))}${spWho(sp.counts.find(c => c.studio_id === sid && c.item_id === it.id).counted_by) ? ' by ' + esc(spWho(sp.counts.find(c => c.studio_id === sid && c.item_id === it.id).counted_by)) : ''}` : 'never counted'];
    return `<div class="sprow ${status}${d !== undefined ? ' dirty' : ''}" data-it="${it.id}">
      <div class="spname"><b>${esc(it.name)}</b><small>${meta.join(' • ')}${st.stale ? ' • <span class="spstale">count is ' + st.days + ' days old</span>' : ''}</small></div>
      <div class="spstat"><span class="sppill ${status}">${SP_LBL[status]}</span>${r ? `<span class="sppill req">${r.status === 'ordered' ? 'Ordered' : 'Requested'}</span>` : ''}</div>
      <div class="spstep"><button class="quiet" data-step="-1" aria-label="One less">−</button><input type="number" min="0" step="any" inputmode="decimal" value="${have ?? ''}" placeholder="?" aria-label="On hand for ${esc(it.name)}" data-cnt="${it.id}"><button class="quiet" data-step="1" aria-label="One more">+</button></div>
      <div class="spact">${r ? '' : `<button class="quiet sm" data-sp="need" data-i="${it.id}" title="Ask for more even though it isn’t low">Request</button>`}</div></div>`;
  };
  const n = Object.keys(sp.draft).length;
  $('spBody').innerHTML =
    (reqs.length ? `<h3 class="sub">Requests for ${esc(studio(sid))}</h3><div class="splist">` + reqs.map(r => { const it = byItem[r.item_id];
      return `<div class="spreq"><div><b>${esc(it.name)}</b>${r.qty ? ` <span class="muted">• ${esc(r.qty)}</span>` : ''}</div>${reqStep(r)}<div class="spreqact">${r.status === 'ordered' ? arriveForm(sid, it.id) : `<button class="quiet sm" data-sp="cancel" data-s="${sid}" data-i="${it.id}">Cancel</button>`}</div></div>`; }).join('') + '</div>' : '') +
    `<h3 class="sub" style="margin-top:${reqs.length ? '1.6rem' : '0'}">${esc(studio(sid))} inventory</h3>` +
    (cats.map(c => `<h4 class="spcat">${esc(c)}</h4><div class="splist">` + sp.items.filter(x => (x.category || 'Other') === c).map(row).join('') + '</div>').join('') || '<p class="lead">No supplies on the list yet.' + (ME.role === 'owner' ? ' Click Manage supply list to add them.' : ' Ask the owner to add them.') + '</p>') +
    `<div class="spsave${n ? ' show' : ''}"><span>${n} change${n === 1 ? '' : 's'} not saved</span><button class="quiet sm" data-sp="discard">Undo</button><button data-sp="save">Save count</button></div>`;
}

// ----- Owner: order list grouped by item -----
function spDrawOrder() {
  const byItem = Object.fromEntries(sp.items.map(x => [x.id, x]));
  const group = st => { const g = {}; sp.reqs.filter(r => r.status === st && byItem[r.item_id]).forEach(r => (g[r.item_id] = g[r.item_id] || []).push(r)); return Object.entries(g); };
  const need = group('needed'), coming = group('ordered');
  const lows = []; locs.forEach(l => sp.items.forEach(it => { const st = spState(l.id, it); if (st.low && !sp.reqs.some(r => r.studio_id === l.id && r.item_id === it.id)) lows.push({ l, it, st }); }));
  const line = r => `<li><b>${esc(studio(r.studio_id))}</b> <span class="muted">${esc(r.qty || 'requested')}</span></li>`;
  $('spBody').innerHTML =
    `<h3 class="sub">To order <span class="hcount">${need.length}</span></h3>` +
    (need.length ? '<div class="spgrid2">' + need.map(([iid, rs]) => { const it = byItem[iid];
      return `<div class="spcard"><div class="spcard-h"><b>${esc(it.name)}</b>${orderLink(it)}</div><ul class="hlist">${rs.map(line).join('')}</ul><button class="sm" data-sp="orderall" data-i="${iid}">Mark ordered${rs.length > 1 ? ' for all ' + rs.length : ''}</button></div>`; }).join('') + '</div>'
      : '<p class="hclear">✓ Nothing to order right now.</p>') +
    (lows.length ? `<h3 class="sub" style="margin-top:1.6rem">Low, but not requested</h3><div class="splist">` + lows.map(({ l, it, st }) => `<div class="spreq"><div><b>${esc(it.name)}</b> <span class="muted">• ${esc(l.name)} • have ${st.have}, min ${st.min}</span></div><div class="spreqact"><button class="quiet sm" data-sp="need" data-s="${l.id}" data-i="${it.id}" data-q="${esc(spAutoQty(it, st.have, st))}">Add to order list</button></div></div>`).join('') + '</div>' : '') +
    `<h3 class="sub" style="margin-top:1.6rem">On the way <span class="hcount">${coming.length}</span></h3>` +
    (coming.length ? '<div class="splist">' + coming.flatMap(([iid, rs]) => rs.map(r => `<div class="spreq"><div><b>${esc(byItem[iid].name)}</b> <span class="muted">• ${esc(studio(r.studio_id))}${r.qty ? ' • ' + esc(r.qty) : ''}</span></div>${reqStep(r)}<div class="spreqact">${arriveForm(r.studio_id, iid)}<button class="quiet sm" data-sp="unorder" data-s="${r.studio_id}" data-i="${iid}" title="Move back to To order">Undo</button></div></div>`)).join('') + '</div>' : '<p class="lead">Nothing on the way.</p>');
}

// ----- Owner: inventory grid, every item at every studio -----
function spDrawGrid() {
  const cell = (l, it) => { const st = spState(l.id, it), s = spStatus(st), r = sp.reqs.find(x => x.studio_id === l.id && x.item_id === it.id);
    return `<td><span class="spcell ${s}${st.stale ? ' stale' : ''}" title="${esc(SP_LBL[s])}${st.at ? ', counted ' + fmt(st.at.slice(0, 10)) : ''}${st.min !== null ? ', min ' + st.min : ''}">${st.have ?? '–'}</span>${r ? `<span class="spreqdot" title="${r.status === 'ordered' ? 'Ordered' : 'Requested'}">${r.status === 'ordered' ? '→' : '!'}</span>` : ''}</td>`; };
  $('spBody').innerHTML = `<div class="table-wrap"><table class="mt spgrid"><thead><tr><th>Item</th><th>Min</th>${locs.map(l => `<th>${esc(l.name)}</th>`).join('')}</tr></thead><tbody>` +
    sp.items.map(it => `<tr style="cursor:default"><td><b>${esc(it.name)}</b><small class="nm-sub">${esc(it.category || 'Other')}</small></td><td class="muted">${it.min_qty ?? '–'}</td>${locs.map(l => cell(l, it)).join('')}</tr>`).join('') + '</tbody></table></div>' +
    '<p class="legend nb-legend"><span><i class="spcell ok"></i>In stock</span><span><i class="spcell low"></i>Low</span><span><i class="spcell out"></i>Out</span><span><i class="spcell stale"></i>Count over 2 weeks old</span><span>! requested • → ordered</span></p>';
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
$('spStudio').onchange = e => { sp.studio = e.target.value; sp.draft = {}; drawSupplies(); };
$('spManage').onclick = spManage;
// Count edits are kept as a draft until Save count
$('spBody').addEventListener('input', e => {
  const id = e.target.dataset.cnt; if (!id) return;
  const v = e.target.value === '' ? undefined : Math.max(0, +e.target.value);
  const st = spState(sp.studio, sp.items.find(x => x.id === id));
  if (v === undefined || v === st.have) delete sp.draft[id]; else sp.draft[id] = v;
  const pos = e.target.selectionStart; spDrawCount();
  const el = document.querySelector(`[data-cnt="${id}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) {} }
});
$('spBody').onclick = async e => {
  if (e.target.id === 'spSaveMins') return spSaveMins();
  const stp = e.target.closest('[data-step]');
  if (stp) {
    const id = stp.closest('[data-it]').dataset.it, st = spState(sp.studio, sp.items.find(x => x.id === id));
    const cur = sp.draft[id] !== undefined ? sp.draft[id] : (st.have ?? 0), v = Math.max(0, cur + +stp.dataset.step);
    if (v === st.have) delete sp.draft[id]; else sp.draft[id] = v;
    spDrawCount(); return;
  }
  const b = e.target.closest('[data-sp]'); if (!b) return;
  const a = b.dataset.sp, iid = b.dataset.i, sid = b.dataset.s || sp.studio, now = new Date().toISOString(), ops = [];
  if (a === 'discard') { sp.draft = {}; spDrawCount(); return; }
  if (a === 'save') {
    const ids = Object.keys(sp.draft); if (!ids.length) return;
    let req = 0, clr = 0;
    ids.forEach(id => {
      const it = sp.items.find(x => x.id === id), v = sp.draft[id], st0 = spState(sid, it), r = sp.reqs.find(x => x.studio_id === sid && x.item_id === id);
      ops.push(db.from('supply_counts').upsert({ studio_id: sid, item_id: id, on_hand: v, counted_at: now, counted_by: ME.id }, { onConflict: 'studio_id,item_id' }));
      const low = st0.min !== null ? v <= st0.min : v <= 0;
      if (low && !r) { req++; ops.push(db.from('supply_requests').upsert({ studio_id: sid, item_id: id, status: 'needed', qty: spAutoQty(it, v, st0), requested_by: ME.id, updated_at: now }, { onConflict: 'studio_id,item_id' })); }
      else if (!low && r && r.status === 'needed' && /^have\b/i.test(r.qty || '')) { clr++; ops.push(db.from('supply_requests').delete().eq('studio_id', sid).eq('item_id', id)); }
      else if (low && r && r.status === 'needed' && /^have\b/i.test(r.qty || '')) ops.push(db.from('supply_requests').update({ qty: spAutoQty(it, v, st0), updated_at: now }).eq('studio_id', sid).eq('item_id', id));
    });
    b.disabled = true; b.textContent = 'Saving...';
    const err = (await Promise.all(ops)).map(x => x.error).find(Boolean); if (err) { b.disabled = false; b.textContent = 'Save count'; alert('That did not work: ' + err.message); return; }
    toast(`Saved ${ids.length} count${ids.length === 1 ? '' : 's'}` + (req ? ` • ${req} requested` : '') + (clr ? ` • ${clr} request${clr === 1 ? '' : 's'} cleared` : ''));
    await loadSupplies(); suppliesBadge(); return;
  }
  if (a === 'need') {
    const it = sp.items.find(x => x.id === iid), q = b.dataset.q !== undefined ? b.dataset.q : 'Requested by ' + (spWho(ME.id) || 'staff');
    ops.push(db.from('supply_requests').upsert({ studio_id: sid, item_id: iid, status: 'needed', qty: q || null, requested_by: ME.id, updated_at: now }, { onConflict: 'studio_id,item_id' }));
  } else if (a === 'orderall') ops.push(db.from('supply_requests').update({ status: 'ordered', updated_at: now }).eq('item_id', iid).eq('status', 'needed'));
  else if (a === 'unorder') ops.push(db.from('supply_requests').update({ status: 'needed', updated_at: now }).eq('studio_id', sid).eq('item_id', iid));
  else if (a === 'cancel') ops.push(db.from('supply_requests').delete().eq('studio_id', sid).eq('item_id', iid));
  else if (a === 'arrived') {
    const v = parseFloat(b.previousElementSibling.value); if (isNaN(v) || v < 0) { b.previousElementSibling.focus(); b.previousElementSibling.placeholder = 'How many?'; return; }
    ops.push(db.from('supply_counts').upsert({ studio_id: sid, item_id: iid, on_hand: v, counted_at: now, counted_by: ME.id }, { onConflict: 'studio_id,item_id' }));
    ops.push(db.from('supply_requests').delete().eq('studio_id', sid).eq('item_id', iid));
  }
  const err = (await Promise.all(ops)).map(x => x.error).find(Boolean); if (err) { alert('That did not work: ' + err.message); return; }
  toast({ need: 'Requested', orderall: 'Marked ordered', unorder: 'Moved back to To order', cancel: 'Request cancelled', arrived: 'Arrived and counted' }[a] || 'Saved');
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

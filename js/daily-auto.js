// ---------- Daily numbers filled in from ClubReady ----------
// When ClubReady reports are imported on the Members page (by hand or by the morning bot), count
// each day's leads, contacts, demos, sales, cancels and stretches and save them to the Daily log,
// so the Daily, Weekly, Month-to-date and Last-30-days reviews fill themselves in.
// Only the numbers ClubReady can answer are written. Revenue, refunds, payroll, reactivations and
// available slots stay as managers typed them. A column is only touched when its report came with the upload.
const AUTO_DAYS = 45;   // how far back each import refreshes (covers this week, this month and the last 30 days)
const AUTO_DL = new Set(['revenue', 'refunds', 'leads', 'contacts', 'demos_booked', 'demos_held', 'agreements', 'renewals', 'new_eft', 'cancellations', 'freezes', 'active_members', 'stretches_completed', 'staff_util']);

function buildDailyAuto() {
  const { leads, contacts, bookings, agreements, cancels, invoices } = imp.data;
  const last = dAdd(todayStr(), -1), first = dAdd(last, -(AUTO_DAYS - 1)), inRange = d => d && d >= first && d <= last;
  const days = {}; for (let d = first; d <= last; d = dAdd(d, 1)) days[d] = {};
  const cols = new Set(), add = (d, k, n = 1) => { if (inRange(d)) days[d][k] = (days[d][k] || 0) + n; };
  const want = (...ks) => ks.forEach(k => cols.add(k));

  // Leads: one per person, on the day they were added
  if (leads) { want('leads'); const seen = new Set(); leads.forEach(r => { const id = +r['User ID']; if (!id || seen.has(id)) return; seen.add(id); add(toDay(r['Date Added']), 'leads'); }); }

  // Contacts: every call, text, email or visit logged in ClubReady
  if (contacts) { want('contacts'); contacts.forEach(r => add(toDay(r['Contact Date']), 'contacts')); }

  if (bookings) {
    // The log can list the same session more than once (booked, moved, completed), so keep one row per person and start time
    const seen = new Map();
    bookings.forEach(r => { const id = +r['User ID'], t = toDT(r['Booking Date']); if (!id || !t) return; seen.set(id + '|' + t.getTime(), { id, t, day: ymd(t), st: String(r['Current Status'] || '') }); });
    const B = [...seen.values()], done = b => /^completed/i.test(b.st), dropped = b => /cancel/i.test(b.st) && !/late/i.test(b.st);
    // Stretches completed: every finished session that day
    want('stretches_completed'); B.forEach(b => { if (done(b)) add(b.day, 'stretches_completed'); });
    // Demos: a lead's sessions up to and including their first completed one (later visits are not demos)
    if (leads) {
      want('demos_booked', 'demos_held');
      const isLead = new Set(leads.map(r => +r['User ID']).filter(Boolean)), by = {};
      B.forEach(b => { if (isLead.has(b.id)) (by[b.id] = by[b.id] || []).push(b); });
      Object.values(by).forEach(L => { L.sort((a, b) => a.t - b.t);
        for (const b of L) { if (dropped(b)) continue; add(b.day, 'demos_booked'); if (done(b)) { add(b.day, 'demos_held'); break; } } });
    }
  }

  // Agreements (add-ons don't count as a sale). Someone with previous agreements is a renewal; nobody before is a new sale.
  if (agreements) {
    want('agreements', 'new_eft');
    const pk = agreements.length ? Object.keys(agreements[0]).find(k => /prev/i.test(k) && /agree/i.test(k)) : null;
    if (pk) want('renewals');
    agreements.forEach(r => { if (!+r['User ID']) return; const item = String(r['Description'] || '').split('\n')[0]; if (/add-on/i.test(item)) return;
      const t = toDT(r['Date']); if (!t) return;
      add(ymd(t), pk && (parseFloat(r[pk]) || 0) > 0 ? 'renewals' : 'agreements'); add(ymd(t), 'new_eft', +r['New EFT'] || 0); });
  }

  // Cancellations: people whose membership is now cancelled, on the day they cancelled (plan changes don't count).
  // Freezes: the first freeze event in a stretch of freezing, so a monthly pushed-out invoice isn't counted again.
  if (cancels) {
    want('cancellations', 'freezes');
    buildCx().rows.forEach(r => { if (r.kind === 'cancelled') add(r.event_on, 'cancellations'); });
    let cur = 0; const fz = {};
    cancels.forEach(x => { if (x['User Id']) cur = +x['User Id']; const t = toDT(x['Change Date']), type = String(x['Change Type'] || '');
      if (cur && t && /membership/i.test(String(x['Description'] || '')) && /freeze|frozen|pushed out/i.test(type) && !/un-?frozen/i.test(type)) (fz[cur] = fz[cur] || []).push(ymd(t)); });
    Object.values(fz).forEach(L => { L.sort(); let prev = null; L.forEach(d => { if (!prev || (new Date(d + 'T00:00') - new Date(prev + 'T00:00')) / DAY > 25) add(d, 'freezes'); prev = d; }); });
  }

  // Active members: people with a monthly invoice due in the next 30 days, as of the latest day
  if (invoices) {
    want('active_members');
    const to = dAdd(todayStr(), 30), ids = new Set();
    invoices.forEach(r => { const id = +r['User ID'], d = toDay(r['Due Date']); if (id && d && d <= to && r['Invoice Type'] !== 'Monthly Freeze Fee') ids.add(id); });
    if (ids.size) days[last].active_members = ids.size;
  }

  if (!cols.size) return [];
  const now = new Date().toISOString();
  return Object.entries(days).map(([day, v]) => {
    const row = { studio_id: mem.studio, day, updated_by: ME.id, updated_at: now };
    cols.forEach(k => { row[k] = k === 'active_members' ? (v[k] ?? null) : k === 'new_eft' ? Math.round((v[k] || 0) * 100) / 100 : (v[k] || 0); });
    return row;
  }).map(r => { if ('active_members' in r && r.active_members === null) delete r.active_members; return r; });
}

// Save in batches. Rows without an active-members count go separately so the count already saved for that day is kept.
async function saveDailyAuto() {
  const rows = buildDailyAuto(); if (!rows.length) return null;
  const groups = [rows.filter(r => 'active_members' in r), rows.filter(r => !('active_members' in r))].filter(g => g.length);
  for (const g of groups) for (let i = 0; i < g.length; i += 200) {
    let { error } = await db.from('daily_log').upsert(g.slice(i, i + 200), { onConflict: 'studio_id,day' });
    // Before sql/daily_auto.sql has been run there is no renewals column: save everything else and count renewals as sales
    if (error && /renewals/.test(error.message)) ({ error } = await db.from('daily_log').upsert(g.slice(i, i + 200).map(({ renewals, ...r }) => ({ ...r, agreements: r.agreements + (renewals || 0) })), { onConflict: 'studio_id,day' }));
    if (error) return error;
  }
  DL.from = ''; DL.to = '';   // the Daily page reloads fresh next time it opens
  return null;
}

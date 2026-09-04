// Workout Hub — cloud layer (Supabase). Loaded after the main script; the app
// works fully offline without it. When config.js provides SB_URL/SB_KEY and the
// user signs in, localStorage becomes a cache that syncs both ways.
//
// Sync model (deliberately simple):
//   push: every local write (save()) schedules a debounced upsert of the
//         user's sessions, workouts, favourites and custom exercises.
//   pull: on sign-in and on app open, fetch the user's rows + all public
//         workouts/exercises; newer updated_at wins per row.
(() => {
  const cfg = window.SB_CONFIG || {};
  const cloud = { client: null, user: null, ready: false, remote: { workouts: [], exercises: {} }, lastSync: null, error: null };
  window.cloud = cloud;
  if (!cfg.url || !cfg.key || !window.supabase) { cloud.reason = !cfg.url ? 'not configured' : 'library missing'; return; }

  const sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  cloud.client = sb;

  const iso = d => new Date(d).toISOString();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  cloud.signIn = async email => {
    const redirectTo = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
  };
  cloud.verifyCode = async (email, token) => {
    const { error } = await sb.auth.verifyOtp({ email, token: token.replace(/\s+/g, ''), type: 'email' });
    if (error) throw error;
  };
  cloud.signInGoogle = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + '#/me' } });
    if (error) throw error;
  };
  cloud.providers = {};
  fetch(cfg.url + '/auth/v1/settings', { headers: { apikey: cfg.key } }).then(r => r.json()).then(d => { cloud.providers = d.external || {}; if (location.hash.includes('/me')) route(); }).catch(() => {});
  cloud.signOut = async () => { await sb.auth.signOut(); cloud.user = null; route(); };

  // ── push ──
  async function pushAll() {
    if (!cloud.user) return;
    const uid = cloud.user.id;
    const errs = [];
    const sessions = store.sessions.map(s => ({ id: s.id, owner: uid, workout_id: s.workoutId || null, type: s.type || 'workout', title: s.title, started_at: iso(s.startedAt), ended_at: s.endedAt ? iso(s.endedAt) : null, duration_min: s.duration_min || 0, completed: !!s.completed, data: s }));
    if (sessions.length) { const { error } = await sb.from('sessions').upsert(sessions, { onConflict: 'id' }); if (error) errs.push(error); }
    const workouts = store.workouts.map(w => ({ id: w.id, owner: uid, creator: w.creator, title: w.title, public: w.public !== false, data: w }));
    if (workouts.length) { const { error } = await sb.from('workouts').upsert(workouts, { onConflict: 'id' }); if (error) errs.push(error); }
    const exercises = Object.entries(store.exercises).map(([key, e]) => ({ key, owner: uid, public: true, data: e }));
    if (exercises.length) { const { error } = await sb.from('exercises').upsert(exercises, { onConflict: 'key' }); if (error) errs.push(error); }
    { const { error } = await sb.from('user_state').upsert({ owner: uid, favorites: store.favorites, prefs: { name: store.name, saved: store.saved, units: store.units, avatar: store.avatar } }, { onConflict: 'owner' }); if (error) errs.push(error); }
    { const { error } = await sb.from('profiles').update({ name: store.name, units: store.units }).eq('id', uid); if (error) errs.push(error); }
    if (errs.length) { cloud.error = errs[0].message; console.warn('push', errs); } else cloud.error = null;
  }
  cloud.push = debounce(pushAll, 1500);

  // ── pull ──
  async function pullAll() {
    const uid = cloud.user?.id;
    // public content for everyone (anon too)
    const { data: pubW } = await sb.from('workouts').select('id,data,updated_at').eq('public', true);
    const { data: pubE } = await sb.from('exercises').select('key,data').eq('public', true);
    cloud.remote.workouts = (pubW || []).map(r => r.data).filter(w => !WORKOUTS.some(x => x.id === w.id) && !store.workouts.some(x => x.id === w.id));
    cloud.remote.exercises = Object.fromEntries((pubE || []).filter(r => !EXERCISES[r.key]).map(r => [r.key, r.data]));
    if (!uid) return;
    const { data: rows } = await sb.from('sessions').select('id,data,updated_at').eq('owner', uid);
    (rows || []).forEach(r => { if (!store.sessions.some(s => s.id === r.id)) store.sessions.push(r.data); });
    const { data: mine } = await sb.from('workouts').select('id,data').eq('owner', uid);
    (mine || []).forEach(r => { const i = store.workouts.findIndex(w => w.id === r.id); if (i < 0) store.workouts.push(r.data); });
    const { data: st } = await sb.from('user_state').select('favorites,prefs').eq('owner', uid).maybeSingle();
    if (st) { (st.favorites || []).forEach(f => { if (!store.favorites.some(x => x.name === f.name)) store.favorites.push(f); }); if (st.prefs?.name) store.name = st.prefs.name; if (st.prefs?.avatar) store.avatar = st.prefs.avatar; (st.prefs?.saved || []).forEach(id => { if (!store.saved.includes(id)) store.saved.push(id); }); }
    const { data: prof } = await sb.from('profiles').select('name,units').eq('id', uid).maybeSingle();
    if (prof?.units) store.units = prof.units;
    localStorage.setItem(LS_KEY, JSON.stringify(store));
    cloud.lastSync = new Date().toISOString();
  }
  const fingerprint = () => `${store.sessions.length}|${store.workouts.length}|${Object.keys(store.exercises).length}|${store.favorites.length}|${store.saved.length}|${store.name}|${cloud.remote.workouts.length}|${cloud.user?.id || ''}`;
  cloud.sync = async (announce) => { const before = fingerprint(); const wasErr = cloud.error; try { await pullAll(); await pushAll(); } catch (e) { cloud.error = e.message; } const changed = fingerprint() !== before || wasErr !== cloud.error; if (changed && typeof route === 'function' && !location.hash.startsWith('#/do/')) route(); if (announce && typeof toast === 'function' && !cloud.error) toast(`Signed in — ${store.sessions.length} session${store.sessions.length === 1 ? '' : 's'} saved to your account`); };

  // device metrics overlapping a session (±30 min)
  cloud.deviceFor = async s => {
    if (!cloud.user) return [];
    const { data } = await sb.rpc('session_device', { p_started: iso(s.startedAt), p_ended: s.endedAt ? iso(s.endedAt) : null });
    return data || [];
  };

  // ── boot ──
  sb.auth.onAuthStateChange((event, session) => {
    cloud.user = session?.user || null;
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + (location.hash || '#/me'));
      const first = !cloud.ready && event === 'SIGNED_IN';
      cloud.ready = true;
      cloud.sync(first);
    }
    if (event === 'SIGNED_OUT') { cloud.ready = true; route(); }
  });
})();

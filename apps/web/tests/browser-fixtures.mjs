const origin = "http://[::1]:3001";

// Fictional account responses stay inside the browser; no remote profile is read or written.
export async function mockAccount(page, id = "10000000-0000-4000-8000-000000000099") {
  // Keep a legacy six-key row to exercise upgrades without silently overwriting saved preferences.
  const row = { player_id: id, locale: "ko", skin_id: "classic", icon_id: "fox", ability_id: null, custom_shortcuts: true,
    keybindings: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", xblock: "Digit1", hardblock: "Digit2" } };
  const user = { id, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: expires, role: "authenticated" })).toString("base64url")}.fixture`;
  const session = { access_token: token, refresh_token: "fixture-only", expires_at: expires, expires_in: 3600, token_type: "bearer", user };
  const cookie = `sb-rbfujqjvkfdgaofztrdq-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}; Path=/; SameSite=Lax`;
  await page.addInitScript(cookie => { document.cookie = cookie; }, cookie);
  // The SSR header remains a guest; only the browser client uses the fictional account.
  await page.route(`${origin}/**`, route => {
    const headers = { ...route.request().headers() };
    headers.cookie = (headers.cookie ?? "").split("; ").filter(part => !part.startsWith("sb-")).join("; ");
    return route.continue({ headers });
  });
  const fixture = { row, failSave: false };
  await page.route("https://*.supabase.co/**", async route => {
    const request = route.request(), url = new URL(request.url());
    let value;
    if (url.pathname.startsWith("/auth/")) value = user;
    else if (url.pathname.endsWith("/player_preferences")) {
      if (request.method() === "PATCH") {
        if (fixture.failSave) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Fixture save failure" }) });
        Object.assign(row, request.postDataJSON());
      }
      value = row;
    } else if (url.pathname.endsWith("/players")) value = { id, name: "타일탐험가", image_path: null };
    else if (url.pathname.endsWith("/player_wallets")) value = { player_id: id, balance: 0, created_at: user.created_at };
    else value = null;
    const body = url.pathname.startsWith("/auth/") || request.headers().accept?.includes("vnd.pgrst.object") ? value : value ? [value] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return fixture;
}


export async function trackAudio(context) {
  await context.addInitScript(() => {
    window.audioProbe = { contexts: [], notes: [] };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor() { super(); window.audioProbe.contexts.push(this); }
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        let frequency;
        oscillator.frequency.setValueAtTime = (value, at) => { frequency ??= value; return setFrequency(value, at); };
        oscillator.start = at => { window.audioProbe.notes.push(frequency); start(at); };
        return oscillator;
      }
      createGain() {
        const gain = super.createGain();
        if (!this.master) { this.master = gain; this.analyser = this.createAnalyser(); gain.connect(this.analyser); }
        return gain;
      }
    };
  });
}

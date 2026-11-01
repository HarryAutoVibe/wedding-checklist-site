// Only the public project key belongs in config.js. Access is enforced by RLS.
const backend = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)
  : null;
let sessionGeneration = 0;
let currentUserId = null;
let pendingWrites = 0;
let photoUrl = null;
let refreshInFlight = false;
let mutationVersion = 0;

function syncStatus(message) {
  const pill = document.getElementById("syncPill");
  pill.textContent = message;
}

function lockChecklist() {
  sessionGeneration += 1;
  currentUserId = null;
  activeProfile = "";
  state = { tasks: [] };
  appShell.hidden = true;
  accessGate.hidden = false;
  document.getElementById("categoryGrid").replaceChildren();
  taskDialog.close();
  document.getElementById("taskForm").reset();
  document.querySelector(".petals").replaceChildren();
  document.documentElement.style.removeProperty("--couple-photo");
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
}

async function refreshChecklist() {
  if (!currentUserId || pendingWrites || refreshInFlight) return;
  refreshInFlight = true;
  const generation = sessionGeneration;
  const version = mutationVersion;
  try {
    const { data, error } = await backend.from("wedding_tasks").select("*").order("position").order("id");
    if (error) throw error;
    if (generation !== sessionGeneration || pendingWrites || version !== mutationVersion) return;
    state.tasks = data;
    render();
    syncStatus("✓ Shared checklist up to date");
  } catch {
    if (generation === sessionGeneration) syncStatus("Connection interrupted · retrying");
  } finally { refreshInFlight = false; }
}

async function writeTask(operation) {
  if (!currentUserId) return false;
  const generation = sessionGeneration;
  pendingWrites += 1;
  mutationVersion += 1;
  syncStatus("Saving…");
  try {
    const { data, error } = await operation();
    if (error || !data) throw error || new Error("Update not saved");
    if (generation !== sessionGeneration) return false;
    syncStatus("✓ Saved for both of you");
    return true;
  } catch {
    if (generation === sessionGeneration) {
      syncStatus("Update not saved · please retry");
      showToast("Could not save. Check your connection and try again.");
    }
    return false;
  } finally { pendingWrites -= 1; }
}

async function unlockSession(session) {
  if (!session) { lockChecklist(); return; }
  if (currentUserId === session.user.id) return;
  lockChecklist();
  const generation = sessionGeneration;
  document.getElementById("loginStatus").textContent = "Opening your private checklist…";
  try {
    const { data: member, error } = await backend.from("wedding_members").select("profile").eq("email", session.user.email.toLowerCase()).single();
    if (error || !member) throw new Error("This account is not invited.");
    const tasks = await backend.from("wedding_tasks").select("*").order("position").order("id");
    if (tasks.error) throw tasks.error;
    if (generation !== sessionGeneration) return;
    currentUserId = session.user.id;
    state.tasks = tasks.data;
    enterApp(member.profile);
    syncStatus("✓ Shared checklist up to date");
    const result = await backend.storage.from("wedding-private").download("couple.jpg");
    if (generation !== sessionGeneration) return;
    if (result.data) {
      photoUrl = URL.createObjectURL(result.data);
      document.documentElement.style.setProperty("--couple-photo", `url("${photoUrl}")`);
    }
  } catch {
    if (generation !== sessionGeneration) return;
    lockChecklist();
    document.getElementById("loginStatus").textContent = "Unable to open the checklist. Check your invitation and connection, then try signing in again.";
  }
}

document.getElementById("accessForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = document.getElementById("signInButton");
  const status = document.getElementById("loginStatus");
  if (!backend) { status.textContent = "Private sign-in is being configured. Please check back shortly."; return; }
  button.disabled = true;
  try {
    const { error } = await backend.auth.signInWithOtp({
      email: document.getElementById("loginEmail").value.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: new URL("./", location.href).href }
    });
    if (error) throw error;
    status.textContent = "If this email is invited, a sign-in link is on its way. Check your inbox and spam folder.";
  } catch { status.textContent = "Could not send a sign-in link. Check your email address and try again shortly."; }
  finally { button.disabled = false; }
});

document.getElementById("profileButton").addEventListener("click", async () => {
  lockChecklist();
  if (backend) await backend.auth.signOut({ scope: "local" });
  document.getElementById("loginStatus").textContent = "You’re signed out.";
});

if (backend) {
  backend.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => unlockSession(session), 0);
  });
  backend.auth.getSession().then(({ data, error }) => {
    if (!error) unlockSession(data.session);
  });
  setInterval(() => { if (!document.hidden) refreshChecklist(); }, 4000);
  window.addEventListener("online", refreshChecklist);
} else {
  document.getElementById("loginStatus").textContent = "Private sign-in is being configured. Please check back shortly.";
}

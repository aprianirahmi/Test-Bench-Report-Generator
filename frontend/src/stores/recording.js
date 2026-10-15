import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { deleteRecordingDraft, fetchOpcData, getRecordingDraft, saveRecordingDraft } from "../services/api";
import { toNumberOrNull } from "../utils/sensors";

// The recording lives here, not in the Records page, so it keeps running when
// the operator opens another page. Polling, the timer and the finished session
// all survive leaving the page; coming back shows the same state.

export const MAX_SESSION_SECONDS = 4 * 3600; // safety cap for recordings without a timer
export const LIVE_STEPS = 40; // samples kept for the live charts (1 per second)
const POLL_MS = 1000;
// Polls in a row without any sensor value (PLC unreachable, or every node
// unreadable) before the recording is flagged as having lost its signal.
export const LOSS_POLLS = 3;
// Autosave of the running recording: every 15 s, every 60 s after the first hour.
const DRAFT_EVERY_S = 15;
const DRAFT_EVERY_LONG_S = 60;
// Keys that are not sensor readings: they do not count as "data received".
const NON_SENSOR = new Set(["time", "ts", "command_7", "command_8"]);

function hasSensorValue(sample) {
  return Object.keys(sample).some((k) => !NON_SENSOR.has(k) && sample[k] !== null && sample[k] !== undefined);
}

export const useRecordingStore = defineStore("recording", () => {
  // --- Live data ---
  const plcStatus = ref("unknown"); // unknown | connected | disconnected
  const latest = ref({});
  const liveBuffer = ref([]);
  // Polls in a row that answered but carried no sensor value at all
  // (every node unreadable, e.g. a wrong Node ID format in Settings).
  const emptyStreak = ref(0);

  // Published by the Records page while it is open; used for every sample
  // and copied into the session when the recording ends.
  const catalog = ref([]);
  const charts = ref([]);
  const manualCmd7 = ref(null);
  const manualCmd8 = ref(null);

  // --- Recording ---
  const isRecording = ref(false);
  const samples = ref([]);
  const startedAt = ref(null);
  const selectedDuration = ref(0); // 0 = no timer, runs until Stop
  const activeDuration = ref(0);
  const elapsedSeconds = ref(0);
  const recordJob = ref(null);
  const recordMode = ref("repair_job");
  const samplesWithData = ref(0);

  // --- Signal loss while recording ---
  // gaps: closed periods without sensor values { from, to, seconds, kind }
  // kind: "plc_offline" (PLC unreachable) or "no_data" (PLC answers, nothing readable).
  // signalLost is true from the third bad poll in a row until values return.
  const gaps = ref([]);
  const signalLost = ref(false);
  const signalLostKind = ref("plc_offline");
  const signalLostSince = ref(null);
  // Raised on loss and on recovery; the layout shows a toast for it.
  const signalEvent = ref(null);
  let badStreak = 0;
  let badStart = null;

  // --- Autosave / recovery ---
  const draftSavedAt = ref(null);
  const draftError = ref(false);
  const draftInfo = ref(null); // set at startup when an unsaved recording is waiting
  let draftData = null;
  let draftChecked = false;
  let draftChain = Promise.resolve();
  let draftQueued = false;

  // --- Finished session, waiting for Save / PDF / CSV / Discard ---
  const session = ref(null);
  const sessionDialog = ref(false);
  const sessionState = ref({ saved: false, pdf: false, csv: false, saving: false });
  const confirmDiscard = ref(false);
  // A message for the Records page to show as a toast the next time it is open.
  const notice = ref(null);

  // Total time without sensor values in this recording, including the gap that is still open.
  const lostSeconds = computed(() => {
    let t = gaps.value.reduce((a, g) => a + g.seconds, 0);
    if (signalLost.value && signalLostSince.value) t += Math.max(0, Math.round((elapsedMs.value - signalLostSince.value) / 1000));
    return t;
  });
  const elapsedMs = ref(Date.now());

  const clockSeconds = computed(() =>
    activeDuration.value > 0 ? Math.max(0, activeDuration.value - elapsedSeconds.value) : elapsedSeconds.value,
  );
  const formattedClock = computed(() => {
    const t = clockSeconds.value;
    const h = Math.floor(t / 3600);
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const ss = String(t % 60).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  });

  // --- Polling: runs while the Records page is open or a recording runs ---
  let pollTimer = null;
  let clockTimer = null;
  let consumers = 0;
  const listeners = new Set();

  function syncPolling() {
    const needed = consumers > 0 || isRecording.value;
    if (needed && !pollTimer) pollTimer = setInterval(poll, POLL_MS);
    else if (!needed && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
  function attach() {
    consumers++;
    syncPolling();
  }
  function detach() {
    consumers = Math.max(0, consumers - 1);
    syncPolling();
  }
  function onData(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function setContext(ctx) {
    if (ctx.catalog) catalog.value = ctx.catalog.map((s) => ({ key: s.key, label: s.label, unit: s.unit, group: s.group }));
    if (ctx.charts) charts.value = ctx.charts.map((c) => ({ ...c }));
  }

  async function poll() {
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
    let d = {};
    let ok = false;
    try {
      const res = await fetchOpcData();
      d = res.data || {};
      ok = true;
    } catch (e) {
      /* shown as PLC: DISCONNECTED */
    }
    plcStatus.value = ok ? "connected" : "disconnected";
    if (ok) for (const fn of listeners) fn(d);

    // One sample holds every sensor, so any X/Y pair can be drawn now or later
    // in the report. Unreadable nodes come back as null and stay null.
    const sample = { time, ts: now.toISOString() };
    for (const s of catalog.value) {
      if (s.key === "command_7" || s.key === "command_8") continue;
      sample[s.key] = toNumberOrNull(d[s.key]);
    }
    sample.command_7 = toNumberOrNull(manualCmd7.value);
    sample.command_8 = toNumberOrNull(manualCmd8.value);

    const withData = hasSensorValue(sample);
    emptyStreak.value = ok && !withData ? emptyStreak.value + 1 : 0;

    latest.value = sample;
    const buf = liveBuffer.value.slice(-(LIVE_STEPS - 1));
    buf.push(sample);
    liveBuffer.value = buf;

    if (isRecording.value) {
      samples.value.push(sample);
      if (withData) samplesWithData.value++;
      trackSignal(!ok || !withData, ok, now);
    }
  }

  // Counts bad polls in a row; the third one raises the alarm, the first
  // good one after it closes the gap.
  function trackSignal(bad, ok, now) {
    elapsedMs.value = now.getTime();
    if (bad) {
      if (badStreak === 0) badStart = now;
      badStreak++;
      if (!signalLost.value && badStreak >= LOSS_POLLS) {
        signalLost.value = true;
        signalLostKind.value = ok ? "no_data" : "plc_offline";
        signalLostSince.value = badStart.getTime();
        signalEvent.value = { id: now.getTime(), type: "lost", kind: signalLostKind.value };
      } else if (signalLost.value && !ok) {
        signalLostKind.value = "plc_offline";
      }
    } else {
      if (signalLost.value) {
        const g = closeGap(now);
        signalEvent.value = { id: now.getTime(), type: "restored", seconds: g.seconds };
      }
      badStreak = 0;
      badStart = null;
    }
  }

  function closeGap(end) {
    const from = signalLostSince.value;
    const g = {
      from: new Date(from).toISOString(),
      to: end.toISOString(),
      seconds: Math.max(1, Math.round((end.getTime() - from) / 1000)),
      kind: signalLostKind.value,
    };
    gaps.value.push(g);
    signalLost.value = false;
    signalLostSince.value = null;
    return g;
  }

  // --- Autosave: the running (or just stopped) recording is kept in the
  // database, so a closed app, a crash or a power cut loses at most a few seconds.
  function draftPayload(state) {
    const s = session.value;
    const live = state === "recording";
    const gapList = live ? gaps.value.slice() : (s?.gaps || []);
    if (live && signalLost.value && signalLostSince.value) {
      gapList.push({
        from: new Date(signalLostSince.value).toISOString(),
        to: null,
        seconds: Math.round((Date.now() - signalLostSince.value) / 1000),
        kind: signalLostKind.value,
      });
    }
    const src = live
      ? {
          samples: samples.value,
          charts: charts.value,
          catalog: catalog.value,
          job: recordJob.value,
          mode: recordMode.value,
          startedAt: startedAt.value,
          endedAt: null,
          reason: null,
          timer: activeDuration.value,
          withData: samplesWithData.value,
        }
      : s;
    return JSON.stringify({ v: 1, state, savedAt: new Date().toISOString(), ...src, gaps: gapList });
  }

  function queueDraft(op) {
    draftChain = draftChain.then(op).catch(() => {});
    return draftChain;
  }

  function saveDraft(state) {
    if (state === "recording") {
      if (draftQueued) return draftChain; // one save waiting is enough
      draftQueued = true;
    }
    return queueDraft(async () => {
      if (state === "recording") draftQueued = false;
      // Build the payload when the save runs, so it holds the newest samples.
      if (state === "recording" && !isRecording.value) return; // stopped meanwhile: the "stopped" save follows
      if (state === "stopped" && !session.value) return;
      try {
        await saveRecordingDraft(draftPayload(state));
        draftSavedAt.value = new Date();
        draftError.value = false;
      } catch (e) {
        draftError.value = true;
      }
    });
  }

  // Removes the autosave: after the session was saved as a record or discarded.
  function clearDraft() {
    return queueDraft(async () => {
      try {
        await deleteRecordingDraft();
      } catch (e) {
        /* nothing to remove, or the server is unreachable */
      }
      draftSavedAt.value = null;
    });
  }

  // At startup: is there an unsaved recording from a previous run?
  async function checkDraft() {
    if (draftChecked) return;
    if (isRecording.value || session.value) return;
    draftChecked = true;
    try {
      const res = await getRecordingDraft();
      if (!res.data?.exists) return;
      const d = JSON.parse(res.data.payload);
      if (!d || !Array.isArray(d.samples) || !d.samples.length) {
        await clearDraft();
        return;
      }
      draftData = d;
      draftInfo.value = {
        state: d.state,
        samples: d.samples.length,
        startedAt: d.startedAt,
        savedAt: d.savedAt || res.data.updated_at,
        job: d.job,
        mode: d.mode,
      };
    } catch (e) {
      /* no draft, or not readable: nothing to recover */
    }
  }

  // Opens the unsaved recording as a finished session (Save / PDF / CSV / Discard).
  function recoverDraft() {
    const d = draftData;
    if (!d) return false;
    const last = d.samples[d.samples.length - 1];
    const gapList = (d.gaps || []).map((g) => (g.to ? g : { ...g, to: last?.ts || d.savedAt }));
    session.value = {
      samples: d.samples,
      charts: d.charts || [],
      catalog: d.catalog || [],
      job: d.job || null,
      mode: d.mode,
      startedAt: new Date(d.startedAt),
      endedAt: new Date(d.endedAt || last?.ts || d.savedAt),
      reason: d.state === "recording" ? "recovered" : d.reason || "manual",
      timer: d.timer || 0,
      withData: d.withData ?? d.samples.length,
      gaps: gapList,
      lostSeconds: gapList.reduce((a, g) => a + (g.seconds || 0), 0),
    };
    sessionState.value = { saved: false, pdf: false, csv: false, saving: false };
    confirmDiscard.value = false;
    sessionDialog.value = true;
    draftInfo.value = null;
    draftData = null;
    return true;
  }

  async function discardDraft() {
    draftInfo.value = null;
    draftData = null;
    await clearDraft();
  }

  function start({ job, mode }) {
    if (isRecording.value) return false;
    isRecording.value = true;
    samples.value = [];
    samplesWithData.value = 0;
    gaps.value = [];
    signalLost.value = false;
    signalLostSince.value = null;
    badStreak = 0;
    badStart = null;
    startedAt.value = new Date();
    activeDuration.value = selectedDuration.value;
    elapsedSeconds.value = 0;
    recordJob.value = job ? { ...job } : null;
    recordMode.value = mode;
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      elapsedSeconds.value++;
      const every = elapsedSeconds.value < 3600 ? DRAFT_EVERY_S : DRAFT_EVERY_LONG_S;
      if (elapsedSeconds.value % every === 0) saveDraft("recording");
      if (activeDuration.value > 0) {
        if (elapsedSeconds.value >= activeDuration.value) stop("timer");
      } else if (elapsedSeconds.value >= MAX_SESSION_SECONDS) {
        stop("limit");
      }
    }, 1000);
    syncPolling();
    return true;
  }

  // reason: "manual" (Stop button), "timer" (duration reached), "limit" (4 h cap without a timer)
  function stop(reason) {
    if (!isRecording.value) return;
    isRecording.value = false;
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
    syncPolling();

    if (reason === "limit") {
      notice.value = {
        severity: "warn",
        summary: "Recording Limit Reached",
        detail: "Recording stopped automatically after 4 hours.",
      };
    }
    const stoppedAt = new Date();
    // A gap still open when the recording ends is closed at that moment.
    if (signalLost.value) closeGap(stoppedAt);
    const list = samples.value.slice();
    samples.value = [];
    if (!list.length) {
      notice.value = { severity: "warn", summary: "Recording Stopped", detail: "No samples were captured." };
      clearDraft();
      return;
    }
    session.value = {
      samples: list,
      charts: charts.value.map((c) => ({ ...c })),
      catalog: catalog.value.map((s) => ({ ...s })),
      job: recordJob.value,
      mode: recordMode.value,
      startedAt: startedAt.value || new Date(),
      endedAt: stoppedAt,
      reason,
      timer: activeDuration.value,
      withData: samplesWithData.value,
      gaps: gaps.value.slice(),
      lostSeconds: gaps.value.reduce((a, g) => a + g.seconds, 0),
    };
    sessionState.value = { saved: false, pdf: false, csv: false, saving: false };
    confirmDiscard.value = false;
    sessionDialog.value = true;
    saveDraft("stopped");
  }

  function takeNotice() {
    const n = notice.value;
    notice.value = null;
    return n;
  }

  return {
    plcStatus,
    latest,
    liveBuffer,
    emptyStreak,
    catalog,
    charts,
    manualCmd7,
    manualCmd8,
    isRecording,
    samples,
    startedAt,
    selectedDuration,
    activeDuration,
    elapsedSeconds,
    samplesWithData,
    gaps,
    signalLost,
    signalLostKind,
    signalEvent,
    lostSeconds,
    draftSavedAt,
    draftError,
    draftInfo,
    session,
    sessionDialog,
    sessionState,
    confirmDiscard,
    notice,
    formattedClock,
    attach,
    detach,
    onData,
    setContext,
    start,
    stop,
    takeNotice,
    clearDraft,
    checkDraft,
    recoverDraft,
    discardDraft,
  };
});

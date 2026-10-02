"use strict";
// Optional browser speech only. No recordings, provider keys or new server routes.
(function (host) {
  const errors = {
    "not-allowed": "Microphone permission was denied. Allow it in your browser's site settings, or type your reply.",
    "service-not-allowed": "Your browser or organisation has blocked speech recognition. You can still type your reply.",
    "audio-capture": "No working microphone was found. Check the microphone connection, or type your reply.",
    network: "The browser's speech service could not connect. Try again, or use typing. A work network may block this service.",
    "no-speech": "No speech was detected. Try talking again, or type your reply.",
    "language-not-supported": "English speech recognition is unavailable in this browser. Use typing instead.",
    aborted: "Listening stopped. Check your reply before sending.",
  };
  function speechChunks(text) {
    const words = String(text || "").trim().split(/\s+/);
    const chunks = [];
    let chunk = "";
    for (const word of words) {
      if (chunk && chunk.length + word.length + 1 > 180) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += (chunk ? " " : "") + word;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }
  class Controller {
    constructor({ environment = host, onState = () => {}, onDraft = () => {}, onNotice = () => {} } = {}) {
      this.environment = environment;
      this.Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition;
      this.synth = environment.speechSynthesis;
      this.Utterance = environment.SpeechSynthesisUtterance;
      this.onState = onState;
      this.onDraft = onDraft;
      this.onNotice = onNotice;
      this.active = false;
      this.busy = false;
      this.spoken = false;
      this.rec = null;
      this.stopping = false;
      this.utterance = null;
      this.speechId = 0;
      this.voiceURI = "";
      this.captureTimer = null;
      this.stopTimer = null;
      this.speechTimer = null;
    }
    snapshot() {
      return {
        inputSupported: !!this.Recognition && this.environment.isSecureContext !== false,
        outputSupported: !!this.synth && !!this.Utterance,
        active: this.active,
        busy: this.busy,
        listening: !!this.rec,
        stopping: this.stopping,
        speaking: !!this.utterance,
        spoken: this.spoken,
      };
    }
    emit() { this.onState(this.snapshot()); }
    message(text, error = false) { this.onNotice(text, error); }
    setContext(active, busy = false) {
      this.active = !!active;
      this.busy = !!busy;
      if (!this.active || this.busy) {
        this.cancelListening();
        this.stopSpeaking();
      }
      this.emit();
    }
    clearCaptureTimers() {
      this.environment.clearTimeout(this.captureTimer);
      this.environment.clearTimeout(this.stopTimer);
      this.captureTimer = this.stopTimer = null;
    }
    startListening(draft = "") {
      if (!this.active || this.busy || this.rec) return false;
      if (!this.snapshot().inputSupported) {
        this.message("Voice input is not supported in this browser. Type your reply, or use your keyboard's dictation button.", true);
        return false;
      }
      this.stopSpeaking();
      const base = String(draft).trim();
      if (base.length >= 1000) {
        this.message("Your reply is already at the 1,000-character limit. Edit it before adding more speech.", true);
        return false;
      }
      let rec;
      try { rec = new this.Recognition(); }
      catch {
        this.message("Speech recognition could not start. You can still type your reply.", true);
        return false;
      }
      this.rec = rec;
      this.stopping = false;
      let heard = "", failed = false;
      rec.lang = "en-GB";
      // Single turns work on desktop and mobile without repeatedly reopening the mic.
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        if (this.rec !== rec || this.stopping) return;
        this.message("Listening… speak your reply, then press Stop listening. Nothing is sent yet.");
      };
      rec.onresult = (event) => {
        if (this.rec !== rec) return;
        const parts = [];
        for (let i = 0; i < event.results.length; i++)
          parts.push(event.results[i][0]?.transcript || "");
        heard = parts.join(" ").trim();
        const value = [base, heard].filter(Boolean).join(" ");
        this.onDraft(value.slice(0, 1000));
        if (value.length >= 1000 && !this.stopping) this.stopListening();
      };
      rec.onerror = (event) => {
        if (this.rec !== rec) return;
        failed = true;
        this.cancelListening();
        this.message(errors[event.error] || "The browser could not recognise speech. Your reply is still available to edit or type.", true);
      };
      rec.onend = () => {
        if (this.rec !== rec) return;
        this.rec = null;
        this.stopping = false;
        this.clearCaptureTimers();
        this.emit();
        if (!failed) this.message(heard
          ? "Check the words in Your reply, edit if needed, then press Send reply."
          : "No words were captured. Try Talk again, or type your reply.");
      };
      this.emit();
      this.message("Starting the microphone… allow access if your browser asks.");
      this.captureTimer = this.environment.setTimeout(() => {
        if (this.rec === rec) this.stopListening();
      }, 60000);
      try { rec.start(); }
      catch {
        this.cancelListening();
        this.message("The microphone could not start. Check permissions or type your reply.", true);
        return false;
      }
      return true;
    }
    stopListening() {
      if (!this.rec || this.stopping) return;
      const rec = this.rec;
      this.stopping = true;
      this.emit();
      this.message("Finishing transcription… your reply has not been sent.");
      // Some browser speech services fail to send an end event after stop().
      this.stopTimer = this.environment.setTimeout(() => {
        if (this.rec !== rec) return;
        this.cancelListening();
        this.message("Listening stopped. Check the words captured, then send or type your reply.");
      }, 2500);
      try { rec.stop(); }
      catch {
        this.cancelListening();
        this.message("Listening stopped. Check your reply before sending.");
      }
    }
    cancelListening() {
      const rec = this.rec;
      this.rec = null; // Ignore late callbacks after send, navigation or expiry.
      this.stopping = false;
      this.clearCaptureTimers();
      if (rec) { try { rec.abort(); } catch {} }
      this.emit();
    }
    setSpoken(enabled) {
      this.spoken = !!enabled && this.snapshot().outputSupported;
      if (!this.spoken) this.stopSpeaking();
      this.emit();
    }
    voices() {
      try { return this.synth?.getVoices() || []; } catch { return []; }
    }
    selectVoice(uri) { this.voiceURI = uri; }
    stopSpeaking() {
      this.speechId++;
      this.utterance = null;
      this.environment.clearTimeout(this.speechTimer);
      this.speechTimer = null;
      try { this.synth?.cancel(); } catch {}
      this.emit();
    }
    speak(text) {
      if (!this.active || this.busy || !this.spoken || !this.snapshot().outputSupported) return false;
      const chunks = speechChunks(text);
      if (!chunks.length) return false;
      this.cancelListening(); // Never transcribe the customer's own playback.
      this.stopSpeaking();
      const speechId = this.speechId;
      const voices = this.voices();
      const voice = voices.find(v => v.voiceURI === this.voiceURI)
        || voices.find(v => /^en[-_]GB$/i.test(v.lang))
        || voices.find(v => /^en/i.test(v.lang));
      let index = 0;
      const next = () => {
        if (speechId !== this.speechId) return;
        this.environment.clearTimeout(this.speechTimer);
        if (index >= chunks.length) {
          this.utterance = null;
          this.emit();
          this.message("Customer finished speaking. Talk or type your reply.");
          return;
        }
        try {
          const utterance = new this.Utterance(chunks[index++]);
          this.utterance = utterance; // Keep alive until completion in Safari/Chrome.
          utterance.lang = voice?.lang || "en-GB";
          if (voice) utterance.voice = voice;
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.onend = () => { if (speechId === this.speechId) next(); };
          utterance.onerror = (event) => {
            if (speechId !== this.speechId) return;
            this.stopSpeaking();
            this.message(event.error === "not-allowed"
              ? "Your browser needs a tap to play audio. Press Replay customer, or read the reply."
              : "The customer could not be read aloud. Press Replay customer or read the text.", true);
          };
          this.emit();
          this.message("Customer speaking… press Talk to interrupt, or Mute customer to turn sound off.");
          this.speechTimer = this.environment.setTimeout(() => {
            if (speechId !== this.speechId) return;
            this.stopSpeaking();
            this.message("Playback stopped. You can replay the customer or read the text.");
          }, 30000);
          this.synth.speak(utterance);
        } catch {
          this.stopSpeaking();
          this.message("Spoken replies are unavailable here. You can read the customer's text instead.", true);
        }
      };
      next();
      return true;
    }
    reset() {
      this.active = false;
      this.busy = false;
      this.cancelListening();
      this.stopSpeaking();
    }
  }
  function createControls({ document = host.document, messageInput, sendButton }) {
    const get = id => document.getElementById(id);
    const talk = get("voiceTalk"), mute = get("voiceMute"), replay = get("voiceReplay"),
      stop = get("voiceStop"), voiceSelect = get("voiceChoice"), status = get("voiceStatus");
    let current = null, latest = null, pendingSpeech = false, blocked = false;
    const controller = new Controller({
      onDraft: text => { messageInput.value = text; },
      onNotice: (text, error) => {
        status.textContent = text;
        status.classList.toggle("voice-error", error);
      },
      onState: state => {
        talk.disabled = !state.inputSupported || !state.active || state.busy || state.stopping;
        talk.textContent = state.stopping ? "Finishing…" : state.listening ? "Stop listening" : "Talk";
        talk.setAttribute("aria-pressed", String(state.listening));
        messageInput.readOnly = state.listening;
        sendButton.disabled = state.busy || state.listening || !state.active;
        mute.disabled = !state.outputSupported;
        mute.textContent = state.spoken ? "Mute customer" : "Enable spoken replies";
        mute.setAttribute("aria-pressed", String(state.spoken));
        replay.disabled = !latest || !state.active || state.busy || !state.spoken;
        stop.disabled = !state.speaking;
        voiceSelect.disabled = !state.outputSupported;
      },
    });
    function fillVoices() {
      const selected = voiceSelect.value;
      voiceSelect.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Automatic English voice";
      voiceSelect.append(option);
      for (const voice of controller.voices()) {
        const option = document.createElement("option");
        option.value = voice.voiceURI;
        option.textContent = voice.name + " (" + voice.lang + ")";
        voiceSelect.append(option);
      }
      if ([...voiceSelect.options].some(v => v.value === selected)) voiceSelect.value = selected;
    }
    talk.addEventListener("click", () => {
      pendingSpeech = false;
      if (controller.rec) controller.stopListening();
      else controller.startListening(messageInput.value);
    });
    mute.addEventListener("click", () => {
      pendingSpeech = false;
      controller.setSpoken(!controller.spoken);
      if (controller.spoken && latest) controller.speak(latest.content);
      else controller.message("Customer muted. You can still Talk or type your reply.");
    });
    replay.addEventListener("click", () => {
      pendingSpeech = false;
      if (latest) controller.speak(latest.content);
    });
    stop.addEventListener("click", () => {
      pendingSpeech = false;
      controller.stopSpeaking();
      controller.message("Playback stopped. Future replies will still be spoken unless you mute the customer.");
    });
    voiceSelect.addEventListener("change", () => controller.selectVoice(voiceSelect.value));
    fillVoices();
    controller.synth?.addEventListener?.("voiceschanged", fillVoices);
    function flushSpeech() {
      if (!pendingSpeech || blocked || document.hidden || !controller.active) return;
      pendingSpeech = false;
      if (controller.spoken && latest) controller.speak(latest.content);
    }
    controller.emit();
    if (!controller.snapshot().inputSupported) controller.message(
      "Voice input is unavailable in this browser. Type your reply or use your keyboard's dictation button. Spoken replies may still be available.");
    else controller.message("Optional: press Talk to dictate, check the words, then Send reply. Enable spoken replies to hear the customer.");
    return {
      isListening: () => !!controller.rec,
      updateSession(s) {
        const fresh = current?.id !== s.id;
        const previousTurn = fresh ? -1 : (latest?.turn ?? -1);
        const customers = s.messages.filter(m => m.role === "assistant");
        if (fresh) controller.reset();
        current = s;
        latest = customers[customers.length - 1] || null;
        controller.setContext(s.phase === "active", blocked);
        if (latest && latest.turn > previousTurn) pendingSpeech = true;
        if (s.phase !== "active") pendingSpeech = false;
        flushSpeech();
      },
      setBusy(value) {
        blocked = !!value;
        controller.setContext(current?.phase === "active", blocked);
        flushSpeech();
      },
      stop() {
        pendingSpeech = false;
        controller.cancelListening();
        controller.stopSpeaking();
      },
      reset() {
        pendingSpeech = false;
        current = latest = null;
        controller.reset();
      },
    };
  }
  host.AdvisorPracticeVoice = { Controller, createControls, speechChunks };
})(window);

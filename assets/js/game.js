(function () {
  "use strict";

  function Content() {
    return window.GAME_CONTENT || {};
  }

  function Config() {
    return window.GAME_CONFIG || {};
  }

  function bal() {
    return Config().balance || {};
  }

  function labels() {
    return Config().labels || {};
  }

  function sys(name) {
    const s = (Config().systems || {})[name];
    return !s || s.enabled !== false;
  }

  function souls() {
    return (Content().souls || Content().cases || []).slice();
  }

  function courtCfg() {
    return bal().courtTime || {};
  }

  function maxCourtMinutes() {
    const ct = courtCfg();
    if (ct.maxMinutes != null) return ct.maxMinutes;
    const hours = ct.hoursPerDay != null ? ct.hoursPerDay : 8;
    return hours * 60;
  }

  function startCourtMinutes() {
    const ct = courtCfg();
    return ct.startMinutes != null ? ct.startMinutes : maxCourtMinutes();
  }

  function hoursPerDay() {
    const ct = courtCfg();
    return ct.hoursPerDay != null ? ct.hoursPerDay : Math.max(1, Math.round(maxCourtMinutes() / 60));
  }

  function formatMinutes(total) {
    const m = Math.max(0, Math.floor(total || 0));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  function normalizeSoul(raw, index) {
    const deceased = raw.deceased || raw;
    return {
      id: raw.id || deceased.id || "soul_" + index,
      name: deceased.trueName || deceased.name || "이름 없음",
      birthYear: deceased.birthYear != null ? deceased.birthYear : null,
      deathYear: deceased.deathYear != null ? deceased.deathYear : null,
      ageAtDeath: deceased.ageAtDeath != null ? deceased.ageAtDeath : null,
      gender: deceased.gender || "",
      job: deceased.job || "",
      summary: deceased.profileNote || deceased.summary || "",
      intro: deceased.intro || deceased.summary || "",
      grade: deceased.grade || raw.grade || "",
      values: (deceased.values || raw.values || []).slice(),
      coreConflictKeywords: (deceased.coreConflictKeywords || raw.coreConflictKeywords || []).slice(),
      tendencyTags: (deceased.tendencyTags || raw.tendencyTags || []).slice(),
      events: (raw.events || deceased.events || []).map(function (ev, eventIndex) {
        const context = ev.context || ev.fact || {};
        const intent = ev.intent || ev.emotion || {};
        return {
          id: ev.id || "event_" + eventIndex,
          year: ev.year,
          age: ev.age != null ? ev.age : null,
          title: ev.title || "이름 없는 사건",
          summary: ev.summary || ev.basic || "",
          contextText: ev.contextText || context.text || ev.factText || "",
          intentText: ev.intentText || intent.text || ev.emotionText || "",
          contextKeywords: (ev.contextKeywords || context.keywords || ev.factKeywords || []).slice(),
          intentKeywords: (ev.intentKeywords || intent.keywords || ev.emotionKeywords || []).slice(),
          linkText: ev.linkText || ev.nextLink || "",
        };
      }).sort(function (a, b) {
        return (a.year || 0) - (b.year || 0);
      }),
    };
  }

  function todayRoster() {
    return souls().map(function (raw, index) {
      const s = normalizeSoul(raw, index);
      return {
        index: index,
        id: s.id,
        name: s.name,
        summary: s.summary,
        grade: s.grade,
        verdict: null,
      };
    });
  }

  const Log = {
    session: null,
    startSession(soulId) {
      this.session = {
        startedAt: new Date().toISOString(),
        soulId: soulId || null,
        events: [],
      };
    },
    push(type, data) {
      if (!sys("playtestLog") || !this.session) return;
      this.session.events.push({
        t: Date.now(),
        type: type,
        data: data || null,
      });
    },
    download() {
      if (!this.session) return;
      const blob = new Blob([JSON.stringify(this.session, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hellcourt-log-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };

  function createTrialState(game, soulIndex) {
    const raw = souls()[soulIndex];
    if (!raw) throw new Error("no soul in GAME_CONTENT");
    const soul = normalizeSoul(raw, soulIndex);
    const events = soul.events.map(function (ev) {
      return {
        id: ev.id,
        year: ev.year,
        age: ev.age,
        title: ev.title,
        summary: ev.summary,
        contextText: ev.contextText,
        intentText: ev.intentText,
        contextKeywords: ev.contextKeywords.slice(),
        intentKeywords: ev.intentKeywords.slice(),
        linkText: ev.linkText,
        contextRead: false,
        intentRead: false,
      };
    });

    return {
      phase: "trial",
      day: game.day,
      soulIndex: soulIndex,
      soulId: soul.id,
      name: soul.name,
      birthYear: soul.birthYear,
      deathYear: soul.deathYear,
      ageAtDeath: soul.ageAtDeath,
      gender: soul.gender,
      job: soul.job,
      summary: soul.summary,
      intro: soul.intro,
      grade: soul.grade,
      values: soul.values.slice(),
      coreConflictKeywords: soul.coreConflictKeywords.slice(),
      tendencyTags: soul.tendencyTags.slice(),
      courtName: labels().courtName || "공정의 법정",
      courtTimeMinutes: game.courtTimeMinutes,
      courtTimeMaxMinutes: maxCourtMinutes(),
      courtTimeHours: hoursPerDay(),
      today: game.today.map(function (s) { return Object.assign({}, s); }),
      events: events,
      selectedEventId: events.length ? events[0].id : null,
      currentView: "profile",
      lastAction: null,
      verdict: null,
      lastSummary: null,
    };
  }

  const Events = {
    find(state, eventId) {
      return (state.events || []).find(function (ev) {
        return ev.id === eventId;
      });
    },
    selected(state) {
      return this.find(state, state.selectedEventId);
    },
    counts(state) {
      let context = 0;
      let intent = 0;
      (state.events || []).forEach(function (ev) {
        if (ev.contextRead) context += 1;
        if (ev.intentRead) intent += 1;
      });
      return { context: context, intent: intent, total: (state.events || []).length };
    },
    record(state) {
      return (state.events || []).filter(function (ev) {
        return ev.contextRead || ev.intentRead;
      }).map(function (ev) {
        return {
          id: ev.id,
          year: ev.year,
          age: ev.age,
          title: ev.title,
          summary: ev.summary,
          contextRead: ev.contextRead,
          intentRead: ev.intentRead,
          contextText: ev.contextText,
          intentText: ev.intentText,
        };
      });
    },
  };

  const Game = {
    state: null,
    day: 1,
    courtTimeMinutes: null,
    today: [],
    activeSoulIndex: null,
    verdictHistory: [],

    labels() {
      return labels();
    },
    balance() {
      return bal();
    },
    contentArt() {
      return (Content().art && Content().art.paths) || {};
    },
    contentAudio() {
      return Content().audio || {};
    },
    formatCourtTime(minutes) {
      return formatMinutes(minutes != null ? minutes : this.courtTimeMinutes);
    },
    actionCosts() {
      const ct = courtCfg();
      return {
        contextTime: ct.costContextMinutes != null ? ct.costContextMinutes : 30,
        intentTime: ct.costIntentMinutes != null ? ct.costIntentMinutes : 15,
      };
    },
    bootDay() {
      if (this.courtTimeMinutes == null) this.courtTimeMinutes = startCourtMinutes();
      if (!this.today.length) this.today = todayRoster();
    },
    startNewRun() {
      this.day = 1;
      this.courtTimeMinutes = startCourtMinutes();
      this.today = todayRoster();
      this.activeSoulIndex = null;
      this.verdictHistory = [];
      return this.enterLobby();
    },
    enterLobby(options) {
      options = options || {};
      this.bootDay();
      this.state = {
        phase: "lobby",
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
        courtTimeMaxMinutes: maxCourtMinutes(),
        courtTimeHours: hoursPerDay(),
        today: this.today.map(function (s) { return Object.assign({}, s); }),
        lastSummary: options.summary || (this.verdictHistory.length ? this.verdictHistory[this.verdictHistory.length - 1] : null),
        verdictHistory: this.verdictHistory.slice(),
        dayJustAdvanced: !!options.dayJustAdvanced,
      };
      Log.push("lobby_enter", {
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
        remainingSouls: this.remainingSouls(),
      });
      return this.state;
    },
    remainingSouls() {
      this.bootDay();
      return this.today.filter(function (s) { return !s.verdict; }).length;
    },
    remainingSoulRows() {
      this.bootDay();
      return this.today.filter(function (s) { return !s.verdict; }).map(function (s) {
        return Object.assign({}, s);
      });
    },
    allSoulsJudged() {
      return this.remainingSouls() === 0;
    },
    canStartTrial() {
      this.bootDay();
      return this.remainingSouls() > 0;
    },
    startTrial(options) {
      options = options || {};
      this.bootDay();
      if (!this.canStartTrial()) return null;
      let index = options.soulIndex;
      if (index == null) {
        const next = this.today.find(function (s) { return !s.verdict; });
        index = next ? next.index : 0;
      }
      const row = this.today.find(function (s) { return s.index === index; });
      if (!row || row.verdict) return null;
      this.activeSoulIndex = index;
      this.state = createTrialState(this, index);
      Log.startSession(this.state.soulId);
      Log.push("trial_start", {
        day: this.day,
        soulId: this.state.soulId,
        courtTimeMinutes: this.courtTimeMinutes,
      });
      return this.state;
    },
    advanceDay() {
      this.day += 1;
      this.courtTimeMinutes = startCourtMinutes();
      this.today = todayRoster();
      this.activeSoulIndex = null;
      Log.push("day_advance", {
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
      });
      return this.enterLobby({ dayJustAdvanced: true });
    },
    selectEvent(eventId) {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.find(s, eventId);
      if (!ev) return { ok: false, reason: "no_event" };
      s.selectedEventId = eventId;
      s.currentView = "event";
      Log.push("event_selected", { eventId: eventId });
      return { ok: true, event: ev };
    },
    inspectBasic() {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.selected(s);
      if (!ev) return { ok: false, reason: "no_event" };
      s.currentView = "event";
      s.lastAction = { type: "basic", eventId: ev.id };
      Log.push("basic_view", { eventId: ev.id });
      return { ok: true, event: ev, text: ev.summary };
    },
    investigateContext() {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.selected(s);
      if (!ev) return { ok: false, reason: "no_event" };
      if (ev.contextRead) return { ok: false, reason: "already", event: ev };
      const cost = this.actionCosts().contextTime;
      if (s.courtTimeMinutes < cost) return { ok: false, reason: "no_time", event: ev };
      s.courtTimeMinutes = Math.max(0, s.courtTimeMinutes - cost);
      this.courtTimeMinutes = s.courtTimeMinutes;
      ev.contextRead = true;
      s.currentView = "context";
      s.lastAction = { type: "context", eventId: ev.id, text: ev.contextText };
      Log.push("context_read", {
        eventId: ev.id,
        costMinutes: cost,
        courtTimeMinutes: s.courtTimeMinutes,
      });
      return { ok: true, event: ev, text: ev.contextText, courtTimeMinutes: s.courtTimeMinutes };
    },
    investigateIntent() {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.selected(s);
      if (!ev) return { ok: false, reason: "no_event" };
      if (!ev.contextRead) return { ok: false, reason: "need_context", event: ev };
      if (ev.intentRead) return { ok: false, reason: "already", event: ev };
      const cost = this.actionCosts().intentTime;
      if (s.courtTimeMinutes < cost) return { ok: false, reason: "no_time", event: ev };
      s.courtTimeMinutes = Math.max(0, s.courtTimeMinutes - cost);
      this.courtTimeMinutes = s.courtTimeMinutes;
      ev.intentRead = true;
      s.currentView = "intent";
      s.lastAction = { type: "intent", eventId: ev.id, text: ev.intentText };
      Log.push("intent_read", {
        eventId: ev.id,
        costMinutes: cost,
        courtTimeMinutes: s.courtTimeMinutes,
      });
      return { ok: true, event: ev, text: ev.intentText, courtTimeMinutes: s.courtTimeMinutes };
    },
    canInvestigateContext() {
      const s = this.state;
      if (!s || s.phase !== "trial") return false;
      const ev = Events.selected(s);
      return !!ev && !ev.contextRead && s.courtTimeMinutes >= this.actionCosts().contextTime;
    },
    canInvestigateIntent() {
      const s = this.state;
      if (!s || s.phase !== "trial") return false;
      const ev = Events.selected(s);
      return !!ev && ev.contextRead && !ev.intentRead && s.courtTimeMinutes >= this.actionCosts().intentTime;
    },
    openVerdict() {
      const s = this.state;
      if (!s || (s.phase !== "trial" && s.phase !== "verdict")) return { ok: false };
      s.phase = "verdict";
      Log.push("verdict_open", { reads: Events.counts(s) });
      return { ok: true, reads: Events.counts(s), record: Events.record(s) };
    },
    submitVerdict(choice, reason) {
      const s = this.state;
      if (!s || s.phase !== "verdict") return { ok: false, reason: "bad_phase" };
      if (choice !== "heaven" && choice !== "hell") return { ok: false, reason: "bad_choice" };

      const counts = Events.counts(s);
      const record = Events.record(s);
      const summary = {
        day: this.day,
        soulId: s.soulId,
        soulIndex: s.soulIndex,
        deceasedName: s.name,
        choice: choice,
        reason: reason || "",
        eventCount: counts.total,
        contextRead: counts.context,
        intentRead: counts.intent,
        courtTimeMinutesLeft: s.courtTimeMinutes,
        courtTimeLeftLabel: formatMinutes(s.courtTimeMinutes),
        values: s.values.slice(),
        tendencyTags: s.tendencyTags.slice(),
        record: record,
      };

      const row = this.today.find(function (item) { return item.index === s.soulIndex; });
      if (row) row.verdict = choice;
      this.courtTimeMinutes = s.courtTimeMinutes;
      this.verdictHistory.push(summary);

      s.phase = "ended";
      s.verdict = { choice: choice, reason: reason || "", reads: counts };
      s.lastSummary = summary;
      Log.push("verdict_submit", summary);
      return { ok: true, verdict: s.verdict, summary: summary };
    },
    quickSubmitVerdict(soulIndex, choice, reason) {
      this.bootDay();
      if (choice !== "heaven" && choice !== "hell") return { ok: false, reason: "bad_choice" };
      const row = this.today.find(function (item) { return item.index === soulIndex; });
      if (!row || row.verdict) return { ok: false, reason: "no_soul" };
      const soul = normalizeSoul(souls()[soulIndex], soulIndex);
      row.verdict = choice;
      const summary = {
        day: this.day,
        soulId: soul.id,
        soulIndex: soulIndex,
        deceasedName: soul.name,
        choice: choice,
        reason: reason || "법정시간 종료 후 간이 판결",
        eventCount: soul.events.length,
        contextRead: 0,
        intentRead: 0,
        courtTimeMinutesLeft: this.courtTimeMinutes || 0,
        courtTimeLeftLabel: formatMinutes(this.courtTimeMinutes || 0),
        values: soul.values.slice(),
        tendencyTags: soul.tendencyTags.slice(),
        record: [],
        quick: true,
      };
      this.verdictHistory.push(summary);
      if (this.state) this.state.lastSummary = summary;
      Log.push("quick_verdict_submit", summary);
      return { ok: true, summary: summary };
    },
    finishToLobby() {
      const summary = this.state && this.state.lastSummary;
      return this.enterLobby({ summary: summary });
    },
    getSelectedEvent() {
      return this.state && this.state.phase === "trial" ? Events.selected(this.state) : null;
    },
    getReadCounts() {
      return this.state ? Events.counts(this.state) : { context: 0, intent: 0, total: 0 };
    },
    getRecord() {
      return this.state ? Events.record(this.state) : [];
    },
    downloadLog() {
      Log.download();
    },
  };

  window.HellCourtGame = Game;
})();

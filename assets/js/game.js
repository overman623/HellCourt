(function () {
  /*
   * 지옥법정 — 개정 룰 MVP 코어
   * 타임라인 공개 → 사실 열람(분) → 감정 질문(분+영력) → 천국/지옥 → 로비
   * 법정시간: 하루 풀(분), 같은 날 재판 간 유지 / 날짜 변경 시만 회복
   * 영력: 자동 회복 없음 / 영기 재화로 로비에서 회복
   */
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
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function soulList() {
    const c = Content();
    if (c.souls && c.souls.length) return c.souls;
    return c.cases || [];
  }
  function caseCount() {
    return soulList().length;
  }
  function resolveCase(caseIndex) {
    const cases = soulList();
    if (!cases.length) return { pack: null, index: 0 };
    const i = ((caseIndex % cases.length) + cases.length) % cases.length;
    return { pack: cases[i], index: i };
  }

  /** 신규 soul 스키마 / 구 cases 스키마 모두 런타임 상태로 정규화 */
  function normalizeSoulPack(pack) {
    if (!pack) return null;
    // 구 포맷: { deceased, events with factText }
    if (pack.deceased) {
      return {
        id: pack.id,
        name: pack.deceased.trueName || "???",
        birthYear: pack.deceased.birthYear || null,
        deathYear: pack.deceased.deathYear || null,
        ageAtDeath: pack.deceased.ageAtDeath || null,
        gender: pack.deceased.gender || "",
        summary: pack.deceased.profileNote || pack.deceased.summary || "",
        intro: pack.deceased.intro || "",
        values: (pack.deceased.values || []).slice(),
        coreConflictKeywords: (pack.deceased.coreConflictKeywords || []).slice(),
        identityEventId: pack.identityEventId || null,
        events: (pack.events || []).map(function (ev) {
          return {
            id: ev.id,
            year: ev.year,
            age: ev.age != null ? ev.age : null,
            title: ev.title,
            summary: ev.summary || "",
            factText: ev.factText || (ev.fact && ev.fact.text) || "",
            emotionText: ev.emotionText || (ev.emotion && ev.emotion.text) || "",
            factKeywords: (ev.factKeywords || (ev.fact && ev.fact.keywords) || []).slice(),
            emotionKeywords: (ev.emotionKeywords || (ev.emotion && ev.emotion.keywords) || []).slice(),
            revealsIdentity: !!ev.revealsIdentity || ev.id === pack.identityEventId,
          };
        }),
      };
    }
    // 신 포맷: soul 루트
    return {
      id: pack.id,
      name: pack.name || "???",
      birthYear: pack.birthYear != null ? pack.birthYear : null,
      deathYear: pack.deathYear != null ? pack.deathYear : null,
      ageAtDeath: pack.ageAtDeath != null ? pack.ageAtDeath : null,
      gender: pack.gender || "",
      summary: pack.summary || "",
      intro: pack.intro || pack.summary || "",
      values: (pack.values || []).slice(),
      coreConflictKeywords: (pack.coreConflictKeywords || []).slice(),
      identityEventId: pack.identityEventId || null,
      events: (pack.events || []).map(function (ev) {
        const fact = ev.fact || {};
        const emotion = ev.emotion || {};
        return {
          id: ev.id,
          year: ev.year,
          age: ev.age != null ? ev.age : null,
          title: ev.title,
          summary: ev.summary || "",
          factText: fact.text || ev.factText || "",
          emotionText: emotion.text || ev.emotionText || "",
          factKeywords: (fact.keywords || ev.factKeywords || []).slice(),
          emotionKeywords: (emotion.keywords || ev.emotionKeywords || []).slice(),
          revealsIdentity: !!ev.revealsIdentity || ev.id === pack.identityEventId,
        };
      }),
    };
  }

  function courtCfg() {
    return bal().courtTime || {};
  }
  function spiritCfg() {
    return bal().spirit || {};
  }
  function maxCourtMinutes() {
    const ct = courtCfg();
    if (ct.maxMinutes != null) return ct.maxMinutes;
    const hours = ct.hoursPerDay != null ? ct.hoursPerDay : 8;
    return hours * 60;
  }
  function startCourtMinutes() {
    const ct = courtCfg();
    if (ct.startMinutes != null) return ct.startMinutes;
    return maxCourtMinutes();
  }
  function hoursPerDay() {
    const ct = courtCfg();
    return ct.hoursPerDay != null ? ct.hoursPerDay : Math.round(maxCourtMinutes() / 60);
  }

  /** 분 → "H:MM" / 표시용 */
  function formatMinutes(total) {
    const m = Math.max(0, Math.floor(total || 0));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  // ---------- Log ----------
  const Log = {
    session: null,
    startSession(caseId) {
      this.session = {
        startedAt: new Date().toISOString(),
        caseId: caseId || null,
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
      const blob = new Blob([JSON.stringify(this.session, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hellcourt-log-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };

  // ---------- Events ----------
  const Events = {
    find(state, eventId) {
      return (state.events || []).find(function (e) {
        return e.id === eventId;
      });
    },
    selected(state) {
      return this.find(state, state.selectedEventId);
    },
    countRead(state) {
      let facts = 0;
      let emotions = 0;
      (state.events || []).forEach(function (e) {
        if (e.factRead) facts++;
        if (e.emotionRead) emotions++;
      });
      return { facts: facts, emotions: emotions, total: (state.events || []).length };
    },
  };

  // ---------- Karma ----------
  const Karma = {
    readRatio(state) {
      const c = Events.countRead(state);
      if (!c.total) return 1;
      const slots = c.total * 2;
      return (c.facts + c.emotions) / slots;
    },
    isRushed(state) {
      if (!sys("karmaUi")) return false;
      const min = (bal().karma && bal().karma.minReadRatio) != null ? bal().karma.minReadRatio : 0.35;
      return this.readRatio(state) < min;
    },
  };

  function createState(caseIndex, meta) {
    meta = meta || {};
    const resolved = resolveCase(caseIndex);
    const raw = resolved.pack;
    if (!raw) throw new Error("no souls in GAME_CONTENT");
    const pack = normalizeSoulPack(raw);

    const sp = spiritCfg();
    const rb = bal().rebirth || {};
    const maxMin = maxCourtMinutes();
    const courtMin = meta.courtTimeMinutes != null ? meta.courtTimeMinutes : startCourtMinutes();
    const spirit = meta.spirit != null ? meta.spirit : sp.start != null ? sp.start : 10;

    const events = (pack.events || []).map(function (ev) {
      return {
        id: ev.id,
        year: ev.year,
        age: ev.age,
        title: ev.title,
        summary: ev.summary || "",
        factText: ev.factText || "",
        emotionText: ev.emotionText || "",
        factKeywords: (ev.factKeywords || []).slice(),
        emotionKeywords: (ev.emotionKeywords || []).slice(),
        revealsIdentity: !!ev.revealsIdentity,
        factRead: false,
        emotionRead: false,
      };
    });

    events.sort(function (a, b) {
      return (a.year || 0) - (b.year || 0);
    });

    return {
      phase: "trial",
      caseId: pack.id,
      caseIndex: resolved.index,
      deceasedId: pack.id,
      trueName: pack.name || "???",
      displayName: labels().anonymousName || "이름 불명",
      courtName: labels().courtName || "공정의 법정",
      nameRevealed: false,
      intro: pack.intro || "익명의 망자가 법정에 섰다.",
      profileNote: pack.summary || "",
      values: (pack.values || []).slice(),
      coreConflictKeywords: (pack.coreConflictKeywords || []).slice(),
      gender: pack.gender || "",
      birthYear: pack.birthYear,
      deathYear: pack.deathYear,
      ageAtDeath: pack.ageAtDeath,
      identityEventId: pack.identityEventId || null,
      courtTimeMinutes: courtMin,
      courtTimeMaxMinutes: maxMin,
      courtTimeHours: hoursPerDay(),
      spirit: spirit,
      spiritMax: sp.max != null ? sp.max : 10,
      essence: meta.essence != null ? meta.essence : 0,
      rebirthDaysLeft: meta.rebirthDaysLeft != null ? meta.rebirthDaysLeft : rb.daysLeft != null ? rb.daysLeft : 100,
      rebirthDaysTotal: rb.daysTotal != null ? rb.daysTotal : 100,
      rebirthStones: meta.rebirthStones != null ? meta.rebirthStones : rb.stones != null ? rb.stones : 1,
      day: meta.day != null ? meta.day : 1,
      events: events,
      selectedEventId: events.length ? events[0].id : null,
      lastAction: null,
      verdict: null,
      lastSummary: null,
      lobbyHistory: meta.lobbyHistory || [],
    };
  }

  const Game = {
    state: null,
    caseIndex: 0,
    day: 1,
    courtTimeMinutes: null,
    spirit: null,
    essence: 0,
    rebirthDaysLeft: null,
    rebirthStones: null,
    lobbyHistory: [],

    labels() {
      return labels();
    },
    systemEnabled(name) {
      return sys(name);
    },
    contentArt() {
      return (Content().art && Content().art.paths) || {};
    },
    contentAudio() {
      return Content().audio || {};
    },
    balance() {
      return bal();
    },
    formatCourtTime(minutes) {
      return formatMinutes(minutes != null ? minutes : this.courtTimeMinutes);
    },

    bootMeta() {
      const rb = bal().rebirth || {};
      const sp = spiritCfg();
      if (this.rebirthDaysLeft == null) this.rebirthDaysLeft = rb.daysLeft != null ? rb.daysLeft : 100;
      if (this.rebirthStones == null) this.rebirthStones = rb.stones != null ? rb.stones : 1;
      if (this.courtTimeMinutes == null) this.courtTimeMinutes = startCourtMinutes();
      if (this.spirit == null) this.spirit = sp.start != null ? sp.start : 10;
      if (this.essence == null) this.essence = 0;
    },

    syncResourcesFromState() {
      const s = this.state;
      if (!s) return;
      if (s.courtTimeMinutes != null) this.courtTimeMinutes = s.courtTimeMinutes;
      if (s.spirit != null) this.spirit = s.spirit;
      if (s.essence != null) this.essence = s.essence;
    },

    enterLobby(options) {
      options = options || {};
      this.bootMeta();
      this.state = {
        phase: "lobby",
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
        courtTimeMaxMinutes: maxCourtMinutes(),
        courtTimeHours: hoursPerDay(),
        spirit: this.spirit,
        spiritMax: (spiritCfg().max != null ? spiritCfg().max : 10),
        essence: this.essence,
        rebirthDaysLeft: this.rebirthDaysLeft,
        rebirthDaysTotal: (bal().rebirth && bal().rebirth.daysTotal) || 100,
        rebirthStones: this.rebirthStones,
        lastSummary: options.summary || (this.lobbyHistory.length ? this.lobbyHistory[this.lobbyHistory.length - 1] : null),
        lobbyHistory: this.lobbyHistory.slice(),
        caseIndex: this.caseIndex,
        nextCaseIndex: this.caseIndex % Math.max(1, caseCount()),
        dayJustAdvanced: !!options.dayJustAdvanced,
      };
      Log.push("lobby_enter", {
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
        spirit: this.spirit,
        essence: this.essence,
        historyLen: this.lobbyHistory.length,
      });
      return this.state;
    },

    startTrial(options) {
      options = options || {};
      this.bootMeta();
      if (!this.canStartTrial()) {
        Log.push("trial_blocked", {
          reason: "no_time",
          courtTimeMinutes: this.courtTimeMinutes,
          day: this.day,
        });
        return null;
      }
      if (options.resetCase) this.caseIndex = 0;
      else if (options.nextCase) this.caseIndex = (this.caseIndex + 1) % Math.max(1, caseCount());
      else if (options.caseIndex != null) this.caseIndex = options.caseIndex;

      this.state = createState(this.caseIndex, {
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
        spirit: this.spirit,
        essence: this.essence,
        rebirthDaysLeft: this.rebirthDaysLeft,
        rebirthStones: this.rebirthStones,
        lobbyHistory: this.lobbyHistory,
      });
      this.caseIndex = this.state.caseIndex;
      Log.startSession(this.state.caseId);
      Log.push("trial_start", {
        caseId: this.state.caseId,
        caseIndex: this.state.caseIndex,
        day: this.day,
        courtTimeMinutes: this.state.courtTimeMinutes,
        spirit: this.state.spirit,
        essence: this.state.essence,
      });
      return this.state;
    },

    /** 법정시간 0이면 다음 재판 불가 — 하루 회복 필요 */
    canStartTrial() {
      this.bootMeta();
      return (this.courtTimeMinutes || 0) > 0;
    },

    startNewRun() {
      const rb = bal().rebirth || {};
      const sp = spiritCfg();
      this.caseIndex = 0;
      this.day = 1;
      this.courtTimeMinutes = startCourtMinutes();
      this.spirit = sp.start != null ? sp.start : 10;
      this.essence = 0;
      this.rebirthDaysLeft = rb.daysLeft != null ? rb.daysLeft : 100;
      this.rebirthStones = rb.stones != null ? rb.stones : 1;
      this.lobbyHistory = [];
      return this.enterLobby();
    },

    /** 하루 종료 → 법정시간만 풀 회복. 영력은 유지. */
    advanceDay() {
      this.bootMeta();
      this.syncResourcesFromState();
      this.day += 1;
      this.rebirthDaysLeft = Math.max(0, (this.rebirthDaysLeft != null ? this.rebirthDaysLeft : 100) - 1);
      this.courtTimeMinutes = startCourtMinutes();
      Log.push("day_advance", {
        day: this.day,
        courtTimeMinutes: this.courtTimeMinutes,
        spirit: this.spirit,
        essence: this.essence,
      });
      return this.enterLobby({ dayJustAdvanced: true, summary: this.lobbyHistory.length ? this.lobbyHistory[this.lobbyHistory.length - 1] : null });
    },

    /** 로비: 영기로 영력 회복 */
    restoreSpirit() {
      this.bootMeta();
      this.syncResourcesFromState();
      const sp = spiritCfg();
      const amount = sp.restoreAmount != null ? sp.restoreAmount : 2;
      const cost = sp.restoreCostEssence != null ? sp.restoreCostEssence : 1;
      const max = sp.max != null ? sp.max : 10;
      if (this.spirit >= max) return { ok: false, reason: "full" };
      if (this.essence < cost) return { ok: false, reason: "no_essence" };
      this.essence -= cost;
      this.spirit = clamp(this.spirit + amount, sp.min != null ? sp.min : 0, max);
      if (this.state && this.state.phase === "lobby") {
        this.state.essence = this.essence;
        this.state.spirit = this.spirit;
      }
      Log.push("spirit_restore", { amount: amount, cost: cost, spirit: this.spirit, essence: this.essence });
      return { ok: true, spirit: this.spirit, essence: this.essence, amount: amount, cost: cost };
    },

    selectEvent(eventId) {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.find(s, eventId);
      if (!ev) return { ok: false, reason: "no_event" };
      s.selectedEventId = eventId;
      Log.push("event_selected", { eventId: eventId });
      return { ok: true, event: ev };
    },

    investigateFact() {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.selected(s);
      if (!ev) return { ok: false, reason: "no_event" };
      if (ev.factRead) return { ok: false, reason: "already", event: ev };

      const cost = this.actionCosts().factTime;
      if (s.courtTimeMinutes < cost) return { ok: false, reason: "no_time", event: ev };

      s.courtTimeMinutes = Math.max(courtCfg().min != null ? courtCfg().min : 0, s.courtTimeMinutes - cost);
      this.courtTimeMinutes = s.courtTimeMinutes;
      ev.factRead = true;

      if (sys("identityReveal") && ev.revealsIdentity && !s.nameRevealed) {
        s.nameRevealed = true;
        s.displayName = s.trueName;
      }

      s.lastAction = { type: "fact", eventId: ev.id, text: ev.factText };
      Log.push("fact_read", {
        eventId: ev.id,
        costMinutes: cost,
        courtTimeMinutes: s.courtTimeMinutes,
        nameRevealed: s.nameRevealed,
      });
      return {
        ok: true,
        event: ev,
        text: ev.factText,
        nameRevealed: s.nameRevealed,
        courtTimeMinutes: s.courtTimeMinutes,
        spirit: s.spirit,
      };
    },

    investigateEmotion() {
      const s = this.state;
      if (!s || s.phase !== "trial") return { ok: false, reason: "bad_phase" };
      const ev = Events.selected(s);
      if (!ev) return { ok: false, reason: "no_event" };
      if (!ev.factRead) return { ok: false, reason: "need_fact", event: ev };
      if (ev.emotionRead) return { ok: false, reason: "already", event: ev };

      const c = this.actionCosts();
      const sp = spiritCfg();
      if (s.courtTimeMinutes < c.emotionTime) return { ok: false, reason: "no_time", event: ev };
      if (s.spirit < c.emotionSpirit) return { ok: false, reason: "no_spirit", event: ev };

      s.courtTimeMinutes = Math.max(courtCfg().min != null ? courtCfg().min : 0, s.courtTimeMinutes - c.emotionTime);
      s.spirit = Math.max(sp.min != null ? sp.min : 0, s.spirit - c.emotionSpirit);
      this.courtTimeMinutes = s.courtTimeMinutes;
      this.spirit = s.spirit;
      ev.emotionRead = true;

      s.lastAction = { type: "emotion", eventId: ev.id, text: ev.emotionText };
      Log.push("emotion_read", {
        eventId: ev.id,
        costMinutes: c.emotionTime,
        costSpirit: c.emotionSpirit,
        courtTimeMinutes: s.courtTimeMinutes,
        spirit: s.spirit,
      });
      return {
        ok: true,
        event: ev,
        text: ev.emotionText,
        courtTimeMinutes: s.courtTimeMinutes,
        spirit: s.spirit,
      };
    },

    openVerdict() {
      const s = this.state;
      if (!s || (s.phase !== "trial" && s.phase !== "verdict")) return { ok: false };
      s.phase = "verdict";
      Log.push("verdict_open", {
        rushed: Karma.isRushed(s),
        reads: Events.countRead(s),
      });
      return { ok: true, rushed: Karma.isRushed(s) };
    },

    submitVerdict(choice, reason) {
      const s = this.state;
      if (!s || s.phase !== "verdict") return { ok: false, reason: "bad_phase" };
      if (choice !== "heaven" && choice !== "hell") return { ok: false, reason: "bad_choice" };

      const reads = Events.countRead(s);
      const rushed = Karma.isRushed(s);
      s.phase = "ended";
      s.verdict = {
        choice: choice,
        reason: reason || "",
        rushed: rushed,
        reads: reads,
      };

      const rewards = bal().rewards || {};
      const essenceGain = rushed
        ? rewards.essenceIfRushed != null
          ? rewards.essenceIfRushed
          : 3
        : rewards.essenceIfNotRushed != null
          ? rewards.essenceIfNotRushed
          : 1;
      this.essence = (this.essence || 0) + essenceGain;
      s.essence = this.essence;

      // 같은 날 자원 유지 — 날짜는 넘기지 않음
      this.courtTimeMinutes = s.courtTimeMinutes;
      this.spirit = s.spirit;
      this.caseIndex = (s.caseIndex + 1) % Math.max(1, caseCount());

      // 환생석: 모든 사실·감정을 열람했을 때만 +1
      const fullyRead =
        reads.total > 0 && reads.facts === reads.total && reads.emotions === reads.total;
      if (fullyRead) this.rebirthStones = (this.rebirthStones || 0) + 1;

      const summary = {
        day: this.day,
        caseId: s.caseId,
        deceasedName: s.nameRevealed ? s.trueName : s.displayName,
        trueName: s.trueName,
        choice: choice,
        rushed: rushed,
        fullyRead: fullyRead,
        factsRead: reads.facts,
        emotionsRead: reads.emotions,
        eventCount: reads.total,
        courtTimeMinutesLeft: s.courtTimeMinutes,
        courtTimeLeftLabel: formatMinutes(s.courtTimeMinutes),
        spiritLeft: s.spirit,
        essenceGain: essenceGain,
        essenceTotal: this.essence,
        rebirthStoneGained: fullyRead ? 1 : 0,
        reason: reason || "",
      };
      s.lastSummary = summary;
      this.lobbyHistory.push(summary);

      Log.push("verdict_submit", summary);
      return { ok: true, verdict: s.verdict, summary: summary };
    },

    finishToLobby() {
      this.syncResourcesFromState();
      const summary = this.state && this.state.lastSummary;
      return this.enterLobby({ summary: summary });
    },

    getSelectedEvent() {
      return this.state && this.state.phase === "trial" ? Events.selected(this.state) : null;
    },

    getReadCounts() {
      return this.state ? Events.countRead(this.state) : { facts: 0, emotions: 0, total: 0 };
    },

    isRushedPreview() {
      return !!(this.state && this.state.phase === "trial" && Karma.isRushed(this.state));
    },

    actionCosts() {
      const ct = courtCfg();
      const sp = spiritCfg();
      return {
        factTime: ct.costFactMinutes != null ? ct.costFactMinutes : 30,
        emotionTime: ct.costEmotionMinutes != null ? ct.costEmotionMinutes : 60,
        emotionSpirit: sp.costEmotion != null ? sp.costEmotion : 2,
      };
    },

    canInvestigateFact() {
      const s = this.state;
      if (!s || s.phase !== "trial") return false;
      const ev = Events.selected(s);
      if (!ev || ev.factRead) return false;
      return s.courtTimeMinutes >= this.actionCosts().factTime;
    },

    canInvestigateEmotion() {
      const s = this.state;
      if (!s || s.phase !== "trial") return false;
      const ev = Events.selected(s);
      if (!ev || !ev.factRead || ev.emotionRead) return false;
      const c = this.actionCosts();
      return s.courtTimeMinutes >= c.emotionTime && s.spirit >= c.emotionSpirit;
    },

    downloadLog() {
      Log.download();
    },
  };

  window.HellCourtGame = Game;
})();

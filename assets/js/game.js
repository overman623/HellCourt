(function () {
  /*
   * 지옥법정 MVP — 게임 코어
   * 각 시스템은 GAME_CONFIG.systems.*.enabled 로 독립 토글
   */
  const Config = () => window.GAME_CONFIG || {};
  const Content = () => window.GAME_CONTENT || {};
  const sys = (id) => !!(Config().systems && Config().systems[id] && Config().systems[id].enabled);
  const bal = () => Config().balance || {};
  const labels = () => Config().labels || {};

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function chanceTable(table, value) {
    if (!table || !table.length) return 0.5;
    const i = clamp(value | 0, 0, table.length - 1);
    return table[i];
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // ---------- Playtest Log ----------
  const Log = {
    enabled() {
      return sys("playtestLog");
    },
    entries: [],
    session: null,
    push(type, payload) {
      if (!this.enabled()) return;
      const row = { t: Date.now(), type: type, payload: payload || {} };
      this.entries.push(row);
      console.info("[HellCourt:log]", type, payload);
    },
    startSession(caseId) {
      this.entries = [];
      this.session = {
        startedAt: Date.now(),
        caseId: caseId,
        verdictEnteredAt: null,
        verdictLeftAt: null,
      };
      this.push("session_start", { caseId: caseId });
    },
    enterVerdict() {
      if (this.session) this.session.verdictEnteredAt = Date.now();
      this.push("verdict_enter", {});
    },
    finishVerdict(choice, reason) {
      if (this.session) this.session.verdictLeftAt = Date.now();
      const dwell =
        this.session && this.session.verdictEnteredAt
          ? (this.session.verdictLeftAt || Date.now()) - this.session.verdictEnteredAt
          : null;
      this.push("verdict_choice", { choice: choice, reason: reason, dwellMs: dwell });
    },
    exportJSON() {
      return JSON.stringify(
        {
          configVersion: Config().version,
          contentVersion: Content().version,
          session: this.session,
          entries: this.entries,
        },
        null,
        2
      );
    },
    download() {
      if (!this.enabled()) return;
      const blob = new Blob([this.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hellcourt-playtest-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };

  // ---------- Stats ----------
  const Stats = {
    apply(state, trustDelta, stressDelta) {
      const b = bal();
      const t = b.trust || { min: 0, max: 10 };
      const s = b.stress || { min: 0, max: 10 };
      const before = { trust: state.trust, stress: state.stress };
      state.trust = clamp(state.trust + (trustDelta || 0), t.min, t.max);
      state.stress = clamp(state.stress + (stressDelta || 0), s.min, s.max);
      Log.push("stat_change", {
        before: before,
        after: { trust: state.trust, stress: state.stress },
        delta: { trust: trustDelta, stress: stressDelta },
      });
      return { trust: state.trust, stress: state.stress };
    },
    atMaxStress(state) {
      const max = (bal().stress && bal().stress.max) || 10;
      return state.stress >= max;
    },
  };

  // ---------- Stress guard (high-stress dampen + relief draw) ----------
  const StressGuard = {
    dampenFrom() {
      const s = bal().stress || {};
      return s.dampenFrom != null ? s.dampenFrom : 8;
    },
    maxPositiveDelta() {
      const s = bal().stress || {};
      return s.maxPositiveDelta != null ? s.maxPositiveDelta : 1;
    },
    // 현재 스트레스가 위험 구간이면 양의 증가만 상한
    dampPositive(state, stressDelta) {
      const d = stressDelta || 0;
      if (d <= 0 || !state) return { stressDelta: d, dampened: false };
      if (state.stress < this.dampenFrom()) return { stressDelta: d, dampened: false };
      const cap = this.maxPositiveDelta();
      if (d <= cap) return { stressDelta: d, dampened: false };
      return { stressDelta: cap, dampened: true, before: d };
    },
    isReliefCard(card) {
      return !!(card && (card.stressDelta || 0) < 0);
    },
    handHasRelief(state) {
      if (!state || !state.hand) return false;
      for (let i = 0; i < state.hand.length; i++) {
        if (this.isReliefCard(Hand.cardById(state.hand[i]))) return true;
      }
      return false;
    },
    needsRelief(state) {
      return !!(state && state.stress >= this.dampenFrom() && !this.handHasRelief(state));
    },
  };

  // ---------- Unlock rolls ----------
  const Unlock = {
    chance(state, type) {
      const b = bal();
      if (type === "FACT") {
        if (!sys("trustUnlock")) return 1;
        let p = chanceTable(b.factUnlockChanceByTrust, state.trust);
        if (b.failStreakBonus && b.failStreakBonus.enabled) {
          p = Math.min(1, p + Math.min(b.failStreakBonus.maxBonus, state.failStreakFact * b.failStreakBonus.perFail));
        }
        return p;
      }
      if (type === "EMOTION") {
        if (!sys("emotionUnlock")) return 1;
        let p = chanceTable(b.emotionUnlockChanceByStress, state.stress);
        if (b.failStreakBonus && b.failStreakBonus.enabled) {
          p = Math.min(
            1,
            p + Math.min(b.failStreakBonus.maxBonus, state.failStreakEmotion * b.failStreakBonus.perFail)
          );
        }
        return p;
      }
      return 0;
    },
    roll(state, type, rng) {
      const p = this.chance(state, type);
      const r = rng();
      const success = r < p;
      Log.push("unlock_roll", { type: type, p: p, roll: r, success: success });
      if (type === "FACT") state.failStreakFact = success ? 0 : state.failStreakFact + 1;
      if (type === "EMOTION") state.failStreakEmotion = success ? 0 : state.failStreakEmotion + 1;
      return { success: success, p: p, roll: r };
    },
  };

  // ---------- Events / info ----------
  const Events = {
    find(state, id) {
      return state.events.find(function (e) {
        return e.id === id;
      });
    },
    selected(state) {
      return this.find(state, state.selectedEventId);
    },
    nextHidden(list) {
      for (let i = 0; i < list.length; i++) {
        if (!list[i].revealed) return list[i];
      }
      return null;
    },
    allRevealed(list) {
      return list.every(function (x) {
        return x.revealed;
      });
    },
    listOf(state, kind) {
      const ev = this.selected(state);
      if (!ev) return [];
      return kind === "FACT" ? ev.facts || [] : ev.emotions || [];
    },
    hiddenChoices(state, kind) {
      return this.listOf(state, kind).filter(function (x) {
        return x && !x.revealed;
      });
    },
    applyRevealSideEffects(state, kind, info, result) {
      if (kind === "EMOTION" && info.unlocksEventId && sys("eventLinkFromEmotion")) {
        const linked = this.find(state, info.unlocksEventId);
        if (linked && !linked.unlocked) {
          linked.unlocked = true;
          result.unlockedEventId = linked.id;
          Log.push("event_unlocked", { eventId: linked.id, fromEmotionId: info.id });
        }
      }

      if (kind === "FACT" && sys("identityReveal") && info.id === state.identityFactId) {
        state.nameRevealed = true;
        state.displayName = state.trueName;
        state.courtName = state.trueName + " 법정";
        try {
          localStorage.setItem("hellcourt.court." + (state.deceasedId || state.caseId), state.courtName);
        } catch (e) {}
        result.nameRevealed = true;
        Log.push("name_revealed", { name: state.trueName, fromFactId: info.id });
      }
    },
    revealById(state, kind, infoId) {
      const ev = this.selected(state);
      if (!ev) return { ok: false, reason: "no_event" };
      const list = this.listOf(state, kind);
      const info = list.find(function (x) {
        return x.id === infoId;
      });
      if (!info) return { ok: false, reason: "no_info" };
      if (info.revealed) return { ok: false, reason: "already", info: info, event: ev };

      info.revealed = true;
      Log.push("info_revealed", {
        eventId: ev.id,
        kind: kind,
        infoId: info.id,
        text: info.text,
        chosen: true,
      });

      const result = {
        ok: true,
        event: ev,
        info: info,
        kind: kind,
        unlockedEventId: null,
        nameRevealed: false,
      };
      this.applyRevealSideEffects(state, kind, info, result);
      return result;
    },
    revealNext(state, kind) {
      const next = this.nextHidden(this.listOf(state, kind));
      if (!next) {
        const ev = this.selected(state);
        return { ok: false, reason: "complete", event: ev };
      }
      return this.revealById(state, kind, next.id);
    },
  };

  // ---------- Hand / deck ----------
  const Hand = {
    cardById(id) {
      const cards = Content().questionCards || [];
      return cards.find(function (c) {
        return c.id === id;
      });
    },
    buildDeck(rng) {
      const ids = (Content().questionCards || []).map(function (c) {
        return c.id;
      });
      return shuffle(ids, rng);
    },
    drawOne(state, rng) {
      if (!sys("handDraw") && state.hand.length) return null;
      if (!state.deck.length) {
        // TODO(스펙§13): 교체/재셔플 규칙 미확정 — 임시로 폐기 더미 재사용
        state.deck = shuffle(state.discard.slice(), rng);
        state.discard = [];
        Log.push("deck_reshuffle", { size: state.deck.length });
      }
      if (!state.deck.length) return null;

      let id = null;
      let reliefPriority = false;
      if (StressGuard.needsRelief(state)) {
        const idx = state.deck.findIndex(function (cid) {
          return StressGuard.isReliefCard(Hand.cardById(cid));
        });
        if (idx >= 0) {
          id = state.deck.splice(idx, 1)[0];
          reliefPriority = true;
        }
      }
      if (!id) id = state.deck.shift();

      state.hand.push(id);
      Log.push("card_drawn", { cardId: id, reliefPriority: reliefPriority });
      return id;
    },
    dealInitial(state, rng) {
      const size = (bal().handSize || 5);
      state.hand = [];
      state.deck = this.buildDeck(rng);
      state.discard = [];

      if (sys("initialHandBalance")) {
        const fact = state.deck.find(function (id) {
          const c = Hand.cardById(id);
          return c && c.type === "FACT";
        });
        const emotion = state.deck.find(function (id) {
          const c = Hand.cardById(id);
          return c && c.type === "EMOTION";
        });
        const pick = [];
        if (fact) {
          state.deck = state.deck.filter(function (id) {
            return id !== fact;
          });
          pick.push(fact);
        }
        if (emotion) {
          state.deck = state.deck.filter(function (id) {
            return id !== emotion;
          });
          pick.push(emotion);
        }
        while (pick.length < size && state.deck.length) {
          pick.push(state.deck.shift());
        }
        state.hand = pick;
        Log.push("initial_hand", { hand: state.hand.slice(), balanced: true });
        return;
      }

      for (let i = 0; i < size; i++) this.drawOne(state, rng);
      Log.push("initial_hand", { hand: state.hand.slice(), balanced: false });
    },
    play(state, handIndex, rng, options) {
      options = options || {};
      if (handIndex < 0 || handIndex >= state.hand.length) return null;
      const cardId = state.hand.splice(handIndex, 1)[0];
      state.discard.push(cardId);
      Log.push("card_played", { cardId: cardId, eventId: state.selectedEventId });
      // 스탯 적용 후 드로우하려면 options.draw === false
      if (sys("handDraw") && options.draw !== false) this.drawOne(state, rng);
      return this.cardById(cardId);
    },
  };

  // ---------- Values (card ↔ deceased resonance) ----------
  const Values = {
    matches(state, card) {
      if (!state || !card || !card.value) return false;
      const list = state.values || [];
      return list.indexOf(card.value) >= 0;
    },
    // 0이 아닌 스탯 효과를 동일 방향으로 1씩 강화
    amplify(delta) {
      const d = delta || 0;
      if (d === 0) return 0;
      return d > 0 ? d + 1 : d - 1;
    },
    resolveDeltas(state, card) {
      const baseTrust = card.trustDelta || 0;
      const baseStress = card.stressDelta || 0;
      const matched = this.matches(state, card);
      let trustDelta = baseTrust;
      let stressDelta = baseStress;
      if (matched) {
        trustDelta = this.amplify(baseTrust);
        stressDelta = this.amplify(baseStress);
      }
      const damp = StressGuard.dampPositive(state, stressDelta);
      return {
        matched: matched,
        value: card.value || null,
        trustDelta: trustDelta,
        stressDelta: damp.stressDelta,
        stressDampened: damp.dampened,
        stressBeforeDamp: damp.dampened ? damp.before : damp.stressDelta,
      };
    },
  };

  // ---------- Soul break ----------
  const Soul = {
    check(state) {
      if (!sys("soulBreak")) return false;
      if (state.soulBroken) return false;
      if (!Stats.atMaxStress(state)) return false;
      state.soulBroken = true;
      state.phase = "verdict";
      Log.push("soul_break", { trust: state.trust, stress: state.stress });
      return true;
    },
  };

  // ---------- Court time expiry ----------
  const CourtTime = {
    check(state) {
      if (!sys("courtTimeGauge")) return false;
      if (state.timeExpired) return false;
      if (state.courtTime > 0) return false;
      state.timeExpired = true;
      state.phase = "verdict";
      Log.push("court_time_expired", { trust: state.trust, stress: state.stress, courtTime: state.courtTime });
      return true;
    },
  };

  // ---------- Karma (UI-only rushed verdict) ----------
  const Karma = {
    countRevealed(state) {
      if (!state || !state.events) return 0;
      let n = 0;
      state.events.forEach(function (ev) {
        (ev.facts || []).forEach(function (f) {
          if (f.revealed) n++;
        });
        (ev.emotions || []).forEach(function (f) {
          if (f.revealed) n++;
        });
      });
      return n;
    },
    minRequired() {
      const k = bal().karma || {};
      return k.minRevealedKeywords != null ? k.minRevealedKeywords : 3;
    },
    evaluate(state) {
      const revealedCount = this.countRevealed(state);
      const min = this.minRequired();
      const enabled = sys("karmaUi");
      const rushed = enabled && revealedCount < min;
      return { rushed: rushed, revealedCount: revealedCount, min: min, enabled: enabled };
    },
  };

  function interrogationLocked(state) {
    return !!(state && (state.soulBroken || state.timeExpired));
  }

  function caseCount() {
    const c = Content();
    if (c.cases && c.cases.length) return c.cases.length;
    return 1;
  }

  function resolveCasePack(caseIndex) {
    const c = Content();
    if (c.cases && c.cases.length) {
      const n = c.cases.length;
      const i = ((caseIndex % n) + n) % n;
      return { index: i, pack: c.cases[i] };
    }
    return {
      index: 0,
      pack: {
        id: (c.deceased && c.deceased.id) || "legacy",
        deceased: c.deceased || {},
        identityFactId: c.identityFactId || null,
        achievements: c.achievements || [],
        events: c.events || [],
      },
    };
  }

  // ---------- Controller ----------
  function createState(rng, caseIndex) {
    const resolved = resolveCasePack(caseIndex == null ? 0 : caseIndex);
    const pack = resolved.pack || {};
    const b = bal();
    const deceased = pack.deceased || {};
    const events = (pack.events || []).map(function (ev) {
      return {
        id: ev.id,
        title: ev.title,
        summary: ev.summary || "",
        unlocked: !!ev.startUnlocked,
        facts: (ev.facts || []).map(function (f) {
          return {
            id: f.id,
            keyword: f.keyword || null,
            text: f.text,
            revealed: false,
          };
        }),
        emotions: (ev.emotions || []).map(function (em) {
          return {
            id: em.id,
            keyword: em.keyword || null,
            text: em.text,
            revealed: false,
            unlocksEventId: em.unlocksEventId || null,
          };
        }),
      };
    });

    const startEvent = events.find(function (e) {
      return e.unlocked;
    });

    const deceasedId = deceased.id || pack.id || "unknown";
    const savedCourt = (function () {
      try {
        return localStorage.getItem("hellcourt.court." + deceasedId);
      } catch (e) {
        return null;
      }
    })();

    const baseCourt = deceased.courtName || "ㅁㅁ법정";

    return {
      phase: "interrogation", // interrogation | verdict | ended
      caseId: pack.id || deceasedId,
      caseIndex: resolved.index,
      deceasedId: deceasedId,
      trueName: deceased.trueName || "???",
      displayName: labels().anonymousName || deceased.anonymousLabel || "이름 불명",
      courtName: savedCourt || baseCourt,
      defaultCourtName: baseCourt,
      nameRevealed: false,
      intro: deceased.intro || "",
      profileNote: deceased.profileNote || "",
      values: (deceased.values || []).slice(),
      trust: (b.trust && b.trust.start) || 5,
      stress: (b.stress && b.stress.start) || 5,
      courtTime: (b.courtTime && b.courtTime.start) || 10,
      courtTimeMax: (b.courtTime && b.courtTime.max) || 10,
      events: events,
      selectedEventId: startEvent ? startEvent.id : null,
      identityFactId: pack.identityFactId || null,
      achievements: (pack.achievements || []).slice(),
      hand: [],
      deck: [],
      discard: [],
      soulBroken: false,
      timeExpired: false,
      failStreakFact: 0,
      failStreakEmotion: 0,
      lastResult: null,
      pendingReveal: null,
      guidePhase: "trial_start", // trial_start | pick_card | card_selected
      rng: rng || Math.random,
    };
  }

  const Game = {
    state: null,
    caseIndex: 0,
    log: Log,

    systemEnabled: sys,
    labels: labels,
    config: Config,
    content: Content,

    activeCase() {
      return resolveCasePack(this.caseIndex).pack;
    },

    start(rng, options) {
      options = options || {};
      const total = caseCount();
      if (options.resetCase) this.caseIndex = 0;
      else if (options.nextCase) this.caseIndex = (this.caseIndex + 1) % total;
      else if (options.caseIndex != null) this.caseIndex = options.caseIndex;

      this.state = createState(rng || Math.random, this.caseIndex);
      this.caseIndex = this.state.caseIndex;
      try {
        localStorage.setItem("hellcourt.court." + this.state.deceasedId, this.state.courtName);
      } catch (e) {}
      Log.startSession(this.state.caseId || "unknown");
      Hand.dealInitial(this.state, this.state.rng);
      Log.push("trial_start", {
        selectedEventId: this.state.selectedEventId,
        trust: this.state.trust,
        stress: this.state.stress,
        courtName: this.state.courtName,
        caseId: this.state.caseId,
        caseIndex: this.state.caseIndex,
      });
      return this.state;
    },

    selectEvent(eventId) {
      const s = this.state;
      if (!s || s.phase !== "interrogation" || interrogationLocked(s)) return { ok: false, reason: "locked" };
      const ev = Events.find(s, eventId);
      if (!ev || !ev.unlocked) return { ok: false, reason: "locked_event" };
      s.selectedEventId = eventId;
      if (s.guidePhase === "trial_start") s.guidePhase = "pick_card";
      Log.push("event_selected", { eventId: eventId });
      return { ok: true, event: ev };
    },

    setGuideCardFocus(handIndex) {
      const s = this.state;
      if (!s) return;
      if (interrogationLocked(s)) return;
      if (handIndex == null || handIndex < 0) {
        s.guidePhase = s.selectedEventId ? "pick_card" : "trial_start";
        return;
      }
      s.guidePhase = "card_selected";
      s.guideCardIndex = handIndex;
    },

    /**
     * 질문 카드 사용
     * 순서: 스탯 변화 → 법정시간 → 해금 판정 → 공개 → 영혼 파괴/시간 만료 검사 → 손패 교체
     */
    useCard(handIndex) {
      const s = this.state;
      if (!s || s.phase !== "interrogation" || interrogationLocked(s)) {
        return { ok: false, reason: interrogationLocked(s) ? "locked" : "bad_phase" };
      }
      if (!s.selectedEventId) return { ok: false, reason: "no_event" };

      const cardId = s.hand[handIndex];
      const preview = Hand.cardById(cardId);
      if (!preview) return { ok: false, reason: "no_card" };

      const ev = Events.selected(s);
      const kind = preview.type;
      const list = kind === "FACT" ? ev.facts : ev.emotions;
      if (Events.allRevealed(list)) {
        return { ok: false, reason: "info_complete", card: preview, event: ev };
      }

      const card = Hand.play(s, handIndex, s.rng, { draw: false });
      const deltas = Values.resolveDeltas(s, card);
      Stats.apply(s, deltas.trustDelta, deltas.stressDelta);
      if (deltas.matched) {
        Log.push("value_resonance", {
          value: deltas.value,
          base: { trust: card.trustDelta || 0, stress: card.stressDelta || 0 },
          applied: { trust: deltas.trustDelta, stress: deltas.stressDelta },
        });
      }
      if (deltas.stressDampened) {
        Log.push("stress_dampened", {
          from: deltas.stressBeforeDamp,
          to: deltas.stressDelta,
          stress: s.stress,
          dampenFrom: StressGuard.dampenFrom(),
        });
      }
      if (sys("handDraw")) Hand.drawOne(s, s.rng);

      if (sys("courtTimeGauge")) {
        const ct = bal().courtTime || {};
        const cost = ct.costPerQuestion != null ? ct.costPerQuestion : 1;
        const min = ct.min != null ? ct.min : 0;
        s.courtTime = Math.max(min, s.courtTime - cost);
        Log.push("court_time", { courtTime: s.courtTime, cost: cost });
      }

      s.guidePhase = "pick_card";
      s.pendingReveal = null;

      const roll = Unlock.roll(s, kind, s.rng);
      let reveal = null;
      let needChoose = false;
      let choices = [];

      if (roll.success) {
        choices = Events.hiddenChoices(s, kind).map(function (info) {
          return {
            id: info.id,
            keyword: info.keyword || (kind === "FACT" ? "사실" : "감정"),
            unlocksEventId: info.unlocksEventId || null,
          };
        });
        if (choices.length === 1) {
          reveal = Events.revealById(s, kind, choices[0].id);
        } else if (choices.length > 1) {
          needChoose = true;
          s.pendingReveal = {
            kind: kind,
            eventId: ev.id,
            choiceIds: choices.map(function (c) {
              return c.id;
            }),
          };
          Log.push("reveal_choice_open", { kind: kind, choices: choices.map(function (c) {
            return c.id;
          }) });
        }
      }

      // 키워드 선택은 획득한 해금이므로, 선택 대기 중에는 강제 판결을 미룸
      let broken = false;
      let timeOut = false;
      if (!needChoose) {
        broken = Soul.check(s);
        timeOut = !broken && CourtTime.check(s);
        if (broken || timeOut) Log.enterVerdict();
      }

      const result = {
        ok: true,
        card: card,
        roll: roll,
        reveal: reveal,
        needChoose: needChoose,
        choices: choices,
        soulBroken: broken,
        timeExpired: timeOut || s.timeExpired,
        trust: s.trust,
        stress: s.stress,
        hand: s.hand.slice(),
        valueMatch: deltas.matched,
        value: deltas.value,
        appliedDeltas: { trust: deltas.trustDelta, stress: deltas.stressDelta },
        stressDampened: !!deltas.stressDampened,
      };
      s.lastResult = result;
      return result;
    },

    confirmReveal(infoId) {
      const s = this.state;
      if (!s || !s.pendingReveal) return { ok: false, reason: "no_pending" };
      const pending = s.pendingReveal;
      if (pending.choiceIds.indexOf(infoId) < 0) return { ok: false, reason: "bad_choice" };

      const reveal = Events.revealById(s, pending.kind, infoId);
      s.pendingReveal = null;
      Log.push("reveal_choice_confirm", { infoId: infoId, kind: pending.kind });

      const broken = Soul.check(s);
      const timeOut = !broken && CourtTime.check(s);
      if (broken || timeOut) Log.enterVerdict();

      const result = {
        ok: !!reveal.ok,
        reveal: reveal,
        soulBroken: broken,
        timeExpired: timeOut || s.timeExpired,
        trust: s.trust,
        stress: s.stress,
      };
      s.lastResult = result;
      return result;
    },

    hasPendingReveal() {
      return !!(this.state && this.state.pendingReveal);
    },

    openVerdict(forced) {
      const s = this.state;
      if (!s) return { ok: false };
      if (s.phase === "ended") return { ok: false, reason: "ended" };
      s.phase = "verdict";
      Log.enterVerdict();
      Log.push("verdict_open", {
        forced: !!forced,
        soulBroken: s.soulBroken,
        timeExpired: s.timeExpired,
        karma: Karma.evaluate(s),
      });
      return { ok: true };
    },

    submitVerdict(choice, reason) {
      const s = this.state;
      if (!s || s.phase !== "verdict") return { ok: false, reason: "bad_phase" };
      if (choice !== "guilty" && choice !== "innocent") return { ok: false, reason: "bad_choice" };
      s.phase = "ended";
      const karma = Karma.evaluate(s);
      s.verdict = {
        choice: choice,
        reason: reason || "",
        karma: karma,
      };
      try {
        localStorage.setItem("hellcourt.court." + (s.deceasedId || s.caseId), s.courtName);
      } catch (e) {}
      Log.finishVerdict(choice, reason || "");
      Log.push("verdict_karma", karma);
      return { ok: true, verdict: s.verdict };
    },

    countRevealedKeywords() {
      return Karma.countRevealed(this.state);
    },

    karmaPreview() {
      return Karma.evaluate(this.state);
    },

    isInterrogationLocked() {
      return interrogationLocked(this.state);
    },

    getHandCards() {
      const s = this.state;
      if (!s) return [];
      return s.hand.map(function (id) {
        return Hand.cardById(id);
      }).filter(Boolean);
    },

    getSelectedEvent() {
      return this.state ? Events.selected(this.state) : null;
    },

    infoComplete(kind) {
      const ev = this.getSelectedEvent();
      if (!ev) return false;
      return Events.allRevealed(kind === "FACT" ? ev.facts : ev.emotions);
    },

    unlockChancePreview(type) {
      if (!this.state) return 0;
      // 카드 적용 전 미리보기용 — 실제 판정은 적용 후 수치
      return Unlock.chance(this.state, type);
    },

    riskPreview(card) {
      if (!this.state || !card) return null;
      const b = bal();
      const tMax = (b.trust && b.trust.max) || 10;
      const sMax = (b.stress && b.stress.max) || 10;
      const deltas = Values.resolveDeltas(this.state, card);
      const nextTrust = clamp(this.state.trust + deltas.trustDelta, (b.trust && b.trust.min) || 0, tMax);
      const nextStress = clamp(this.state.stress + deltas.stressDelta, (b.stress && b.stress.min) || 0, sMax);
      const fake = {
        trust: nextTrust,
        stress: nextStress,
        failStreakFact: this.state.failStreakFact,
        failStreakEmotion: this.state.failStreakEmotion,
      };
      const p = Unlock.chance(fake, card.type);
      const soulRisk = sys("soulBreak") && nextStress >= sMax;
      return {
        nextTrust: nextTrust,
        nextStress: nextStress,
        unlockP: p,
        soulRisk: soulRisk,
        valueMatch: deltas.matched,
        value: deltas.value,
        trustDelta: deltas.trustDelta,
        stressDelta: deltas.stressDelta,
        stressDampened: !!deltas.stressDampened,
      };
    },

    cardDeltas(card) {
      if (!card) return null;
      return Values.resolveDeltas(this.state, card);
    },

    stressDampenFrom() {
      return StressGuard.dampenFrom();
    },

    isHighStress() {
      return !!(this.state && this.state.stress >= StressGuard.dampenFrom());
    },

    downloadLog() {
      Log.download();
    },
  };

  window.HellCourtGame = Game;
})();

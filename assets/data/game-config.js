(function () {
  /*
   * 지옥법정 — 개정 룰 MVP 밸런스/토글
   * 법정시간: 하루 8시간(분 단위 소모), 같은 날 재판 간 유지, 날짜 변경 시에만 회복
   * 영력: 자동 회복 없음, 재판 후 재화(영기)로만 회복
   */
  window.GAME_CONFIG = {
    version: "mvp-revision-2026-08-04b",

    systems: {
      playtestLog: { enabled: true },
      courtTimeGauge: { enabled: true },
      spiritGauge: { enabled: true },
      verdictReason: { enabled: true },
      karmaUi: { enabled: true },
      identityReveal: { enabled: true },
      bgm: { enabled: true },
      uiSelectSfx: { enabled: true },
      uiConfirmSfx: { enabled: true },
    },

    balance: {
      // 하루 8시간 = 480분. HUD 세그먼트는 시간(8칸).
      courtTime: {
        min: 0,
        hoursPerDay: 8,
        maxMinutes: 480,
        startMinutes: 480,
        costFactMinutes: 30,
        costEmotionMinutes: 15,
      },
      spirit: {
        min: 0,
        max: 10,
        start: 10,
        costEmotion: 2,
        // 로비에서 영기로 회복
        restoreAmount: 2,
        restoreCostEssence: 1,
      },
      rewards: {
        // 판결 후 영기: 성급할수록 많음(기운을 덜 씀) / 충분히 열람하면 적음
        essenceIfRushed: 3,
        essenceIfNotRushed: 1,
      },
      rebirth: {
        daysTotal: 10,
        daysLeft: 10,
        stones: 1,
        // 로비: 영기 → 환생석
        stoneCostEssence: 1,
        stoneBuyAmount: 1,
      },
      karma: { minReadRatio: 0.35 },
      bgmVolume: 0.45,
      sfxVolume: 0.55,
    },

    labels: {
      anonymousName: "이름 불명",
      courtName: "공정의 법정",
      courtTime: "법정시간",
      spirit: "영 력",
      essence: "영기",
      factAction: "사실 조사하기",
      emotionAction: "감정 들여다 보기",
      heaven: "천국",
      hell: "지옥",
      timeExpired: "법정 시간이 거의 없습니다. 판결을 고려하십시오.",
      timeExhaustedNeedDay: "법정시간이 소진되었습니다. 하루를 마쳐 법정시간을 회복하십시오.",
      spiritLow: "영력이 부족하여 감정을 들여다볼 수 없습니다.",
      needFactFirst: "먼저 사실을 조사해야 감정을 물을 수 있습니다.",
      karmaWarn: "아직 알아본 것이 적습니다. 성급한 판결은 업보가 됩니다.",
      karmaEnd: "업보 — 충분히 알아보지 않고 판결하였다.",
      dayEnded: "하루가 지나 법정시간이 회복되었습니다.",
      spiritRestored: "영력을 회복했습니다.",
      stoneBought: "환생석을 구입했습니다.",
      essenceLow: "영기가 부족합니다.",
    },
  };
})();

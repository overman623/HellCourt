(function () {
  /*
   * 지옥법정 — 현재 기획 기준 HTML5 프로토타입 설정
   * 핵심 자원은 법정시간 하나이며, 정확한 수치는 프로토타입 튜닝값이다.
   */
  window.GAME_CONFIG = {
    version: "current-rules-prototype-2026-08-13",

    systems: {
      playtestLog: { enabled: true },
      courtTimeGauge: { enabled: true },
      verdictReason: { enabled: true },
      bgm: { enabled: true },
      uiSelectSfx: { enabled: true },
      uiConfirmSfx: { enabled: true },
    },

    balance: {
      courtTime: {
        min: 0,
        hoursPerDay: 8,
        maxMinutes: 480,
        startMinutes: 480,
        costContextMinutes: 10,
        costIntentMinutes: 5,
      },
      bgmVolume: 0.45,
      sfxVolume: 0.55,
    },

    labels: {
      courtName: "공정의 법정",
      courtTime: "법정시간",
      contextAction: "추가 사실 CONTEXT 조사",
      intentAction: "감정과 의도 확인",
      heaven: "천국",
      hell: "지옥",
      timeExpired: "남은 법정시간이 부족합니다.",
      needContextFirst: "먼저 CONTEXT를 조사해야 합니다.",
      dayEnded: "하루가 지나 법정시간과 금일 공판이 갱신되었습니다.",
    },
  };
})();

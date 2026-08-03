(function () {
  /*
   * 지옥법정 — 밸런스/시스템 토글 (플레이테스트용)
   * systems.*.enabled 로 개별 끄기/교체 가능
   * 여기 수치는 '확정 규칙'이 아니라 초기 테스트 상수 (스펙 §13)
   */
  window.GAME_CONFIG = {
    version: "mvp-2026-08-02",

    systems: {
      trustUnlock: { enabled: true }, // 사실 해금 판정
      emotionUnlock: { enabled: true }, // 감정 해금 판정
      soulBreak: { enabled: true }, // 스트레스 최대 → 영혼 파괴
      identityReveal: { enabled: true }, // 정체 사실 → 이름 공개
      eventLinkFromEmotion: { enabled: true }, // 감정 → 새 인생사건 확정 해금
      handDraw: { enabled: true }, // 사용 후 1장 재공급
      initialHandBalance: { enabled: true }, // 최초 손패 FACT+EMOTION 보장
      verdictReason: { enabled: true }, // 판결 이유 입력
      playtestLog: { enabled: true }, // 세션 로그 / JSON 다운로드
      courtTimeGauge: { enabled: true }, // 법정시간 표시·소모·0시 강제 판결
      karmaUi: { enabled: true }, // 조기 판결 업보 UI (채점/엔딩 분기 없음)
      bgm: { enabled: true },
      uiSelectSfx: { enabled: true },
      uiConfirmSfx: { enabled: true },
    },

    balance: {
      trust: { min: 0, max: 10, start: 5 },
      // start 낮춤 + 고구간 댐핑으로 조기 영혼 파괴 완화
      stress: { min: 0, max: 10, start: 3, dampenFrom: 8, maxPositiveDelta: 1 },
      courtTime: { min: 0, max: 10, start: 10, costPerQuestion: 1 },
      // 공개 키워드(사실+감정)가 이 미만이면 업보 UI
      karma: { minRevealedKeywords: 3 },
      // 재판 중 동시에 보이는 손패 상한 (전체 카드 풀 개수와 무관)
      handSize: 5,
      bgmVolume: 0.45,
      sfxVolume: 0.55,
      // index = 스탯 현재값 → 해금 성공 확률 (0~1)
      // TODO(스펙§13): 공식 확정 전 테스트용 테이블
      factUnlockChanceByTrust: [0.15, 0.2, 0.25, 0.32, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.95],
      emotionUnlockChanceByStress: [0.15, 0.2, 0.25, 0.32, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.95],
      // TODO(스펙§13): 연속 실패 보정 — 시스템 자리만 확보, 기본 무보정
      failStreakBonus: { enabled: false, perFail: 0.05, maxBonus: 0.25 },
    },

    labels: {
      anonymousName: "이름 불명",
      trust: "신뢰",
      stress: "스트레스",
      fact: "사실",
      emotion: "감정",
      soulBroken: "영혼 파괴 — 추가 심문 불가. 판결하십시오.",
      timeExpired: "법정 시간이 끝났습니다. 판결하십시오.",
      karmaWarn: "아직 알아본 것이 적습니다. 성급한 판결은 업보가 됩니다.",
      karmaEnd: "업보 — 알아보지도 않고 판결하였다.",
    },
  };
})();

/**
 * 일일 케어 현황 (Daily Care Status) - Main SPA Controller
 */

class App {
  constructor() {
    this.currentDateStr = CONFIG.getKSTDateString();
    this.currentYearMonth = CONFIG.getKSTYearMonthString();
    this.reportMode = 'daily';
    this.reportDateStr = this.currentDateStr;
    this.pinPadController = null;
    this.signupPinPadController = null;
    this.selectedCondition = '상';
    this.selectedMeal = '잘 드심';
    this.selectedStoolType = '부드러움';
  }

  init() {
    console.log('App Initializing...');
    this.bindEvents();
    this.bindDateAutoSync();
    this.initPinPads();
    this.checkAuthAndRender();
  }

  // Toast 메시지 출력
  showToast(message, type = 'info') {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} active`;
    setTimeout(() => {
      toast.classList.remove('active');
    }, 3000);
  }

  // Auth 상태 체크 후 적절한 화면으로 라우팅
  checkAuthAndRender() {
    const user = store.currentUser;
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const bottomNav = document.getElementById('bottomNav');
    const userHeaderInfo = document.getElementById('userHeaderInfo');
    const navCaregiverWriteBtn = document.getElementById('navCaregiverWriteBtn');

    if (!user) {
      authSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      if (bottomNav) bottomNav.style.display = 'none';
      if (userHeaderInfo) userHeaderInfo.style.display = 'none';
      return;
    }

    if (userHeaderInfo) {
      userHeaderInfo.style.display = 'flex';
      document.getElementById('headerUserName').textContent = `${user.name} (${user.role})`;
      document.getElementById('headerElderName').textContent = user.elder_name || `${user.name} 댁 어르신`;
    }

    authSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';
    if (bottomNav) bottomNav.style.display = 'flex';

    this.updateStatusDate(this.currentDateStr);

    // 요양보호사 및 가족 회원 모두 케어 작성 탭 이용 가능 (주말/휴가 가족 직접 입력)
    if (navCaregiverWriteBtn) {
      navCaregiverWriteBtn.style.display = 'flex';
      const labelSpan = navCaregiverWriteBtn.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = '케어 작성';
      }
    }

    const noticeText = document.getElementById('writeNoticeText');
    if (noticeText) {
      noticeText.textContent = user.role === '가족' 
        ? '토요일·일요일 주말이나 요양보호사 휴가 시에는 가족이 직접 케어 현황(혈압, 체온, 식사, 배변 등)을 입력하실 수 있습니다.'
        : '평일에는 요양보호사님이 작성하시며, 토요일·일요일 주말이나 휴가 시에는 가족이 직접 케어 현황을 입력할 수 있습니다.';
    }

    if (user.role === '요양보호사') {
      this.switchView('caregiverWriteView');
      this.loadCaregiverDashboard();
    } else {
      this.switchView('todaySummaryView');
      this.loadFamilyDashboard();
    }
  }

  // 대한민국 표준시(KST) 자동 동기화 바인딩
  bindDateAutoSync() {
    // 탭 전환/브라우저 복귀 시 자동 감지
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkAndUpdateCurrentDate();
      }
    });

    window.addEventListener('focus', () => {
      this.checkAndUpdateCurrentDate();
    });

    // 1분 간격 자정 넘어감 자동 감지
    setInterval(() => {
      this.checkAndUpdateCurrentDate();
    }, 60000);
  }

  // 날짜 변경 감지 및 유기적 뷰/데이터 갱신 헬퍼
  checkAndUpdateCurrentDate() {
    const latestKSTDate = CONFIG.getKSTDateString();
    if (this.currentDateStr !== latestKSTDate) {
      console.log(`[KST Date Auto-Sync] Date changed: ${this.currentDateStr} -> ${latestKSTDate}`);
      this.currentDateStr = latestKSTDate;
      this.currentYearMonth = CONFIG.getKSTYearMonthString();
      this.updateStatusDate(this.currentDateStr);

      if (store.currentUser) {
        if (store.currentUser.role === '요양보호사') {
          this.loadCaregiverDashboard();
        } else {
          this.loadFamilyDashboard();
        }
      }
      return true;
    }
    return false;
  }

  // 뷰 패널 전환 (요양보호사 & 가족 공용)
  switchView(targetView) {
    this.checkAndUpdateCurrentDate();

    document.querySelectorAll('.view-pane').forEach(pane => pane.style.display = 'none');
    const activePane = document.getElementById(targetView);
    if (activePane) activePane.style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-target') === targetView) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    if (targetView === 'caregiverWriteView') {
      this.loadCaregiverDashboard();
    } else if (targetView === 'todaySummaryView') {
      this.loadReportData();
    } else if (targetView === 'calendarView') {
      this.refreshFamilyCalendar();
    } else if (targetView === 'trendView') {
      this.refreshFamilyTrendChart();
    }
  }

  // 어르신 코드 안전 획득 헬퍼 (로그인 유무 상관없이 안전 반환)
  getElderCode() {
    const user = store.currentUser;
    if (user && user.elder_code) return user.elder_code;
    try {
      const localElders = JSON.parse(localStorage.getItem(CONFIG.KEYS.LOCAL_ELDERS) || '[]');
      if (localElders.length > 0 && localElders[0].elder_code) {
        return localElders[0].elder_code;
      }
    } catch (e) {}
    return 'ELDER001';
  }

  // 케어 작성 탭으로 즉시 전환
  switchToCareWriteTab() {
    this.switchView('caregiverWriteView');
  }

  // 오늘 날짜로 이력 보고서 리셋
  resetReportPeriodToToday() {
    this.reportDateStr = CONFIG.getKSTDateString();
    this.loadReportData();
  }

  // ==========================================================================
  // 기간별(일/주/월) 케어 이력 보고서 상태 제어 메서드
  // ==========================================================================

  // 이력 보고서 모드 선택 (일 / 주 / 월)
  setReportMode(mode) {
    this.reportMode = mode;
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.loadReportData();
  }

  // 이력 보고서 기간 이동 (이전 / 다음)
  navigateReportPeriod(direction) {
    if (!this.reportDateStr) {
      this.reportDateStr = CONFIG.getKSTDateString();
    }
    const parts = this.reportDateStr.split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

    if (this.reportMode === 'daily') {
      dateObj.setDate(dateObj.getDate() + direction);
    } else if (this.reportMode === 'weekly') {
      dateObj.setDate(dateObj.getDate() + (direction * 7));
    } else if (this.reportMode === 'monthly') {
      dateObj.setMonth(dateObj.getMonth() + direction);
    }

    this.reportDateStr = CONFIG.getKSTDateString(dateObj);
    this.loadReportData();
  }

  // 이력 보고서 데이터 로드 (SWR 0ms 로컬 캐시 + GAS 백그라운드 동기화)
  async loadReportData() {
    try {
      const elderCode = this.getElderCode();
      if (!this.reportDateStr) {
        this.reportDateStr = CONFIG.getKSTDateString();
      }

      const labelEl = document.getElementById('reportPeriodDisplayLabel');

      if (this.reportMode === 'daily') {
        if (labelEl) labelEl.textContent = CONFIG.formatKSTDateDisplay(this.reportDateStr);

        const localRec = store.getLocalRecord(elderCode, this.reportDateStr);
        uiComponents.renderDailyReport('careReportContainer', localRec, this.reportDateStr);

        gasApi.getDailyCare(elderCode, this.reportDateStr).then(res => {
          if (res && res.success && res.data) {
            store.saveLocalRecord(elderCode, this.reportDateStr, res.data);
            uiComponents.renderDailyReport('careReportContainer', res.data, this.reportDateStr);
          }
        }).catch(e => console.warn('gasApi.getDailyCare error:', e));

      } else if (this.reportMode === 'weekly') {
        const { startDateStr, endDateStr } = CONFIG.getKSTWeekRange(this.reportDateStr);
        if (labelEl) labelEl.textContent = CONFIG.formatKSTDateRangeDisplay(startDateStr, endDateStr);

        const yearMonth = startDateStr.slice(0, 7);
        const localMonthly = store.getLocalMonthlyRecords(elderCode, yearMonth) || [];
        const safeLocal = Array.isArray(localMonthly) ? localMonthly : (typeof localMonthly === 'object' ? Object.values(localMonthly) : []);
        const filteredLocal = safeLocal.filter(r => r && r.date >= startDateStr && r.date <= endDateStr);

        uiComponents.renderWeeklyReport('careReportContainer', filteredLocal, startDateStr, endDateStr);

        gasApi.getMonthlyCare(elderCode, yearMonth).then(res => {
          if (res && res.success && res.data) {
            const rawList = Array.isArray(res.data) ? res.data : (typeof res.data === 'object' ? Object.values(res.data) : []);
            const filtered = rawList.filter(r => r && r.date >= startDateStr && r.date <= endDateStr);
            uiComponents.renderWeeklyReport('careReportContainer', filtered, startDateStr, endDateStr);
          }
        }).catch(e => console.warn('gasApi.getMonthlyCare error:', e));

      } else if (this.reportMode === 'monthly') {
        const yearMonth = this.reportDateStr.slice(0, 7);
        const [year, month] = yearMonth.split('-');
        if (labelEl) labelEl.textContent = `${year}년 ${Number(month)}월 케어 리포트`;

        const localMonthly = store.getLocalMonthlyRecords(elderCode, yearMonth) || [];
        const safeLocal = Array.isArray(localMonthly) ? localMonthly : (typeof localMonthly === 'object' ? Object.values(localMonthly) : []);
        uiComponents.renderMonthlyReport('careReportContainer', safeLocal, yearMonth);

        gasApi.getMonthlyCare(elderCode, yearMonth).then(res => {
          if (res && res.success && res.data) {
            const safeResData = Array.isArray(res.data) ? res.data : (typeof res.data === 'object' ? Object.values(res.data) : []);
            uiComponents.renderMonthlyReport('careReportContainer', safeResData, yearMonth);
          }
        }).catch(e => console.warn('gasApi.getMonthlyCare error:', e));
      }
    } catch (err) {
      console.error('loadReportData failed:', err);
    }
  }

  // 4자리 PIN 패드 초기화
  initPinPads() {
    this.pinPadController = uiComponents.setupPinKeypad(
      'loginPinDisplay',
      'loginKeypadGrid',
      (pin) => {
        document.getElementById('loginPinHidden').value = pin;
        const errBox = document.getElementById('loginErrorMessage');
        if (errBox) errBox.style.display = 'none';
      }
    );

    this.signupPinPadController = uiComponents.setupPinKeypad(
      'signupPinDisplay',
      'signupKeypadGrid',
      (pin) => {
        document.getElementById('signupPinHidden').value = pin;
        const errBox = document.getElementById('signupErrorMessage');
        if (errBox) errBox.style.display = 'none';
      }
    );
  }

  // 이벤트 바인딩
  bindEvents() {
    // 1. Auth 탭 전환 (로그인 / 회원가입)
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        
        const loginErr = document.getElementById('loginErrorMessage');
        const signupErr = document.getElementById('signupErrorMessage');
        if (loginErr) loginErr.style.display = 'none';
        if (signupErr) signupErr.style.display = 'none';

        if (targetTab === 'login') {
          document.getElementById('loginTabForm').style.display = 'block';
          document.getElementById('signupTabForm').style.display = 'none';
        } else {
          document.getElementById('loginTabForm').style.display = 'none';
          document.getElementById('signupTabForm').style.display = 'block';
        }
      });
    });

    // 2. 로그인 폼 제출
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('loginName').value.trim();
      const role = document.querySelector('input[name="loginRole"]:checked').value;
      const pin = document.getElementById('loginPinHidden').value;
      const loginErrBox = document.getElementById('loginErrorMessage');

      if (loginErrBox) loginErrBox.style.display = 'none';

      if (!name) {
        const msg = '이름을 입력해 주세요.';
        if (loginErrBox) {
          loginErrBox.textContent = `⚠ ${msg}`;
          loginErrBox.style.display = 'block';
        }
        this.showToast(msg, 'warning');
        return;
      }

      if (!pin || pin.length < 4) {
        const msg = '비밀번호 4자리(PIN)를 모두 완료해 주세요.';
        if (loginErrBox) {
          loginErrBox.textContent = `⚠ ${msg}`;
          loginErrBox.style.display = 'block';
        }
        this.showToast(msg, 'warning');
        return;
      }

      const loginBtn = document.getElementById('loginSubmitBtn');

      // 1단계: 0ms 초고속 로컬 세션 검증 (SWR 즉각 로그인)
      const passHash = await gasApi.hashPassword(pin);
      const localUsers = JSON.parse(localStorage.getItem(CONFIG.KEYS.LOCAL_USERS) || '[]');
      const localMatch = localUsers.find(u => u.name === name && u.role === role && u.password_hash === passHash);

      if (localMatch) {
        if (loginErrBox) loginErrBox.style.display = 'none';
        store.setCurrentUser({
          ...localMatch,
          elder_name: localMatch.elder_name || `${name} 댁 어르신`
        });
        this.showToast('🎉 로그인되었습니다!', 'success');
        this.checkAuthAndRender();

        // 백그라운드 원격 수신 검증 및 어르신 정보 동기화
        gasApi.login(name, role, pin).then(res => {
          if (res && res.success && res.elder && res.elder.elder_name) {
            const cur = store.currentUser;
            if (cur && cur.name === name) {
              store.setCurrentUser({ ...cur, elder_name: res.elder.elder_name });
            }
          }
        });
        return;
      }

      // 2단계: 신규 기기/최초 로그인 시 백그라운드 서버 검증
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '⏳ 로그인 진행 중...';
      }

      this.showToast('⏳ 로그인 진행 중...', 'info');
      const res = await gasApi.login(name, role, pin);

      if (res.success) {
        if (loginErrBox) loginErrBox.style.display = 'none';
        store.setCurrentUser({
          ...res.user,
          elder_name: res.elder ? res.elder.elder_name : `${name} 댁 어르신`
        });
        this.showToast('🎉 로그인되었습니다!', 'success');
        this.checkAuthAndRender();
      } else {
        const errMsg = res.message || '가입된 이름 또는 4자리 비밀번호가 일치하지 않습니다. 이름과 PIN을 확인해 주세요.';
        if (loginErrBox) {
          loginErrBox.textContent = `⚠ ${errMsg}`;
          loginErrBox.style.display = 'block';
        }
        this.showToast(errMsg, 'danger');
      }

      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '로그인하기';
      }
    });

    // 3. 회원가입 폼 제출
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signupName').value.trim();
      const elderName = document.getElementById('signupElderName').value.trim();
      const role = document.querySelector('input[name="signupRole"]:checked').value;
      const pin = document.getElementById('signupPinHidden').value;
      const elderCode = '';
      const signupErrBox = document.getElementById('signupErrorMessage');

      if (signupErrBox) signupErrBox.style.display = 'none';

      if (!name) {
        const msg = '이름을 입력해 주세요.';
        if (signupErrBox) {
          signupErrBox.textContent = `⚠ ${msg}`;
          signupErrBox.style.display = 'block';
        }
        this.showToast(msg, 'warning');
        return;
      }

      if (!elderName) {
        const msg = '어르신 성함을 입력해 주세요.';
        if (signupErrBox) {
          signupErrBox.textContent = `⚠ ${msg}`;
          signupErrBox.style.display = 'block';
        }
        this.showToast(msg, 'warning');
        return;
      }

      if (!pin || pin.length < 4) {
        const msg = '4자리 비밀번호(PIN)를 모두 입력해 주세요.';
        if (signupErrBox) {
          signupErrBox.textContent = `⚠ ${msg}`;
          signupErrBox.style.display = 'block';
        }
        this.showToast(msg, 'warning');
        return;
      }

      const signupBtn = document.getElementById('signupSubmitBtn');
      if (signupBtn) {
        signupBtn.disabled = true;
        signupBtn.innerHTML = '⏳ 회원 가입 진행 중...';
      }

      this.showToast('⏳ 회원 가입 진행 중...', 'info');
      const res = await gasApi.signup(name, role, pin, elderCode, elderName);

      if (res.success) {
        if (signupErrBox) signupErrBox.style.display = 'none';

        // 0ms 초고속 로그인을 위한 로컬 프로필 즉각 캐싱
        const passHash = await gasApi.hashPassword(pin);
        const users = JSON.parse(localStorage.getItem(CONFIG.KEYS.LOCAL_USERS) || '[]');
        const newUser = {
          user_id: res.user ? res.user.user_id : 'USER_' + Date.now(),
          name: name,
          role: role,
          password_hash: passHash,
          elder_code: res.user ? res.user.elder_code : elderCode,
          elder_name: elderName
        };
        const existIdx = users.findIndex(u => u.name === name && u.role === role);
        if (existIdx >= 0) users[existIdx] = newUser;
        else users.push(newUser);
        localStorage.setItem(CONFIG.KEYS.LOCAL_USERS, JSON.stringify(users));

        this.showToast('🎉 회원 가입이 완료되었습니다! 로그인해 주세요.', 'success');
        
        document.getElementById('loginName').value = name;
        if (this.pinPadController) this.pinPadController.clear();
        if (this.signupPinPadController) this.signupPinPadController.clear();
        
        document.querySelector('.auth-tab-btn[data-tab="login"]').click();
      } else {
        const errMsg = res.message || '회원가입 실패';
        if (signupErrBox) {
          signupErrBox.textContent = `⚠ ${errMsg}`;
          signupErrBox.style.display = 'block';
        }
        this.showToast(errMsg, 'danger');
      }

      if (signupBtn) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = '회원가입 완료';
      }
    });

    // 4. 로그아웃
    document.getElementById('logoutBtn').addEventListener('click', () => {
      store.logout();
      this.showToast('로그아웃되었습니다.', 'info');
      this.checkAuthAndRender();
    });

    // 5. 하단 탭 네비게이션
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-target');
        this.switchView(targetView);
      });
    });

    // 6. 스텝퍼 (+/- 버튼) 바인딩
    this.setupStepper('morningSysStepper', 120, 60, 220);
    this.setupStepper('morningDiaStepper', 80, 40, 140);
    this.setupStepper('morningTempStepper', 36.5, 34.0, 42.0, 0.1);

    this.setupStepper('eveningSysStepper', 120, 60, 220);
    this.setupStepper('eveningDiaStepper', 80, 40, 140);
    this.setupStepper('eveningTempStepper', 36.5, 34.0, 42.0, 0.1);

    this.setupStepper('stoolCountStepper', 1, 0, 10, 1);

    // 7. 이상 수치 감지 실시간 피드백
    ['morningSys', 'morningDia', 'morningTemp', 'eveningSys', 'eveningDia', 'eveningTemp'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', () => this.validateHealthInputs());
      }
    });

    // 8. 칩 선택 바인딩 (컨디션 / 식사 / 배변형태 / 투약체크)
    this.setupChips('conditionChips', (val) => this.selectedCondition = val);
    this.setupChips('mealChips', (val) => this.selectedMeal = val);
    this.setupChips('stoolTypeChips', (val) => this.selectedStoolType = val);
    this.setupMultiToggleChips('medicationChips');

    // 9. 케어 작성 폼 제출
    document.getElementById('caregiverForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveCareRecord();
    });

    // 10. 모달 닫기 버튼
    document.getElementById('closeModalBtn').addEventListener('click', () => {
      uiComponents.closeDetailModal();
    });
    document.getElementById('detailModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'detailModalOverlay') uiComponents.closeDetailModal();
    });
  }

  setupMultiToggleChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.chip').forEach(chip => {
      chip.onclick = (e) => {
        const targetChip = e.target.closest('.chip') || chip;
        targetChip.classList.toggle('selected');
      };
    });
  }

  // 스텝퍼 헬퍼
  setupStepper(containerId, defaultVal, min, max, step = 1) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const minusBtn = container.querySelector('.stepper-minus');
    const plusBtn = container.querySelector('.stepper-plus');
    const input = container.querySelector('input');

    const updateVal = (delta) => {
      let current = (input.value !== undefined && input.value !== '') ? parseFloat(input.value) : defaultVal;
      if (isNaN(current)) current = defaultVal;
      current = Math.round((current + delta) * 10) / 10;
      if (current < min) current = min;
      if (current > max) current = max;
      input.value = step < 1 ? current.toFixed(1) : Math.round(current);
      this.validateHealthInputs();
    };

    minusBtn.addEventListener('click', () => updateVal(-step));
    plusBtn.addEventListener('click', () => updateVal(step));
  }

  // 칩 선택 헬퍼
  setupChips(containerId, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const val = chip.getAttribute('data-val');
        onSelect(val);
      });
    });
  }

  // 실시간 수치 유효성 및 경고 하이라이트
  validateHealthInputs() {
    const checkInput = (inputId, threshold, isHigh = true) => {
      const el = document.getElementById(inputId);
      if (!el) return;
      const val = parseFloat(el.value);
      if (!isNaN(val) && (isHigh ? val >= threshold : val <= threshold)) {
        el.classList.add('input-danger');
      } else {
        el.classList.remove('input-danger');
      }
    };

    checkInput('morningSys', CONFIG.THRESHOLDS.HIGH_SYSTOLIC);
    checkInput('morningDia', CONFIG.THRESHOLDS.HIGH_DIASTOLIC);
    checkInput('morningTemp', CONFIG.THRESHOLDS.HIGH_TEMP);

    checkInput('eveningSys', CONFIG.THRESHOLDS.HIGH_SYSTOLIC);
    checkInput('eveningDia', CONFIG.THRESHOLDS.HIGH_DIASTOLIC);
    checkInput('eveningTemp', CONFIG.THRESHOLDS.HIGH_TEMP);
  }

  // 대시보드 날짜 및 상태 뱃지 안전 갱신 헬퍼
  updateStatusDate(dateStr) {
    const formatted = CONFIG.formatKSTDateDisplay(dateStr);
    ['dashDateLabel', 'careDateLabel', 'familyDateLabel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = formatted;
    });
  }

  updateStatusBadge(isWritten, role = '', authorName = '') {
    let badgeHTML = `<span class="badge badge-warning">⚠ 오늘 기록 미작성</span>`;
    if (isWritten) {
      if (role === '가족') {
        badgeHTML = `<span class="badge badge-blue">✔ 오늘 기록 작성 완료 (👨‍👩‍👧 가족 작성)</span>`;
      } else {
        badgeHTML = `<span class="badge badge-green">✔ 오늘 기록 작성 완료 (🧑‍⚕️ 요양보호사)</span>`;
      }
    }
      
    ['dashStatusBadge', 'todayStatusBadge', 'familyStatusBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = badgeHTML;
    });
  }

  applyCareRecordToForm(d) {
    // 폼 초기화 (기본 세팅 숫자 제거 및 공백 리셋)
    ['morningSys', 'morningDia', 'morningTemp', 'morningTime', 'eveningSys', 'eveningDia', 'eveningTemp', 'eveningTime'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    if (!d) return;
    if (d.morning_systolic != null && d.morning_systolic !== '') { const el = document.getElementById('morningSys'); if (el) el.value = d.morning_systolic; }
    if (d.morning_diastolic != null && d.morning_diastolic !== '') { const el = document.getElementById('morningDia'); if (el) el.value = d.morning_diastolic; }
    if (d.morning_temp != null && d.morning_temp !== '') { const el = document.getElementById('morningTemp'); if (el) el.value = d.morning_temp; }
    if (d.morning_time) { const el = document.getElementById('morningTime'); if (el) el.value = CONFIG.formatKSTTime(d.morning_time, ''); }

    if (d.evening_systolic != null && d.evening_systolic !== '') { const el = document.getElementById('eveningSys'); if (el) el.value = d.evening_systolic; }
    if (d.evening_diastolic != null && d.evening_diastolic !== '') { const el = document.getElementById('eveningDia'); if (el) el.value = d.evening_diastolic; }
    if (d.evening_temp != null && d.evening_temp !== '') { const el = document.getElementById('eveningTemp'); if (el) el.value = d.evening_temp; }
    if (d.evening_time) { const el = document.getElementById('eveningTime'); if (el) el.value = CONFIG.formatKSTTime(d.evening_time, ''); }

    if (d.condition_memo) { const el = document.getElementById('conditionMemo'); if (el) el.value = d.condition_memo; }
    if (d.meal_memo) { const el = document.getElementById('mealMemo'); if (el) el.value = d.meal_memo; }
    if (d.stool_count !== undefined) {
      const el = document.getElementById('stoolCount');
      if (el) {
        let parsedStool = parseInt(d.stool_count, 10);
        if (isNaN(parsedStool) || parsedStool < 0 || parsedStool > 10) parsedStool = 0;
        el.value = parsedStool;
      }
    }

    if (d.condition) {
      this.selectedCondition = d.condition;
      this.selectChipByValue('conditionChips', d.condition);
    }
    if (d.meal_status) {
      this.selectedMeal = d.meal_status;
      this.selectChipByValue('mealChips', d.meal_status);
    }
    if (d.stool_type) {
      this.selectedStoolType = d.stool_type;
      this.selectChipByValue('stoolTypeChips', d.stool_type);
    }

    // 투약 복원
    const medMorningChip = document.getElementById('medMorningChip');
    const medLunchChip = document.getElementById('medLunchChip');
    const medEveningChip = document.getElementById('medEveningChip');
    const medMemoEl = document.getElementById('medicationMemo');

    if (medMorningChip) {
      if (d.medication_morning === true || d.medication_morning === 'Y' || d.medication_morning === 'true') medMorningChip.classList.add('selected');
      else medMorningChip.classList.remove('selected');
    }
    if (medLunchChip) {
      if (d.medication_lunch === true || d.medication_lunch === 'Y' || d.medication_lunch === 'true') medLunchChip.classList.add('selected');
      else medLunchChip.classList.remove('selected');
    }
    if (medEveningChip) {
      if (d.medication_evening === true || d.medication_evening === 'Y' || d.medication_evening === 'true') medEveningChip.classList.add('selected');
      else medEveningChip.classList.remove('selected');
    }
    if (medMemoEl && d.medication_memo !== undefined) {
      medMemoEl.value = CONFIG.cleanMedicationMemo(d.medication_memo);
    }

    this.validateHealthInputs();
  }

  isTaken(val) {
    return val === true || val === 'true' || val === 'Y' || val === '복용' || val === 1 || val === '1';
  }

  formatMedicationStatus(d) {
    if (!d) return '미복용';
    const m = this.isTaken(d.medication_morning);
    const l = this.isTaken(d.medication_lunch);
    const e = this.isTaken(d.medication_evening);

    const list = [];
    if (m) list.push('아침');
    if (l) list.push('점심');
    if (e) list.push('저녁');

    if (list.length === 0) return '미복용';
    if (list.length === 3) return '아침·점심·저녁 모두 완료';
    return `${list.join('·')} 복용 완료`;
  }

  renderFamilySummaryCard(d) {
    const summaryCard = document.getElementById('familyTodaySummaryCard');
    if (!summaryCard) return;

    if (!d) {
      this.updateStatusBadge(false);
      summaryCard.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📋</div>
          <p style="font-weight: 600;">오늘 작성된 케어 기록이 아직 없습니다.</p>
        </div>
      `;
      return;
    }

    this.updateStatusBadge(true, d.updated_role, d.updated_by_name);
    
    const authorText = d.updated_by_name ? ` (${d.updated_by_name})` : '';
    const roleBadge = d.updated_role === '가족'
      ? `<span class="badge badge-blue">👨‍👩‍👧 가족 직접 작성${authorText}</span>`
      : `<span class="badge badge-green">🧑‍⚕️ 요양보호사 작성${authorText}</span>`;

    const rawCount = parseInt(d.stool_count, 10);
    const cleanStool = isNaN(rawCount) || rawCount < 0 ? 0 : (rawCount > 10 ? 1 : rawCount);
    const stoolText = cleanStool === 0 ? '0회 (미배변)' : `${cleanStool}회 (${d.stool_type || '부드러움'})`;
    const medText = this.formatMedicationStatus(d);

    summaryCard.innerHTML = `
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span class="text-muted" style="font-size: 0.85rem; font-weight: 600;">작성자 구별:</span>
        ${roleBadge}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div style="background: rgba(255,255,255,0.85); padding: 14px; border-radius: 14px;">
          <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">🌅 아침 혈압/체온</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-blue); margin-top: 4px;">
            ${d.morning_systolic ? `${d.morning_systolic}/${d.morning_diastolic} mmHg` : '미입력'}
          </div>
          <div style="font-size: 0.95rem; font-weight: 600; color: ${d.morning_temp >= 37.5 ? 'var(--alert-red)' : 'var(--text-dark)'};">
            ${d.morning_temp ? `${d.morning_temp} ℃` : ''}
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.85); padding: 14px; border-radius: 14px;">
          <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">🌙 저녁 혈압/체온</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-blue); margin-top: 4px;">
            ${d.evening_systolic ? `${d.evening_systolic}/${d.evening_diastolic} mmHg` : '미입력'}
          </div>
          <div style="font-size: 0.95rem; font-weight: 600; color: ${d.evening_temp >= 37.5 ? 'var(--alert-red)' : 'var(--text-dark)'};">
            ${d.evening_temp ? `${d.evening_temp} ℃` : ''}
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <span class="badge badge-blue">😀 컨디션: ${d.condition || '미입력'}</span>
        <span class="badge badge-blue">🍚 식사: ${d.meal_status || '미입력'}</span>
        <span class="badge badge-blue">🚽 배변: ${stoolText}</span>
        <span class="badge badge-blue">💊 투약: ${medText}</span>
      </div>

      <div style="margin-top: 16px;">
        <button class="btn btn-secondary" onclick="app.switchView('caregiverWriteView')" style="width: 100%;">✏️ 오늘 기록 수정 / 추가 작성하기</button>
      </div>
    `;
  }

  // 요양보호사 대시보드 데이터 로드 (SWR 초고속 0ms 즉각 반환)
  async loadCaregiverDashboard() {
    const user = store.currentUser;
    if (!user) return;

    this.updateStatusDate(this.currentDateStr);
    
    // 폼 초기화 (기본 세팅 숫자/시간 제거)
    this.applyCareRecordToForm(null);

    // 1단계: 0ms 초고속 로컬 캐시 즉시 반영
    const localRec = store.getLocalRecord(user.elder_code, this.currentDateStr);
    if (localRec) {
      this.applyCareRecordToForm(localRec);
      this.updateStatusBadge(true, localRec.updated_role, localRec.updated_by_name);
    }

    // 2단계: 백그라운드 실시간 비동기 동기화
    gasApi.getDailyCare(user.elder_code, this.currentDateStr).then(res => {
      if (res && res.success && res.data) {
        store.saveLocalRecord(user.elder_code, this.currentDateStr, res.data);
        this.applyCareRecordToForm(res.data);
        this.updateStatusBadge(true, res.data.updated_role, res.data.updated_by_name);
      }
    });

    this.loadRecentHistory();
  }

  selectChipByValue(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.chip').forEach(c => {
      if (c.getAttribute('data-val') === value) {
        c.click();
      }
    });
  }

  toggleMedicationChip(chipEl) {
    if (!chipEl) return;
    if (chipEl.classList.contains('selected')) {
      chipEl.classList.remove('selected');
    } else {
      chipEl.classList.add('selected');
    }
  }

  setupMultiToggleChips(containerId) {
    // Handled via direct inline onclick in HTML to prevent double-toggling
  }

  // 최근 7일 작성 이력 로드
  async loadRecentHistory() {
    const user = store.currentUser;
    if (!user) return;
    const historyList = document.getElementById('recentHistoryList');
    if (!historyList) return;

    // 로컬 데이터 즉시 반환
    const localMonthly = store.getLocalMonthlyRecords(user.elder_code, this.currentYearMonth);
    const renderHistory = (records) => {
      if (!records || records.length === 0) {
        historyList.innerHTML = `<p class="text-muted" style="text-align:center; padding: 12px;">최근 작성된 기록이 없습니다.</p>`;
        return;
      }
      const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
      historyList.innerHTML = sorted.map(r => {
        const creatorBadge = r.updated_role === '가족'
          ? `<span class="badge badge-blue" style="margin-left: 6px; font-size: 0.72rem; padding: 2px 8px;">👨‍👩‍👧 가족</span>`
          : `<span class="badge badge-green" style="margin-left: 6px; font-size: 0.72rem; padding: 2px 8px;">🧑‍⚕️ 요양보호사</span>`;

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; background: rgba(255,255,255,0.7); border-radius: 12px; margin-bottom: 8px;">
            <div>
              <span style="font-weight: 700; color: var(--text-dark);">${r.date}</span>
              <span class="badge badge-blue" style="margin-left: 8px;">${r.condition || '기록'}</span>
              ${creatorBadge}
            </div>
            <button class="btn btn-secondary" style="width: auto; min-height: 32px; padding: 4px 12px; font-size: 0.85rem;" onclick="app.openDetailModalForDate('${r.date}')">상세보기</button>
          </div>
        `;
      }).join('');
    };

    renderHistory(localMonthly);

    gasApi.getMonthlyCare(user.elder_code, this.currentYearMonth).then(res => {
      if (res && res.success && res.data) {
        renderHistory(res.data);
      }
    });
  }

  // 케어 기록 저장 (Optimistic UI 0ms 즉각 저장 & 기존 데이터 재저장 보장)
  async saveCareRecord() {
    const user = store.currentUser;
    if (!user) return;

    const morningSysEl = document.getElementById('morningSys');
    const morningDiaEl = document.getElementById('morningDia');
    const morningTempEl = document.getElementById('morningTemp');
    const morningTimeEl = document.getElementById('morningTime');

    const eveningSysEl = document.getElementById('eveningSys');
    const eveningDiaEl = document.getElementById('eveningDia');
    const eveningTempEl = document.getElementById('eveningTemp');
    const eveningTimeEl = document.getElementById('eveningTime');

    const conditionMemoEl = document.getElementById('conditionMemo');
    const mealMemoEl = document.getElementById('mealMemo');
    const stoolCountEl = document.getElementById('stoolCount');

    let cleanStoolCount = 0;
    if (stoolCountEl) {
      const parsed = parseInt(stoolCountEl.value, 10);
      cleanStoolCount = isNaN(parsed) || parsed < 0 ? 0 : Math.min(10, parsed);
    }

    const medMorningChip = document.getElementById('medMorningChip');
    const medLunchChip = document.getElementById('medLunchChip');
    const medEveningChip = document.getElementById('medEveningChip');
    const medMemoEl = document.getElementById('medicationMemo');

    // 기존에 작성된 데이터와 유기적 병합
    const existingRec = store.getLocalRecord(user.elder_code, this.currentDateStr) || {};

    const hasMorningVitals = (morningSysEl && morningSysEl.value.trim() !== '') || (morningDiaEl && morningDiaEl.value.trim() !== '') || (morningTempEl && morningTempEl.value.trim() !== '');
    const hasEveningVitals = (eveningSysEl && eveningSysEl.value.trim() !== '') || (eveningDiaEl && eveningDiaEl.value.trim() !== '') || (eveningTempEl && eveningTempEl.value.trim() !== '');

    const nowStr = CONFIG.formatKSTTime(new Date(), '');

    const morningTimeVal = hasMorningVitals
      ? (morningTimeEl && morningTimeEl.value ? CONFIG.formatKSTTime(morningTimeEl.value, nowStr) : nowStr)
      : (existingRec.morning_time ? CONFIG.formatKSTTime(existingRec.morning_time, '') : '');

    const eveningTimeVal = hasEveningVitals
      ? (eveningTimeEl && eveningTimeEl.value ? CONFIG.formatKSTTime(eveningTimeEl.value, nowStr) : nowStr)
      : (existingRec.evening_time ? CONFIG.formatKSTTime(existingRec.evening_time, '') : '');

    const careData = {
      morning_systolic: (morningSysEl && morningSysEl.value.trim() !== '') ? parseFloat(morningSysEl.value) : (morningSysEl ? null : (existingRec.morning_systolic || null)),
      morning_diastolic: (morningDiaEl && morningDiaEl.value.trim() !== '') ? parseFloat(morningDiaEl.value) : (morningDiaEl ? null : (existingRec.morning_diastolic || null)),
      morning_temp: (morningTempEl && morningTempEl.value.trim() !== '') ? parseFloat(morningTempEl.value) : (morningTempEl ? null : (existingRec.morning_temp || null)),
      morning_time: morningTimeVal,

      evening_systolic: (eveningSysEl && eveningSysEl.value.trim() !== '') ? parseFloat(eveningSysEl.value) : (eveningSysEl ? null : (existingRec.evening_systolic || null)),
      evening_diastolic: (eveningDiaEl && eveningDiaEl.value.trim() !== '') ? parseFloat(eveningDiaEl.value) : (eveningDiaEl ? null : (existingRec.evening_diastolic || null)),
      evening_temp: (eveningTempEl && eveningTempEl.value.trim() !== '') ? parseFloat(eveningTempEl.value) : (eveningTempEl ? null : (existingRec.evening_temp || null)),
      evening_time: eveningTimeVal,

      condition: this.selectedCondition || existingRec.condition || '상 (양호)',
      condition_memo: (conditionMemoEl && conditionMemoEl.value.trim() !== '') ? conditionMemoEl.value.trim() : (existingRec.condition_memo || ''),
      meal_status: this.selectedMeal || existingRec.meal_status || '잘 드심',
      meal_memo: (mealMemoEl && mealMemoEl.value.trim() !== '') ? mealMemoEl.value.trim() : (existingRec.meal_memo || ''),

      stool_count: cleanStoolCount,
      stool_type: this.selectedStoolType || existingRec.stool_type || '부드러움',

      medication_morning: medMorningChip ? medMorningChip.classList.contains('selected') : (existingRec.medication_morning || false),
      medication_lunch: medLunchChip ? medLunchChip.classList.contains('selected') : (existingRec.medication_lunch || false),
      medication_evening: medEveningChip ? medEveningChip.classList.contains('selected') : (existingRec.medication_evening || false),
      medication_memo: medMemoEl ? CONFIG.cleanMedicationMemo(medMemoEl.value) : CONFIG.cleanMedicationMemo(existingRec.medication_memo || ''),

      updated_by: user.user_id,
      updated_by_name: user.name,
      updated_role: user.role
    };

    // 1단계: 0ms 즉각 UI 반환
    store.saveLocalRecord(user.elder_code, this.currentDateStr, careData);
    this.showToast('🎉 저장이 완료되었습니다!', 'success');

    // 저장 버튼 즉각 시각적 갱신 ('✅ 저장이 완료되었습니다!' 초록 전환)
    const saveBtn = document.querySelector('#caregiverForm button[type="submit"]');
    if (saveBtn) {
      const origHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.style.backgroundColor = '#10B981';
      saveBtn.style.borderColor = '#059669';
      saveBtn.innerHTML = '✅ 저장이 완료되었습니다!';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.style.backgroundColor = '';
        saveBtn.style.borderColor = '';
        saveBtn.innerHTML = origHtml;
      }, 2500);
    }

    this.updateStatusBadge(true, user.role, user.name);
    this.loadRecentHistory();

    // 2단계: 백그라운드 원격 서버 동기화
    gasApi.saveDailyCare(user.elder_code, this.currentDateStr, careData);
  }

  // 가족 대시보드 데이터 로드 (SWR 0ms 초고속 반영)
  async loadFamilyDashboard() {
    const user = store.currentUser;
    if (!user) return;

    this.updateStatusDate(this.currentDateStr);
    this.loadReportData();
    this.refreshFamilyCalendar();
    this.refreshFamilyTrendChart();
  }

  // 가족 달력 뷰 새로고침 (SWR 0ms 즉각 반환)
  async refreshFamilyCalendar() {
    const user = store.currentUser;
    if (!user) return;
    const [year, month] = this.currentYearMonth.split('-').map(Number);
    
    // 1단계: 0ms 즉각 로컬 캐시 달력 렌더링
    const localMonthly = store.getLocalMonthlyRecords(user.elder_code, this.currentYearMonth);
    uiComponents.renderCalendar('familyCalendarContainer', year, month, localMonthly, (dateStr, record) => {
      this.openDetailModalForDate(dateStr);
    });

    // 2단계: 백그라운드 원격 수신 후 동기화
    gasApi.getMonthlyCare(user.elder_code, this.currentYearMonth).then(res => {
      if (res && res.success && res.data) {
        uiComponents.renderCalendar('familyCalendarContainer', year, month, res.data, (dateStr, record) => {
          this.openDetailModalForDate(dateStr);
        });
      }
    });
  }

  // 가족 추이 그래프 새로고침 (SWR 0ms 즉각 반환)
  async refreshFamilyTrendChart() {
    const user = store.currentUser;
    if (!user) return;

    // 1단계: 0ms 즉각 로컬 캐시 그래프 렌더링
    const localMonthly = store.getLocalMonthlyRecords(user.elder_code, this.currentYearMonth);
    uiComponents.renderTrendChart('familyTrendChartCanvas', localMonthly);

    // 2단계: 백그라운드 원격 동기화
    gasApi.getMonthlyCare(user.elder_code, this.currentYearMonth).then(res => {
      if (res && res.success && res.data) {
        uiComponents.renderTrendChart('familyTrendChartCanvas', res.data);
      }
    });
  }

  // 특정 일자 모달 호출 헬퍼 (SWR 0ms 즉각 팝업)
  async openDetailModalForDate(dateStr) {
    const user = store.currentUser;
    if (!user) return;

    // 1단계: 0ms 로컬 데이터로 즉시 모달 열기
    const localRec = store.getLocalRecord(user.elder_code, dateStr);
    uiComponents.showDetailModal(dateStr, localRec);

    // 2단계: 백그라운드 최신화
    gasApi.getDailyCare(user.elder_code, dateStr).then(res => {
      if (res && res.success && res.data) {
        store.saveLocalRecord(user.elder_code, dateStr, res.data);
        uiComponents.showDetailModal(dateStr, res.data);
      }
    });
  }
}

// Global App Launch
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});

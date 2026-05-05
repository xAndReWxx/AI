// ================================================================
//  PhysioAI Pro — app.js  (Complete Edition)
//  Firebase Auth + Firestore + Three.js 3D + MediaPipe
//  Dashboard + Patient Profiles + Analytics + Excel Export
// ================================================================

// ====== FIREBASE CONFIG ======
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDEj7XgmcI48rGVSxrJMOO-HEfUWrFz2z4",
    authDomain: "caii-ad3e0.firebaseapp.com",
    projectId: "caii-ad3e0",
    storageBucket: "caii-ad3e0.firebasestorage.app",
    messagingSenderId: "618039685347",
    appId: "1:618039685347:web:052df05e63357d6e1395d6",
    measurementId: "G-7VCZS9WK6D"
};

let db = null, auth = null, firebaseReady = false;
let currentUser = null;

// ====== EXERCISE DEFINITIONS ======
const EXERCISES = {
    bicep:    { name:'ثني الكوع',   icon:'💪', joints:[12,14,16], minFlex:65,  maxExt:150, desc:'اثنِ الكوع ببطء حتى تقترب اليد من الكتف', tips:['ثبّت كوعك بجانب جسمك','تحرك ببطء في الاتجاهين','لا تتأرجح بكتفك'], videoId:'ykJmrZ5v0Oo', color:'#00e5c4', bones:[[12,14],[14,16]] },
    shoulder: { name:'رفع الكتف',  icon:'🔄', joints:[14,12,24], minFlex:55,  maxExt:140, desc:'ارفع ذراعك للأمام حتى تكون موازية للأرض',   tips:['ابقَ ظهرك مستقيماً','لا ترفع كتفك','تحكم في العودة'], videoId:'XB_CFUuMRgM', color:'#7c6fff', bones:[[12,14],[12,24]] },
    knee:     { name:'ثني الركبة', icon:'🦵', joints:[24,26,28], minFlex:65,  maxExt:160, desc:'اثنِ الركبة للخلف ببطء ثم أعدها مع التحكم',   tips:['تمسك بدعم عند الحاجة','تحرك بمنتظم','لا تقفل الركبة'], videoId:'L8fvypPrKik', color:'#ff7c6f', bones:[[24,26],[26,28]] },
    hip:      { name:'رفع الورك',  icon:'🏃', joints:[12,24,26], minFlex:65,  maxExt:145, desc:'ارفع الفخذ للأمام مع ثني الركبة وظهر منتصب', tips:['تمسك بدعم للتوازن','ارفع للمستوى','ثبّت البطن'],    videoId:'YaXPRqUwItQ', color:'#ffd32a', bones:[[12,24],[24,26]] },
};

const CONFIG = { smoothing: 0.2, analysisInterval: 12000 };

// ====== SESSION STATE ======
let SESSION = {
    patient:{name:'',age:'',diagnosis:''}, exercise:'bicep',
    targetSets:3, repsPerSet:10, restTime:30,
    isStarted:false, currentSet:1, reps:0, stage:'down',
    smoothedAngle:180, minAngle:999, maxAngle:0,
    globalMinAngle:999, globalMaxAngle:0,
    startTime:null, totalReps:0, allAngles:[], setResults:[],
    qualityScore:0, timerInterval:null, restInterval:null,
    analysisInterval:null, isResting:false,
    chart:null, camera:null, pose:null,
    patientDocId:null, sessionDocId:null,
    threeRenderer:null, threeScene:null, threeCamera3d:null,
    boneMeshes:{}, jointSpheres:{}, lastLandmarks:null,
};

// ====== DASHBOARD STATE ======
let DASH = {
    allPatients:[], allSessions:[],
    filteredPatients:[], filteredSessions:[],
    charts:{ weekly:null, exercise:null, rom:null, reps:null, quality:null }
};

const PARAMS = { sets:3, repsPerSet:10, restTime:30 };

// ================================================================
//  FIREBASE INIT
// ================================================================
window.addEventListener('load', () => {
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        auth = firebase.auth();
        db   = firebase.firestore();
        firebaseReady = true;
        updateDBBadges(true);
        document.getElementById('firebase-status-login').textContent = '✅ Firebase متصل';

        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                afterLogin(user);
            } else {
                showScreen('screen-login');
            }
        });
    } catch(e) {
        console.error('Firebase error:', e);
        updateDBBadges(false);
        document.getElementById('firebase-status-login').textContent = '❌ خطأ في الاتصال';
        showScreen('screen-login');
    }
});

function updateDBBadges(online) {
    const cls = online ? 'online' : 'offline';
    document.querySelectorAll('.db-dot').forEach(d => d.className = `db-dot ${cls}`);
    const lbl = document.getElementById('db-label');
    if (lbl) lbl.textContent = online ? 'Firebase ✓' : 'غير متصل';
}

// ================================================================
//  AUTH
// ================================================================
let loginRole = 'doctor';
function switchLoginTab(role) {
    loginRole = role;
    document.querySelectorAll('.login-tab').forEach((t,i) => {
        t.classList.toggle('active', (role==='doctor' && i===0)||(role==='admin' && i===1));
    });
}

async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const btn   = document.getElementById('login-btn');
    const err   = document.getElementById('login-error');
    if (!email || !pass) { showLoginError('أدخل البريد وكلمة المرور'); return; }
    btn.textContent = '⏳ جاري الدخول...'; btn.disabled = true;
    try {
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        afterLogin(cred.user);
    } catch(e) {
        const msgs = {
            'auth/user-not-found':'البريد الإلكتروني غير مسجل',
            'auth/wrong-password':'كلمة المرور غلط',
            'auth/invalid-email':'بريد إلكتروني غير صحيح',
            'auth/too-many-requests':'محاولات كثيرة، انتظر قليلاً',
        };
        showLoginError(msgs[e.code] || 'خطأ في تسجيل الدخول');
    } finally { btn.textContent = '🔐 دخول'; btn.disabled = false; }
}

async function doRegister() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    if (!email || !pass) { showLoginError('أدخل البريد وكلمة المرور أولاً'); return; }
    if (pass.length < 6) { showLoginError('كلمة المرور 6 أحرف على الأقل'); return; }
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        // Save doctor profile
        await db.collection('doctors').doc(cred.user.uid).set({
            email, role: loginRole, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        afterLogin(cred.user);
    } catch(e) {
        showLoginError(e.code === 'auth/email-already-in-use' ? 'البريد مسجل بالفعل' : e.message);
    }
}

function doGuestLogin() {
    currentUser = { uid:'guest', email:'guest@physioai.pro', displayName:'ضيف' };
    afterLogin(currentUser, true);
}

async function doLogout() {
    if (auth && currentUser?.uid !== 'guest') await auth.signOut();
    currentUser = null;
    showScreen('screen-login');
}

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg; el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

async function afterLogin(user, guest=false) {
    currentUser = user;
    // Fill sidebar user info
    const name = user.displayName || user.email?.split('@')[0] || 'المستخدم';
    const el = document.getElementById('user-name');
    if (el) el.textContent = name;
    const av = document.getElementById('user-avatar');
    if (av) av.textContent = name[0]?.toUpperCase() || 'D';
    const roleEl = document.getElementById('user-role');
    if (roleEl) roleEl.textContent = guest ? 'ضيف' : loginRole === 'admin' ? 'مدير' : 'معالج طبيعي';

    showScreen('screen-dashboard');
    await refreshDashboard();
}

// ================================================================
//  DASHBOARD
// ================================================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'screen-dashboard') refreshDashboard();
}

async function refreshDashboard() {
    if (!firebaseReady) return;
    try {
        // Load patients
        const pSnap = await db.collection('patients').orderBy('createdAt','desc').limit(100).get();
        DASH.allPatients = pSnap.docs.map(d => ({id:d.id,...d.data()}));

        // Load sessions
        const sSnap = await db.collection('sessions').where('status','==','completed')
            .orderBy('completedAt','desc').limit(200).get();
        DASH.allSessions = sSnap.docs.map(d => ({id:d.id,...d.data()}));

        renderOverview();
        renderPatientsTable(DASH.allPatients);
        renderSessionsTable(DASH.allSessions);
        populateAnalyticsPatients();
    } catch(e) {
        console.warn('Dashboard load error:', e);
        // If missing index, show toast
        showToast('تأكد من تفعيل Firestore indexes', 'warn');
    }
}

function dashTab(tab) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    const navEl = document.getElementById(`nav-${tab}`);
    if (navEl) navEl.classList.add('active');
    const titles = { overview:'نظرة عامة', patients:'المرضى', sessions:'الجلسات', analytics:'التحليلات' };
    document.getElementById('dash-title').textContent = titles[tab] || '';
    if (tab === 'analytics') loadAnalytics();
}

// ====== OVERVIEW ======
function renderOverview() {
    const sessions = DASH.allSessions;
    const patients = DASH.allPatients;

    document.getElementById('kpi-patients').textContent = patients.length;
    document.getElementById('kpi-sessions').textContent = sessions.length;
    const avgStars = sessions.length ? (sessions.reduce((a,s) => a+(s.qualityStars||0),0)/sessions.length).toFixed(1) : '—';
    document.getElementById('kpi-avg-stars').textContent = avgStars + (sessions.length ? ' ★' : '');
    const avgRom = sessions.length ? Math.round(sessions.reduce((a,s)=>a+(s.romDegrees||0),0)/sessions.length) : '—';
    document.getElementById('kpi-avg-rom').textContent = avgRom + (sessions.length ? '°' : '');

    renderWeeklyChart(sessions);
    renderExerciseChart(sessions);
    renderRecentSessions(sessions.slice(0,8));
}

function renderWeeklyChart(sessions) {
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    if (DASH.charts.weekly) DASH.charts.weekly.destroy();
    const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const counts = new Array(7).fill(0);
    const now = Date.now();
    sessions.forEach(s => {
        const t = s.completedAt?.toDate?.()?.getTime() || 0;
        if (now - t < 7*24*3600*1000) {
            const d = new Date(t).getDay();
            counts[d]++;
        }
    });
    DASH.charts.weekly = new Chart(ctx, {
        type:'bar',
        data:{ labels:days, datasets:[{label:'جلسات', data:counts, backgroundColor:'rgba(0,229,196,0.6)', borderColor:'#00e5c4', borderWidth:1, borderRadius:6}] },
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,ticks:{color:'#7a9e96',stepSize:1},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#7a9e96'},grid:{display:false}} } }
    });
}

function renderExerciseChart(sessions) {
    const ctx = document.getElementById('exerciseChart').getContext('2d');
    if (DASH.charts.exercise) DASH.charts.exercise.destroy();
    const counts = {};
    sessions.forEach(s => { counts[s.exercise||'أخرى'] = (counts[s.exercise||'أخرى']||0)+1; });
    const labels = Object.keys(counts), data = Object.values(counts);
    DASH.charts.exercise = new Chart(ctx, {
        type:'doughnut',
        data:{ labels, datasets:[{data, backgroundColor:['#00e5c4','#7c6fff','#ff7c6f','#ffd32a','#00b894'], borderWidth:0}] },
        options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{color:'#7a9e96',font:{size:11}} } } }
    });
}

function renderRecentSessions(sessions) {
    const el = document.getElementById('recent-sessions-list');
    if (!sessions.length) { el.innerHTML = '<p class="empty-msg">لا توجد جلسات بعد</p>'; return; }
    el.innerHTML = sessions.map(s => `
        <div class="session-row">
            <div class="sr-avatar">${(s.patientName||'م')[0]}</div>
            <div class="sr-info">
                <div class="sr-name">${s.patientName||'—'}</div>
                <div class="sr-meta">${s.exercise||'—'} · ${s.totalReps||0} تكرار</div>
            </div>
            <div class="sr-stats">
                <span class="sr-rom">${s.romDegrees||0}°</span>
                <span class="sr-stars">${'★'.repeat(s.qualityStars||0)}${'☆'.repeat(5-(s.qualityStars||0))}</span>
            </div>
            <div class="sr-date">${formatDate(s.completedAt)}</div>
        </div>`).join('');
}

// ====== PATIENTS TABLE ======
function renderPatientsTable(patients) {
    DASH.filteredPatients = patients;
    const tbody = document.getElementById('patients-tbody');
    if (!tbody) return;
    if (!patients.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">لا يوجد مرضى</td></tr>'; return; }

    // Count sessions per patient
    const sessionCounts = {};
    const lastSession = {};
    DASH.allSessions.forEach(s => {
        sessionCounts[s.patientName] = (sessionCounts[s.patientName]||0)+1;
        if (!lastSession[s.patientName]) lastSession[s.patientName] = s.completedAt;
    });

    tbody.innerHTML = patients.map(p => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div class="mini-avatar">${(p.name||'م')[0]}</div>
                    <div><div style="font-weight:700">${p.name||'—'}</div><div style="font-size:0.72rem;color:var(--text-dim)">${p.phone||''}</div></div>
                </div>
            </td>
            <td>${p.age||'—'}</td>
            <td>${p.diagnosis||'—'}</td>
            <td><span class="badge-count">${sessionCounts[p.name]||0}</span></td>
            <td>${lastSession[p.name] ? formatDate(lastSession[p.name]) : '—'}</td>
            <td><span class="status-badge active">نشط</span></td>
            <td>
                <button class="btn-sm" onclick="openPatientProfile('${p.id}')">ملف</button>
                <button class="btn-sm danger" onclick="startSessionForPatient('${encodeURIComponent(p.name)}','${p.age||''}','${encodeURIComponent(p.diagnosis||'')}')">جلسة</button>
            </td>
        </tr>`).join('');
}

function filterPatients() {
    const q = document.getElementById('patient-search').value.toLowerCase();
    const filtered = DASH.allPatients.filter(p =>
        (p.name||'').toLowerCase().includes(q) ||
        (p.diagnosis||'').toLowerCase().includes(q)
    );
    renderPatientsTable(filtered);
}

function showNewPatientForm() {
    const f = document.getElementById('new-patient-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function addNewPatient() {
    const name  = document.getElementById('np-name').value.trim();
    const age   = document.getElementById('np-age').value;
    const diag  = document.getElementById('np-diag').value.trim();
    const phone = document.getElementById('np-phone').value.trim();
    if (!name) { showToast('أدخل اسم المريض', 'error'); return; }
    try {
        await db.collection('patients').add({
            name, age: parseInt(age)||0, diagnosis:diag, phone,
            createdBy: currentUser?.uid || 'guest',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('تم إضافة المريض ✓');
        document.getElementById('new-patient-form').style.display = 'none';
        ['np-name','np-age','np-diag','np-phone'].forEach(id => document.getElementById(id).value = '');
        await refreshDashboard();
    } catch(e) { showToast('خطأ في الحفظ', 'error'); }
}

function startSessionForPatient(name, age, diag) {
    showScreen('screen-setup');
    document.getElementById('patient-name').value = decodeURIComponent(name);
    document.getElementById('patient-age').value  = age;
    document.getElementById('diagnosis').value    = decodeURIComponent(diag);
}

// ====== PATIENT PROFILE MODAL ======
async function openPatientProfile(patientId) {
    const patient = DASH.allPatients.find(p => p.id === patientId);
    if (!patient) return;
    const patientSessions = DASH.allSessions.filter(s => s.patientName === patient.name);
    const modal = document.getElementById('patient-modal');
    document.getElementById('pmodal-name').textContent = `👤 ${patient.name}`;

    const totalReps = patientSessions.reduce((a,s)=>a+(s.totalReps||0),0);
    const avgRom    = patientSessions.length ? Math.round(patientSessions.reduce((a,s)=>a+(s.romDegrees||0),0)/patientSessions.length) : 0;
    const avgStars  = patientSessions.length ? (patientSessions.reduce((a,s)=>a+(s.qualityStars||0),0)/patientSessions.length).toFixed(1) : 0;

    document.getElementById('patient-modal-body').innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar">${(patient.name||'م')[0]}</div>
            <div>
                <div class="profile-name">${patient.name}</div>
                <div class="profile-meta">العمر: ${patient.age||'—'} · التشخيص: ${patient.diagnosis||'—'}</div>
            </div>
        </div>
        <div class="profile-kpis">
            <div class="pkpi"><div class="pkpi-val">${patientSessions.length}</div><div class="pkpi-lbl">جلسة</div></div>
            <div class="pkpi"><div class="pkpi-val">${totalReps}</div><div class="pkpi-lbl">إجمالي التكرارات</div></div>
            <div class="pkpi"><div class="pkpi-val">${avgRom}°</div><div class="pkpi-lbl">متوسط مدى الحركة</div></div>
            <div class="pkpi"><div class="pkpi-val">${avgStars}★</div><div class="pkpi-lbl">متوسط الجودة</div></div>
        </div>
        <canvas id="profile-progress-chart" height="140" style="margin:16px 0"></canvas>
        <h4 style="color:var(--text-dim);font-size:0.85rem;margin-bottom:10px">سجل الجلسات</h4>
        <div class="profile-sessions">
            ${patientSessions.map(s=>`
                <div class="profile-session-row">
                    <span>${s.exercise||'—'}</span>
                    <span>${s.totalReps||0} تكرار</span>
                    <span>${s.romDegrees||0}°</span>
                    <span>${'★'.repeat(s.qualityStars||0)}</span>
                    <span>${formatDate(s.completedAt)}</span>
                </div>`).join('') || '<p class="empty-msg">لا توجد جلسات</p>'}
        </div>
        <button class="btn-primary" style="margin-top:16px" onclick="startSessionForPatient('${encodeURIComponent(patient.name)}','${patient.age||''}','${encodeURIComponent(patient.diagnosis||'')}');document.getElementById('patient-modal').style.display='none'">
            🚀 ابدأ جلسة جديدة
        </button>`;

    modal.style.display = 'flex';

    // Draw ROM progress chart
    if (patientSessions.length > 1) {
        setTimeout(() => {
            const ctx = document.getElementById('profile-progress-chart')?.getContext('2d');
            if (!ctx) return;
            new Chart(ctx, {
                type:'line',
                data:{
                    labels: patientSessions.map((s,i)=>`جلسة ${i+1}`).reverse(),
                    datasets:[{
                        label:'مدى الحركة', data:patientSessions.map(s=>s.romDegrees||0).reverse(),
                        borderColor:'#00e5c4', backgroundColor:'rgba(0,229,196,0.1)',
                        fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#00e5c4'
                    }]
                },
                options:{ responsive:true, plugins:{legend:{display:false}}, scales:{
                    y:{min:0,max:180,ticks:{color:'#7a9e96'},grid:{color:'rgba(255,255,255,0.04)'}},
                    x:{ticks:{color:'#7a9e96'},grid:{display:false}}
                }}
            });
        }, 100);
    }
}

// ====== SESSIONS TABLE ======
function renderSessionsTable(sessions) {
    const tbody = document.getElementById('sessions-tbody');
    if (!tbody) return;
    if (!sessions.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">لا توجد جلسات</td></tr>'; return; }
    tbody.innerHTML = sessions.map(s => `
        <tr>
            <td><div style="font-weight:700">${s.patientName||'—'}</div></td>
            <td>${s.exercise||'—'}</td>
            <td><span class="badge-count">${s.totalReps||0}</span></td>
            <td><span style="color:var(--teal);font-weight:700">${s.romDegrees||0}°</span></td>
            <td>${'★'.repeat(s.qualityStars||0)}${'☆'.repeat(5-(s.qualityStars||0))}</td>
            <td>${formatDuration(s.durationSeconds||0)}</td>
            <td>${formatDate(s.completedAt)}</td>
            <td><button class="btn-sm" onclick="viewSessionDetail('${s.id}')">تفاصيل</button></td>
        </tr>`).join('');
}

function filterSessions() {
    const q  = document.getElementById('session-search').value.toLowerCase();
    const ex = document.getElementById('session-filter-ex').value;
    const filtered = DASH.allSessions.filter(s =>
        (s.patientName||'').toLowerCase().includes(q) &&
        (!ex || s.exercise === ex)
    );
    renderSessionsTable(filtered);
}

// ====== ANALYTICS ======
function populateAnalyticsPatients() {
    const sel = document.getElementById('analytics-patient');
    if (!sel) return;
    const names = [...new Set(DASH.allSessions.map(s=>s.patientName).filter(Boolean))];
    sel.innerHTML = '<option value="">كل المرضى</option>' + names.map(n=>`<option>${n}</option>`).join('');
}

function loadAnalytics() {
    const patient  = document.getElementById('analytics-patient')?.value;
    const exercise = document.getElementById('analytics-exercise')?.value;
    let sessions = DASH.allSessions.filter(s =>
        (!patient  || s.patientName === patient) &&
        (!exercise || s.exercise === exercise)
    ).slice(0,50).reverse();

    const labels  = sessions.map((s,i)=>`${i+1}`);
    const roms    = sessions.map(s=>s.romDegrees||0);
    const reps    = sessions.map(s=>s.totalReps||0);
    const quality = sessions.map(s=>s.qualityStars||0);

    const chartCfg = (data, color, label, max) => ({
        type:'line', data:{ labels, datasets:[{
            label, data, borderColor:color,
            backgroundColor: color.replace(')',',0.1)').replace('rgb','rgba'),
            fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:color
        }]},
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{
            y:{min:0, max, ticks:{color:'#7a9e96'}, grid:{color:'rgba(255,255,255,0.04)'}},
            x:{ticks:{color:'#7a9e96'}, grid:{display:false}}
        }}
    });

    const destroyAndCreate = (id, cfg) => {
        const el = document.getElementById(id);
        if (!el) return;
        const existing = Chart.getChart(el);
        if (existing) existing.destroy();
        new Chart(el.getContext('2d'), cfg);
    };

    destroyAndCreate('romProgressChart',     chartCfg(roms,    '#00e5c4', 'مدى الحركة°', 180));
    destroyAndCreate('repsProgressChart',    chartCfg(reps,    '#7c6fff', 'التكرارات',   Math.max(30,...reps)+5));
    destroyAndCreate('qualityProgressChart', chartCfg(quality, '#ffd32a', 'الجودة',      5));

    // Summary
    const avgRom   = roms.length    ? Math.round(roms.reduce((a,v)=>a+v,0)/roms.length)       : 0;
    const avgReps  = reps.length    ? Math.round(reps.reduce((a,v)=>a+v,0)/reps.length)       : 0;
    const avgQual  = quality.length ? (quality.reduce((a,v)=>a+v,0)/quality.length).toFixed(1): 0;
    const trend    = roms.length>1  ? (roms[roms.length-1]-roms[0]>0 ? '📈 تحسن' : '📉 تراجع') : '—';

    document.getElementById('analytics-summary').innerHTML = `
        <div class="analytics-grid">
            <div class="astat"><span class="astat-val">${sessions.length}</span><span class="astat-lbl">جلسة محللة</span></div>
            <div class="astat"><span class="astat-val">${avgRom}°</span><span class="astat-lbl">متوسط ROM</span></div>
            <div class="astat"><span class="astat-val">${avgReps}</span><span class="astat-lbl">متوسط التكرارات</span></div>
            <div class="astat"><span class="astat-val">${avgQual}★</span><span class="astat-lbl">متوسط الجودة</span></div>
            <div class="astat"><span class="astat-val">${trend}</span><span class="astat-lbl">اتجاه ROM</span></div>
        </div>`;
}

// ====== EXCEL EXPORT ======
function exportExcel() {
    const sessions = DASH.allSessions;
    if (!sessions.length) { showToast('لا توجد بيانات للتصدير','warn'); return; }
    const rows = [
        ['المريض','التمرين','التكرارات','مدى الحركة (°)','الجودة (نجوم)','مدة الجلسة (ثانية)','التاريخ']
    ];
    sessions.forEach(s => rows.push([
        s.patientName||'—', s.exercise||'—', s.totalReps||0,
        s.romDegrees||0, s.qualityStars||0, s.durationSeconds||0,
        s.completedAt?.toDate?.()?.toLocaleDateString('ar-EG')||'—'
    ]));
    downloadCSV(rows, 'PhysioAI_Sessions.csv');
    showToast('تم التصدير ✓');
}

function exportSessionExcel() {
    if (!SESSION.allAngles.length) return;
    const rows = [['رقم','الزاوية (°)'], ...SESSION.allAngles.map((a,i)=>[i+1,Math.round(a)])];
    downloadCSV(rows, `جلسة_${SESSION.patient.name}_${new Date().toLocaleDateString('ar-EG')}.csv`);
    showToast('تم تصدير بيانات الجلسة ✓');
}

function downloadCSV(rows, filename) {
    const bom = '\uFEFF';
    const csv = bom + rows.map(r => r.map(v=>`"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ================================================================
//  SESSION SETUP
// ================================================================
function changeParam(key, delta) {
    const limits = {sets:[1,10], repsPerSet:[3,30], restTime:[10,120]};
    PARAMS[key] = Math.max(limits[key][0], Math.min(limits[key][1], PARAMS[key]+delta));
    document.getElementById(`${key}-val`).textContent = PARAMS[key];
}

document.querySelectorAll('.ex-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.ex-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        SESSION.exercise = card.dataset.exercise;
    });
});

// ================================================================
//  EXERCISE SESSION
// ================================================================
async function startSession() {
    SESSION.patient.name      = document.getElementById('patient-name').value.trim() || 'المريض';
    SESSION.patient.age       = document.getElementById('patient-age').value || '—';
    SESSION.patient.diagnosis = document.getElementById('diagnosis').value.trim() || '—';
    SESSION.targetSets  = PARAMS.sets;
    SESSION.repsPerSet  = PARAMS.repsPerSet;
    SESSION.restTime    = PARAMS.restTime;

    Object.assign(SESSION, {
        isStarted:false, currentSet:1, reps:0, stage:'down',
        smoothedAngle:180, minAngle:999, maxAngle:0,
        globalMinAngle:999, globalMaxAngle:0,
        startTime:Date.now(), totalReps:0, allAngles:[], setResults:[],
        qualityScore:0, isResting:false, patientDocId:null, sessionDocId:null,
    });

    const ex = EXERCISES[SESSION.exercise];
    showScreen('screen-exercise');
    document.getElementById('display-name').textContent = SESSION.patient.name;
    document.getElementById('exercise-badge').textContent = `${ex.icon} ${ex.name}`;
    document.getElementById('rep-goal').textContent = `الهدف: ${SESSION.repsPerSet}`;
    updateSetDots(); updateSetDisplay();
    setFeedback(ex.desc,'📋');

    initChart(); init3D(); initCamera(); startTimer();
    SESSION.analysisInterval = setInterval(doAnalysis, CONFIG.analysisInterval);

    // Firebase — save patient & session
    if (firebaseReady && currentUser?.uid !== 'guest') {
        try {
            const pRef = await db.collection('patients').add({
                name:SESSION.patient.name, age:SESSION.patient.age,
                diagnosis:SESSION.patient.diagnosis,
                createdBy:currentUser.uid,
                createdAt:firebase.firestore.FieldValue.serverTimestamp()
            });
            SESSION.patientDocId = pRef.id;
            const sRef = await db.collection('sessions').add({
                patientId:pRef.id, patientName:SESSION.patient.name,
                exercise:ex.name, exerciseKey:SESSION.exercise,
                targetSets:SESSION.targetSets, repsPerSet:SESSION.repsPerSet,
                status:'in_progress',
                createdBy:currentUser.uid,
                startedAt:firebase.firestore.FieldValue.serverTimestamp()
            });
            SESSION.sessionDocId = sRef.id;
        } catch(e) { console.warn('Firebase session create error:', e); }
    }

    speak(`مرحباً ${SESSION.patient.name}، سنبدأ تمرين ${ex.name}. ${ex.desc}`);
    setTimeout(() => { SESSION.isStarted = true; }, 1500);
}

// ================================================================
//  THREE.JS 3D SKELETON
// ================================================================
const MP_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
    [11,12],[11,23],[12,24],[23,24],
    [11,13],[13,15],[15,17],[15,19],[17,19],
    [12,14],[14,16],[16,18],[16,20],[18,20],
    [23,25],[25,27],[27,29],[27,31],[29,31],
    [24,26],[26,28],[28,30],[28,32],[30,32],
];

function init3D() {
    const canvas = document.getElementById('avatar-canvas');
    if (!canvas || SESSION.threeRenderer) return;
    const W = canvas.clientWidth||190, H = canvas.clientHeight||350;

    SESSION.threeRenderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
    SESSION.threeRenderer.setSize(W,H);
    SESSION.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    SESSION.threeRenderer.setClearColor(0x000000,0);
    SESSION.threeScene = new THREE.Scene();
    SESSION.threeCamera3d = new THREE.PerspectiveCamera(55, W/H, 0.01, 100);
    SESSION.threeCamera3d.position.set(0,0,2.8);

    const amb = new THREE.AmbientLight(0xffffff,0.4);
    SESSION.threeScene.add(amb);
    const dir = new THREE.DirectionalLight(0x00e5c4,1.3);
    dir.position.set(1,2,3); SESSION.threeScene.add(dir);
    const back = new THREE.DirectionalLight(0x7c6fff,0.5);
    back.position.set(-2,-1,-2); SESSION.threeScene.add(back);

    const grid = new THREE.GridHelper(3,12,0x1a3028,0x131e1b);
    grid.position.y = -1.3; SESSION.threeScene.add(grid);

    SESSION.boneMeshes = {};
    SESSION.jointSpheres = {};

    MP_CONNECTIONS.forEach(([a,b]) => {
        const mat = new THREE.MeshPhongMaterial({color:0x00e5c4,transparent:true,opacity:0.7,emissive:0x001a14});
        const geo = new THREE.CylinderGeometry(0.013,0.013,1,8);
        const mesh = new THREE.Mesh(geo,mat);
        mesh.visible = false;
        SESSION.threeScene.add(mesh);
        SESSION.boneMeshes[`${a}-${b}`] = mesh;
    });

    for(let i=0;i<33;i++){
        const geo = new THREE.SphereGeometry(0.028,10,10);
        const mat = new THREE.MeshPhongMaterial({color:0xff4757,emissive:0x220000,shininess:80});
        const mesh = new THREE.Mesh(geo,mat);
        mesh.visible = false;
        SESSION.threeScene.add(mesh);
        SESSION.jointSpheres[i] = mesh;
    }

    animate3D();
}

let avatarRotY = 0, avatarAnimFrame = null;
function animate3D() {
    avatarAnimFrame = requestAnimationFrame(animate3D);
    if (!SESSION.threeRenderer || !SESSION.threeScene) return;
    if (!SESSION.lastLandmarks) {
        avatarRotY += 0.007;
        SESSION.threeScene.rotation.y = avatarRotY;
        // demo animation
        const t = Date.now()/1000;
        const fakeLm = buildDemoLandmarks(t);
        update3DSkeleton(fakeLm);
    } else {
        SESSION.threeScene.rotation.y *= 0.92;
    }
    SESSION.threeRenderer.render(SESSION.threeScene, SESSION.threeCamera3d);
}

function buildDemoLandmarks(t) {
    const swing = (Math.sin(t*1.2)*0.5+0.5);
    const base = [
        [0.5,0.07,0],[0.49,0.09,0],[0.48,0.09,0],[0.47,0.09,0],
        [0.51,0.09,0],[0.52,0.09,0],[0.53,0.09,0],[0.46,0.08,0],
        [0.54,0.08,0],[0.48,0.11,0],[0.52,0.11,0],
        [0.43,0.21,0],[0.57,0.21,0],
        [0.38,0.21+swing*0.15,0],[0.62,0.21+swing*0.15,0],
        [0.35,0.21+swing*0.28,0],[0.65,0.21+swing*0.28,0],
        [0.34,0.21+swing*0.30,0],[0.66,0.21+swing*0.30,0],
        [0.33,0.21+swing*0.29,0],[0.67,0.21+swing*0.29,0],
        [0.35,0.21+swing*0.26,0],[0.65,0.21+swing*0.26,0],
        [0.45,0.50,0],[0.55,0.50,0],
        [0.44,0.68,0],[0.56,0.68,0],
        [0.44,0.86,0],[0.56,0.86,0],
        [0.43,0.88,0],[0.57,0.88,0],
        [0.44,0.90,0],[0.56,0.90,0],
    ];
    return base.map(([x,y,z])=>({x,y,z,visibility:0.95}));
}

function update3DSkeleton(landmarks) {
    if (!SESSION.threeScene || !landmarks) return;
    const ex = EXERCISES[SESSION.exercise];
    const activeJoints = new Set(ex.joints);
    const activeBoneKeys = new Set(ex.bones.map(([a,b])=>`${a}-${b}`));

    const toVec = lm => new THREE.Vector3(
        (lm.x-0.5)*-2.4, (lm.y-0.5)*-2.4, (lm.z||0)*-1.5
    );

    for(let i=0; i<Math.min(landmarks.length,33); i++){
        const lm = landmarks[i], sphere = SESSION.jointSpheres[i];
        if (!sphere) continue;
        if (lm.visibility < 0.3) { sphere.visible=false; continue; }
        sphere.position.copy(toVec(lm));
        sphere.visible = true;
        if (activeJoints.has(i)) {
            sphere.material.color.set(0xffd32a);
            sphere.material.emissive.set(0x332200);
            sphere.scale.setScalar(1.7);
        } else {
            sphere.material.color.set(0xff4757);
            sphere.material.emissive.set(0x220000);
            sphere.scale.setScalar(1.0);
        }
    }

    MP_CONNECTIONS.forEach(([a,b]) => {
        const key = `${a}-${b}`, mesh = SESSION.boneMeshes[key];
        const lmA = landmarks[a], lmB = landmarks[b];
        if (!mesh||!lmA||!lmB||lmA.visibility<0.3||lmB.visibility<0.3){if(mesh)mesh.visible=false;return;}
        const vA = toVec(lmA), vB = toVec(lmB);
        const dist = vA.distanceTo(vB);
        if (dist < 0.001){mesh.visible=false;return;}
        mesh.position.copy(vA).add(vB).multiplyScalar(0.5);
        const dir = vB.clone().sub(vA).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
        mesh.scale.set(1,dist,1);
        mesh.visible = true;
        if (activeBoneKeys.has(key)) {
            mesh.material.color.set(0x00e5c4);
            mesh.material.opacity = 1.0;
            mesh.material.emissive.set(0x003322);
        } else {
            mesh.material.color.set(0x1a5045);
            mesh.material.opacity = 0.4;
            mesh.material.emissive.set(0x000000);
        }
    });
}

// ================================================================
//  CAMERA & POSE
// ================================================================
function initCamera() {
    const video = document.getElementById('input-video');
    SESSION.pose = new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
    SESSION.pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.65,minTrackingConfidence:0.65});
    SESSION.pose.onResults(onResults);
    SESSION.camera = new Camera(video,{
        onFrame: async()=>{ if(SESSION.pose) await SESSION.pose.send({image:video}); },
        width:640, height:480
    });
    SESSION.camera.start();
}

function onResults(results) {
    if (!results.poseLandmarks||!SESSION.isStarted||SESSION.isResting) return;
    const canvas = document.getElementById('output-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = results.image.width;
    canvas.height = results.image.height;
    ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(results.image,0,0);

    const lm = results.poseLandmarks;
    SESSION.lastLandmarks = lm;
    const ex = EXERCISES[SESSION.exercise];
    const [iA,iB,iC] = ex.joints;
    if (!lm[iA]||!lm[iB]||!lm[iC]){ctx.restore();return;}

    const angle = calculateAngle(lm[iA],lm[iB],lm[iC]);
    SESSION.minAngle = Math.min(SESSION.minAngle,angle);
    SESSION.maxAngle = Math.max(SESSION.maxAngle,angle);
    SESSION.globalMinAngle = Math.min(SESSION.globalMinAngle,angle);
    SESSION.globalMaxAngle = Math.max(SESSION.globalMaxAngle,angle);
    SESSION.allAngles.push(angle);

    SESSION.chart.data.datasets[0].data.push(Math.round(angle));
    if (SESSION.chart.data.datasets[0].data.length>60) SESSION.chart.data.datasets[0].data.shift();
    SESSION.chart.update('none');

    const dom = id => document.getElementById(id);
    dom('angle-overlay').textContent = `${Math.round(angle)}°`;
    dom('stat-rom').textContent = `${Math.round(SESSION.maxAngle-SESSION.minAngle)}°`;
    dom('stat-min').textContent = `${Math.round(SESSION.minAngle)}°`;
    dom('stat-max').textContent = `${Math.round(SESSION.maxAngle)}°`;
    dom('avatar-angle-label').textContent = `الزاوية: ${Math.round(angle)}°`;
    dom('avatar-stage-label').textContent  = SESSION.stage==='up' ? 'ثني ↑' : 'مد ↓';

    // Form quality detection
    detectFormErrors(lm, angle, canvas, ex);

    // Rep logic
    if (angle > ex.maxExt) SESSION.stage = 'down';
    if (angle < ex.minFlex && SESSION.stage==='down') {
        SESSION.stage = 'up'; SESSION.reps++; SESSION.totalReps++;
        countRep();
    }

    // Draw skeleton
    drawConnectors(ctx,lm,POSE_CONNECTIONS,{color:'#1a4a3a',lineWidth:3});
    drawLandmarks(ctx,lm,{color:'#ffffff',lineWidth:1,radius:3});

    // Highlight active joints
    const pts = [iA,iB,iC].map(i=>({x:lm[i].x*canvas.width, y:lm[i].y*canvas.height}));
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y); ctx.lineTo(pts[2].x,pts[2].y);
    ctx.strokeStyle=ex.color; ctx.lineWidth=5; ctx.stroke();
    pts.forEach((p,i)=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,i===1?13:8,0,Math.PI*2);
        ctx.fillStyle = i===1?'#ffd32a':ex.color; ctx.fill();
    });

    drawAngleArc(ctx,pts[0],pts[1],pts[2],angle);
    drawGuidanceArrow(lm,pts,angle,canvas,ex);
    update3DSkeleton(lm);
    ctx.restore();
}

// ====== FORM ERROR DETECTION ======
let formAlertTimeout = null;
function detectFormErrors(lm, angle, canvas, ex) {
    const alertEl = document.getElementById('form-alert');
    if (!alertEl) return;
    let error = null;

    // Check for shoulder shrug (left shoulder rising too high during bicep curl)
    if (ex.exerciseKey === 'bicep' || SESSION.exercise === 'bicep') {
        const lShoulder = lm[11], lElbow = lm[13];
        if (lShoulder && lElbow && Math.abs(lShoulder.y - lElbow.y) < 0.05 && angle < 100) {
            error = '⚠️ لا ترفع كتفك!';
        }
    }
    // Back straightness — check if nose too far from midpoint of hips
    const nose = lm[0], lHip = lm[23], rHip = lm[24];
    if (nose && lHip && rHip) {
        const hipMidX = (lHip.x + rHip.x)/2;
        if (Math.abs(nose.x - hipMidX) > 0.18) error = '⚠️ حافظ على استقامة ظهرك!';
    }

    if (error) {
        alertEl.textContent = error;
        alertEl.style.display = 'block';
        setEyeState('error');
        clearTimeout(formAlertTimeout);
        formAlertTimeout = setTimeout(()=>{ alertEl.style.display='none'; setEyeState('idle'); }, 2000);
    }
}

// ====== ANGLE ARC ======
function drawAngleArc(ctx, pA, pB, pC, angle) {
    const dx1=pA.x-pB.x, dy1=pA.y-pB.y;
    const dx2=pC.x-pB.x, dy2=pC.y-pB.y;
    const a1=Math.atan2(dy1,dx1), a2=Math.atan2(dy2,dx2);
    ctx.beginPath(); ctx.arc(pB.x,pB.y,36,a1,a2,false);
    ctx.strokeStyle = angle<90?'#00e5c4':'#ffd32a'; ctx.lineWidth=3; ctx.stroke();
    const mid=(a1+a2)/2;
    ctx.fillStyle='#fff'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
    ctx.fillText(`${Math.round(angle)}°`, pB.x+(52)*Math.cos(mid), pB.y+(52)*Math.sin(mid));
}

// ====== GUIDANCE ARROWS ======
function drawGuidanceArrow(lm, pts, angle, canvas, ex) {
    const gc = document.getElementById('guide-canvas');
    if (!gc) return;
    gc.width = canvas.width; gc.height = canvas.height;
    const gctx = gc.getContext('2d');
    gctx.clearRect(0,0,gc.width,gc.height);
    const needFlex = angle > ex.minFlex+20 && SESSION.stage==='down';
    if (!needFlex) return;
    const alpha = 0.5 + 0.5*Math.sin(Date.now()/400);
    gctx.globalAlpha = alpha;
    arrowBetween(gctx, pts[2].x, pts[2].y, pts[1].x, pts[1].y, '#00e5c4', 4, 18);
    gctx.globalAlpha = 1;
}

function arrowBetween(ctx,x1,y1,x2,y2,color,lw,hs){
    const ang=Math.atan2(y2-y1,x2-x1), len=Math.hypot(x2-x1,y2-y1);
    const ex=x1+Math.cos(ang)*len*0.4, ey=y1+Math.sin(ang)*len*0.4;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(ex,ey);
    ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex,ey);
    ctx.lineTo(ex-hs*Math.cos(ang-0.4),ey-hs*Math.sin(ang-0.4));
    ctx.lineTo(ex-hs*Math.cos(ang+0.4),ey-hs*Math.sin(ang+0.4));
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
}

// ================================================================
//  REP & SET LOGIC
// ================================================================
function countRep() {
    const el = document.getElementById('rep-number');
    el.textContent = SESSION.reps;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    document.getElementById('rep-bar').style.width = Math.min(SESSION.reps/SESSION.repsPerSet*100,100)+'%';
    setEyeState('correct'); setTimeout(()=>setEyeState('idle'),700);
    speak(SESSION.reps.toString(),true);
    updateQuality();
    if (SESSION.reps === Math.floor(SESSION.repsPerSet/2)) setFeedback('ممتاز! نصف الطريق 💪','🎯');
    if (SESSION.reps >= SESSION.repsPerSet) completeSet();
}

function completeSet() {
    SESSION.isStarted = false;
    const rom = SESSION.maxAngle - SESSION.minAngle;
    SESSION.setResults.push({set:SESSION.currentSet, reps:SESSION.reps, rom:Math.round(rom)});
    if (firebaseReady && SESSION.sessionDocId) {
        db.collection('sessions').doc(SESSION.sessionDocId)
          .update({[`set_${SESSION.currentSet}`]:SESSION.setResults.at(-1)}).catch(()=>{});
    }
    const dot = document.querySelectorAll('.set-dot')[SESSION.currentSet-1];
    if (dot){dot.classList.remove('active');dot.classList.add('done');}
    if (SESSION.currentSet >= SESSION.targetSets){speak('رائع! أكملت جميع المجموعات.');setTimeout(endSession,800);return;}
    speak(`أحسنت! انتهت المجموعة ${SESSION.currentSet}. استرح.`);
    setEyeState('rest'); startRest();
}

function startRest() {
    SESSION.isResting = true;
    let r = SESSION.restTime;
    document.getElementById('rest-timer').textContent = r;
    document.getElementById('rest-next').textContent  = `المجموعة التالية: ${SESSION.currentSet+1} من ${SESSION.targetSets}`;
    document.getElementById('rest-overlay').style.display = 'flex';
    SESSION.restInterval = setInterval(()=>{
        r--;
        document.getElementById('rest-timer').textContent = r;
        if (r<=3&&r>0) speak(r.toString(),true);
        if (r<=0) skipRest();
    },1000);
}

function skipRest() {
    clearInterval(SESSION.restInterval);
    document.getElementById('rest-overlay').style.display = 'none';
    SESSION.currentSet++; SESSION.reps=0; SESSION.minAngle=999; SESSION.maxAngle=0;
    SESSION.stage='down'; SESSION.isResting=false;
    document.getElementById('rep-number').textContent='0';
    document.getElementById('rep-bar').style.width='0%';
    updateSetDots(); updateSetDisplay(); setEyeState('idle');
    setFeedback(`ابدأ المجموعة ${SESSION.currentSet}‎ 💪`,'🔁');
    speak(`ابدأ المجموعة ${SESSION.currentSet}`);
    setTimeout(()=>{SESSION.isStarted=true;},500);
}

function updateSetDots() {
    const c = document.getElementById('set-dots'); if(!c)return;
    c.innerHTML='';
    for(let i=1;i<=SESSION.targetSets;i++){
        const d=document.createElement('div'); d.className='set-dot';
        if(i<SESSION.currentSet)d.classList.add('done');
        else if(i===SESSION.currentSet)d.classList.add('active');
        c.appendChild(d);
    }
}
function updateSetDisplay(){ const el=document.getElementById('set-display'); if(el)el.textContent=`${SESSION.currentSet} / ${SESSION.targetSets}`; }

// ====== QUALITY ======
function updateQuality() {
    const rom=SESSION.maxAngle-SESSION.minAngle, ex=EXERCISES[SESSION.exercise];
    const stars=Math.max(1,Math.min(5,Math.round((rom/(ex.maxExt-ex.minFlex))*5)));
    SESSION.qualityScore=stars;
    document.querySelectorAll('#quality-stars span').forEach((s,i)=>{
        s.textContent=i<stars?'★':'☆'; s.style.color=i<stars?'var(--gold)':'var(--text-dim)';
    });
    const lbs=['','يحتاج تحسين','جيد','جيد جداً','ممتاز','مثالي 🏆'];
    const el=document.getElementById('quality-text'); if(el)el.textContent=lbs[stars]||'—';
}

// ====== ANALYSIS ======
function doAnalysis() {
    if(!SESSION.isStarted||SESSION.allAngles.length<10)return;
    const rom=SESSION.globalMaxAngle-SESSION.globalMinAngle;
    let msg = rom<40 ? 'حاول زيادة مدى الحركة — الثني الكامل يعطي فائدة أكبر.'
            : rom<70 ? 'مدى حركتك معقول، حاول الوصول لزاوية أعمق.'
            : SESSION.totalReps>5 ? 'أداء ممتاز! حافظ على هذا الإيقاع.'
            : 'استمر، تأكد من ثبات ظهرك.';
    setFeedback(msg,'🧠'); speak(msg);
}

// ================================================================
//  END SESSION & REPORT
// ================================================================
async function endSession() {
    SESSION.isStarted=false;
    clearInterval(SESSION.timerInterval);
    clearInterval(SESSION.analysisInterval);
    if(SESSION.camera)SESSION.camera.stop();
    SESSION.lastLandmarks=null;

    const duration=Math.round((Date.now()-SESSION.startTime)/1000);
    const rom=SESSION.globalMaxAngle-SESSION.globalMinAngle;
    const ex=EXERCISES[SESSION.exercise];
    const romScore=Math.min(rom/(ex.maxExt-ex.minFlex),1);
    const repScore=Math.min(SESSION.totalReps/(SESSION.targetSets*SESSION.repsPerSet),1);
    const finalStars=Math.max(1,Math.round((romScore*0.5+repScore*0.5)*5));

    if(firebaseReady&&SESSION.sessionDocId&&currentUser?.uid!=='guest'){
        try{
            await db.collection('sessions').doc(SESSION.sessionDocId).update({
                totalReps:SESSION.totalReps, setsDone:SESSION.setResults.length,
                romDegrees:Math.round(rom), durationSeconds:duration,
                qualityStars:finalStars, globalMinAngle:Math.round(SESSION.globalMinAngle),
                globalMaxAngle:Math.round(SESSION.globalMaxAngle),
                angleData:SESSION.allAngles.slice(0,500),
                status:'completed',
                completedAt:firebase.firestore.FieldValue.serverTimestamp()
            });
        }catch(e){console.warn('Save error:',e);}
    }

    showReport(duration,rom,finalStars);
}

function showReport(duration, rom, stars) {
    showScreen('screen-report');
    const ex=EXERCISES[SESSION.exercise];
    const now=new Date();
    document.getElementById('report-date').textContent=now.toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('report-patient').innerHTML=`<strong>المريض:</strong> ${SESSION.patient.name} &nbsp;|&nbsp; <strong>العمر:</strong> ${SESSION.patient.age} &nbsp;|&nbsp; <strong>التشخيص:</strong> ${SESSION.patient.diagnosis}`;
    const mm=Math.floor(duration/60),ss=duration%60;
    document.getElementById('report-summary').innerHTML=`
        <div class="summary-box"><div class="summary-val">${SESSION.totalReps}</div><div class="summary-lbl">إجمالي التكرارات</div></div>
        <div class="summary-box"><div class="summary-val">${SESSION.setResults.length}</div><div class="summary-lbl">مجموعات مكتملة</div></div>
        <div class="summary-box"><div class="summary-val">${Math.round(rom)}°</div><div class="summary-lbl">أفضل مدى حركي</div></div>
        <div class="summary-box"><div class="summary-val">${mm}:${String(ss).padStart(2,'0')}</div><div class="summary-lbl">مدة الجلسة</div></div>`;
    let analysis=`<strong>${ex.icon} ${ex.name}</strong><br>`;
    analysis+=rom<40?'⚠️ مدى الحركة محدود — يُنصح بتمارين إطالة.<br>':rom<70?'🟡 مدى الحركة متوسط — استمر في التحسن.<br>':'✅ مدى الحركة ممتاز!<br>';
    analysis+=SESSION.totalReps>=SESSION.targetSets*SESSION.repsPerSet?'✅ أكمل جميع التكرارات المطلوبة.<br>':`⚠️ أُكمل ${SESSION.totalReps} من ${SESSION.targetSets*SESSION.repsPerSet}.<br>`;
    analysis+=`<strong>الجودة:</strong> ${'★'.repeat(stars)}${'☆'.repeat(5-stars)}<br><br><strong>توصية:</strong> زيادة تدريجية في التكرارات مع الجلسات القادمة.`;
    document.getElementById('report-analysis').innerHTML=analysis;
    const statusEl=document.getElementById('db-save-status');
    if(statusEl){statusEl.textContent=firebaseReady&&SESSION.sessionDocId?'✅ تم الحفظ في Firebase':'⚠️ الحفظ المحلي فقط';statusEl.style.color=firebaseReady&&SESSION.sessionDocId?'var(--teal)':'var(--gold)';}

    const existing=Chart.getChart('reportChart');
    if(existing)existing.destroy();
    new Chart(document.getElementById('reportChart').getContext('2d'),{
        type:'line',
        data:{labels:SESSION.allAngles.map((_,i)=>i),datasets:[{label:'الزاوية',data:SESSION.allAngles.map(a=>Math.round(a)),borderColor:'#00e5c4',backgroundColor:'rgba(0,229,196,0.08)',fill:true,tension:0.4,pointRadius:0}]},
        options:{responsive:true,animation:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:180,ticks:{color:'#7a9e96'},grid:{color:'rgba(255,255,255,0.04)'}},x:{display:false}}}
    });
    speak(`انتهت الجلسة. ${SESSION.patient.name} أكمل ${SESSION.totalReps} تكراراً بمدى ${Math.round(rom)} درجة.`);
}

function printReport(){window.print();}

// ================================================================
//  HELPERS
// ================================================================
function initChart(){
    const existing=Chart.getChart('angleChart'); if(existing)existing.destroy();
    const ctx=document.getElementById('angleChart').getContext('2d');
    SESSION.chart=new Chart(ctx,{type:'line',data:{datasets:[{label:'الزاوية',data:[],borderColor:'#00e5c4',backgroundColor:'rgba(0,229,196,0.1)',fill:true,tension:0.4,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:180,ticks:{color:'#7a9e96',font:{size:9}},grid:{color:'rgba(255,255,255,0.04)'}},x:{display:false}}}});
}

function startTimer(){
    SESSION.timerInterval=setInterval(()=>{
        if(!SESSION.startTime)return;
        const e=Math.floor((Date.now()-SESSION.startTime)/1000);
        const el=document.getElementById('stat-timer');
        if(el)el.textContent=`${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;
    },1000);
}

function calculateAngle(a,b,c){
    const rad=Math.atan2(c.y-b.y,c.x-b.x)-Math.atan2(a.y-b.y,a.x-b.x);
    let angle=Math.abs((rad*180)/Math.PI);
    if(angle>180)angle=360-angle;
    SESSION.smoothedAngle=SESSION.smoothedAngle*(1-CONFIG.smoothing)+angle*CONFIG.smoothing;
    return SESSION.smoothedAngle;
}

function speak(text,force=false){
    if(!force&&window.speechSynthesis.speaking)return;
    window.speechSynthesis.cancel();
    const ut=new SpeechSynthesisUtterance(text);
    ut.lang='ar-SA'; ut.rate=1.05;
    ut.onstart=()=>setEyeState('speaking');
    ut.onend=()=>setEyeState('idle');
    window.speechSynthesis.speak(ut);
}

function setEyeState(state){
    ['eye-left','eye-right'].forEach(id=>{
        const el=document.getElementById(id);
        if(el)el.className=`eye${state&&state!=='idle'?' '+state:''}`;
    });
}

function setFeedback(text,icon='🤖'){
    const ic=document.getElementById('feedback-icon'), tx=document.getElementById('feedback-text');
    if(ic)ic.textContent=icon; if(tx)tx.textContent=text;
}

function formatDate(ts){
    if(!ts)return'—';
    const d=ts?.toDate?.()??new Date(ts);
    return d.toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'});
}
function formatDuration(secs){
    const m=Math.floor(secs/60),s=secs%60;
    return `${m}:${String(s).padStart(2,'0')}`;
}
function viewSessionDetail(id){ showToast('عرض تفاصيل الجلسة — قريباً'); }

function showToast(msg,type='success'){
    const t=document.createElement('div');
    t.className=`toast toast-${type}`;
    t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(()=>t.classList.add('show'),50);
    setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),400);},3000);
}

function openVideoModal(event,exKey){
    event.stopPropagation();
    const ex=EXERCISES[exKey];
    document.getElementById('modal-title').textContent=`${ex.icon} ${ex.name}`;
    document.getElementById('tutorial-iframe').src=`https://www.youtube.com/embed/${ex.videoId}?autoplay=1&rel=0`;
    document.getElementById('modal-tips').innerHTML=`<strong style="color:var(--teal)">💡 نصائح:</strong><br>`+ex.tips.map(t=>`• ${t}`).join('<br>');
    document.getElementById('video-modal').style.display='flex';
}
function closeVideoModal(){
    document.getElementById('tutorial-iframe').src='';
    document.getElementById('video-modal').style.display='none';
}

function copySQL(){ showToast('الكولكشنز بتتعمل أوتوماتيك في Firebase!'); }

// Exercise card click
document.querySelectorAll('.ex-card').forEach(card=>{
    card.addEventListener('click',()=>{
        document.querySelectorAll('.ex-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        SESSION.exercise=card.dataset.exercise;
    });
});

// Keyboard shortcuts
document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeVideoModal();document.getElementById('patient-modal').style.display='none';}
    if(e.key===' '&&SESSION.isResting){e.preventDefault();skipRest();}
});

// Modal backdrop close
['video-modal','patient-modal'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click',function(e){if(e.target===this)this.style.display='none';});
});

// Resize 3D
window.addEventListener('resize',()=>{
    if(!SESSION.threeRenderer)return;
    const c=document.getElementById('avatar-canvas'); if(!c)return;
    SESSION.threeRenderer.setSize(c.clientWidth,c.clientHeight);
    if(SESSION.threeCamera3d){SESSION.threeCamera3d.aspect=c.clientWidth/c.clientHeight;SESSION.threeCamera3d.updateProjectionMatrix();}
});

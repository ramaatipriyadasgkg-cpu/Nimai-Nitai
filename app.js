// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyCZdmZJckSWJo1tFT14NVKVurUGsoKrRy8",
    authDomain: "rapd--sadhana-tracker.firebaseapp.com",
    projectId: "rapd--sadhana-tracker",
    storageBucket: "rapd--sadhana-tracker.firebasestorage.app",
    messagingSenderId: "811405448950",
    appId: "1:811405448950:web:8b711f3129e4bdf06dbed7"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null, userProfile = null, activeListener = null;
let scoreChart = null, activityChart = null;
// For edit-mode tracking
let editingDate = null;

// --- 2. HELPERS ---
const t2m = (t, isSleep = false) => {
    if (!t || t === "NR") return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isSleep && h >= 0 && h <= 3) h += 24;
    return h * 60 + m;
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const fmt = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleString('en-GB', { month: 'short' });
        return `${day} ${month}`;
    };
    return { sunStr: sun.toISOString().split('T')[0], label: `${fmt(sun)} to ${fmt(sat)}_${sun.getFullYear()}` };
}

function getNRData(date) {
    return {
        id: date, totalScore: -40, dayPercent: -23,
        sleepTime: "NR", wakeupTime: "NR", morningProgramTime: "NR", chantingTime: "NR",
        readingMinutes: "NR", hearingMinutes: "NR", notesMinutes: "NR", daySleepMinutes: "NR",
        scores: { sleep: -5, wakeup: -5, morningProgram: -5, chanting: -5, reading: -5, hearing: -5, notes: -5, daySleep: 0 }
    };
}

// --- 3. DOWNLOAD EXCEL LOGIC ---
window.downloadUserExcel = async (userId, userName) => {
    try {
        if (typeof XLSX === 'undefined') {
            alert("Excel Library not loaded. Please wait 2 seconds and try again.");
            return;
        }

        const snap = await db.collection('users').doc(userId).collection('sadhana').get();
        if (snap.empty) {
            alert("No data found to download.");
            return;
        }

        const weeksData = {};
        snap.forEach(doc => {
            const weekInfo = getWeekInfo(doc.id);
            if (!weeksData[weekInfo.sunStr]) {
                weeksData[weekInfo.sunStr] = { label: weekInfo.label, sunStr: weekInfo.sunStr, days: {} };
            }
            weeksData[weekInfo.sunStr].days[doc.id] = doc.data();
        });

        const sortedWeeks = Object.keys(weeksData).sort((a, b) => b.localeCompare(a));
        const dataArray = [];

        sortedWeeks.forEach((sunStr, weekIndex) => {
            const week = weeksData[sunStr];
            dataArray.push([`WEEK: ${week.label}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            dataArray.push(['Day', '1.To Bed', 'Mks', '2. Wake Up', 'Mks', '3. Japa', 'Mks', '4. MP', 'Mks', '5. DS', 'Mks', '6. Pathan', 'Mks', '7. Sarwan', 'Mks', '8. Ntes Rev.', 'Mks', 'Day Wise']);

            let weekTotals = { sleepM: 0, wakeupM: 0, morningProgramM: 0, chantingM: 0, readingM: 0, hearingM: 0, notesM: 0, daySleepM: 0, readingMins: 0, hearingMins: 0, notesMins: 0, daySleepMins: 0, total: 0 };
            const weekStart = new Date(week.sunStr);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            for (let i = 0; i < 7; i++) {
                const currentDate = new Date(weekStart);
                currentDate.setDate(currentDate.getDate() + i);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayLabel = `${dayNames[i]} ${String(currentDate.getDate()).padStart(2, '0')}`;
                const entry = week.days[dateStr] || getNRData(dateStr);

                const readMins = entry.readingMinutes === 'NR' ? 0 : (entry.readingMinutes || 0);
                const hearMins = entry.hearingMinutes === 'NR' ? 0 : (entry.hearingMinutes || 0);
                const notesMins = entry.notesMinutes === 'NR' ? 0 : (entry.notesMinutes || 0);

                weekTotals.sleepM += entry.scores?.sleep ?? 0;
                weekTotals.wakeupM += entry.scores?.wakeup ?? 0;
                weekTotals.morningProgramM += entry.scores?.morningProgram ?? 0;
                weekTotals.chantingM += entry.scores?.chanting ?? 0;
                weekTotals.readingM += entry.scores?.reading ?? 0;
                weekTotals.hearingM += entry.scores?.hearing ?? 0;
                weekTotals.notesM += entry.scores?.notes ?? 0;
                weekTotals.daySleepM += entry.scores?.daySleep ?? 0;
                weekTotals.readingMins += readMins;
                weekTotals.hearingMins += hearMins;
                weekTotals.notesMins += notesMins;
                weekTotals.total += entry.totalScore ?? 0;

                dataArray.push([
                    dayLabel, entry.sleepTime || 'NR', entry.scores?.sleep ?? 0,
                    entry.wakeupTime || 'NR', entry.scores?.wakeup ?? 0,
                    entry.chantingTime || 'NR', entry.scores?.chanting ?? 0,
                    entry.morningProgramTime || 'NR', entry.scores?.morningProgram ?? 0,
                    entry.daySleepMinutes !== 'NR' ? entry.daySleepMinutes : 'NR', entry.scores?.daySleep ?? 0,
                    entry.readingMinutes !== 'NR' ? entry.readingMinutes : 'NR', entry.scores?.reading ?? 0,
                    entry.hearingMinutes !== 'NR' ? entry.hearingMinutes : 'NR', entry.scores?.hearing ?? 0,
                    entry.notesMinutes !== 'NR' ? entry.notesMinutes : 'NR', entry.scores?.notes ?? 0,
                    (entry.dayPercent ?? 0) + '%'
                ]);
            }

            let adjustedNotesM = weekTotals.notesM;
            if (weekTotals.notesMins >= 245) adjustedNotesM = 175;
            const adjustedTotal = weekTotals.total - weekTotals.notesM + adjustedNotesM;
            const weekPercent = Math.round((adjustedTotal / 1225) * 100);

            dataArray.push(['Total/1225', '', weekTotals.sleepM, '', weekTotals.wakeupM, '', weekTotals.chantingM, '', weekTotals.morningProgramM, '', weekTotals.daySleepM, weekTotals.readingMins, weekTotals.readingM, weekTotals.hearingMins, weekTotals.hearingM, weekTotals.notesMins, adjustedNotesM, '']);
            dataArray.push(['Sadhna %', '', Math.round((weekTotals.sleepM/175)*100)+'%', '', Math.round((weekTotals.wakeupM/175)*100)+'%', '', Math.round((weekTotals.chantingM/175)*100)+'%', '', Math.round((weekTotals.morningProgramM/175)*100)+'%', '', Math.round((weekTotals.daySleepM/70)*100)+'%', '', Math.round((weekTotals.readingM/175)*100)+'%', '', Math.round((weekTotals.hearingM/175)*100)+'%', '', Math.round((adjustedNotesM/175)*100)+'%', '']);
            dataArray.push(['OVERALL', weekPercent + '%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

            if (weekIndex < sortedWeeks.length - 1) {
                dataArray.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
                dataArray.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            }
        });

        const worksheet = XLSX.utils.aoa_to_sheet(dataArray);
        worksheet['!cols'] = [{wch:10},{wch:8},{wch:4},{wch:8},{wch:4},{wch:8},{wch:4},{wch:8},{wch:4},{wch:10},{wch:4},{wch:10},{wch:4},{wch:10},{wch:4},{wch:12},{wch:4},{wch:8},{wch:6}];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sadhana History');
        XLSX.writeFile(workbook, `${userName}_Sadhana_History.xlsx`);
    } catch (error) {
        alert("Error downloading Excel: " + error.message);
    }
};

// --- 4. UI NAVIGATION ---
function showSection(section) {
    ['auth', 'profile', 'dashboard'].forEach(s => {
        document.getElementById(`${s}-section`).classList.add('hidden');
    });
    document.getElementById(`${section}-section`).classList.remove('hidden');
}

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => { el.classList.remove('active'); el.classList.add('hidden'); });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const tabContent = document.getElementById(t + '-tab');
    if (tabContent) { tabContent.classList.remove('hidden'); tabContent.classList.add('active'); }

    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if (btn) btn.classList.add('active');

    if (t === 'reports' && currentUser) loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'charts' && currentUser) generateCharts();
    // Reset edit mode when leaving Daily Entry
    if (t !== 'sadhana') cancelEdit();
};

// --- 5. AUTH STATE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || !userDoc.data().name) {
            showSection('profile');
            document.getElementById('profile-title').textContent = 'Set Your Name';
        } else {
            userProfile = userDoc.data();
            showSection('dashboard');
            document.getElementById('user-display-name').textContent = userProfile.name;
            setupDateSelect();
            loadReports(currentUser.uid, 'weekly-reports-container');
        }
    } else {
        showSection('auth');
        currentUser = null;
        userProfile = null;
    }
});

// --- 6. SCORING ENGINE ---
function computeScores(slp, wak, mpTime, mpNotDone, chn, rMin, hMin, nMin, dsMin) {
    const sc = { sleep: -5, wakeup: -5, morningProgram: -5, chanting: -5, reading: -5, hearing: -5, notes: -5, daySleep: 0 };

    // Sleep Score
    const slpM = t2m(slp, true);
    if (slpM <= 1350) sc.sleep = 25;
    else if (slpM <= 1355) sc.sleep = 20;
    else if (slpM <= 1360) sc.sleep = 15;
    else if (slpM <= 1365) sc.sleep = 10;
    else if (slpM <= 1370) sc.sleep = 5;
    else if (slpM <= 1375) sc.sleep = 0;
    else sc.sleep = -5;

    // Wakeup Score
    const wakM = t2m(wak, false);
    if (wakM <= 305) sc.wakeup = 25;
    else if (wakM <= 310) sc.wakeup = 20;
    else if (wakM <= 315) sc.wakeup = 15;
    else if (wakM <= 320) sc.wakeup = 10;
    else if (wakM <= 325) sc.wakeup = 5;
    else if (wakM <= 330) sc.wakeup = 0;
    else sc.wakeup = -5;

    // Morning Program Score — CHANGE 3: if "No" toggle selected, fixed -5
    if (mpNotDone) {
        sc.morningProgram = -5;
    } else {
        const mpM = t2m(mpTime, false);
        if (mpM <= 285) sc.morningProgram = 25;
        else if (mpM <= 300) sc.morningProgram = 10;
        else if (mpM <= 334) sc.morningProgram = 5;
        else if (mpM <= 359) sc.morningProgram = 0;
        else sc.morningProgram = -5;
    }

    // Chanting Score
    const chnM = t2m(chn, false);
    if (chnM <= 540) sc.chanting = 25;
    else if (chnM <= 570) sc.chanting = 20;
    else if (chnM <= 660) sc.chanting = 15;
    else if (chnM <= 870) sc.chanting = 10;
    else if (chnM <= 1020) sc.chanting = 5;
    else if (chnM <= 1140) sc.chanting = 0;
    else sc.chanting = -5;

    // Day Sleep
    sc.daySleep = (dsMin <= 60) ? 10 : -5;

    // Reading & Hearing
    const getActScore = (m) => {
        if (m >= 40) return 25; if (m >= 30) return 20; if (m >= 20) return 15;
        if (m >= 15) return 10; if (m >= 10) return 5; if (m >= 5) return 0;
        return -5;
    };
    sc.reading = getActScore(rMin);
    sc.hearing = getActScore(hMin);

    // Notes Revision
    if (nMin >= 35) sc.notes = 25;
    else if (nMin >= 30) sc.notes = 20;
    else if (nMin >= 20) sc.notes = 15;
    else if (nMin >= 15) sc.notes = 10;
    else if (nMin >= 10) sc.notes = 5;
    else if (nMin >= 5) sc.notes = 0;
    else sc.notes = -5;

    return sc;
}

// --- CHANGE 3: Morning Program toggle handler ---
window.toggleMorningProgram = (notDone) => {
    const timeRow = document.getElementById('mp-time-row');
    const mpDoneBtn = document.getElementById('mp-done-btn');
    const mpNoBtn = document.getElementById('mp-no-btn');
    if (notDone) {
        timeRow.style.display = 'none';
        mpDoneBtn.classList.remove('mp-active');
        mpNoBtn.classList.add('mp-active');
    } else {
        timeRow.style.display = 'block';
        mpDoneBtn.classList.add('mp-active');
        mpNoBtn.classList.remove('mp-active');
    }
};

function isMorningProgramNotDone() {
    return document.getElementById('mp-no-btn').classList.contains('mp-active');
}

// --- 7. FORM SUBMIT (new + edit) ---
const sadhanaForm = document.getElementById('sadhana-form');
if (sadhanaForm) {
    sadhanaForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) { alert('Please login first'); return; }

        const date = document.getElementById('sadhana-date').value;
        const slp = document.getElementById('sleep-time').value;
        const wak = document.getElementById('wakeup-time').value;
        const mpTime = document.getElementById('morning-program-time').value;
        const mpNotDone = isMorningProgramNotDone();
        const chn = document.getElementById('chanting-time').value;
        const rMin = parseInt(document.getElementById('reading-mins').value) || 0;
        const hMin = parseInt(document.getElementById('hearing-mins').value) || 0;
        const nMin = parseInt(document.getElementById('notes-mins').value) || 0;
        const dsMin = parseInt(document.getElementById('day-sleep-minutes').value) || 0;

        const sc = computeScores(slp, wak, mpTime, mpNotDone, chn, rMin, hMin, nMin, dsMin);
        const total = sc.sleep + sc.wakeup + sc.morningProgram + sc.chanting + sc.reading + sc.hearing + sc.notes + sc.daySleep;
        const dayPercent = Math.round((total / 175) * 100);

        try {
            await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set({
                sleepTime: slp,
                wakeupTime: wak,
                morningProgramTime: mpNotDone ? 'Not Done' : mpTime,
                chantingTime: chn,
                readingMinutes: rMin,
                hearingMinutes: hMin,
                notesMinutes: nMin,
                daySleepMinutes: dsMin,
                scores: sc,
                totalScore: total,
                dayPercent: dayPercent,
                submittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            const isEdit = editingDate !== null;
            cancelEdit();
            alert(`${isEdit ? 'Updated' : 'Saved'}! Score: ${total}/175 (${dayPercent}%)`);
            switchTab('reports');
        } catch (error) {
            alert('Error saving: ' + error.message);
        }
    };
}

// --- CHANGE 2: Edit from reports ---
window.editEntry = async (dateStr) => {
    // Switch to Daily Entry tab
    document.querySelectorAll('.tab-content').forEach(el => { el.classList.remove('active'); el.classList.add('hidden'); });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabContent = document.getElementById('sadhana-tab');
    tabContent.classList.remove('hidden'); tabContent.classList.add('active');
    const btn = document.querySelector(`button[onclick*="switchTab('sadhana')"]`);
    if (btn) btn.classList.add('active');

    // Load existing data
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateStr).get();
    const data = snap.exists ? snap.data() : null;

    // Set date dropdown to this date (add option if needed)
    const sel = document.getElementById('sadhana-date');
    let found = false;
    for (const opt of sel.options) { if (opt.value === dateStr) { opt.selected = true; found = true; break; } }
    if (!found) {
        const opt = document.createElement('option');
        opt.value = dateStr;
        opt.textContent = dateStr;
        sel.insertBefore(opt, sel.firstChild);
        sel.value = dateStr;
    }
    sel.disabled = true; // Lock date in edit mode

    if (data) {
        // Existing entry — prefill with saved values
        document.getElementById('sleep-time').value = data.sleepTime !== 'NR' ? data.sleepTime : '';
        document.getElementById('wakeup-time').value = data.wakeupTime !== 'NR' ? data.wakeupTime : '';
        document.getElementById('chanting-time').value = data.chantingTime !== 'NR' ? data.chantingTime : '';
        document.getElementById('reading-mins').value = data.readingMinutes !== 'NR' ? data.readingMinutes : 0;
        document.getElementById('hearing-mins').value = data.hearingMinutes !== 'NR' ? data.hearingMinutes : 0;
        document.getElementById('notes-mins').value = data.notesMinutes !== 'NR' ? data.notesMinutes : 0;
        document.getElementById('day-sleep-minutes').value = data.daySleepMinutes !== 'NR' ? data.daySleepMinutes : 0;

        // Morning program toggle
        if (data.morningProgramTime === 'Not Done') {
            toggleMorningProgram(true);
        } else {
            toggleMorningProgram(false);
            document.getElementById('morning-program-time').value = data.morningProgramTime !== 'NR' ? data.morningProgramTime : '';
        }
    } else {
        // NR entry — clear all fields for fresh fill
        document.getElementById('sleep-time').value = '';
        document.getElementById('wakeup-time').value = '';
        document.getElementById('chanting-time').value = '';
        document.getElementById('reading-mins').value = 0;
        document.getElementById('hearing-mins').value = 0;
        document.getElementById('notes-mins').value = 0;
        document.getElementById('day-sleep-minutes').value = 0;
        toggleMorningProgram(false);
        document.getElementById('morning-program-time').value = '';
    }

    // Show edit banner
    editingDate = dateStr;
    const isNREntry = !snap.exists;
    document.getElementById('edit-mode-banner').style.display = 'flex';
    document.getElementById('edit-mode-banner').querySelector('span').textContent = isNREntry
        ? `Filling NR entry for: ${dateStr}`
        : `Editing: ${dateStr}`;
    document.getElementById('sadhana-submit-btn').textContent = isNREntry ? '✅ Submit Entry' : '💾 Update Entry';

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function cancelEdit() {
    editingDate = null;
    const sel = document.getElementById('sadhana-date');
    if (sel) { sel.disabled = false; setupDateSelect(); }
    const banner = document.getElementById('edit-mode-banner');
    if (banner) banner.style.display = 'none';
    const submitBtn = document.getElementById('sadhana-submit-btn');
    if (submitBtn) submitBtn.textContent = '✅ Submit Sadhana';
    // Reset morning program to default state
    toggleMorningProgram(false);
    document.getElementById('morning-program-time').value = '';
}
window.cancelEdit = cancelEdit;

// --- SCORE BACKGROUND ---
function getScoreBackground(score) {
    if (score === null || score === undefined) return '#ffcdd2';
    if (score >= 20) return '#c8e6c9';
    if (score >= 15) return '#fff9c4';
    if (score >= 10) return '#ffe0b2';
    if (score >= 0) return '#ffebee';
    return '#ffcdd2';
}

// --- 8. REPORTS ---
async function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    const snap = await db.collection('users').doc(userId).collection('sadhana').get();

    if (snap.empty) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:40px;">No sadhana data yet. Start tracking!</p>';
        document.getElementById('four-week-comparison').innerHTML = '';
        return;
    }

    const weeksData = {};
    snap.forEach(doc => {
        const weekInfo = getWeekInfo(doc.id);
        if (!weeksData[weekInfo.sunStr]) {
            weeksData[weekInfo.sunStr] = { label: weekInfo.label, sunStr: weekInfo.sunStr, days: {} };
        }
        weeksData[weekInfo.sunStr].days[doc.id] = doc.data();
    });

    const sortedWeeks = Object.keys(weeksData).sort((a, b) => b.localeCompare(a));
    generate4WeekComparison(sortedWeeks.slice(0, 4), weeksData);

    let html = '';
    sortedWeeks.forEach(sunStr => {
        const week = weeksData[sunStr];
        const weekStart = new Date(week.sunStr);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        let weekTotals = { total: 0, readingMins: 0, hearingMins: 0, notesMins: 0, notesMarks: 0, sleepMarks: 0, wakeupMarks: 0, morningMarks: 0, chantingMarks: 0, readingMarks: 0, hearingMarks: 0, daySleepMarks: 0 };

        let tableRows = '';
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStart);
            currentDate.setDate(currentDate.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            const entry = week.days[dateStr] || getNRData(dateStr);
            const isNR = !week.days[dateStr];

            weekTotals.total += entry.totalScore ?? 0;
            weekTotals.readingMins += (entry.readingMinutes === 'NR' ? 0 : entry.readingMinutes) || 0;
            weekTotals.hearingMins += (entry.hearingMinutes === 'NR' ? 0 : entry.hearingMinutes) || 0;
            weekTotals.notesMins += (entry.notesMinutes === 'NR' ? 0 : entry.notesMinutes) || 0;
            weekTotals.notesMarks += entry.scores?.notes || 0;
            weekTotals.sleepMarks += entry.scores?.sleep || 0;
            weekTotals.wakeupMarks += entry.scores?.wakeup || 0;
            weekTotals.morningMarks += entry.scores?.morningProgram || 0;
            weekTotals.chantingMarks += entry.scores?.chanting || 0;
            weekTotals.readingMarks += entry.scores?.reading || 0;
            weekTotals.hearingMarks += entry.scores?.hearing || 0;
            weekTotals.daySleepMarks += entry.scores?.daySleep || 0;

            const dayPercent = entry.dayPercent ?? -23;
            const percentColor = dayPercent >= 80 ? 'green' : dayPercent >= 60 ? 'orange' : 'red';
            const mpDisplay = entry.morningProgramTime === 'Not Done' ? '<span style="color:#e74c3c;font-size:0.85em;">Not Done</span>' : (entry.morningProgramTime || 'NR');

            // CHANGE 2: Edit button on each day row
            const editBtn = !isNR
                ? `<button onclick="editEntry('${dateStr}')" style="padding:2px 8px;font-size:11px;background:#3498db;width:auto;margin:0;border-radius:4px;">✏️ Edit</button>`
                : `<button onclick="editEntry('${dateStr}')" style="padding:2px 8px;font-size:11px;background:#27ae60;width:auto;margin:0;border-radius:4px;">+ Fill</button>`;

            tableRows += `
                <tr>
                    <td><strong>${dayNames[i]} ${currentDate.getDate()}</strong><br>${editBtn}</td>
                    <td>${entry.sleepTime}</td>
                    <td style="background:${getScoreBackground(entry.scores?.sleep)};font-weight:bold;">${entry.scores?.sleep}</td>
                    <td>${entry.wakeupTime}</td>
                    <td style="background:${getScoreBackground(entry.scores?.wakeup)};font-weight:bold;">${entry.scores?.wakeup}</td>
                    <td>${entry.chantingTime}</td>
                    <td style="background:${getScoreBackground(entry.scores?.chanting)};font-weight:bold;">${entry.scores?.chanting}</td>
                    <td>${mpDisplay}</td>
                    <td style="background:${getScoreBackground(entry.scores?.morningProgram)};font-weight:bold;">${entry.scores?.morningProgram ?? 0}</td>
                    <td>${entry.daySleepMinutes !== 'NR' ? entry.daySleepMinutes : 'NR'}</td>
                    <td style="background:${getScoreBackground(entry.scores?.daySleep)};font-weight:bold;">${entry.scores?.daySleep}</td>
                    <td>${entry.readingMinutes !== 'NR' ? entry.readingMinutes : 'NR'}</td>
                    <td style="background:${getScoreBackground(entry.scores?.reading)};font-weight:bold;">${entry.scores?.reading}</td>
                    <td>${entry.hearingMinutes !== 'NR' ? entry.hearingMinutes : 'NR'}</td>
                    <td style="background:${getScoreBackground(entry.scores?.hearing)};font-weight:bold;">${entry.scores?.hearing}</td>
                    <td>${entry.notesMinutes !== 'NR' ? entry.notesMinutes : 'NR'}</td>
                    <td style="background:${getScoreBackground(entry.scores?.notes)};font-weight:bold;">${entry.scores?.notes}</td>
                    <td style="color:${percentColor};font-weight:bold;">${dayPercent}%</td>
                </tr>
            `;
        }

        let adjustedNotesMarks = weekTotals.notesMarks;
        if (weekTotals.notesMins >= 245) adjustedNotesMarks = 175;
        const adjustedTotal = weekTotals.total - weekTotals.notesMarks + adjustedNotesMarks;
        const weekPercent = Math.round((adjustedTotal / 1225) * 100);
        const weekClass = adjustedTotal < 735 ? 'low-score' : '';

        html += `
            <div class="week-card ${weekClass}">
                <div class="week-header" onclick="this.nextElementSibling.classList.toggle('expanded'); this.querySelector('.toggle-icon').textContent = this.nextElementSibling.classList.contains('expanded') ? '▼' : '▶';">
                    <span>${week.label.split('_')[0]}</span>
                    <span>${adjustedTotal}/1225 (${weekPercent}%) <span class="toggle-icon">▶</span></span>
                </div>
                <div class="week-content">
                    <div style="overflow-x:auto;">
                    <table class="daily-table">
                        <thead>
                            <tr style="background:var(--secondary);color:black;">
                                <th>Day</th><th>1.To Bed</th><th>Mks</th><th>2. Wake Up</th><th>Mks</th>
                                <th>3. Japa</th><th>Mks</th><th>4. MP</th><th>Mks</th><th>5. DS</th><th>Mks</th>
                                <th>6. Pathan</th><th>Mks</th><th>7. Sarwan</th><th>Mks</th><th>8. Ntes Rev.</th><th>Mks</th><th>Day Wise</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                            <tr style="background:#f0f4ff;font-weight:bold;">
                                <td>Total/1225</td><td>—</td>
                                <td style="background:lightgreen;">${weekTotals.sleepMarks}</td><td>—</td>
                                <td style="background:lightgreen;">${weekTotals.wakeupMarks}</td><td>—</td>
                                <td style="background:lightgreen;">${weekTotals.chantingMarks}</td><td>—</td>
                                <td style="background:lightgreen;">${weekTotals.morningMarks}</td><td>—</td>
                                <td style="background:lightgreen;">${weekTotals.daySleepMarks}</td>
                                <td>${weekTotals.readingMins}</td><td style="background:lightgreen;">${weekTotals.readingMarks}</td>
                                <td>${weekTotals.hearingMins}</td><td style="background:lightgreen;">${weekTotals.hearingMarks}</td>
                                <td>${weekTotals.notesMins}</td><td style="background:lightgreen;">${adjustedNotesMarks}</td><td>—</td>
                            </tr>
                            <tr style="background:#e8f5e9;font-weight:bold;">
                                <td>Sadhna %</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.sleepMarks/175)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.wakeupMarks/175)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.chantingMarks/175)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.morningMarks/175)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.daySleepMarks/70)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.readingMarks/175)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((weekTotals.hearingMarks/175)*100)}%</td>
                                <td colspan="2" style="background:lightgreen;font-size:1.1em;">${Math.round((adjustedNotesMarks/175)*100)}%</td>
                                <td>—</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                    <div style="margin-top:15px;padding:15px;background:var(--secondary);color:white;border-radius:8px;text-align:center;">
                        <strong style="font-size:1.3em;">OVERALL: ${adjustedTotal}/1225 (${weekPercent}%)</strong>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 4-week comparison
function generate4WeekComparison(weeks, weeksData) {
    const container = document.getElementById('four-week-comparison');
    if (!container) return;
    if (weeks.length === 0) { container.innerHTML = '<p style="color:#999;text-align:center;">Not enough data for comparison</p>'; return; }

    let tableHTML = `<table class="comparison-table"><thead><tr><th>Week</th><th>Total Score</th><th>Percentage</th><th>Trend</th></tr></thead><tbody>`;
    let previousPercent = null;

    weeks.forEach(sunStr => {
        const week = weeksData[sunStr];
        const weekStart = new Date(week.sunStr);
        let weekTotal = 0, weekNotesMins = 0, weekNotesMarks = 0;

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStart);
            currentDate.setDate(currentDate.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            const entry = week.days[dateStr] || getNRData(dateStr);
            weekTotal += entry.totalScore ?? 0;
            weekNotesMins += entry.notesMinutes || 0;
            weekNotesMarks += entry.scores?.notes || 0;
        }

        let adjustedNotesMarks = weekNotesMarks;
        if (weekNotesMins >= 245) adjustedNotesMarks = 175;
        const adjustedTotal = weekTotal - weekNotesMarks + adjustedNotesMarks;
        const weekPercent = Math.round((adjustedTotal / 1225) * 100);

        let trendIcon = '—', trendColor = '#666';
        if (previousPercent !== null) {
            const diff = weekPercent - previousPercent;
            if (diff > 0) { trendIcon = `▲ +${diff}%`; trendColor = 'green'; }
            else if (diff < 0) { trendIcon = `▼ ${diff}%`; trendColor = 'red'; }
        }
        previousPercent = weekPercent;
        const percentColor = weekPercent >= 80 ? 'green' : weekPercent >= 60 ? 'orange' : 'red';

        tableHTML += `<tr><td><strong>${week.label.split('_')[0]}</strong></td><td><strong>${adjustedTotal}/1225</strong></td><td style="color:${percentColor};font-weight:bold;font-size:1.1em;">${weekPercent}%</td><td style="color:${trendColor};font-weight:bold;">${trendIcon}</td></tr>`;
    });

    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
}

// --- 9. CHARTS — CHANGE 4: Activity Analysis style ---
async function generateCharts() {
    const period = document.getElementById('chart-period').value;
    if (period === 'daily') await generateDailyCharts();
    else if (period === 'weekly') await generateWeeklyCharts();
    else if (period === 'monthly') await generateMonthlyCharts();
}

async function generateDailyCharts() {
    const today = new Date();
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    const snapshot = await db.collection('users').doc(currentUser.uid)
        .collection('sadhana')
        .where(firebase.firestore.FieldPath.documentId(), 'in', dates)
        .get();

    const data = {};
    snapshot.forEach(doc => { data[doc.id] = doc.data(); });

    const labels = dates.map(d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const scores = dates.map(d => data[d]?.totalScore || 0);

    // Activity-wise total marks for the week (for ring + bar chart)
    const activityTotals = {
        Sleep: dates.reduce((s, d) => s + (data[d]?.scores?.sleep || 0), 0),
        'Wake-up': dates.reduce((s, d) => s + (data[d]?.scores?.wakeup || 0), 0),
        Chanting: dates.reduce((s, d) => s + (data[d]?.scores?.chanting || 0), 0),
        Reading: dates.reduce((s, d) => s + (data[d]?.scores?.reading || 0), 0),
        Hearing: dates.reduce((s, d) => s + (data[d]?.scores?.hearing || 0), 0),
        'Notes Rev.': dates.reduce((s, d) => s + (data[d]?.scores?.notes || 0), 0),
        'Day Sleep': dates.reduce((s, d) => s + (data[d]?.scores?.daySleep || 0), 0),
    };

    // Weekly score ring: total out of max possible for days with data
    const submittedDays = dates.filter(d => data[d]).length;
    const maxPossible = submittedDays * 175;
    const totalEarned = scores.reduce((a, b) => a + b, 0);
    const weekPercent = maxPossible > 0 ? Math.round((totalEarned / maxPossible) * 100) : 0;

    renderScoreRing(weekPercent, `${dates[0].slice(5).replace('-','/')} – ${dates[6].slice(5).replace('-','/')}`, submittedDays, totalEarned);
    renderActivityBarChart(activityTotals, labels, scores);
}

async function generateWeeklyCharts() {
    const today = new Date();
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (today.getDay() + i * 7));
        weeks.push(weekStart);
    }

    const labels = [];
    const scores = [];
    const weekActivityTotals = { Sleep: 0, 'Wake-up': 0, Chanting: 0, Reading: 0, Hearing: 0, 'Notes Rev.': 0, 'Day Sleep': 0 };
    let latestWeekTotal = 0, latestWeekDays = 0;

    for (let wi = 0; wi < weeks.length; wi++) {
        const weekStart = weeks[wi];
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            weekDates.push(d.toISOString().split('T')[0]);
        }

        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('sadhana')
            .where(firebase.firestore.FieldPath.documentId(), 'in', weekDates)
            .get();

        let weekTotal = 0, weekDayCount = 0;
        const wData = {};
        snapshot.forEach(doc => { wData[doc.id] = doc.data(); weekTotal += doc.data().totalScore || 0; weekDayCount++; });

        labels.push(`Wk ${weekStart.getDate()}/${weekStart.getMonth() + 1}`);
        scores.push(weekTotal);

        // Use latest (most recent) week for ring + bar
        if (wi === weeks.length - 1) {
            latestWeekTotal = weekTotal;
            latestWeekDays = weekDayCount;
            weekDates.forEach(d => {
                if (wData[d]) {
                    weekActivityTotals['Sleep'] += wData[d]?.scores?.sleep || 0;
                    weekActivityTotals['Wake-up'] += wData[d]?.scores?.wakeup || 0;
                    weekActivityTotals['Chanting'] += wData[d]?.scores?.chanting || 0;
                    weekActivityTotals['Reading'] += wData[d]?.scores?.reading || 0;
                    weekActivityTotals['Hearing'] += wData[d]?.scores?.hearing || 0;
                    weekActivityTotals['Notes Rev.'] += wData[d]?.scores?.notes || 0;
                    weekActivityTotals['Day Sleep'] += wData[d]?.scores?.daySleep || 0;
                }
            });
        }
    }

    const maxPossible = latestWeekDays * 175;
    const weekPercent = maxPossible > 0 ? Math.round((latestWeekTotal / maxPossible) * 100) : 0;
    const dateRange = `${weeks[weeks.length-1].getDate()}/${weeks[weeks.length-1].getMonth()+1} – week`;

    renderScoreRing(weekPercent, dateRange, latestWeekDays, latestWeekTotal);
    renderActivityBarChart(weekActivityTotals, labels, scores);
}

async function generateMonthlyCharts() {
    const today = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(new Date(today.getFullYear(), today.getMonth() - i, 1));

    const labels = [];
    const scores = [];

    for (const month of months) {
        const startDate = new Date(month.getFullYear(), month.getMonth(), 1);
        const endDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);

        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('sadhana')
            .where(firebase.firestore.FieldPath.documentId(), '>=', startDate.toISOString().split('T')[0])
            .where(firebase.firestore.FieldPath.documentId(), '<=', endDate.toISOString().split('T')[0])
            .get();

        let monthTotal = 0, monthDays = 0;
        snapshot.forEach(doc => { monthTotal += doc.data().totalScore || 0; monthDays++; });
        labels.push(month.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
        scores.push(monthTotal);
    }

    // For monthly, just show the total score bar chart (no ring — too broad)
    renderActivityBarChart(null, labels, scores);
    // Hide ring for monthly
    document.getElementById('score-ring-container').style.display = 'none';
}

// --- CHANGE 4: Render score ring (donut) ---
function renderScoreRing(percent, dateRange, days, totalPts) {
    const container = document.getElementById('score-ring-container');
    container.style.display = 'flex';

    const color = percent >= 70 ? '#27ae60' : percent >= 50 ? '#f39c12' : '#e74c3c';
    const ringLabel = percent >= 70 ? 'Good' : percent >= 50 ? 'OK' : 'Needs work';

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
            <div style="position:relative;width:120px;height:120px;flex-shrink:0;">
                <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="48" fill="none" stroke="#eee" stroke-width="14"/>
                    <circle cx="60" cy="60" r="48" fill="none" stroke="${color}" stroke-width="14"
                        stroke-dasharray="${Math.round(2*Math.PI*48*percent/100)} ${Math.round(2*Math.PI*48*(100-percent)/100)}"
                        stroke-dashoffset="${Math.round(2*Math.PI*48*0.25)}"
                        stroke-linecap="round" transform="rotate(-90 60 60)"/>
                </svg>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;line-height:1.2;">
                    <div style="font-size:22px;font-weight:bold;color:${color};">${percent}%</div>
                    <div style="font-size:10px;color:#888;">week score</div>
                </div>
            </div>
            <div>
                <div style="font-weight:700;font-size:15px;color:#2c3e50;margin-bottom:4px;">Weekly Score %</div>
                <div style="font-size:13px;color:#555;margin-bottom:6px;">${dateRange} · ${days} day${days !== 1 ? 's' : ''} · ${totalPts} pts</div>
                <div style="font-size:12px;">
                    <span style="color:#27ae60;font-weight:600;">≥70%</span> Good &nbsp;
                    <span style="color:#f39c12;font-weight:600;">50–69%</span> OK &nbsp;
                    <span style="color:#e74c3c;font-weight:600;">&lt;50%</span> Needs work
                </div>
                <div style="margin-top:6px;padding:4px 10px;background:${color}18;border-left:3px solid ${color};border-radius:4px;font-size:12px;color:${color};font-weight:600;">${ringLabel}</div>
            </div>
        </div>
    `;
}

// --- CHANGE 4: Render horizontal bar chart (activity breakdown) + score line chart ---
function renderActivityBarChart(activityTotals, labels, scores) {
    // Destroy old charts
    if (scoreChart) { scoreChart.destroy(); scoreChart = null; }
    if (activityChart) { activityChart.destroy(); activityChart = null; }

    // Score chart — bar chart for daily/weekly
    const scoreCtx = document.getElementById('score-chart').getContext('2d');
    scoreChart = new Chart(scoreCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Score',
                data: scores,
                backgroundColor: scores.map(s => {
                    const max = labels.length > 4 ? 175 : 1225;
                    const pct = s / max * 100;
                    return pct >= 70 ? 'rgba(39,174,96,0.75)' : pct >= 50 ? 'rgba(243,156,18,0.75)' : 'rgba(231,76,60,0.75)';
                }),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `Score: ${ctx.parsed.y}`
                    }
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });

    // Activity breakdown — horizontal bar
    if (!activityTotals) {
        document.getElementById('activity-chart-section').style.display = 'none';
        return;
    }
    document.getElementById('activity-chart-section').style.display = 'block';

    const actLabels = Object.keys(activityTotals);
    const actValues = Object.values(activityTotals);
    const actColors = actValues.map(v => v >= 50 ? '#27ae60' : v >= 20 ? '#f39c12' : '#e74c3c');

    const actCtx = document.getElementById('activity-chart').getContext('2d');
    activityChart = new Chart(actCtx, {
        type: 'bar',
        data: {
            labels: actLabels,
            datasets: [{
                label: 'Total pts this week',
                data: actValues,
                backgroundColor: actColors,
                borderRadius: 5,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.x} pts`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    min: -15,
                    max: 175,
                    grid: { color: 'rgba(0,0,0,0.06)' }
                },
                y: { grid: { display: false } }
            }
        }
    });
}

// --- 10. MISC ---
// CHANGE 1: setupDateSelect — allow past 5 days
function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    if (!s) return;
    s.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option');
        opt.value = iso;
        // Show human-friendly label
        const label = i === 0 ? `Today (${iso})` : i === 1 ? `Yesterday (${iso})` : iso;
        opt.textContent = label;
        s.appendChild(opt);
    }
}

const profileForm = document.getElementById('profile-form');
if (profileForm) {
    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = { name: document.getElementById('profile-name').value.trim(), role: userProfile?.role || 'user' };
        await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
        alert("Name saved!");
        location.reload();
    };
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me').checked;

        if (!email || !password) { alert('Please enter both email and password'); return; }

        try {
            if (rememberMe) {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            } else {
                await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
            }
            await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            let errorMsg = 'Login failed: ';
            switch (err.code) {
                case 'auth/invalid-email': errorMsg += 'Invalid email address'; break;
                case 'auth/user-disabled': errorMsg += 'This account has been disabled'; break;
                case 'auth/user-not-found': errorMsg += 'No account found with this email'; break;
                case 'auth/wrong-password': errorMsg += 'Incorrect password'; break;
                case 'auth/invalid-credential': errorMsg += 'Invalid email or password'; break;
                default: errorMsg += err.message;
            }
            alert(errorMsg);
        }
    };
}

// --- EYE BUTTON: toggle password visibility ---
window.togglePw = (inputId, btn) => {
    const inp = document.getElementById(inputId);
    if (inp.type === 'password') {
        inp.type = 'text';
        btn.textContent = '🙈';
    } else {
        inp.type = 'password';
        btn.textContent = '👁';
    }
};

// --- FORGOT PASSWORD ---
window.openForgot = () => {
    document.getElementById('forgot-email').value = '';
    const msg = document.getElementById('forgot-msg');
    msg.style.display = 'none';
    document.getElementById('forgot-send-btn').disabled = false;
    document.getElementById('forgot-send-btn').textContent = 'Send Reset Link';
    document.getElementById('forgot-modal').classList.add('show');
};

window.closeForgot = () => {
    document.getElementById('forgot-modal').classList.remove('show');
};

window.sendReset = async () => {
    const email = document.getElementById('forgot-email').value.trim();
    const msg = document.getElementById('forgot-msg');
    const btn = document.getElementById('forgot-send-btn');

    if (!email) {
        msg.style.display = 'block';
        msg.style.background = '#ffebee';
        msg.style.color = '#e74c3c';
        msg.textContent = 'Please enter your email.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        await auth.sendPasswordResetEmail(email);
        msg.style.display = 'block';
        msg.style.background = '#e8f5e9';
        msg.style.color = '#27ae60';
        msg.textContent = '✅ Reset link sent! Check your email (and spam folder).';
        btn.textContent = 'Sent ✓';
    } catch (err) {
        msg.style.display = 'block';
        msg.style.background = '#ffebee';
        msg.style.color = '#e74c3c';
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
        switch (err.code) {
            case 'auth/user-not-found':
                msg.textContent = 'No account found with this email.'; break;
            case 'auth/invalid-email':
                msg.textContent = 'Invalid email address.'; break;
            case 'auth/too-many-requests':
                msg.textContent = 'Too many attempts. Please wait a moment.'; break;
            default:
                msg.textContent = err.message;
        }
    }
};

// Close modal if clicking backdrop
document.addEventListener('click', (e) => {
    const modal = document.getElementById('forgot-modal');
    if (modal && e.target === modal) closeForgot();
});



window.openProfileEdit = () => {
    document.getElementById('profile-name').value = userProfile.name;
    document.getElementById('cancel-edit').classList.remove('hidden');
    showSection('profile');
};

setTimeout(() => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => auth.signOut();
}, 100);

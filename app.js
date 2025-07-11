// --- بداية كود تهيئة Firebase ---
// استخدام الإعدادات التي قمت بتزويدي بها
const firebaseConfig = {
  apiKey: "AIzaSyCXscXexb0bvKEeJ9QKxnrhlB70F0ej7fs",
  authDomain: "arkanat-287ff.firebaseapp.com",
  projectId: "arkanat-287ff",
  storageBucket: "arkanat-287ff.appspot.com",
  messagingSenderId: "773019407626",
  appId: "1:773019407626:web:3b534f6c26c970693b16f3",
  measurementId: "G-81PYGC42FX"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
// --- نهاية كود تهيئة Firebase ---
// --- الخطوة 4: إعداد الاتصال مع قاعدة البيانات ---
const SUPABASE_URL = 'https://tlgyxbdjdhdjgkcndxoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZ3l4YmRqZGhkamdrY25keG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwOTU4NzMsImV4cCI6MjA2NTY3MTg3M30.fX6ek2_xIdSzu_71cmsXWweZXP6cSeFlv8NTlVFKzZg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// --- دالة مساعدة لتحويل مفتاح VAPID إلى الصيغة المطلوبة ---
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
let currentUser = null; // متغير لتخزين معلومات المستخدم الذي سجل دخوله
let locationWatcherId = null; // متغير لتخزين معرّف عملية تتبع الموقع
let guardMarkers = new Map(); // متغير لتخزين علامات الحراس على الخريطة
// بداية الإضافة
let patrolWatcherId = null; // متغير لتخزين معرّف عملية تتبع الجولة
// نهاية الإضافة
let payrollExportData = []; // لتخزين بيانات مسير الرواتب الجاهزة للتصدير
// بداية الإضافة: أضف هذا الكود في ملف app.js
function formatTimeAMPM(timeString) {
    if (!timeString) return 'غير محدد';
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'م' : 'ص';
    h = h % 12;
    h = h ? h : 12; // الساعة 0 أو 12 تبقى 12
    const m = minutes.padStart(2, '0');
    return `${h}:${m} ${ampm}`;
}
// نهاية الإضافة
// بداية الإضافة
function stopPatrolTracking() {
    if (patrolWatcherId) {
        navigator.geolocation.clearWatch(patrolWatcherId);
        patrolWatcherId = null;
        console.log('تم إيقاف تتبع الجولة.');
    }
}

function startPatrolTracking(patrolId) {
    stopPatrolTracking(); // إيقاف أي متتبع قديم أولاً
    console.log(`بدء تتبع الجولة رقم: ${patrolId}`);

    patrolWatcherId = navigator.geolocation.watchPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            const newCoordinate = { lat: latitude, lng: longitude, time: new Date().toISOString() };

            // 1. تحديث الموقع المباشر للمشرف على الخريطة
            await supabaseClient.from('guard_locations')
                .upsert({ guard_id: currentUser.id, latitude, longitude }, { onConflict: 'guard_id' });

            // 2. تحديث مسار الجولة في جدول patrols
            // نجلب المسار الحالي أولاً
            const { data: currentPatrol, error: fetchError } = await supabaseClient
                .from('patrols')
                .select('path')
                .eq('id', patrolId)
                .single();

            if (fetchError) return console.error("Error fetching current path:", fetchError);

            // نضيف النقطة الجديدة للمسار
            const newPath = (currentPatrol.path || []);
            newPath.push(newCoordinate);

            // نحدث السجل بالمسار الجديد
            await supabaseClient
                .from('patrols')
                .update({ path: newPath })
                .eq('id', patrolId);
        },
        (error) => {
            console.error("خطأ في تتبع الجولة:", error);
            stopPatrolTracking();
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
}
// نهاية الإضافة
// بداية الاستبدال
async function loadOpsReviewRequestsPage() {
    const container = document.getElementById('ops-review-requests-container');
    if (!container || !currentUser || !currentUser.project) { return container.innerHTML = '<p>لا يمكن عرض الصفحة.</p>'; }
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الطلبات...</p>';
    const { data: requests, error } = await supabaseClient.from('employee_requests').select(`*, users:user_id!inner(name, project)`).eq('status', 'معلق').eq('users.project', currentUser.project);
    if (error) { container.innerHTML = '<p style="color:red;">حدث خطأ في جلب الطلبات.</p>'; return console.error(error); }
    if (requests.length === 0) { container.innerHTML = '<p style="text-align: center;">لا توجد طلبات معلقة من موظفي مشروعك حالياً.</p>'; return; }
    container.innerHTML = '';
    requests.forEach(request => {
        const requestTypeTranslations = { leave: 'إجازة', resignation: 'استقالة', loan: 'سلفة', permission: 'استئذان' };
        const typeText = requestTypeTranslations[request.request_type] || request.request_type;
        let detailsHtml = '';
        if (request.details) {
            if (request.details.days) detailsHtml += `<p><strong>المدة:</strong> ${request.details.days} أيام</p>`;
            if (request.details.amount) detailsHtml += `<p><strong>المبلغ:</strong> ${request.details.amount} ر.س</p>`;
            if (request.details.reason) detailsHtml += `<p><strong>السبب:</strong> ${request.details.reason}</p>`;
        }
        const cardHtml = `<div class="review-request-card"><div class="review-request-header status-pending"><h4>طلب ${typeText}</h4><span class="status-badge">${request.status}</span></div><div class="review-request-body"><div class="request-meta-grid" style="grid-template-columns: 1fr;"><div class="request-meta-item"><i class="ph-bold ph-user-circle"></i><span><strong>مقدم الطلب:</strong> ${request.users ? request.users.name : 'غير معروف'}</span></div></div><div class="request-main-details">${detailsHtml}</div></div><div class="review-request-footer"><button class="btn btn-success request-action-button" data-approval-stage="ops_escalate" data-action="approve" data-request-id="${request.id}"><i class="ph-bold ph-arrow-fat-up"></i> موافقة ورفع للموارد البشرية</button><button class="btn btn-danger request-action-button" data-approval-stage="ops_escalate" data-action="reject" data-request-id="${request.id}"><i class="ph-bold ph-x-circle"></i> رفض مباشر</button></div></div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الاستبدال
// بداية الإضافة
async function loadOpsDirectivesPage() {
    const container = document.getElementById('ops-users-list-container');
    if (!container || !currentUser) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل قائمة الموظفين...</p>';

    // جلب المشرفين والحراس التابعين لنفس مشروع مدير العمليات
    const { data: users, error } = await supabaseClient
        .from('users')
        .select('id, name, role, location')
        .eq('project', currentUser.project)
        .or('role.eq.مشرف,role.eq.حارس أمن');

    if (error) {
        container.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ في جلب الموظفين.</p>';
        return console.error(error);
    }
    
    if (users.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لا يوجد مشرفون أو حراس في مشروعك حالياً.</p>';
        return;
    }

    container.innerHTML = '';
    users.forEach(user => {
        const userCard = `
            <div class="attendance-card">
                <div>
                    <span>${user.name}</span>
                    <p class="time">${user.role} - ${user.location || 'غير محدد'}</p>
                </div>
                <button class="btn btn-primary open-directive-modal-btn" data-recipient-id="${user.id}" data-recipient-name="${user.name}">
                    <i class="ph-bold ph-paper-plane-tilt"></i> إرسال توجيه
                </button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', userCard);
    });
}
// نهاية الإضافة
// بداية الاستبدال: دالة عرض الحضور لمدير العمليات (مع التحقق من الجداول)
// بداية الاستبدال: دالة عرض الحضور لمدير العمليات (مع زر التغطية)
async function loadGuardAttendancePage() {
    const container = document.getElementById('guard-attendance-container');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل بيانات الفريق...</p>';
    if (!currentUser || currentUser.role !== 'ادارة العمليات') {
        container.innerHTML = '<p>هذه الصفحة مخصصة لمدراء العمليات.</p>';
        return;
    }
    try {
        const [{ data: guards, error: e1 }, { data: presentRecords, error: e2 }] = await Promise.all([
            supabaseClient.from('users').select('id, name, assigned_shift, project, location, region, city').eq('employment_status', 'نشط').eq('role', 'حارس أمن').eq('project', currentUser.project),
            supabaseClient.from('attendance').select('guard_id, created_at').is('checkout_at', null)
        ]);
        if (e1 || e2) throw new Error(e1?.message || e2?.message);
        if (guards.length === 0) {
            container.innerHTML = '<p style="text-align: center;">لا يوجد حراس أمن في مشروعك حالياً.</p>';
            return;
        }

        const now = new Date();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' });
        let guardsStatusHtml = '';

        for (const guard of guards) {
            const shift = guard.assigned_shift;
            let status = { text: 'في راحة', class: 'off' };
            let actionButton = '';

            if (shift && shift.days && shift.start_time && shift.end_time) {
                if (shift.days.includes(currentDay)) {
                    const startTime = new Date(now);
                    const [startHours, startMinutes] = shift.start_time.split(':');
                    startTime.setHours(startHours, startMinutes, 0, 0);
                    
                    if (now >= startTime) { // إظهار الحالة فقط إذا بدأت الوردية
                        const attendance = presentRecords.find(r => r.guard_id === guard.id);
                        if (attendance) {
                            const checkInTime = new Date(attendance.created_at).toLocaleTimeString('ar-SA', { timeStyle: 'short' });
                            status = { text: `حاضر (منذ ${checkInTime})`, class: 'present' };
                        } else {
                            status = { text: 'لم يحضر بعد', class: 'absent' };
                            // --- إضافة زر التغطية للحارس الغائب ---
                            const shiftData = { project: guard.project, location: guard.location, region: guard.region, city: guard.city, ...shift };
                            actionButton = `<button class="btn btn-secondary btn-sm add-to-coverage-btn" data-shift='${JSON.stringify(shiftData)}'>
                                <i class="ph-bold ph-plus"></i> إضافة للتغطية
                            </button>`;
                        }
                    } else {
                        status.text = 'وردية قادمة'; // إذا لم تبدأ ورديته بعد
                    }
                }
            }
            guardsStatusHtml += `
                <div class="attendance-card ${status.class}">
                    <div><span>${guard.name}</span><p class="time">${guard.project} / ${guard.location || ''}</p></div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span>${status.text}</span>
                        ${actionButton}
                    </div>
                </div>
            `;
        }
        container.innerHTML = `<div class="attendance-list">${guardsStatusHtml}</div>`;
    } catch (err) {
        container.innerHTML = `<p style="text-align: center; color: red;">حدث خطأ: ${err.message}</p>`;
        console.error("Ops Attendance Error:", err);
    }
}
// نهاية الاستبدال
// بداية الإضافة: دالة تصدير مسير الرواتب التفصيلي
function exportPayrollDataToCsv(data, filename) {
    const BOM = "\uFEFF"; // لجعل اللغة العربية تظهر بشكل صحيح
    const headers = [
        "اسم الموظف", "رقم الهوية", "رقم الجوال", "رقم الآيبان",
        "المشروع", "الموقع", "المسمى الوظيفي",
        "إجمالي الراتب", "أيام الغياب", "خصم الغياب",
        "دقائق التأخير", "خصم التأخير", "صافي المستحق"
    ];
    
    // تحويل مصفوفة الكائنات إلى مصفوفة من الصفوف النصية
    const csvRows = data.map(row => {
        const values = [
            row.name, row.id_number, row.phone, row.iban,
            row.project, row.location, row.role,
            row.gross_salary.toFixed(2), row.absence_days, row.absence_deduction.toFixed(2),
            row.late_minutes, row.lateness_deduction.toFixed(2), row.net_salary.toFixed(2)
        ];
        // تغليف كل قيمة بعلامات اقتباس للتعامل مع الفواصل
        return values.map(val => `"${val || ''}"`).join(',');
    });

    // دمج الرؤوس والصفوف
    const csvString = [BOM, headers.join(','), ...csvRows].join('\n');

    // إنشاء وتنزيل الملف
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
// نهاية الإضافة
// بداية الاستبدال
// دالة تحميل صفحة الجولة (النسخة الجديدة المعتمدة على جدول patrols)
async function loadSupervisorPatrolPage() {
    const page = document.getElementById('page-patrol');
    if (!page) return;

    const statusText = page.querySelector('#patrol-status');
    const startBtn = page.querySelector('#start-patrol-btn');
    const endBtn = page.querySelector('#end-patrol-btn');

    if (!currentUser) {
        statusText.innerHTML = '<p>الرجاء تسجيل الدخول أولاً.</p>';
        return;
    }

    statusText.innerHTML = '<p>جاري التحقق من حالة الجولة...</p>';
    startBtn.classList.add('hidden');
    endBtn.classList.add('hidden');

    // التحقق من وجود جولة نشطة للمشرف الحالي
    const { data: activePatrol, error } = await supabaseClient
    .from('patrols')
    .select('id, start_time')
    .eq('supervisor_id', currentUser.id)
    .eq('status', 'active')
    .limit(1) // <-- أضف هذا السطر
    .single();

    if (error && error.code !== 'PGRST116') { // تجاهل خطأ عدم وجود سجلات
        statusText.innerHTML = '<p>حدث خطأ أثناء التحقق من حالتك.</p>';
        return console.error(error);
    }

    if (activePatrol) {
    // توجد جولة نشطة
    const startTime = new Date(activePatrol.start_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    statusText.innerHTML = `<p>أنت حالياً في جولة ميدانية بدأت الساعة <strong>${startTime}</strong>.</p>`;
    endBtn.dataset.patrolId = activePatrol.id;
    endBtn.classList.remove('hidden');
    startPatrolTracking(activePatrol.id); // <-- تشغيل التتبع للجولة الحالية
} else {
        // لا توجد جولة نشطة
        statusText.innerHTML = `<p>أنت لست في جولة حالياً. اضغط على "بدء الجولة" لتسجيل جولة جديدة.</p>`;
        startBtn.classList.remove('hidden');
    }
}    
// نهاية الاستبدال

// بداية الإضافة: دالة تحميل صفحة الشواغر
async function loadVacanciesPage() {
    const listContainer = document.getElementById('vacancies-list-container');
    listContainer.innerHTML = '<p style="text-align: center;">جاري حساب الإحصائيات وتحميل الشواغر...</p>';

    // --- 1. حساب الإحصائيات ---
    let totalRequired = 0;
    const { data: contracts } = await supabaseClient.from('contracts').select('locations_and_guards').eq('status', 'active');
    if (contracts) {
        contracts.forEach(contract => {
            if (contract.locations_and_guards) {
                contract.locations_and_guards.forEach(location => {
                    if(location.shifts) {
                        location.shifts.forEach(shift => {
                            totalRequired += parseInt(shift.guards_count) || 0;
                        });
                    }
                });
            }
        });
    }

    const { count: assignedEmployees } = await supabaseClient.from('users').select('*', { count: 'exact', head: true }).not('contract_id', 'is', null);

    document.getElementById('hr-stats-required').textContent = totalRequired;
    document.getElementById('hr-stats-assigned').textContent = assignedEmployees || 0;
    document.getElementById('hr-stats-gap').textContent = totalRequired - (assignedEmployees || 0);

    // --- 2. جلب وعرض الشواغر الحالية ---
    // (ملاحظة: جدول الشواغر لديك اسمه job_vacancies)
    const { data: vacancies, error } = await supabaseClient.from('job_vacancies').select('*, contracts(company_name)');

    if (error) {
        console.error('Error fetching vacancies:', error);
        listContainer.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الشواغر.</p>';
        return;
    }

    if (vacancies.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center;">لا توجد شواغر مضافة حالياً.</p>';
        return;
    }

    listContainer.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>المسمى الوظيفي</th>
                    <th>المشروع</th>
                    <th>تابع لعقد</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                </tr>
            </thead>
            <tbody>
                ${vacancies.map(vacancy => `
                    <tr>
                        <td>${vacancy.title}</td>
                        <td>${vacancy.project || 'غير محدد'}</td>
                        <td>${vacancy.contracts ? vacancy.contracts.company_name : 'غير تابع لعقد'}</td>
                        <td><span class="status ${vacancy.status === 'open' ? 'active' : 'inactive'}">${vacancy.status === 'open' ? 'مفتوح' : 'مغلق'}</span></td>
                        <td>
                            <button class="btn-action edit-vacancy-btn" data-id="${vacancy.id}"><i class="ph-bold ph-pencil-simple"></i></button>
                            <button class="btn-action delete-vacancy-btn" data-id="${vacancy.id}"><i class="ph-bold ph-trash"></i></button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}
// نهاية الإضافة
// بداية الاستبدال للدوال المساعدة
function createShiftGroupHtml(shift = {}) {
    const guardsCount = shift.guards_count || 1;
    const startTime = shift.start_time || '';
    const endTime = shift.end_time || '';
    const days = shift.days || [];
    
    const dayNames = {Sat: 'السبت', Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة'};
    const daysHtml = Object.keys(dayNames).map(dayKey => {
        const isChecked = days.includes(dayKey) ? 'checked' : '';
        return `<label><input type="checkbox" value="${dayKey}" ${isChecked}>${dayNames[dayKey]}</label>`;
    }).join('');

    return `
        <div class="shift-group">
            <div class="form-group">
                <label>عدد الحراس لهذه الوردية</label>
                <input type="number" class="shift-guards-input" value="${guardsCount}" min="1" style="width: 150px;">
            </div>
            <div class="form-group" style="flex-grow:1;">
                <label>أيام عمل الوردية:</label>
                <div class="weekdays-selector">${daysHtml}</div>
            </div>
            <div class="form-group">
                <label>من:</label>
                <input type="time" class="shift-start-time-input" value="${startTime}">
            </div>
            <div class="form-group">
                <label>إلى:</label>
                <input type="time" class="shift-end-time-input" value="${endTime}">
            </div>
            <button class="delete-btn delete-shift-btn" title="حذف الوردية"><i class="ph-bold ph-x"></i></button>
        </div>
    `;
}

function createLocationGroupHtml(location = {}) {
    const locationName = location.location_name || '';
    const shifts = location.shifts && location.shifts.length > 0 ? location.shifts : [{}];
    const shiftsHtml = shifts.map(shift => createShiftGroupHtml(shift)).join('');
    
    return `
        <div class="location-group">
            <div class="location-group-header">
                <div class="form-group" style="flex-grow:1;">
                    <label>اسم الموقع (الفرع)</label>
                    <input type="text" class="location-name-input" value="${locationName}" placeholder="مثال: فرع غرناطة">
                </div>
                <button class="delete-btn delete-location-btn" title="حذف الموقع"><i class="ph-bold ph-trash"></i></button>
            </div>
            <div class="shifts-section">
                <h6>ورديات هذا الموقع:</h6>
                <div class="shifts-container">${shiftsHtml}</div>
                <button class="btn btn-secondary btn-sm add-shift-btn" style="margin-top:10px;">
                    <i class="ph-bold ph-plus-circle"></i> إضافة وردية أخرى لهذا الموقع
                </button>
            </div>
        </div>
    `;
}
// نهاية الاستبدال

function loadMyProfilePage() {
    // هذه الدالة فارغة حالياً لأن الصفحة لا تحتاج لتحميل أي بيانات ديناميكية
    // يمكننا إضافة منطق لها في المستقبل إذا احتجنا لذلك
    console.log("My Profile page loaded.");
}

// ===================== نهاية الإضافة =====================
// بداية الاستبدال
async function loadPermissionRequests() {
    const container = document.getElementById('permission-requests-container');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الطلبات...</p>';

    const { data: requests, error } = await supabaseClient
        .from('employee_requests')
        .select(`*, users:user_id(name)`)
        .eq('request_type', 'permission')
        .eq('status', 'بانتظار موافقة العمليات') // <-- التعديل هنا
        .order('created_at', { ascending: false });

    if (error) {
        console.error('خطأ في جلب طلبات الاستئذان:', error);
        container.innerHTML = '<p style="color:red;">حدث خطأ.</p>';
        return;
    }
    if (requests.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لا توجد طلبات استئذان بانتظار الموافقة النهائية.</p>';
        return;
    }

    container.innerHTML = '';
    requests.forEach(request => {
        const cardActions = `
            <button class="btn btn-success request-action-button" data-approval-stage="direct_permission" data-action="approve" data-request-id="${request.id}" data-user-id="${request.user_id}"><i class="ph-bold ph-check"></i> قبول نهائي</button>
            <button class="btn btn-danger request-action-button" data-approval-stage="direct_permission" data-action="reject" data-request-id="${request.id}"><i class="ph-bold ph-x"></i> رفض</button>
        `;
        const card = `
            <div class="request-card" style="border-right-color: #f59e0b;">
                <div class="request-card-header">
                    <h4>طلب من: ${request.users ? request.users.name : 'غير معروف'}</h4>
                    <div class="report-actions">${cardActions}</div>
                </div>
                <div class="request-card-body">
                    <p class="visit-notes"><strong>السبب:</strong> ${request.details.reason || 'لم يحدد سبب.'}</p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}
// نهاية الاستبدال

function updateUIVisibility(role) {
    const allMenuItems = document.querySelectorAll('.sidebar-nav li');

    allMenuItems.forEach(item => {
        const allowedRoles = item.dataset.role ? item.dataset.role.split(',') : [];

        // التعديل هنا: تحقق إذا كانت القائمة تحتوي على الدور الحالي أو تحتوي على 'all'
        if (allowedRoles.includes(role) || allowedRoles.includes('all')) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}
// --- الخطوة 8: دالة لجلب وعرض المستخدمين ---
async function fetchUsers() {
    // 1. جلب البيانات من جدول 'users'
    const { data: users, error } = await supabaseClient
        .from('users')
        .select('name, role, last_login, status');

    if (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        return;
    }

    // 2. الوصول إلى جسم الجدول في الصفحة
    const tableBody = document.querySelector('#page-users tbody');

    // 3. مسح أي صفوف قديمة
    tableBody.innerHTML = ''; 

    // 4. التحقق إذا لم يكن هناك مستخدمين
    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا يوجد مستخدمين لعرضهم حالياً.</td></tr>';
        return;
    }

    // 5. إضافة صف جديد لكل مستخدم
    users.forEach(user => {
        // تنسيق التاريخ والوقت ليصبح удобочитаемым
        const lastLogin = user.last_login 
            ? new Date(user.last_login).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) 
            : 'لم يسجل الدخول';

        const row = `
            <tr>
                <td>${user.name || 'غير متوفر'}</td>
                <td>${user.role || 'غير محدد'}</td>
                <td>${lastLogin}</td>
                <td>
                    <span class="status ${user.status === 'active' ? 'active' : 'inactive'}">
                        ${user.status === 'active' ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>
                    <button class="btn-action edit"><i class="ph-bold ph-pencil-simple"></i></button>
                    <button class="btn-action delete"><i class="ph-bold ph-trash"></i></button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}



// --- دالة لجلب وعرض العقود ---
// بداية الاستبدال لدالة fetchContracts
async function fetchContracts() {
    const listContainer = document.querySelector('#contracts-list-container');
    listContainer.innerHTML = '<p style="text-align: center;">جاري تحميل العقود...</p>';

    const { data: contracts, error } = await supabaseClient
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('خطأ في جلب العقود:', error);
        listContainer.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ.</p>';
        return;
    }

    if (contracts.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center;">لا توجد عقود مضافة حالياً.</p>';
        return;
    }

    listContainer.innerHTML = '';
    const contractsHtml = contracts.map(contract => {
        // --- حساب إجمالي الحراس من البيانات الجديدة ---
        let totalGuards = 0;
        if (contract.locations_and_guards && Array.isArray(contract.locations_and_guards)) {
            contract.locations_and_guards.forEach(location => {
                if (location.shifts && Array.isArray(location.shifts)) {
                    location.shifts.forEach(shift => {
                        totalGuards += parseInt(shift.guards_count) || 0;
                    });
                }
            });
        }
        
        let statusClass = '';
        let statusText = contract.status || 'غير محدد';
        if (contract.status === 'active') statusClass = 'active';
        if (contract.status === 'pending') statusClass = 'pending';
        if (contract.status === 'cancelled') statusClass = 'cancelled';

        return `
            <div class="contract-card">
                <div class="contract-card-header"><h4>${contract.company_name}</h4></div>
                <div class="contract-card-body">
                    <div class="info-line">
                        <i class="ph-bold ph-shield-plus"></i>
                        <strong>إجمالي الحراس:</strong> ${totalGuards}
                    </div>
                     <div class="info-line">
                        <i class="ph-bold ph-info"></i>
                        <strong>الحالة:</strong> <span class="contract-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
              <div class="contract-card-footer">
                    <button class="btn btn-primary view-contract-btn" data-id="${contract.id}"><i class="ph-bold ph-eye"></i> عرض</button>
                    <button class="btn btn-secondary edit-contract-btn" data-id="${contract.id}"><i class="ph-bold ph-pencil-simple"></i> تعديل</button>
                    <button class="btn btn-danger delete-contract-btn" data-id="${contract.id}"><i class="ph-bold ph-trash"></i> حذف</button>
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = `<div class="contracts-container">${contractsHtml}</div>`;
}
// نهاية الاستبدال
// ------------------------------------
// ------------------------------------
// --- دالة لبناء واجهة صفحة الحضور للحارس مع التحقق من الحالة (نسخة مصححة) ---
// ==================== بداية الاستبدال ====================
async function loadAttendancePage() {
    const attendanceContent = document.querySelector('#page-attendance');
    attendanceContent.innerHTML = `
        <div class="page-header"><h3>تسجيل الحضور والانصراف</h3></div>
        <div class="attendance-card">
            <div id="attendance-status" class="attendance-status-text"><p>جاري التحقق من حالتك...</p></div>
            <div id="attendance-actions">
                <button id="check-in-btn" class="btn btn-success btn-lg hidden">تسجيل حضور</button>
                <button id="check-out-btn" class="btn btn-danger btn-lg hidden">تسجيل انصراف</button>
            </div>
            <div id="location-status" class="location-status"></div>
        </div>`;

    if (!currentUser) {
        document.getElementById('attendance-status').innerHTML = '<p>الرجاء تسجيل الدخول أولاً.</p>';
        return;
    }

    // --- بداية التعديل الجوهري ---
    // 1. جلب كل السجلات المفتوحة (بدون .single()) وترتيبها من الأحدث للأقدم
    const { data: openRecords, error } = await supabaseClient
        .from('attendance')
        .select('id, created_at')
        .eq('guard_id', currentUser.id)
        .is('checkout_at', null)
        .order('created_at', { ascending: false }); // ترتيب الأحدث أولاً

    if (error) {
        console.error("خطأ في التحقق من الحضور:", error);
        document.getElementById('attendance-status').innerHTML = '<p>حدث خطأ أثناء التحقق من حالتك.</p>';
        return;
    }

    const statusText = document.getElementById('attendance-status');
    const checkInBtn = document.getElementById('check-in-btn');
    const checkOutBtn = document.getElementById('check-out-btn');

    // 2. التحقق من وجود أي سجل مفتوح في القائمة
    if (openRecords && openRecords.length > 0) {
        // إذا وجدنا سجلات، نأخذ أول واحد فقط (وهو الأحدث بسبب الترتيب)
        const latestRecord = openRecords[0]; 
        
        const clockInTime = new Date(latestRecord.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        statusText.innerHTML = `<p>حالتك الحالية: <strong>مسجل حضور</strong> منذ الساعة ${clockInTime}</p>`;
        checkOutBtn.classList.remove('hidden');
        checkOutBtn.dataset.attendanceId = latestRecord.id;
        startPersistentTracking(currentUser.id);
    } else {
        // المستخدم لم يسجل حضوره
        statusText.innerHTML = `<p>حالتك الحالية: <strong>لم تسجل حضور بعد</strong></p>`;
        checkInBtn.classList.remove('hidden');
        stopPersistentTracking();
    }
    // --- نهاية التعديل الجوهري ---
}

// دالة جديدة لبدء التتبع
// ==================== بداية الاستبدال ====================
// دالة جديدة لبدء التتبع
// ==================== بداية الاستبدال ====================
// دالة لبدء التتبع المستمر
function startPersistentTracking(userId) {
    // التأكد من عدم تشغيل أكثر من متتبع في نفس الوقت
    if (window.locationWatcherId) {
        navigator.geolocation.clearWatch(window.locationWatcherId);
    }
    document.getElementById('location-status').innerHTML = `<p style="color: #22c55e;">التتبع المباشر فعال.</p>`;

    window.locationWatcherId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            // *** هذا هو السطر الذي تم تصحيحه بالكامل ***
            // نستخدم upsert مع تحديد عمود guard_id لمنع التعارض
            supabaseClient.from('guard_locations')
                .upsert({ guard_id: userId, latitude, longitude }, { onConflict: 'guard_id' })
                .then();

            // نستخدم insert لإضافة سجل جديد في "تاريخ" المواقع (هذا صحيح كما هو)
            supabaseClient.from('guard_location_history')
                .insert({ guard_id: userId, latitude, longitude })
                .then();
        },
        (error) => {
            console.error("خطأ في التتبع المستمر:", error);
            document.getElementById('location-status').innerHTML = `<p style="color: #dc3545;">توقف التتبع بسبب خطأ.</p>`;
        },
        { enableHighAccuracy: true }
    );
}
// ===================== نهاية الاستبدال =====================
// ===================== نهاية الاستبدال =====================

// دالة جديدة لإيقاف التتبع
function stopPersistentTracking() {
    if (window.locationWatcherId) {
        navigator.geolocation.clearWatch(window.locationWatcherId);
        window.locationWatcherId = null;
        document.getElementById('location-status').innerHTML = '';
        console.log('تم إيقاف التتبع المباشر.');
    }
}
// ===================== نهاية الاستبدال =====================

// --- الخطوة 11: دالة لجلب وعرض الوظائف ---
async function fetchJobs() {
    const { data: jobs, error } = await supabaseClient
        .from('jobs')
        .select('title, location, type, status'); // نحدد الأعمدة المطلوبة

    if (error) {
        console.error('خطأ في جلب الوظائف:', error);
        const jobsContent = document.querySelector('#page-jobs');
        jobsContent.innerHTML = '<p style="text-align: center;">حدث خطأ أثناء تحميل الوظائف.</p>';
        return;
    }

    const jobsContent = document.querySelector('#page-jobs');
    // مسح المحتوى المؤقت "محتوى صفحة الوظائف هنا"
    jobsContent.innerHTML = '';

    if (jobs.length === 0) {
        jobsContent.innerHTML = '<p style="text-align: center;">لا توجد وظائف متاحة حالياً.</p>';
        return;
    }

    // إنشاء حاوية للبطاقات
    const jobsContainer = document.createElement('div');
    jobsContainer.className = 'jobs-container';

    jobs.forEach(job => {
        const card = `
            <div class="job-card">
                <div class="job-card-header">
                    <h3>${job.title || 'بدون عنوان'}</h3>
                    <span class="status ${job.status === 'active' ? 'active' : 'inactive'}">${job.status === 'active' ? 'شاغرة' : 'مغلقة'}</span>
                </div>
                <div class="job-card-body">
                    <p><i class="ph-bold ph-map-pin"></i> ${job.location || 'غير محدد'}</p>
                    <p><i class="ph-bold ph-clock"></i> ${job.type || 'غير محدد'}</p>
                </div>
                <div class="job-card-footer">
                    <button class="btn btn-secondary">عرض التفاصيل</button>
                </div>
            </div>
        `;
        jobsContainer.insertAdjacentHTML('beforeend', card);
    });

    jobsContent.appendChild(jobsContainer);
}
// ------------------------------------

// ------------------------------------

// --- الخطوة 13: تحديث دالة الخريطة لجلب مواقع الحراس ---
let map; // متغير الخريطة معرف مسبقاً
let markersLayer = L.layerGroup(); // طبقة لتجميع علامات الحراس لتسهيل إدارتها

// ==================== بداية الاستبدال ====================
let mapSubscription = null; // متغير للتحكم في الاشتراك المباشر
let requestsSubscription = null; // متغير لاشتراك الطلبات المباشر

async function initializeMap() {
    // إعداد الخريطة مرة واحدة فقط
    if (!map) {
        map = L.map('map').setView([24.7136, 46.6753], 10); // مركز الخريطة على الرياض كمثال
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
    }

    // التأكد من أن حجم الخريطة صحيح عند عرضها
    setTimeout(() => map.invalidateSize(), 100);

    // مسح العلامات القديمة والاشتراكات السابقة عند إعادة فتح الصفحة
    markersLayer.clearLayers();
    guardMarkers.clear();
    if (mapSubscription) {
        supabaseClient.removeChannel(mapSubscription);
        mapSubscription = null;
    }

    markersLayer.addTo(map);

    // 1. التحميل الأولي لآخر موقع معروف لكل الحراس
    const { data: initialLocations, error: initialError } = await supabaseClient
        .from('guard_locations')
        .select(`
            latitude,
            longitude,
            guard_id,
            users ( name ) 
        `);

    if (initialError) {
        console.error('خطأ في جلب المواقع الأولية:', initialError);
        return;
    }

    initialLocations.forEach(loc => {
        if (loc.latitude && loc.longitude) {
            const guardName = loc.users ? loc.users.name : `حارس (ID: ${loc.guard_id})`;
            const marker = L.marker([loc.latitude, loc.longitude])
                .bindPopup(`<b>${guardName}</b>`);

            markersLayer.addLayer(marker);
            guardMarkers.set(loc.guard_id, marker); // حفظ العلامة باستخدام رقم الحارس
        }
    });

    // 2. الاشتراك المباشر (Realtime) للاستماع للتحديثات الجديدة
    mapSubscription = supabaseClient.channel('public:guard_location_history')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guard_location_history' }, 
        async (payload) => {
            const newLocation = payload.new;
            const guardId = newLocation.guard_id;

            if (guardMarkers.has(guardId)) {
                // إذا كان الحارس موجوداً على الخريطة، قم بتحريك علامته
                const markerToMove = guardMarkers.get(guardId);
                markerToMove.setLatLng([newLocation.latitude, newLocation.longitude]);
            } else {
                // إذا كان الحارس جديداً (لم يكن له موقع أولي)، أضف علامة جديدة له
                // نحتاج لجلب اسم الحارس أولاً
                const { data: guardInfo } = await supabaseClient.from('users').select('name').eq('id', guardId).single();
                const guardName = guardInfo ? guardInfo.name : `حارس (ID: ${guardId})`;
                const newMarker = L.marker([newLocation.latitude, newLocation.longitude])
                    .bindPopup(`<b>${guardName}</b>`);

                markersLayer.addLayer(newMarker);
                guardMarkers.set(guardId, newMarker); // حفظ العلامة الجديدة
            }
        })
        .subscribe();
}
// ===================== نهاية الاستبدال =====================
// ------------------------------------
// ------------------------------------

// ------------------------------------

// --- الخطوة 14: دالة لجلب وعرض الجداول والمناوبات ---
async function fetchSchedules() {
    const schedulesContent = document.querySelector('#page-schedules');
    schedulesContent.innerHTML = '<p style="text-align: center;">جاري تحميل الجداول...</p>';

    const { data: schedules, error } = await supabaseClient
        .from('schedules')
        .select(`
            start_time,
            end_time,
            users ( name ),
            clients ( name )
        `)
        .order('start_time', { ascending: true }); // ترتيب المناوبات حسب وقت البداية

    if (error) {
        console.error('خطأ في جلب الجداول:', error);
        schedulesContent.innerHTML = '<p style="text-align: center;">حدث خطأ أثناء تحميل الجداول.</p>';
        return;
    }

    if (schedules.length === 0) {
        schedulesContent.innerHTML = '<p style="text-align: center;">لا توجد مناوبات مجدولة حالياً.</p>';
        return;
    }

    schedulesContent.innerHTML = ''; // مسح رسالة التحميل

    // تجميع المناوبات حسب اليوم
    const groupedByDay = schedules.reduce((acc, schedule) => {
        const date = new Date(schedule.start_time).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(schedule);
        return acc;
    }, {});

    // إنشاء كود HTML لكل مجموعة يوم
    for (const day in groupedByDay) {
        const dayContainer = document.createElement('div');
        dayContainer.className = 'schedule-day-group';

        let dayHtml = `<h3>${day}</h3><div class="shifts-container">`;

        groupedByDay[day].forEach(shift => {
            const startTime = new Date(shift.start_time).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit', hour12: true });
            const endTime = new Date(shift.end_time).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit', hour12: true });

            dayHtml += `
                <div class="shift-card">
                    <div class="shift-time">${startTime} - ${endTime}</div>
                    <div class="shift-details">
                        <p><strong>الحارس:</strong> ${shift.users ? shift.users.name : 'غير محدد'}</p>
                        <p><strong>الموقع:</strong> ${shift.clients ? shift.clients.name : 'غير محدد'}</p>
                    </div>
                </div>
            `;
        });

        dayHtml += `</div>`;
        dayContainer.innerHTML = dayHtml;
        schedulesContent.appendChild(dayContainer);
    }
}
// ------------------------------------
// بداية الاستبدال
async function loadOpsDirectivesHistory() {
    const container = document.getElementById('ops-history-list-container');
    if (!container || !currentUser) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل السجل...</p>';

    const { data: directives, error } = await supabaseClient
        .from('directives')
        .select(`*, recipient:recipient_id (name)`)
        .eq('sender_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ في جلب السجل.</p>';
        return console.error(error);
    }

    if (directives.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لم تقم بإرسال أي توجيهات بعد.</p>';
        return;
    }

    container.innerHTML = directives.map(d => {
        let statusClass, statusText;
        switch(d.status) {
            case 'accepted': statusClass = 'active'; statusText = 'تم القبول'; break;
            case 'rejected': statusClass = 'inactive'; statusText = 'تم الرفض'; break;
            default: statusClass = 'pending'; statusText = 'مرسل';
        }
        const date = new Date(d.created_at).toLocaleString('ar-SA');
        
        // --- هنا الجزء الجديد لعرض الملاحظات ---
        let notesFooter = '';
        if (d.status === 'rejected' && d.rejection_reason) {
            notesFooter = `<div class="request-card-footer"><strong>سبب الرفض:</strong> ${d.rejection_reason}</div>`;
        } else if (d.status === 'accepted' && d.acceptance_notes) {
            notesFooter = `<div class="request-card-footer" style="background-color: #e6f7ff; color: #005f8a; border-top: 1px solid #b3e0ff;"><strong>ملاحظات القبول:</strong> ${d.acceptance_notes}</div>`;
        }
        
        return `
            <div class="request-card" style="margin-bottom:15px;">
                <div class="request-card-header">
                    <h4>إلى: ${d.recipient ? d.recipient.name : 'مستخدم محذوف'}</h4>
                    <span class="status ${statusClass}">${statusText}</span>
                </div>
                <div class="request-card-body">
                    <p>${d.content}</p>
                    <small style="color: var(--text-secondary);">${date}</small>
                    ${notesFooter}
                </div>
            </div>
        `;
    }).join('');
}
// نهاية الاستبدال
// ------------------------------------

// بداية الاستبدال
async function loadMyVisitsPage() {
    const container = document.getElementById('my-visits-list-container');
    if (!container || !currentUser) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل سجل زياراتك...</p>';

    // تصحيح: تم تغيير الربط من clients إلى contracts
    const { data: visits, error } = await supabaseClient
        .from('visits')
        .select(`*, contracts (company_name)`) // الربط مع العقود
        .eq('user_id', currentUser.id)
        .order('visit_time', { ascending: false });

    if (error) {
        container.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ في جلب السجل.</p>';
        return console.error(error);
    }

    if (visits.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لم تقم بتسجيل أي زيارات بعد.</p>';
        return;
    }

    container.innerHTML = visits.map(visit => {
        const visitTimestamp = new Date(visit.visit_time);
        const visitDate = visitTimestamp.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' });
        const visitTime = visitTimestamp.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });

        // تصحيح: عرض اسم الموقع من الزيارة مباشرة
        const locationDisplay = visit.location_name || 'موقع غير محدد';

        return `
            <div class="visit-card" style="margin-bottom: 15px;">
                <div class="visit-icon"><i class="ph-fill ph-car-profile"></i></div>
                <div class="visit-details">
                    <h4>زيارة إلى: ${locationDisplay}</h4>
                    <p class="visit-meta">
                        <span><i class="ph-bold ph-calendar"></i> ${visitDate} - ${visitTime}</span>
                    </p>
                    <p class="visit-notes">${visit.notes || 'لا توجد ملاحظات.'}</p>
                </div>
            </div>
        `;
    }).join('');
}
// نهاية الاستبدال
// بداية الاستبدال
async function loadMySchedulePage() {
    const container = document.getElementById('my-schedule-container');
    if (!container || !currentUser) return container.innerHTML = '<p>لا يمكن عرض الجدول.</p>';
    if (!currentUser.vacancy_id) return container.innerHTML = '<p style="text-align: center;">أنت غير معين على شاغر وظيفي حالياً.</p>';
    
    container.innerHTML = '<p style="text-align: center;">جاري تحميل جدولك...</p>';

    const { data: vacancy, error } = await supabaseClient.from('job_vacancies').select('schedule_details').eq('id', currentUser.vacancy_id).single();
        
    if (error || !vacancy || !vacancy.schedule_details || vacancy.schedule_details.length === 0) {
        return container.innerHTML = '<p style="text-align: center;">لم يتم تعيين جدول ورديات لهذا الشاغر. يرجى مراجعة الإدارة.</p>';
    }

    const shift = vacancy.schedule_details[0];
    const dayTranslations = { Sat: 'السبت', Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة' };
    const workDays = shift.days.map(day => dayTranslations[day] || day).join('، ');
    const allDaysKeys = Object.keys(dayTranslations);
    const offDays = allDaysKeys.filter(day => !shift.days.includes(day)).map(day => dayTranslations[day]).join('، ');

    // --- الجزء الجديد: حساب الوردية القادمة ---
    let nextShiftText = 'لم يتم تحديد وردية قادمة.';
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const workDayIndexes = shift.days.map(d => dayMap[d]);
    const now = new Date();
    const todayIndex = now.getDay();
    const [shiftHours, shiftMinutes] = shift.start_time.split(':');

    // البحث عن وردية قادمة في الأيام السبعة القادمة
    for (let i = 0; i < 7; i++) {
        const checkingDayIndex = (todayIndex + i) % 7;
        if (workDayIndexes.includes(checkingDayIndex)) {
            const checkingDate = new Date(now);
            checkingDate.setDate(now.getDate() + i);
            const shiftTimeToday = new Date(checkingDate);
            shiftTimeToday.setHours(shiftHours, shiftMinutes, 0, 0);

            if (shiftTimeToday > now) {
                const dayName = new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(shiftTimeToday);
                nextShiftText = `يوم ${dayName} القادم، الساعة ${formatTimeAMPM(shift.start_time)}`;
                break;
            }
        }
    }
    // --- نهاية جزء حساب الوردية القادمة ---

    const scheduleHtml = `
        <div class="contract-display" style="max-width: 700px; margin: auto;">
            <div class="info-line" style="font-size: 1.5rem; background-color: #eef2ff; padding: 15px; border-radius: 8px; justify-content: center;">
                <i class="ph-bold ph-bell-ringing"></i>
                <strong>ورديتك القادمة:</strong> ${nextShiftText}
            </div>
            <h2 style="margin-top: 30px;">تفاصيل ورديتك الحالية</h2>
            <div class="info-line" style="font-size: 1.2rem; margin-bottom: 20px;"><i class="ph-bold ph-clock"></i><strong>التوقيت:</strong> من ${formatTimeAMPM(shift.start_time)} إلى ${formatTimeAMPM(shift.end_time)}</div>
            <div class="info-line" style="font-size: 1.2rem; margin-bottom: 20px;"><i class="ph-bold ph-calendar-check" style="color: var(--approved-color);"></i><strong>أيام العمل:</strong> ${workDays}</div>
            <div class="info-line" style="font-size: 1.2rem;"><i class="ph-bold ph-coffee" style="color: var(--denied-color);"></i><strong>أيام الراحة:</strong> ${offDays || 'لا يوجد'}</div>
        </div>
    `;

    container.innerHTML = scheduleHtml;
}
// نهاية الاستبدال

// بداية الإضافة
async function loadSupervisorPermissionRequestsPage() {
    const container = document.getElementById('supervisor-permission-requests-container');
    if (!container || !currentUser || !currentUser.project) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الطلبات...</p>';

    const { data: requests, error } = await supabaseClient
        .from('employee_requests')
        .select(`*, users:user_id!inner(name, project)`)
        .eq('request_type', 'permission')
        .eq('status', 'معلق')
        .eq('users.project', currentUser.project);

    if (error) { container.innerHTML = '<p style="color:red;">حدث خطأ.</p>'; return console.error(error); }
    if (requests.length === 0) { container.innerHTML = '<p style="text-align: center;">لا توجد طلبات استئذان معلقة حالياً.</p>'; return; }

    container.innerHTML = '';
    requests.forEach(request => {
        const cardHtml = `
        <div class="review-request-card">
            <div class="review-request-header status-pending">
                <h4>طلب استئذان</h4>
                <span class="status-badge">${request.status}</span>
            </div>
            <div class="review-request-body">
                <p><strong>مقدم الطلب:</strong> ${request.users.name}</p>
                <p><strong>السبب:</strong> ${request.details.reason}</p>
            </div>
            <div class="review-request-footer">
                <button class="btn btn-success supervisor-permission-action-btn" data-action="approve" data-request-id="${request.id}"><i class="ph-bold ph-arrow-up"></i> موافقة ورفع للعمليات</button>
                <button class="btn btn-danger supervisor-permission-action-btn" data-action="reject" data-request-id="${request.id}"><i class="ph-bold ph-x"></i> رفض</button>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الإضافة

// بداية الإضافة
async function loadSupervisorApplicationsPage() {
    const container = document.getElementById('supervisor-applications-container');
    if (!container || !currentUser || !currentUser.project) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل طلبات التوظيف...</p>';

    const { data: applications, error } = await supabaseClient
        .from('job_applications')
        .select(`*, job_vacancies!inner(title, project, specific_location)`)
        .eq('status', 'pending_supervisor')
        .eq('job_vacancies.project', currentUser.project);

    if (error) { container.innerHTML = '<p style="color:red;">حدث خطأ.</p>'; return console.error(error); }
    if (applications.length === 0) { container.innerHTML = '<p style="text-align: center;">لا توجد طلبات توظيف جديدة لمراجعتها.</p>'; return; }

    // تجميع المتقدمين حسب الشاغر
    const groupedByVacancy = applications.reduce((acc, app) => {
        const vacancyId = app.vacancy_id;
        if (!acc[vacancyId]) {
            acc[vacancyId] = {
                details: app.job_vacancies,
                applicants: []
            };
        }
        acc[vacancyId].applicants.push(app);
        return acc;
    }, {});

    container.innerHTML = '';
    for (const vacancyId in groupedByVacancy) {
        const group = groupedByVacancy[vacancyId];
        const vacancyDetails = group.details;
        const applicants = group.applicants;

        const groupHtml = `
            <div class="attendance-accordion" style="margin-bottom: 20px;">
                <details open>
                    <summary style="font-size: 1.3rem;">
                        ${vacancyDetails.title} - ${vacancyDetails.specific_location || vacancyDetails.project} 
                        <span class="status pending" style="margin-right: auto;">(${applicants.length} متقدم)</span>
                    </summary>
                    <div class="content" style="padding-top: 15px;">
                        ${applicants.map(applicant => `
                            <div class="attendance-card">
                                <span>${applicant.applicant_data.full_name}</span>
                                <div>
                                    <button class="btn btn-secondary btn-sm view-applicant-details-btn" data-appid="${applicant.id}">عرض التفاصيل</button>
                                    <button class="btn btn-success btn-sm nominate-applicant-btn" data-appid="${applicant.id}" data-vid="${vacancyId}">
                                        <i class="ph-bold ph-check-fat"></i> ترشيح
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', groupHtml);
    }
}
// نهاية الإضافة


// بداية الإضافة
async function loadOpsNomineesPage() {
    const container = document.getElementById('ops-nominees-container');
    if (!container || !currentUser || !currentUser.project) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل المرشحين...</p>';

    const { data: applications, error } = await supabaseClient
        .from('job_applications')
        .select(`*, 
            job_vacancies!inner(title, project, specific_location),
            supervisor:supervisor_approver_id (name)
        `)
        .eq('status', 'pending_ops')
        .eq('job_vacancies.project', currentUser.project);

    if (error) { container.innerHTML = '<p style="color:red;">حدث خطأ.</p>'; return console.error(error); }
    if (applications.length === 0) { container.innerHTML = '<p style="text-align: center;">لا يوجد مرشحون جدد لمراجعتهم.</p>'; return; }

    container.innerHTML = '';
    applications.forEach(app => {
        const vacancy = app.job_vacancies;
        const supervisor = app.supervisor;
        const applicant = app.applicant_data;

        const cardHtml = `
        <div class="review-request-card" style="margin-bottom: 20px;">
            <div class="review-request-header status-pending">
                <h4>مرشح لوظيفة: ${vacancy.title}</h4>
                <span class="status-badge">بانتظار الاعتماد</span>
            </div>
            <div class="review-request-body">
                 <div class="request-meta-grid" style="grid-template-columns: 1fr 1fr;">
                    <div class="request-meta-item"><i class="ph-bold ph-user"></i><span><strong>المرشح:</strong> ${applicant.full_name}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-identification-card"></i><span><strong>الهوية:</strong> ${applicant.id_number}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-map-pin"></i><span><strong>لشاغر:</strong> ${vacancy.specific_location || vacancy.project}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-user-gear"></i><span><strong>المُرشِّح:</strong> ${supervisor.name}</span></div>
                </div>
            </div>
            <div class="review-request-footer">
                <button class="btn btn-primary ops-review-applicant-btn" data-appid="${app.id}">
                    <i class="ph-bold ph-user-plus"></i> مراجعة واعتماد
                </button>
                <button class="btn btn-danger ops-reject-applicant-btn" data-appid="${app.id}" data-vid="${app.vacancy_id}">
                    <i class="ph-bold ph-x-circle"></i> رفض
                </button>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الإضافة

// بداية الاستبدال
async function loadHrOpsHiringPage() {
    const container = document.getElementById('hr-ops-hiring-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل...</p>';

    const { data: applications, error } = await supabaseClient
        .from('job_applications')
        .select(`*, job_vacancies(title, project)`)
        .in('status', ['approved', 'hr_acknowledged']); // جلب المعتمد والمؤرشف

    if (error) { container.innerHTML = '<p style="color:red;">حدث خطأ.</p>'; return; }
    if (applications.length === 0) { container.innerHTML = '<p>لا توجد توظيفات جديدة لمراجعتها.</p>'; return; }

    container.innerHTML = '';
    applications.forEach(app => {
        const isAcknowledged = app.status === 'hr_acknowledged';
        const cardHtml = `
        <div class="review-request-card" style="margin-bottom: 20px;">
            <div class="review-request-header ${isAcknowledged ? 'status-denied' : 'status-approved'}">
                <h4>توظيف جديد: ${app.applicant_data.full_name}</h4>
                <span class="status-badge">${isAcknowledged ? 'تمت المراجعة' : 'بانتظار المراجعة'}</span>
            </div>
            <div class="review-request-body"><p><strong>الوظيفة:</strong> ${app.job_vacancies.title} في مشروع ${app.job_vacancies.project}</p></div>
            <div class="review-request-footer">
                <button class="btn btn-secondary view-applicant-details-btn" data-appid="${app.id}"><i class="ph-bold ph-eye"></i> عرض التفاصيل</button>
                <button class="btn btn-success hr-acknowledge-hire-btn" data-appid="${app.id}" ${isAcknowledged ? 'disabled' : ''}><i class="ph-bold ph-check-square"></i> تأكيد المراجعة</button>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الاستبدال

// --- بداية كود التحقق الدوري عن التوجيهات ---

let directivePollingInterval = null; // متغير لتخزين عملية التحقق
const notifiedDirectiveIds = new Set(); // لتخزين التوجيهات التي تم التنبيه عنها

// دالة لإيقاف التحقق (عند تسجيل الخروج مثلاً)
function stopPollingForDirectives() {
    if (directivePollingInterval) {
        clearInterval(directivePollingInterval);
        directivePollingInterval = null;
    }
}

// دالة لبدء التحقق الدوري
function startPollingForDirectives(userId) {
    stopPollingForDirectives(); // إيقاف أي عملية قديمة أولاً

    directivePollingInterval = setInterval(async () => {
        // كل 15 ثانية، اسأل عن التوجيهات الجديدة
        const { data: newDirectives, error } = await supabaseClient
            .from('directives')
            .select('id, content')
            .eq('recipient_id', userId)
            .eq('status', 'pending'); // فقط التوجيهات التي لم يتم الرد عليها

        if (error || !newDirectives) {
            console.error("Polling error:", error);
            return;
        }

        // المرور على كل توجيه جديد
        for (const directive of newDirectives) {
            // التحقق إذا لم نقم بالتنبيه عن هذا التوجيه من قبل
            if (!notifiedDirectiveIds.has(directive.id)) {
                
                // إضافة هوية التوجيه للمجموعة حتى لا نبه عنه مرة أخرى
                notifiedDirectiveIds.add(directive.id);

                // طلب صلاحية الإشعار وعرضه
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    new Notification('لديك توجيه جديد من الإدارة', {
                        body: directive.content.substring(0, 100), // عرض أول 100 حرف
                        icon: 'icon-192.png',
                    });
                }
            }
        }
    }, 15000); // مدة التكرار: 15000 ميلي ثانية = 15 ثانية
}
// --- نهاية كود التحقق الدوري ---

// بداية الاستبدال
// دالة تحميل طلبات التغطية للموارد البشرية (مع تنسيق الوقت)
async function loadCoverageRequestsPage() {
    const container = document.getElementById('coverage-requests-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الطلبات...</p>';

    const { data: requests, error } = await supabaseClient
        .from('coverage_applicants')
        .select(`*, coverage_shifts (*)`)
        .eq('status', 'ops_approved');

    if (error) {
        container.innerHTML = '<p style="text-align:center; color:red;">حدث خطأ.</p>';
        return console.error(error);
    }

    if (requests.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لا توجد طلبات معتمدة من العمليات بانتظار المراجعة حالياً.</p>';
        return;
    }

    container.innerHTML = '';
    requests.forEach(request => {
        const shift = request.coverage_shifts;
        // --- هنا التعديل ---
        const displayTime = `من ${formatTimeAMPM(shift.start_time)} إلى ${formatTimeAMPM(shift.end_time)}`;

        const cardHtml = `
        <div class="review-request-card">
            <div class="review-request-header status-pending">
                <h4>طلب تغطية لوظيفة: ${shift.project}</h4>
                <span class="status-badge">بانتظار المراجعة</span>
            </div>
            <div class="review-request-body">
                <div class="request-meta-grid">
                    <div class="request-meta-item"><i class="ph-bold ph-user-circle"></i><span><strong>اسم المتقدم:</strong> ${request.full_name}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-identification-card"></i><span><strong>رقم الهوية:</strong> ${request.id_number}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-phone"></i><span><strong>الجوال:</strong> ${request.phone_number}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-bank"></i><span><strong>الآيبان:</strong> ${request.iban}</span></div>
                </div>
                <div class="request-main-details">
                    <h5>تفاصيل الوردية</h5>
                    <p><strong>الموقع:</strong> ${shift.city} - ${shift.location}</p>
                    <p><strong>الوقت:</strong> ${displayTime}</p> <p><strong>قيمة التغطية:</strong> ${shift.coverage_pay} ر.س</p>
                </div>
            </div>
            <div class="review-request-footer">
                <button class="btn btn-success hr-coverage-action-btn" data-action="approve" data-applicant-id="${request.id}" data-shift-id="${request.shift_id}">
                    <i class="ph-bold ph-check-circle"></i> قبول نهائي وتعيين
                </button>
                <button class="btn btn-danger hr-coverage-action-btn" data-action="reject" data-applicant-id="${request.id}">
                    <i class="ph-bold ph-x-circle"></i> رفض
                </button>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// بداية الاستبدال
// دالة تحميل صفحة التوجيهات (النسخة النهائية للمشرف والحارس)
async function loadMyDirectivesPage() {
    // التحكم في إظهار التبويبات بناءً على الدور
    const sendTab = document.querySelector('a[data-tab="send-directive-from-supervisor"]');
    const historyTab = document.querySelector('a[data-tab="supervisor-directives-history"]');

    if (currentUser.role === 'مشرف') {
        sendTab.style.display = 'flex';
        historyTab.style.display = 'flex';
    } else {
        sendTab.style.display = 'none';
        historyTab.style.display = 'none';
    }

    // الجزء الأول: تحميل التوجيهات الواردة (يعمل للجميع)
    const incomingContainer = document.getElementById('my-directives-container');
    if (!incomingContainer || !currentUser) return;
    incomingContainer.innerHTML = '<p style="text-align: center;">جاري تحميل التوجيهات الواردة...</p>';

    const { data: directives, error: directivesError } = await supabaseClient
        .from('directives').select(`*, sender:sender_id (name, role)`).eq('recipient_id', currentUser.id).order('created_at', { ascending: false });

    if (directivesError) {
        incomingContainer.innerHTML = '<p style="color:red;">خطأ في جلب التوجيهات.</p>';
        return console.error(directivesError);
    }

    if (directives.length === 0) {
        incomingContainer.innerHTML = '<p style="text-align: center;">لا توجد لديك توجيهات واردة حالياً.</p>';
    } else {
        incomingContainer.innerHTML = directives.map(d => {
            const date = new Date(d.created_at).toLocaleString('ar-SA');
            let footer = (d.status === 'pending') ? `<div class="review-request-footer"><button class="btn btn-success directive-action-btn" data-action="accepted" data-directive-id="${d.id}"><i class="ph-bold ph-check"></i> قبول</button><button class="btn btn-danger directive-action-btn" data-action="rejected" data-directive-id="${d.id}"><i class="ph-bold ph-x"></i> رفض</button></div>` : '';
            return `<div class="visit-card" style="margin-bottom:15px; border-right-color: var(--accent-color);"><div class="visit-details" style="width: 100%;"><div style="display: flex; justify-content: space-between; align-items: start;"><h4>توجيه من: ${d.sender ? d.sender.name : 'غير معروف'} (${d.sender ? d.sender.role : ''})</h4><span class="visit-meta" style="padding:0; border:0;">${date}</span></div><p class="visit-notes" style="margin-top: 15px;">${d.content}</p></div></div>${footer}`;
        }).join('');
    }

    // الجزء الثاني: إذا كان المستخدم مشرفاً، قم بتحميل قائمة حراسه
    if (currentUser.role === 'مشرف' && currentUser.project) {
        const guardsContainer = document.getElementById('supervisor-guards-list-container');
        guardsContainer.innerHTML = '<p style="text-align: center;">جاري تحميل قائمة الحراس...</p>';
        const { data: guards, error: guardsError } = await supabaseClient.from('users').select('id, name, location').eq('project', currentUser.project).eq('role', 'حارس أمن');
        if (guardsError) {
            guardsContainer.innerHTML = '<p style="color:red;">خطأ في جلب الحراس.</p>';
        } else if (guards.length === 0) {
            guardsContainer.innerHTML = '<p style="text-align: center;">لا يوجد حراس في مشروعك لإرسال توجيهات لهم.</p>';
        } else {
            guardsContainer.innerHTML = guards.map(guard => `<div class="attendance-card"><div><span>${guard.name}</span><p class="time">${guard.location || 'غير محدد'}</p></div><button class="btn btn-primary open-directive-modal-btn" data-recipient-id="${guard.id}" data-recipient-name="${guard.name}"><i class="ph-bold ph-paper-plane-tilt"></i> إرسال توجيه</button></div>`).join('');
        }
    }
}
// نهاية الاستبدال

// بداية الاستبدال
async function loadSupervisorSchedulesPage() {
    const container = document.getElementById('supervisor-schedules-container');
    if (!container || !currentUser || !currentUser.project) {
        return container.innerHTML = '<p>لا يمكن عرض الصفحة.</p>';
    }
    container.innerHTML = '<p style="text-align: center;">جاري تحميل جداول الحراس...</p>';

    // --- هنا التعديل المهم لتحديد العلاقة ---
    const { data: guards, error } = await supabaseClient
        .from('users')
        .select(`name, job_vacancies!inner!users_vacancy_id_fkey(schedule_details)`)
        .eq('project', currentUser.project)
        .eq('role', 'حارس أمن')
        .eq('employment_status', 'نشط');

    if (error) {
        container.innerHTML = '<p style="color:red;">حدث خطأ في جلب بيانات الحراس.</p>';
        return console.error(error);
    }
    if (guards.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لا يوجد حراس لعرض جداولهم في مشروعك.</p>';
        return;
    }

    container.innerHTML = '';
    guards.forEach(guard => {
        const schedule = guard.job_vacancies?.schedule_details?.[0];
        if (!schedule) return;

        const dayTranslations = { Sat: 'السبت', Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة' };
        const workDays = schedule.days.map(day => dayTranslations[day] || day).join('، ');

        const cardHtml = `
            <div class="contract-card">
                <div class="contract-card-header"><h4>${guard.name}</h4></div>
                <div class="contract-card-body">
                    <div class="info-line"><i class="ph-bold ph-clock"></i><strong>الوقت:</strong> من ${formatTimeAMPM(schedule.start_time)} إلى ${formatTimeAMPM(schedule.end_time)}</div>
                    <div class="info-line"><i class="ph-bold ph-calendar-check"></i><strong>أيام العمل:</strong> ${workDays}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الاستبدال

// بداية الاستبدال
// دالة عرض ورديات التغطية (مع تنسيق الوقت وأزرار الإجراءات)
async function loadCoveragePage() {
    const container = document.getElementById('coverage-list-container');
    const pageHeader = document.querySelector('#page-coverage .page-header');
    if (!container || !pageHeader) return;

    if (!pageHeader.querySelector('#add-new-coverage-btn')) {
        pageHeader.insertAdjacentHTML('beforeend', `
            <button id="add-new-coverage-btn" class="btn btn-primary">
                <i class="ph-bold ph-plus"></i> إنشاء تغطية جديدة
            </button>
        `);
    }

    container.innerHTML = '<p style="text-align: center;">جاري تحميل ورديات التغطية...</p>';

    try {
        const [
            { data: shifts, error: e1 },
            { data: applicants, error: e2 }
        ] = await Promise.all([
            supabaseClient.from('coverage_shifts').select('*').order('created_at', { ascending: false }),
            supabaseClient.from('coverage_applicants').select('shift_id, status')
        ]);
        
        if (e1 || e2) throw (e1 || e2);
        
        if (shifts.length === 0) {
            container.innerHTML = '<p style="text-align: center;">لا توجد ورديات تغطية متاحة حالياً.</p>';
            return;
        }

        container.innerHTML = '';
        shifts.forEach(shift => {
            const statusClass = shift.status === 'open' ? 'active' : 'inactive';
            let statusText = shift.status === 'open' ? 'متاحة' : 'مغلقة';

            const pendingApplicantsCount = applicants.filter(a => a.shift_id === shift.id && a.status === 'pending').length;
            const hasAssigned = applicants.some(a => a.shift_id === shift.id && a.status === 'hr_approved');
            if(hasAssigned) statusText = 'تم التعيين';

            const viewApplicantsBtn = `<button class="btn btn-primary btn-sm view-applicants-btn" data-shift-id="${shift.id}" ${pendingApplicantsCount === 0 ? 'disabled' : ''}><i class="ph-bold ph-users"></i> عرض المتقدمين (${pendingApplicantsCount})</button>`;
            const editBtn = `<button class="btn btn-secondary btn-sm edit-coverage-btn" data-shift-id="${shift.id}"><i class="ph-bold ph-pencil-simple"></i> تعديل</button>`;
            const deleteBtn = `<button class="btn btn-danger btn-sm delete-coverage-btn" data-shift-id="${shift.id}"><i class="ph-bold ph-trash"></i> حذف</button>`;
            
            // --- هنا التعديل المهم ---
            const displayTime = `من ${formatTimeAMPM(shift.start_time)} إلى ${formatTimeAMPM(shift.end_time)}`;

            const cardHtml = `
            <div class="contract-card">
                <div class="contract-card-header"><h4>${shift.project}</h4><span class="status ${statusClass}">${statusText}</span></div>
                <div class="contract-card-body">
                    <p><i class="ph-bold ph-map-pin"></i> <strong>الموقع:</strong> ${shift.location}</p>
                    <p><i class="ph-bold ph-clock"></i> <strong>الوقت:</strong> ${displayTime}</p> <p><i class="ph-bold ph-money"></i> <strong>قيمة التغطية:</strong> ${shift.coverage_pay} ر.س</p>
                    <p><i class="ph-bold ph-info"></i> <strong>السبب:</strong> ${shift.reason}</p>
                </div>
                <div class="contract-card-footer">
                    ${viewApplicantsBtn}
                    ${editBtn}
                    ${deleteBtn}
                </div>
            </div>`;
            container.insertAdjacentHTML('beforeend', cardHtml);
        });

    } catch(err) {
        container.innerHTML = `<p style="text-align: center; color: red;">حدث خطأ: ${err.message}</p>`;
        console.error("Load Coverage Error:", err);
    }
}
// نهاية الاستبدال

// ------------------------------------------------

// ------------------------------------

// بداية الاستبدال
// --- دالة عرض الزيارات والجولات لمدير العمليات ---
async function fetchVisits() {
    const visitsContent = document.querySelector('#page-visits');
    // إضافة هيكل جديد مع تبويبات
    visitsContent.innerHTML = `
        <div class="page-header"><h3>سجل الميدان</h3></div>
        <div class="tabs">
            <a href="#" class="tab-link active" data-tab="visits-log"><i class="ph-bold ph-car-profile"></i> سجل الزيارات</a>
            <a href="#" class="tab-link" data-tab="patrols-log"><i class="ph-bold ph-footprints"></i> سجل الجولات</a>
        </div>
        <div id="visits-log" class="tab-content active">
            <div id="visits-list-container"><p style="text-align: center;">جاري تحميل سجل الزيارات...</p></div>
        </div>
        <div id="patrols-log" class="tab-content">
            <div id="patrols-list-container"><p style="text-align: center;">جاري تحميل سجل الجولات...</p></div>
        </div>
    `;

    // الكود القديم لجلب الزيارات سيعمل كما هو ولكن داخل التبويب الصحيح
    const listContainer = document.querySelector('#visits-list-container');
    if (!currentUser || !currentUser.project) {
        listContainer.innerHTML = '<p style="text-align: center;">لم يتم تحديد مشروع لك.</p>';
        return;
    }

    const { data: visits, error } = await supabaseClient
        .from('visits')
        .select(`*, contracts (company_name), users:user_id (name, project)`)
        .eq('users.project', currentUser.project)
        .order('visit_time', { ascending: false });

    if (error) {
        console.error('خطأ في جلب الزيارات:', error);
        listContainer.innerHTML = '<p style="text-align: center;">حدث خطأ أثناء تحميل الزيارات.</p>';
        return;
    }

    if (visits.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center;">لا توجد زيارات مسجلة من مشرفي مشروعك حالياً.</p>';
        return;
    }

    listContainer.innerHTML = '';

    visits.forEach(visit => {
        if (!visit.users) return;
        const visitTimestamp = new Date(visit.visit_time);
        const visitDate = visitTimestamp.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long'});
        const visitTime = visitTimestamp.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit'});
        const projectName = visit.contracts?.company_name || 'مشروع غير معروف';
        const locationDisplay = `${projectName} - ${visit.location_name}`;
        const card = `
            <div class="visit-card">
                <div class="visit-icon"><i class="ph-fill ph-car-profile"></i></div>
                <div class="visit-details">
                    <h4>زيارة إلى: ${locationDisplay}</h4>
                    <p class="visit-meta">
                        <span><i class="ph-bold ph-user-circle"></i> المشرف: ${visit.users.name}</span>
                        <span><i class="ph-bold ph-calendar"></i> ${visitDate} - ${visitTime}</span>
                    </p>
                    <p class="visit-notes">${visit.notes || 'لا توجد ملاحظات.'}</p>
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', card);
    });
}
// نهاية الاستبدال

// بداية الإضافة
async function loadPatrolsHistory() {
    const container = document.getElementById('patrols-list-container');
    if (!container || !currentUser || !currentUser.project) {
        container.innerHTML = '<p style="text-align: center;">لا يمكن عرض سجل الجولات.</p>';
        return;
    }
    container.innerHTML = '<p style="text-align: center;">جاري تحميل سجل الجولات...</p>';

    // جلب الجولات المكتملة للمشرفين في نفس مشروع مدير العمليات
    const { data: patrols, error } = await supabaseClient
        .from('patrols')
        .select(`*, supervisor:supervisor_id (name, project)`)
        .eq('status', 'completed')
        .eq('supervisor.project', currentUser.project)
        .order('start_time', { ascending: false });

    if (error) {
        container.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ في جلب السجل.</p>';
        return console.error(error);
    }

    if (patrols.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لا توجد جولات مكتملة لعرضها.</p>';
        return;
    }

    container.innerHTML = '';
    patrols.forEach(patrol => {
        const startTime = new Date(patrol.start_time);
        const endTime = new Date(patrol.end_time);
        const durationMs = endTime - startTime;
        const durationMinutes = Math.round(durationMs / 60000);

        const card = `
            <div class="visit-card" style="border-right-color: #16a34a;">
                <div class="visit-icon" style="color: #16a34a;"><i class="ph-fill ph-footprints"></i></div>
                <div class="visit-details">
                    <h4>جولة للمشرف: ${patrol.supervisor ? patrol.supervisor.name : 'غير معروف'}</h4>
                    <p class="visit-meta">
                        <span><i class="ph-bold ph-calendar-check"></i> ${startTime.toLocaleDateString('ar-SA')}</span>
                        <span><i class="ph-bold ph-clock"></i> من ${startTime.toLocaleTimeString('ar-SA', {timeStyle: 'short'})} إلى ${endTime.toLocaleTimeString('ar-SA', {timeStyle: 'short'})}</span>
                        <span><i class="ph-bold ph-timer"></i> المدة: ${durationMinutes} دقيقة</span>
                    </p>
                    <p class="visit-notes">${patrol.notes || 'لا توجد ملاحظات.'}</p>
                </div>
                <div class="visit-actions">
                    <button class="btn btn-secondary view-patrol-path-btn" data-patrol-id="${patrol.id}">
                        <i class="ph-bold ph-map-trifold"></i> عرض المسار
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}
// نهاية الإضافة
// ------------------------------------
// --- دالة لجلب وعرض صفحة إدارة الشواغر ---
// --- دوال لوحة الموارد البشرية (بنظام التبويبات) ---

async function loadVacancyTabData() {
    const listContainer = document.getElementById('vacancies-list-container');
    const requiredEl = document.getElementById('hr-stats-required');
    const assignedEl = document.getElementById('hr-stats-assigned');
    const gapEl = document.getElementById('hr-stats-gap');

    if (!listContainer) return;
    listContainer.innerHTML = '<p style="text-align: center;">جاري تحميل...</p>';

    try {
        // --- الخطوة 1: جلب الشواغر ---
        const { data: vacancies, error: vacanciesError } = await supabaseClient
            .from('job_vacancies')
            .select('*, contracts(company_name)')
            .order('created_at', { ascending: false });

        if (vacanciesError) throw vacanciesError;

        // --- الخطوة 2: جلب كل الموظفين المرتبطين بشواغر ---
        const { data: assignedUsers, error: usersError } = await supabaseClient
            .from('users')
            .select('id, name, vacancy_id')
            .not('vacancy_id', 'is', null);

        if (usersError) throw usersError;

        // --- الخطوة 3: بناء الجدول ---
        if (vacancies.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center;">لا توجد شواغر مضافة حالياً.</p>';
            return;
        }

        listContainer.innerHTML = `<div class="table-container"><table><thead><tr><th>المسمى الوظيفي</th><th>المشروع</th><th>الموقع المحدد</th><th>الحالة / الموظف المسؤول</th><th>إجراءات</th></tr></thead><tbody id="vacancies-table-body"></tbody></table></div>`;

        const tableBody = document.getElementById('vacancies-table-body');
        vacancies.forEach(vacancy => {
            let statusHtml;
            let actionsHtml;

            if (vacancy.status === 'open') {
                statusHtml = `<span class="status active">مفتوح</span>`;
                actionsHtml = `<button class="btn-action edit-vacancy-btn" data-id="${vacancy.id}"><i class="ph-bold ph-pencil-simple"></i></button><button class="btn-action delete-vacancy-btn" data-id="${vacancy.id}"><i class="ph-bold ph-trash"></i></button>`;
            } else { // الشاغر مغلق
                // البحث العكسي: ابحث عن الموظف الذي لديه vacancy_id مطابق
                const user = assignedUsers.find(u => u.vacancy_id === vacancy.id);

                if (user) {
                    const assignedUserName = user.name;
                    statusHtml = `<span class="status inactive">مغلق ( ${assignedUserName} )</span>`;
                    actionsHtml = `<button class="btn btn-secondary btn-sm swap-assignment-btn" data-vacancy-id="${vacancy.id}" data-current-user-id="${user.id}" data-current-user-name="${assignedUserName}"><i class="ph-bold ph-arrows-clockwise"></i> تبديل</button>`;
                } else {
                    statusHtml = `<span class="status inactive">مغلق (غير معين)</span>`;
                    actionsHtml = `<button class="btn-action edit-vacancy-btn" data-id="${vacancy.id}"><i class="ph-bold ph-pencil-simple"></i></button><button class="btn-action delete-vacancy-btn" data-id="${vacancy.id}"><i class="ph-bold ph-trash"></i></button>`;
                }
            }

            tableBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${vacancy.title}</td>
                    <td>${vacancy.project || (vacancy.contracts ? vacancy.contracts.company_name : 'غير محدد')}</td>
                    <td>${vacancy.specific_location || 'غير محدد'}</td>
                    <td>${statusHtml}</td>
                    <td>${actionsHtml}</td>
                </tr>
            `);
        });

    } catch (error) {
        console.error("Error loading vacancy data:", error);
        listContainer.innerHTML = `<p style="color:red;">حدث خطأ في تحميل بيانات الشواغر: ${error.message}</p>`;
    }
}
// دالة تحميل تبويب الموظفين
async function loadEmployeeTabData() {
    const container = document.getElementById('employees-list-container');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الموظفين...</p>';

    const searchVal = document.getElementById('employee-search-input').value;
    const roleVal = document.getElementById('employee-role-filter').value;
    const projectVal = document.getElementById('employee-project-filter').value;

    // جلب كل الأعمدة الجديدة التي نحتاجها للعرض
    let query = supabaseClient.from('users').select(`
        id, name, role, project, phone, employment_status, auth_user_id
    `);

    if (roleVal) query = query.eq('role', roleVal);
    if (projectVal) query = query.ilike('project', `%${projectVal}%`);
    if (searchVal) query = query.or(`name.ilike.%${searchVal}%,id_number.ilike.%${searchVal}%`);
    
    const { data: employees, error } = await query.order('name', { ascending: true });

    if (error) {
        container.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ في تحميل الموظفين.</p>';
        return console.error(error);
    }
    if (employees.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لم يتم العثور على موظفين بهذه المواصفات.</p>';
        return;
    }

    // تحديث رأس الجدول ليشمل الأعمدة الجديدة
    container.innerHTML = `<table><thead><tr>
        <th>الاسم</th>
        <th>الدور</th>
        <th>رقم الجوال</th>
        <th>المشروع</th>
        <th>الحالة الوظيفية</th>
        <th>إجراءات</th>
    </tr></thead><tbody id="employees-table-body"></tbody></table>`;
    
    const tableBody = document.getElementById('employees-table-body');
    employees.forEach(emp => {
        // عرض البيانات الجديدة في صفوف الجدول
        tableBody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${emp.name || 'غير متوفر'}</td>
                <td>${emp.role || 'غير محدد'}</td>
                <td>${emp.phone || 'غير مسجل'}</td>
                <td>${emp.project || 'غير معين'}</td>
                <td>
                    <span class="status ${emp.employment_status === 'نشط' ? 'active' : 'inactive'}">
                        ${emp.employment_status || 'غير محدد'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-secondary edit-employee-btn" data-id="${emp.id}"><i class="ph-bold ph-pencil-simple"></i> تعديل</button>
                    <button class="btn btn-danger delete-employee-btn" data-id="${emp.id}" data-auth-id="${emp.auth_user_id}"><i class="ph-bold ph-trash"></i> حذف</button>
                </td>
            </tr>
        `);
    });
}
// دالة مطورة لتحميل وعرض الطلبات في صفحة مراجعة الطلبات
// دالة مطورة لتحميل وعرض الطلبات في صفحة مراجعة الطلبات بالتصميم الاحترافي
// بداية الاستبدال
async function loadOperationsRequestsPage() {
    const container = document.getElementById('all-operations-requests-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل طلبات التوظيف...</p>';

    const { data: requests, error } = await supabaseClient
        .from('employee_requests')
        .select(`*, users:user_id(name)`) // <-- تم تحديد العلاقة الصحيحة هنا
        .eq('request_type', 'hiring')
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = '<p style="text-align: center; color: red;">حدث خطأ.</p>';
        return console.error(error);
    }
    if (requests.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لا توجد طلبات توظيف حالياً.</p>';
        return;
    }

    requests.sort((a, b) => (a.status === 'معلق' ? -1 : 1) - (b.status === 'معلق' ? -1 : 1));
    container.innerHTML = '';

    requests.forEach(request => {
        const requestTime = new Date(request.created_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' });
        const emp = request.details;
        let footerHtml = '';

        let headerStatusClass = 'status-pending';
        if (request.status === 'مقبول') headerStatusClass = 'status-approved';
        if (request.status === 'مرفوض') headerStatusClass = 'status-denied';

        if (request.status === 'معلق') {
            footerHtml = `<div class="review-request-footer">
                <button class="btn btn-success approve-request-btn" data-request-id="${request.id}" data-type="hiring"><i class="ph-bold ph-check"></i> قبول</button>
                <button class="btn btn-danger reject-request-btn" data-request-id="${request.id}" data-type="hiring"><i class="ph-bold ph-x"></i> رفض</button>
            </div>`;
        } else if (request.status === 'مرفوض' && request.rejection_reason) {
            footerHtml = `<div class="request-card-footer"><strong>سبب الرفض:</strong> ${request.rejection_reason}</div>`;
        }

        const cardHtml = `
        <div class="review-request-card">
            <div class="review-request-header ${headerStatusClass}"><h4>طلب توظيف</h4><span class="status-badge">${request.status}</span></div>
            <div class="review-request-body">
                <div class="request-meta-grid">
                    <div class="request-meta-item"><i class="ph-bold ph-user-circle"></i><span><strong>مقدم الطلب:</strong> ${request.users ? request.users.name : 'غير معروف'}</span></div>
                    <div class="request-meta-item"><i class="ph-bold ph-calendar"></i><span><strong>تاريخ الطلب:</strong> ${requestTime}</span></div>
                </div>
                <div class="request-main-details">
                    <h5>بيانات الموظف المقترح</h5>
                    <div class="request-meta-grid" style="grid-template-columns: 1fr 1fr; border:0; padding:0; margin-bottom:10px;">
                        <p><strong>الاسم:</strong> ${emp.name}</p>
                        <p><strong>الهوية:</strong> ${emp.id_number}</p>
                        <p><strong>الدور:</strong> ${emp.role}</p>
                        <p><strong>المشروع:</strong> ${emp.project || 'غير محدد'}</p>
                    </div>
                </div>
            </div>
            ${footerHtml}
        </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الاستبدال

// بداية الإضافة: دوال تحميل الطلبات المنفصلة

// بداية الاستبدال
function renderRequests(requests, containerId, requestTypeTranslation) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (requests.length === 0) { container.innerHTML = `<p style="text-align: center;">لا توجد طلبات ${requestTypeTranslation} حالياً.</p>`; return; }
    requests.sort((a, b) => (a.status === 'معلق' || a.status === 'بانتظار موافقة الموارد البشرية' ? -1 : 1) - (b.status === 'معلق' || b.status === 'بانتظار موافقة الموارد البشرية' ? -1 : 1));
    container.innerHTML = '';
    requests.forEach(request => {
        let detailsHtml = '';
        if (request.details) {
            if (request.details.days) detailsHtml += `<p><strong>المدة:</strong> ${request.details.days} أيام</p>`;
            if (request.details.amount) detailsHtml += `<p><strong>المبلغ:</strong> ${request.details.amount} ر.س</p>`;
            if (request.details.reason) detailsHtml += `<p><strong>السبب:</strong> ${request.details.reason}</p>`;
        }
        let footerHtml = '';
        if (request.status === 'بانتظار موافقة الموارد البشرية') {
            footerHtml = `<div class="review-request-footer"><button class="btn btn-success request-action-button" data-approval-stage="hr_final" data-action="approve" data-request-id="${request.id}" data-request-type="${request.request_type}" data-user-id="${request.user_id}" data-vacancy-id="${request.users?.vacancy_id || ''}"><i class="ph-bold ph-check"></i> قبول نهائي</button><button class="btn btn-danger request-action-button" data-approval-stage="hr_final" data-action="reject" data-request-id="${request.id}"><i class="ph-bold ph-x"></i> رفض</button></div>`;
        } else if (request.status === 'مرفوض' && request.rejection_reason) {
            footerHtml = `<div class="request-card-footer"><strong>سبب الرفض:</strong> ${request.rejection_reason}</div>`;
        }
        const headerStatusClass = request.status === 'مقبول' ? 'status-approved' : (request.status === 'مرفوض' ? 'status-denied' : 'status-pending');
        const cardHtml = `<div class="review-request-card"><div class="review-request-header ${headerStatusClass}"><h4>طلب ${requestTypeTranslation}</h4><span class="status-badge">${request.status}</span></div><div class="review-request-body"><div class="request-meta-grid" style="grid-template-columns: 1fr;"><div class="request-meta-item"><i class="ph-bold ph-user-circle"></i><span><strong>مقدم الطلب:</strong> ${request.users ? request.users.name : 'غير معروف'}</span></div></div><div class="request-main-details">${detailsHtml}</div></div>${footerHtml}</div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الاستبدال

// بداية الاستبدال
async function loadLeaveRequests() {
    const container = document.getElementById('all-leave-requests-container');
    container.innerHTML = '<p style="text-align: center;">جاري التحميل...</p>';
    const { data, error } = await supabaseClient
        .from('employee_requests')
        .select(`*, users:user_id (name, vacancy_id)`) // تحديد العلاقة الصحيحة
        .eq('request_type', 'leave')
        .eq('status', 'بانتظار موافقة الموارد البشرية') // جلب الطلبات الجاهزة فقط
        .order('created_at', { ascending: false });
    if(error) { container.innerHTML = '<p style="color:red;">حدث خطأ</p>'; return console.error(error); }
    renderRequests(data, 'all-leave-requests-container', 'إجازة');
}
// نهاية الاستبدال

// بداية الاستبدال
async function loadResignationRequests() {
    const container = document.getElementById('all-resignation-requests-container');
    container.innerHTML = '<p style="text-align: center;">جاري التحميل...</p>';
    const { data, error } = await supabaseClient
        .from('employee_requests')
        .select(`*, users:user_id (name, vacancy_id)`) // تحديد العلاقة الصحيحة
        .eq('request_type', 'resignation')
        .eq('status', 'بانتظار موافقة الموارد البشرية') // جلب الطلبات الجاهزة فقط
        .order('created_at', { ascending: false });
    if(error) { container.innerHTML = '<p style="color:red;">حدث خطأ</p>'; return console.error(error); }
    renderRequests(data, 'all-resignation-requests-container', 'استقالة');
}
// نهاية الاستبدال

// بداية الاستبدال
async function loadLoanRequests() {
    const container = document.getElementById('all-loan-requests-container');
    container.innerHTML = '<p style="text-align: center;">جاري التحميل...</p>';
    const { data, error } = await supabaseClient
        .from('employee_requests')
        .select(`*, users:user_id (name, vacancy_id)`) // تحديد العلاقة الصحيحة
        .eq('request_type', 'loan')
        .eq('status', 'بانتظار موافقة الموارد البشرية') // جلب الطلبات الجاهزة فقط
        .order('created_at', { ascending: false });
    if(error) { container.innerHTML = '<p style="color:red;">حدث خطأ</p>'; return console.error(error); }
    renderRequests(data, 'all-loan-requests-container', 'سلفة');
}
// نهاية الاستبدال

// بداية الاستبدال
// دالة عرض سجل الحضور بالتصميم الهرمي الجديد
async function loadHrAttendanceLogPage(filters = {}) {
    const container = document.getElementById('hr-attendance-accordion-container');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل السجلات...</p>';

    try {
        let query = supabaseClient.from('attendance').select(`
            status, created_at, checkout_at,
            users ( name, region, project, location )
        `).order('created_at', { ascending: false });

        // تطبيق الفلاتر من الكائن الممرر
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
        if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

        const { data, error } = await query;
        if (error) throw error;

        if (data.length === 0) {
            container.innerHTML = '<p style="text-align: center;">لا توجد سجلات تطابق معايير البحث.</p>';
            return;
        }

        // 1. تجميع البيانات بشكل هرمي
        const groupedData = data.reduce((acc, record) => {
            if (!record.users) return acc; // تجاهل السجلات بدون مستخدم مرتبط
            const { region, project, location } = record.users;
            if (!region || !project || !location) return acc;

            if (!acc[region]) acc[region] = {};
            if (!acc[region][project]) acc[region][project] = {};
            if (!acc[region][project][location]) acc[region][project][location] = [];
            acc[region][project][location].push(record);
            
            return acc;
        }, {});

        // 2. بناء الـ HTML الهرمي
        let accordionHtml = '';
        for (const region in groupedData) {
            let projectsHtml = '';
            for (const project in groupedData[region]) {
                let locationsHtml = '';
                for (const location in groupedData[region][project]) {
                    const records = groupedData[region][project][location];
                    const recordsTable = `
                        <table class="records-table"><thead><tr><th>الحارس</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th></tr></thead><tbody>
                        ${records.map(r => `
                            <tr>
                                <td>${r.users.name}</td>
                                <td>${new Date(r.created_at).toLocaleString('ar-SA')}</td>
                                <td>${r.checkout_at ? new Date(r.checkout_at).toLocaleString('ar-SA') : '-'}</td>
                                <td><span class="status ${r.status === 'حاضر' ? 'active' : 'inactive'}">${r.status}</span></td>
                            </tr>
                        `).join('')}
                        </tbody></table>
                    `;
                    locationsHtml += `<details><summary>${location}</summary><div class="content">${recordsTable}</div></details>`;
                }
                projectsHtml += `<details><summary>${project}</summary><div class="content">${locationsHtml}</div></details>`;
            }
            accordionHtml += `<details open><summary>${region}</summary><div class="content">${projectsHtml}</div></details>`;
        }
        
        container.innerHTML = accordionHtml || '<p style="text-align: center;">لا توجد بيانات مجمعة لعرضها.</p>';

    } catch (err) {
        container.innerHTML = `<p style="text-align: center; color: red;">حدث خطأ: ${err.message}</p>`;
        console.error("HR Attendance Accordion Error:", err);
    }
}
// نهاية الاستبدال

// بداية الاستبدال
async function generatePayroll() {
    const resultsContainer = document.getElementById('payroll-results-container');
    const monthInput = document.getElementById('payroll-month').value;
    const projectFilter = document.getElementById('payroll-project').value;
    const locationFilter = document.getElementById('payroll-location').value;

    if (!monthInput) return alert('الرجاء اختيار الشهر والسنة أولاً.');
    resultsContainer.innerHTML = '<p style="text-align: center;">جاري جلب البيانات وحساب الرواتب...</p>';
    payrollExportData = []; // <-- إفراغ بيانات التصدير القديمة عند كل عملية جديدة

    try {
        const [year, month] = monthInput.split('-');
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // تعديل الاستعلام ليشمل كل بيانات الموظف التي نحتاجها
        let employeesQuery = supabaseClient
            .from('users')
            .select(`*, job_vacancies!users_vacancy_id_fkey(*)`)
            .eq('employment_status', 'نشط')
            .not('vacancy_id', 'is', null);

        if (projectFilter) employeesQuery = employeesQuery.like('project', `%${projectFilter}%`);
        if (locationFilter) employeesQuery = employeesQuery.like('location', `%${locationFilter}%`);

        const [ { data: employees, error: e1 }, { data: attendanceRecords, error: e2 }, { data: leaveRecords, error: e3 } ] = await Promise.all([
            employeesQuery,
            supabaseClient.from('attendance').select('guard_id, created_at').gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
            supabaseClient.from('employee_requests').select('user_id, details->>start_date, details->>days').eq('request_type', 'leave').eq('status', 'مقبول')
        ]);

        if (e1 || e2 || e3) throw (e1 || e2 || e3);
        
        if (employees.length === 0) {
            resultsContainer.innerHTML = '<p style="text-align: center;">لم يتم العثور على موظفين مطابقين.</p>';
            return;
        }
        
        let tableRowsHtml = '';
        for (const emp of employees) {
            const vacancy = emp.job_vacancies;
            if (!vacancy || !vacancy.schedule_details || vacancy.schedule_details.length === 0) continue;

            // ... (نفس حسابات الرواتب السابقة) ...
            const shift = vacancy.schedule_details[0];
            const grossSalary = (vacancy.base_salary || 0) + (vacancy.housing_allowance || 0) + (vacancy.transport_allowance || 0) + (vacancy.other_allowances || 0);
            const dailyRate = grossSalary / 30;
            const workHours = shift.work_hours || 8;
            const hourlyRate = dailyRate / workHours;
            let absentDays = 0;
            for (let day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
                const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
                if (shift.days.includes(dayName)) {
                    const hasAttended = attendanceRecords.some(att => att.guard_id === emp.id && new Date(att.created_at).toDateString() === day.toDateString());
                    const isOnLeave = leaveRecords.some(leave => { const leaveStart = new Date(leave.start_date); const leaveEnd = new Date(leaveStart); leaveEnd.setDate(leaveStart.getDate() + (parseInt(leave.days) - 1)); return leave.user_id === emp.id && day >= leaveStart && day <= leaveEnd; });
                    if (!hasAttended && !isOnLeave) absentDays++;
                }
            }
            const absenceDeduction = (absentDays * 2) * dailyRate;
            let totalLateMinutes = 0;
            const employeeAttendance = attendanceRecords.filter(att => att.guard_id === emp.id);
            for (const record of employeeAttendance) {
                const checkInTime = new Date(record.created_at);
                const scheduledTime = new Date(checkInTime);
                const [hours, minutes] = shift.start_time.split(':');
                scheduledTime.setHours(hours, minutes, 0, 0);
                if (checkInTime > scheduledTime) {
                    const lateMilliseconds = checkInTime - scheduledTime;
                    totalLateMinutes += Math.floor(lateMilliseconds / 60000);
                }
            }
            const latenessDeduction = (totalLateMinutes / 60) * hourlyRate;
            const netSalary = grossSalary - absenceDeduction - latenessDeduction;

            // --- الإضافة المهمة: تعبئة مصفوفة التصدير ---
            payrollExportData.push({
                name: emp.name,
                id_number: emp.id_number,
                phone: emp.phone,
                iban: emp.iban,
                project: emp.project,
                location: emp.location,
                role: emp.role,
                gross_salary: grossSalary,
                absence_days: absentDays,
                absence_deduction: absenceDeduction,
                late_minutes: totalLateMinutes,
                lateness_deduction: latenessDeduction,
                net_salary: netSalary
            });

            // بناء جدول العرض على الشاشة (لا تغيير هنا)
            tableRowsHtml += `<tr><td>${emp.name}</td><td>${emp.project} / ${emp.location || ''}</td><td>${grossSalary.toLocaleString('ar-SA')} ر.س</td><td><strong style="color: #ef4444;">${absenceDeduction.toLocaleString('ar-SA', {maximumFractionDigits: 2})} ر.س (${absentDays} أيام)</strong></td><td><strong style="color: #f59e0b;">${latenessDeduction.toLocaleString('ar-SA', {maximumFractionDigits: 2})} ر.س (${totalLateMinutes} دقيقة)</strong></td><td><strong>${netSalary.toLocaleString('ar-SA', {maximumFractionDigits: 2})} ر.س</strong></td></tr>`;
        }
        
        const fullTableHtml = `<div class="table-header" style="margin-top: 20px;"><h3>مسير رواتب شهر ${month}-${year}</h3><button id="export-payroll-btn" class="btn btn-success"><i class="ph-bold ph-file-xls"></i> تصدير إلى Excel</button></div><table><thead><tr><th>الاسم</th><th>المشروع/الموقع</th><th>إجمالي الراتب</th><th>خصم الغياب</th><th>خصم التأخير</th><th>صافي المستحق</th></tr></thead><tbody>${tableRowsHtml}</tbody></table>`;
        resultsContainer.innerHTML = fullTableHtml;

    } catch (err) {
        resultsContainer.innerHTML = `<p style="text-align: center; color: red;">حدث خطأ فادح: ${err.message}</p>`;
        console.error("Payroll Generation Error:", err);
    }
}
// نهاية الاستبدال
// --- دالة جديدة لصفحة التوظيف ---
// --- دالة مطورة لصفحة التوظيف ---
// --- دالة صفحة التوظيف مع تفعيل السحب والإفلات والفلترة ---
async function loadHiringPage() {
    const vacanciesContainer = document.getElementById('hiring-vacancies-container');
    const historyContainer = document.getElementById('hiring-requests-history-container');

    vacanciesContainer.innerHTML = '<p>جاري تحميل الشواغر...</p>';
    historyContainer.innerHTML = '<p>جاري تحميل طلباتك...</p>';

    // جلب البيانات بشكل متوازي
    const [
        { data: vacancies, error: e1 },
        { data: requests, error: e2 }
    ] = await Promise.all([
        supabaseClient.from('job_vacancies').select('*').eq('status', 'open'),
        supabaseClient.from('employee_requests').select('*').eq('request_type', 'hiring').eq('user_id', currentUser.id).order('created_at', { ascending: false })
    ]);

    // 1. عرض الشواغر المفتوحة
    if (e1) {
        vacanciesContainer.innerHTML = '<p style="color:red;">خطأ في تحميل الشواغر.</p>';
    } else if (vacancies.length === 0) {
        vacanciesContainer.innerHTML = '<p>لا توجد شواغر مفتوحة حالياً.</p>';
    } else {
        vacanciesContainer.innerHTML = '';
        vacancies.forEach(vacancy => {
            const cardHtml = `
            <div class="contract-card">
                <div class="contract-card-header"><h4>${vacancy.title}</h4></div>
                <div class="contract-card-body">
                    <p><i class="ph-bold ph-map-pin"></i> ${vacancy.project} - ${vacancy.specific_location || vacancy.location}</p>
                </div>
                <div class="contract-card-footer">
                    <button class="btn btn-secondary btn-sm view-vacancy-details-btn" data-id="${vacancy.id}"><i class="ph-bold ph-info"></i> تفاصيل</button>
                    <button class="btn btn-success btn-sm add-to-coverage-btn" data-id="${vacancy.id}"><i class="ph-bold ph-shield-check"></i> للتغطية</button>
                    <button class="btn btn-primary btn-sm hire-new-btn" 
        data-vacancy-id="${vacancy.id}"
        data-project="${vacancy.project}"
        data-location="${vacancy.location}"
        data-region="${vacancy.region}"
        data-role="${vacancy.title}"
        data-contract-id="${vacancy.contract_id || ''}">
    <i class="ph-bold ph-user-plus"></i> توظيف جديد
</button>
                </div>
            </div>`;
            vacanciesContainer.insertAdjacentHTML('beforeend', cardHtml);
        });
    }

    // 2. عرض طلبات التوظيف المقدمة من هذا المستخدم
    if (e2) {
        historyContainer.innerHTML = '<p style="color:red;">خطأ في تحميل سجل الطلبات.</p>';
    } else if (requests.length === 0) {
        historyContainer.innerHTML = '<p>لم تقم بتقديم أي طلبات توظيف بعد.</p>';
    } else {
        historyContainer.innerHTML = `<div class="table-container"><table><thead><tr><th>اسم الموظف المقترح</th><th>المشروع</th><th>تاريخ الطلب</th><th>الحالة</th></tr></thead><tbody>
            ${requests.map(req => `
                <tr>
                    <td>${req.details.name}</td>
                    <td>${req.details.project}</td>
                    <td>${new Date(req.created_at).toLocaleDateString('ar-SA')}</td>
                    <td><span class="status ${req.status === 'مقبول' ? 'active' : (req.status === 'مرفوض' ? 'inactive' : 'pending')}">${req.status}</span></td>
                </tr>
            `).join('')}
        </tbody></table></div>`;
    }
}

// --- الخطوة 19: إعادة بناء واجهة التقارير ---
async function loadReportsPage() {
    const reportsContent = document.querySelector('#page-reports');
    // الهيكل المبدئي للصفحة مع رسالة تحميل
    reportsContent.innerHTML = `
        <div class="page-header">
            <h3>التقارير</h3>
        </div>
        <div class="report-filters-card">
            <p style="text-align: center;">جاري تحميل خيارات الفلترة...</p>
        </div>
        <div class="report-results-area">
            <p>سيتم عرض بيانات التقرير هنا بعد الضغط على "بحث".</p>
        </div>
    `;

    // جلب البيانات اللازمة لقوائم الفلاتر
    const [
        { data: supervisors, error: supError },
        { data: sites, error: siteError },
        { data: guards, error: guardError }
    ] = await Promise.all([
        supabaseClient.from('users').select('id, name').or('role.eq.مدير النظام,role.eq.مشرف'),
        supabaseClient.from('clients').select('id, name'),
        supabaseClient.from('users').select('id, name').eq('role', 'حارس أمن')
    ]);

    if (supError || siteError || guardError) {
        console.error('خطأ في جلب بيانات الفلاتر:', supError || siteError || guardError);
        document.querySelector('.report-filters-card').innerHTML = '<p>خطأ في تحميل خيارات الفلترة.</p>';
        return;
    }

    // دالة مساعدة لإنشاء خيارات القائمة المنسدلة
    const createOptions = (items) => items.map(item => `<option value="${item.id}">${item.name}</option>`).join('');

    // كود HTML النهائي لنموذج الفلاتر بعد جلب البيانات
    const filtersHtml = `
        <div class="filter-grid">
            <div class="filter-group">
                <label for="report-type">نوع التقرير</label>
                <select id="report-type">
                    <option value="attendance">تقرير الحضور والإنصراف</option>
                    <option value="client_sites">تقرير مواقع العملاء</option>
                    <option value="visits">تقرير الزيارات الميدانية</option>
                </select>
            </div>
            <div class="filter-group">
                <label for="date-from">من تاريخ</label>
                <input type="date" id="date-from">
            </div>
            <div class="filter-group">
                <label for="date-to">إلى تاريخ</label>
                <input type="date" id="date-to">
            </div>
            <div class="filter-group">
                <label for="supervisor-select">المشرف</label>
                <select id="supervisor-select">
                    <option value="">الكل</option>
                    ${createOptions(supervisors)}
                </select>
            </div>
            <div class="filter-group">
                <label for="site-select">الموقع</label>
                <select id="site-select">
                    <option value="">الكل</option>
                    ${createOptions(sites)}
                </select>
            </div>
            <div class="filter-group">
                <label for="guard-select">الحارس</label>
                <select id="guard-select">
                    <option value="">الكل</option>
                    ${createOptions(guards)}
                </select>
            </div>
        </div>
        <div class="report-actions">
            <button class="btn btn-primary"><i class="ph-bold ph-magnifying-glass"></i> بحث</button>
            <button class="btn btn-secondary" style="background-color: #d9534f; color: white;"><i class="ph-bold ph-file-pdf"></i> تصدير PDF</button>
        </div>
    `;

    document.querySelector('.report-filters-card').innerHTML = filtersHtml;
}
// ------------------------------------

// --- دالة لجلب وعرض الإحصائيات ---
// --- دالة الإحصائيات المحصّنة والآمنة ---
async function fetchStatistics() {
    // دالة مساعدة صغيرة لتحديث النص بأمان
    const safeUpdate = (selector, value) => {
        const element = document.querySelector(selector);
        if (element) { // يتحقق أولاً إذا كان العنصر موجوداً قبل محاولة التعديل
            element.textContent = value;
        }
    };

    // جلب البيانات من قاعدة البيانات
    const [
        { count: clientsCount, error: e1 },
        { count: usersCount, error: e2 },
        { count: visitsCount, error: e3 },
        { count: schedulesCount, error: e4 }
    ] = await Promise.all([
        supabaseClient.from('clients').select('*', { count: 'exact', head: true }),
        supabaseClient.from('users').select('*', { count: 'exact', head: true }),
        supabaseClient.from('visits').select('*', { count: 'exact', head: true }),
        supabaseClient.from('schedules').select('*', { count: 'exact', head: true })
    ]);

    if (e1 || e2 || e3 || e4) {
        console.error("خطأ في جلب الإحصائيات:", e1 || e2 || e3 || e4);
    }

    // تحديث الواجهة بأمان (لن يتوقف البرنامج بعد الآن)
    safeUpdate('#stats-clients h3', clientsCount || 0);
    safeUpdate('#stats-users h3', usersCount || 0);
    safeUpdate('#stats-visits h3', visitsCount || 0);
    safeUpdate('#stats-schedules h3', schedulesCount || 0);
}
// ------------------------------------


// ------------------------------------
// =========================================================================
// --- هذا الكود يحل محل كل الكود التفاعلي في نهاية الملف ---

document.addEventListener('DOMContentLoaded', function() {

    // --- إضافة أيقونة لزر القائمة في الجوال ---
const menuBtn = document.getElementById('menu-toggle-btn');
if (menuBtn) {
    menuBtn.innerHTML = '<i class="ph-bold ph-list"></i>';
}
    // بداية الإضافة: ربط فلاتر صفحة سجل الحضور

// نهاية الإضافة
    
    // --- بداية الإضافة: تفعيل فلاتر صفحة الموظفين ---
    const employeeSearchInput = document.getElementById('employee-search-input');
    const employeeRoleFilter = document.getElementById('employee-role-filter');
    const employeeProjectFilter = document.getElementById('employee-project-filter');

    if(employeeSearchInput) {
        employeeSearchInput.addEventListener('keyup', () => {
            // نتأكد من وجود الدالة قبل استدعائها
            if (typeof loadEmployeeTabData === 'function') {
                loadEmployeeTabData();
            }
        });
    }
    if(employeeRoleFilter) {
        employeeRoleFilter.addEventListener('change', () => {
            if (typeof loadEmployeeTabData === 'function') {
                loadEmployeeTabData();
            }
        });
    }
    if(employeeProjectFilter) {
        employeeProjectFilter.addEventListener('keyup', () => {
            if (typeof loadEmployeeTabData === 'function') {
                loadEmployeeTabData();
            }
        });
    }
    // --- نهاية الإضافة ---

    // تسجيل الـ Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(registration => console.log('Service Worker registered successfully:', registration))
        .catch(error => console.error('Service Worker registration failed:', error));
}
    console.log('DOM fully loaded and parsed. Initializing listeners.');
    // --- NEW: Check for existing session ---
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        // إذا وجدنا مستخدم محفوظ، نستخدم بياناته
        currentUser = JSON.parse(savedUser);
        
        // تحديث الواجهة بناءً على دور المستخدم المحفوظ
        updateUIVisibility(currentUser.role);
        
        // إخفاء صفحة تسجيل الدخول وإظهار لوحة التحكم
        document.getElementById('login-page').style.display = 'none';
        document.querySelector('.dashboard-container').classList.remove('hidden');
        
        // تحديث رسالة الترحيب
        const userProfileSpan = document.querySelector('.user-profile span');
        if (userProfileSpan) userProfileSpan.textContent = `مرحباً، ${currentUser.name}`;

        // افتح الصفحة الأولى المتاحة (أو الصفحة المحفوظة في الرابط، سنتعامل معها في الخطوة 3)
        const firstVisibleLink = document.querySelector('.sidebar-nav li[style*="display: block"] a');
        if(firstVisibleLink) firstVisibleLink.click();
    }
    // --- END: Check for existing session ---

    // --- 1. منطق التنقل بين الصفحات ---
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const pageContents = document.querySelectorAll('.page-content');
    const mainTitle = document.getElementById('main-title');

    // ==================== بداية الاستبدال ====================
navLinks.forEach(link => {
    link.addEventListener('click', function(event) {
        event.preventDefault();
        const targetPageId = this.dataset.page;
        if (!targetPageId) return;

        // --- إيقاف الاشتراكات القديمة قبل الانتقال لصفحة جديدة ---
        if (mapSubscription) {
            supabaseClient.removeChannel(mapSubscription);
            mapSubscription = null;
        }
        if (requestsSubscription) {
            supabaseClient.removeChannel(requestsSubscription);
            requestsSubscription = null;
        }

        mainTitle.textContent = this.querySelector('span').textContent;
        navLinks.forEach(navLink => navLink.classList.remove('active'));
        this.classList.add('active');
        pageContents.forEach(page => page.classList.add('hidden'));

        const targetPage = document.getElementById(targetPageId);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        }

        // ==================== بداية التعديل المهم ====================
        // استدعاء الدوال الخاصة بكل صفحة عند الحاجة
        if (targetPageId === 'page-clients') fetchClients();
        if (targetPageId === 'page-users') fetchUsers();
        if (targetPageId === 'page-jobs') fetchJobs();
        if (targetPageId === 'page-geo') initializeMap();
        if (targetPageId === 'page-schedules') fetchSchedules();
        if (targetPageId === 'page-coverage') loadCoveragePage();
        if (targetPageId === 'page-visits') fetchVisits();
        if (targetPageId === 'page-reports') loadReportsPage();
        if (targetPageId === 'page-attendance') loadAttendancePage();
        if (targetPageId === 'page-guard-attendance') loadGuardAttendancePage();
        if (targetPageId === 'page-patrol') loadSupervisorPatrolPage();
        if (targetPageId === 'page-contracts') fetchContracts();
        if (targetPageId === 'page-vacancies') loadVacanciesPage();
        
        // --- الأسطر الجديدة الخاصة بالهيكلة الجديدة للموارد البشرية ---
        if (targetPageId === 'page-vacancies') loadVacancyTabData();
        if (targetPageId === 'page-employees') loadEmployeeTabData();
        if (targetPageId === 'page-requests-review') loadRequestsReviewPage(); // <-- دالة جديدة سننشئها
        if (targetPageId === 'page-hiring') loadHiringPage();
        if (targetPageId === 'page-coverage-requests') loadCoverageRequestsPage();
        if (targetPageId === 'page-directives-ops') loadOpsDirectivesPage();
        if (targetPageId === 'page-my-directives') loadMyDirectivesPage();
        if (targetPageId === 'page-my-visits') loadMyVisitsPage();
        if (targetPageId === 'page-my-schedule') loadMySchedulePage();
        if (targetPageId === 'page-ops-review-requests') loadOpsReviewRequestsPage();
        if (targetPageId === 'page-supervisor-schedules') loadSupervisorSchedulesPage();
        if (targetPageId === 'page-supervisor-permission-requests') loadSupervisorPermissionRequestsPage();
        if (targetPageId === 'page-supervisor-applications') loadSupervisorApplicationsPage();
        if (targetPageId === 'page-ops-nominees') loadOpsNomineesPage();
        if (targetPageId === 'page-hr-ops-hiring') loadHrOpsHiringPage();
        if (targetPageId === 'page-operations-requests') loadOperationsRequestsPage();
        if (targetPageId === 'page-my-profile') loadMyProfilePage();
    if (targetPageId === 'page-leave-requests') loadLeaveRequests();
if (targetPageId === 'page-resignation-requests') loadResignationRequests();
if (targetPageId === 'page-loan-requests') loadLoanRequests();
if (targetPageId === 'page-hr-attendance-log') loadHrAttendanceLogPage();
if (targetPageId === 'page-payroll') {
    // لا نفعل شيئاً عند فتح الصفحة، ننتظر المستخدم يضغط على زر التوليد
    document.getElementById('payroll-results-container').innerHTML = '<p style="text-align: center;">الرجاء اختيار الشهر والضغط على "توليد المسير" لعرض البيانات.</p>';
}


        // --- تشغيل اشتراك طلبات الحارس ---
        if (targetPageId === 'page-my-requests') {
            loadMyRequestsPage();
            requestsSubscription = supabaseClient.channel('public:employee_requests:my_requests')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'employee_requests',
                    filter: `user_id=eq.${currentUser.id}`
                }, payload => {
                    loadMyRequestsPage();
                })
                .subscribe();
        }

        // --- تشغيل اشتراك طلبات المشرف ---
        if (targetPageId === 'page-permission-requests') {
            loadPermissionRequests();
            requestsSubscription = supabaseClient.channel('public:employee_requests:all_permissions')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'employee_requests',
                    filter: 'request_type=eq.permission'
                }, payload => {
                    loadPermissionRequests();
                })
                .subscribe();
        }
    });
});
// ===================== نهاية الاستبدال =====================
// بداية الاستبدال
// منطق الملء التلقائي الذكي لجميع النماذج (شواغر وموظفين)
document.addEventListener('change', async (event) => {

    // بداية الإضافة: الملء التلقائي في نافذة إنشاء التغطية
if (event.target.id === 'coverage-link-vacancy') {
    const vacancyId = event.target.value;
    const projectInput = document.getElementById('coverage-new-project');
    const locationInput = document.getElementById('coverage-new-location');
    const regionInput = document.getElementById('coverage-new-region');
    const cityInput = document.getElementById('coverage-new-city');
    const inputs = [projectInput, locationInput, regionInput, cityInput];
    
    // إعادة تعيين الحقول
    inputs.forEach(input => {
        input.value = '';
        input.disabled = false;
    });

    if (vacancyId) {
        // جلب بيانات الشاغر المحدد
        const { data: vacancy, error } = await supabaseClient
            .from('job_vacancies')
            .select('project, specific_location, region, location') // "location" هنا هو المدينة
            .eq('id', vacancyId)
            .single();
            
        if (vacancy) {
            projectInput.value = vacancy.project || '';
            locationInput.value = vacancy.specific_location || '';
            regionInput.value = vacancy.region || '';
            cityInput.value = vacancy.location || ''; // "location" هو المدينة
            // جعل الحقول غير قابلة للتعديل عند الربط بشاغر
            inputs.forEach(input => input.disabled = true);
        }
    }
}
// نهاية الإضافة

    // --- أولاً: منطق الملء التلقائي في نافذة "إضافة شاغر" ---
    if (event.target.id === 'vacancy-contract') {
        const contractId = event.target.value;
        const projectInput = document.getElementById('vacancy-project');
        const regionInput = document.getElementById('vacancy-region');
        const cityInput = document.getElementById('vacancy-location');
        const salaryInput = document.getElementById('vacancy-base-salary');
        const specificLocationGroup = document.getElementById('specific-location-group');
        const specificLocationSelect = document.getElementById('vacancy-specific-location');

        projectInput.value = ''; regionInput.value = ''; cityInput.value = '';
        salaryInput.value = '0'; specificLocationGroup.style.display = 'none';
        specificLocationSelect.innerHTML = '';

        if (!contractId) return;

        const { data: contract, error: contractError } = await supabaseClient
            .from('contracts').select('company_name, region, city, individual_salary, locations_and_guards').eq('id', contractId).single();
        if (contractError || !contract) return alert('خطأ في جلب بيانات العقد.');

        projectInput.value = contract.company_name;
        regionInput.value = contract.region;
        cityInput.value = contract.city;
        salaryInput.value = contract.individual_salary || 0;

        if (!contract.locations_and_guards || contract.locations_and_guards.length === 0) return;

        const { data: existingVacancies, error: vacanciesError } = await supabaseClient
            .from('job_vacancies').select('specific_location').eq('contract_id', contractId);
        if (vacanciesError) return alert('خطأ في جلب الشواغر الحالية.');

        const vacancyCounts = existingVacancies.reduce((acc, v) => {
            if(v.specific_location) acc[v.specific_location] = (acc[v.specific_location] || 0) + 1;
            return acc;
        }, {});

        let availableLocationsHtml = '<option value="">-- اختر موقعاً متاحاً --</option>';
        let hasAvailableLocations = false;
        contract.locations_and_guards.forEach(location => {
            const requiredGuards = location.shifts.reduce((sum, shift) => sum + (parseInt(shift.guards_count) || 0), 0);
            const createdVacancies = vacancyCounts[location.location_name] || 0;
            if (requiredGuards > createdVacancies) {
                const remaining = requiredGuards - createdVacancies;
                availableLocationsHtml += `<option value="${location.location_name}">${location.location_name} (متبقي ${remaining})</option>`;
                hasAvailableLocations = true;
            }
        });
        
        if (hasAvailableLocations) {
            specificLocationSelect.innerHTML = availableLocationsHtml;
        } else {
            specificLocationSelect.innerHTML = '<option value="">-- كل المواقع ممتلئة --</option>';
        }
        specificLocationGroup.style.display = 'block';
    }

// --- ثانياً: منطق الملء التلقائي في نافذة "إضافة/تعديل موظف" (تحديث جديد) ---
    if (event.target.id === 'employee-contract' || event.target.id === 'employee-vacancy') {
        const contractSelect = document.getElementById('employee-contract');
        const vacancySelect = document.getElementById('employee-vacancy');
        const regionInput = document.getElementById('employee-region');
        const cityInput = document.getElementById('employee-city');
        const projectDisplay = document.getElementById('employee-project-display');
        const locationDisplay = document.getElementById('employee-location-display');
        // --- إضافة الحقول الجديدة للورديات ---
        const shiftGroup = document.getElementById('employee-shift-group');
        const shiftSelect = document.getElementById('employee-shift');

        // إخفاء قائمة الورديات مبدئياً
        shiftGroup.classList.add('hidden');
        shiftSelect.innerHTML = '';

        const vacancyId = vacancySelect.value;
        const contractId = contractSelect.value;

        if (vacancyId) {
            const { data: vacancy, error } = await supabaseClient
                .from('job_vacancies').select(`*, contracts(*)`).eq('id', vacancyId).single();
                
            if (vacancy) {
                regionInput.value = vacancy.region || '';
                cityInput.value = vacancy.location || '';
                projectDisplay.value = vacancy.project || '';
                locationDisplay.value = vacancy.specific_location || '';
                contractSelect.value = vacancy.contract_id || '';

                // --- جلب وعرض الورديات المتاحة لهذا الموقع ---
                const contractDetails = vacancy.contracts;
                if (contractDetails && contractDetails.locations_and_guards) {
                    const locationData = contractDetails.locations_and_guards.find(l => l.location_name === vacancy.specific_location);
                    if (locationData && locationData.shifts) {
                        shiftSelect.innerHTML = '<option value="">-- اختر وردية --</option>';
                        locationData.shifts.forEach((shift, index) => {
                            const shiftLabel = `من ${shift.start_time || '؟'} إلى ${shift.end_time || '؟'} (${shift.days.join(', ')})`;
                            // نستخدم JSON.stringify لحفظ بيانات الوردية كاملة
                            shiftSelect.innerHTML += `<option value='${JSON.stringify(shift)}'>${shiftLabel}</option>`;
                        });
                        shiftGroup.classList.remove('hidden'); // إظهار قائمة الورديات
                    }
                }
            }
        } else if (contractId) {
            // إذا لم يتم تحديد شاغر، نعتمد على العقد
            const { data: contract, error } = await supabaseClient
                .from('contracts').select('region, city, company_name').eq('id', contractId).single();
            if (contract) {
                regionInput.value = contract.region || '';
                cityInput.value = contract.city || '';
                projectDisplay.value = contract.company_name || '';
                locationDisplay.value = 'غير محدد';
            }
        } else {
            // إذا لم يتم تحديد أي منهما، أفرغ الحقول
            regionInput.value = ''; cityInput.value = '';
            projectDisplay.value = ''; locationDisplay.value = '';
        }
    }
});
// نهاية الاستبدال
    // --- 2. منطق الأزرار والنوافذ المنبثقة (باستخدام تفويض الأحداث) ---
    // --- 3. Listener for All Body Clicks (Modals & Actions) ---
// --- 3. Master Click Handler for the entire application ---
document.body.addEventListener('click', async function(event) {

    // --- منطق تغيير كلمة المرور ---
const changePasswordBtn = event.target.closest('#change-password-btn');
if (changePasswordBtn) {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;

    // التحقق من صحة المدخلات
    if (!newPassword || newPassword.length < 6) {
        return alert('كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف.');
    }
    if (newPassword !== confirmPassword) {
        return alert('كلمتا المرور غير متطابقتين.');
    }

    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = 'جاري التحديث...';

    try {
        // استخدام الدالة الرسمية من Supabase لتحديث كلمة مرور المستخدم الحالي
        const { data, error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        alert('تم تحديث كلمة المرور بنجاح!');
        // إفراغ الحقول بعد النجاح
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';

    } catch (error) {
        alert(`حدث خطأ أثناء تحديث كلمة المرور: ${error.message}`);
    } finally {
        changePasswordBtn.disabled = false;
        changePasswordBtn.textContent = 'تحديث كلمة المرور';
    }
}

// --- منطق تفعيل الإشعارات باستخدام Firebase (بالصيغة الصحيحة) ---
const enableNotificationsBtn = event.target.closest('#enable-notifications-btn');
if (enableNotificationsBtn) {
    enableNotificationsBtn.disabled = true;

    try {
        const VAPID_KEY_STRING = 'BO_qk6HKfERdBr4geUGLjQKkDD7830kjunWm3CY9q2WMQ2lKj5O06t92iY-uVIlGarAZBYGKKz4jCLq7aMYqb7o';
        
        // --- هنا التعديل المهم: تحويل المفتاح قبل استخدامه ---
        const applicationServerKey = urlBase64ToUint8Array(VAPID_KEY_STRING);

        messaging.getToken({ vapidKey: applicationServerKey }) // نستخدم المفتاح المحوّل
            .then(async (currentToken) => {
                if (currentToken) {
                    console.log('FCM Token:', currentToken);
                    
                    const { error } = await supabaseClient
                        .from('users')
                        .update({ fcm_token: currentToken })
                        .eq('id', currentUser.id);

                    if (error) throw error;

                    alert('تم تفعيل الإشعارات بنجاح!');
                    enableNotificationsBtn.style.color = '#22c55e';
                } else {
                    Notification.requestPermission().then((permission) => {
                        if (permission === 'granted') {
                            enableNotificationsBtn.disabled = false;
                            enableNotificationsBtn.click();
                        } else {
                            alert('تم رفض إذن استقبال الإشعارات.');
                            enableNotificationsBtn.disabled = false;
                        }
                    });
                }
            }).catch((err) => {
                console.error('An error occurred while retrieving token. ', err);
                alert(`فشل تفعيل الإشعارات: ${err.message}`);
                enableNotificationsBtn.disabled = false;
            });
    } catch (error) {
        alert('حدث خطأ غير متوقع. تأكد من أنك تستخدم HTTPS.');
        enableNotificationsBtn.disabled = false;
    }
}

    // --- منطق فتح وإغلاق القائمة الجانبية في الجوال ---
const menuToggleBtn = event.target.closest('#menu-toggle-btn');
if (menuToggleBtn) {
    document.querySelector('.sidebar').classList.toggle('open');
}

// --- منطق فتح نافذة التبديل ---
const swapBtn = event.target.closest('.swap-assignment-btn');
if (swapBtn) {
    const modal = document.getElementById('swap-employee-modal');
    const vacancyId = swapBtn.dataset.vacancyId;
    const currentUserId = swapBtn.dataset.currentUserId;
    const currentUserName = swapBtn.dataset.currentUserName;

    // تعبئة الحقول بالبيانات الحالية
    document.getElementById('swap-vacancy-id').value = vacancyId;
    document.getElementById('swap-current-user-id').value = currentUserId;
    document.getElementById('swap-current-user-name').value = currentUserName;

    // جلب قائمة الموظفين الآخرين
    const employeeSelect = document.getElementById('swap-new-employee-select');
    employeeSelect.innerHTML = '<option value="">جاري تحميل الموظفين...</option>';
    
    // جلب كل الحراس النشطين ما عدا الحارس الحالي
    const { data: employees, error } = await supabaseClient
        .from('users')
        .select('id, name')
        .eq('employment_status', 'نشط')
        .eq('role', 'حارس أمن')
        .not('id', 'eq', currentUserId);

    if (error) {
        employeeSelect.innerHTML = '<option value="">خطأ في التحميل</option>';
    } else {
        employeeSelect.innerHTML = '<option value="">-- اختر موظفاً بديلاً --</option>';
        employeeSelect.innerHTML += employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
    }
    
    modal.classList.remove('hidden');
}

// --- منطق حفظ التبديل (النسخة المصححة) ---
const saveSwapBtn = event.target.closest('#save-swap-btn');
if (saveSwapBtn) {
    const vacancy_A_Id = document.getElementById('swap-vacancy-id').value;
    const employee_A_Id = document.getElementById('swap-current-user-id').value;
    const employee_B_Id = document.getElementById('swap-new-employee-select').value;

    if (!employee_B_Id) return alert('الرجاء اختيار الموظف البديل.');

    saveSwapBtn.disabled = true;
    saveSwapBtn.textContent = 'جاري التبديل...';

    try {
        // 1. جلب الشاغر الحالي للموظف الجديد (الموظف ب)
        const { data: employeeB_Data, error: e1 } = await supabaseClient
            .from('users').select('vacancy_id').eq('id', employee_B_Id).single();
        if (e1) throw e1;
        const vacancy_B_Id = employeeB_Data.vacancy_id; // قد يكون null

        // 2. تحديث الموظف القديم (أ) وإعطائه شاغر الموظف الجديد (ب)
        const { error: e2 } = await supabaseClient
            .from('users').update({ vacancy_id: vacancy_B_Id }).eq('id', employee_A_Id);
        if (e2) throw e2;

        // 3. تحديث الموظف الجديد (ب) وتعيينه للشاغر المستهدف (أ)
        const { error: e3 } = await supabaseClient
            .from('users').update({ vacancy_id: vacancy_A_Id }).eq('id', employee_B_Id);
        if (e3) throw e3;

        alert('تم تبديل الموظفين بنجاح.');
        document.getElementById('swap-employee-modal').classList.add('hidden');
        loadVacancyTabData(); // تحديث القائمة

    } catch (error) {
        alert('حدث خطأ أثناء عملية التبديل: ' + error.message);
    } finally {
        saveSwapBtn.disabled = false;
        saveSwapBtn.textContent = 'حفظ التبديل';
    }
}

// بداية الإضافة (أضف هذا الكود داخل معالج الأوامر الكبير)
// --- منطق زر الاعتماد النهائي وتوظيف الموظف (متوافق مع الدالة المحسّنة) ---
const finalApproveBtn = event.target.closest('#final-approve-btn');
if (finalApproveBtn) {
    event.preventDefault();
    const submitBtn = finalApproveBtn;
    
    if (!confirm("هل أنت متأكد من اعتماد هذا المرشح؟ سيتم إنشاء حساب له وربطه بالشاغر.")) {
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i> جاري التوظيف...';

    const applicationId = document.getElementById('review-app-id').value;
    const vacancyId = document.getElementById('review-vacancy-id').value;

    try {
        const password = document.getElementById('review-password').value;
        const profileData = {
    name: document.getElementById('review-full-name').value,
    id_number: document.getElementById('review-id-number').value,
    phone: document.getElementById('review-phone').value,
    iban: document.getElementById('review-iban').value,
    vacancy_id: vacancyId,

    // --- الحقول الافتراضية المطلوبة التي تمت إضافتها ---
    employee_type: 'اساسي',
    employment_status: 'نشط',
    status: 'active',
    insurance_status: 'غير مسجل'
};

        const { data: vacancy } = await supabaseClient
            .from('job_vacancies').select('title, project, specific_location, contract_id')
            .eq('id', vacancyId).single();

        profileData.project = vacancy.project;
        profileData.location = vacancy.specific_location;
        profileData.role = vacancy.title;
        profileData.contract_id = vacancy.contract_id;

        // استدعاء الدالة السحابية والحصول على الاستجابة الكاملة
        console.log('Sending this data to function:', profileData);
        const { data: functionResponse, error: invokeError } = await supabaseClient.functions.invoke('create-employee', { body: { password, ...profileData } });

        if (invokeError) throw new Error(`فشل استدعاء الدالة: ${invokeError.message}`);
        
        // التحقق من وجود خطأ مرسل من داخل الدالة نفسها
        if (functionResponse.error) throw new Error(functionResponse.error);

        const newUserId = functionResponse.data.id;
        if (!newUserId) throw new Error("لم يتم استلام ID الموظف الجديد من السيرفر.");

        // تحديث الطلب والشاغر
        await supabaseClient.from('job_vacancies').update({ status: 'closed' }).eq('id', vacancyId);
        await supabaseClient.from('job_applications').update({ status: 'approved', ops_approver_id: currentUser.id }).eq('id', applicationId);

        alert(`اكتملت العملية بنجاح!`);
        
        document.getElementById('ops-review-applicant-modal').classList.add('hidden');
        loadOpsNomineesPage();
        loadVacancyTabData();
        loadEmployeeTabData();

    } catch(error) {
        alert('حدث خطأ: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ph-bold ph-user-plus"></i> اعتماد نهائي وتوظيف';
    }
}
 // بداية الاستبدال
// زر عرض تفاصيل الموظف المعين
const viewNewHireBtn = event.target.closest('.view-new-hire-details-btn');
if (viewNewHireBtn) {
    viewNewHireBtn.classList.add('view-applicant-details-btn');
    viewNewHireBtn.click();
    viewNewHireBtn.classList.remove('view-applicant-details-btn');
}

// بداية الاستبدال
const hrAcknowledgeBtn = event.target.closest('.hr-acknowledge-hire-btn');
if (hrAcknowledgeBtn) {
    const applicationId = hrAcknowledgeBtn.dataset.appid;
    if (confirm('هل أنت متأكد من مراجعة هذا التوظيف؟')) {
        const { error } = await supabaseClient.from('job_applications').update({ status: 'hr_acknowledged' }).eq('id', applicationId);
        if (error) { alert('حدث خطأ'); } else { alert('تم تأكيد المراجعة.'); loadHrOpsHiringPage(); }
    }
}
// نهاية الاستبدال
// بداية الاستبدال
const opsReviewBtn = event.target.closest('.ops-review-applicant-btn');
if (opsReviewBtn) {
    const applicationId = opsReviewBtn.dataset.appid;
    const modal = document.getElementById('ops-review-applicant-modal');
    const formBody = document.getElementById('ops-review-form-body');
    
    modal.classList.remove('hidden');
    formBody.innerHTML = '<p style="text-align: center;">جاري تحميل بيانات المرشح...</p>';

    const { data: application, error } = await supabaseClient
        .from('job_applications')
        .select('*, job_vacancies(*)')
        .eq('id', applicationId)
        .single();
    
    if (error || !application) {
        formBody.innerHTML = '<p style="color:red;">خطأ في جلب البيانات.</p>';
        return;
    }

    document.getElementById('review-app-id').value = application.id;
    document.getElementById('review-vacancy-id').value = application.vacancy_id;

    const appData = application.applicant_data;
    const vacancy = application.job_vacancies;

    // --- بداية الجزء الجديد: جلب روابط الصور ---
    const signedUrlsToGenerate = [];
    if (application.id_photo_url) signedUrlsToGenerate.push(application.id_photo_url);
    if (application.iban_certificate_url) signedUrlsToGenerate.push(application.iban_certificate_url);

    let idPhotoUrl = '#';
    let ibanCertUrl = '#';

    if (signedUrlsToGenerate.length > 0) {
        const { data: signedUrls, error: urlError } = await supabaseClient
            .storage.from('job-applications').createSignedUrls(signedUrlsToGenerate, 300);
        if (!urlError) {
            idPhotoUrl = signedUrls.find(u => u.path === application.id_photo_url)?.signedUrl || '#';
            ibanCertUrl = signedUrls.find(u => u.path === application.iban_certificate_url)?.signedUrl || '#';
        }
    }
    // --- نهاية الجزء الجديد ---

    formBody.innerHTML = `
        <h4>1. المعلومات الشخصية (قابلة للتعديل)</h4>
        <div class="form-grid">
            <div class="form-group"><label>الاسم الكامل</label><input type="text" id="review-full-name" value="${appData.full_name || ''}"></div>
            <div class="form-group"><label>رقم الهوية</label><input type="text" id="review-id-number" value="${appData.id_number || ''}"></div>
            <div class="form-group"><label>رقم الجوال</label><input type="tel" id="review-phone" value="${appData.phone || ''}"></div>
            <div class="form-group"><label>رقم الآيبان</label><input type="text" id="review-iban" value="${appData.iban || ''}"></div>
        </div>
        <hr>
        <h4>2. المرفقات</h4>
        <div class="info-line" style="gap: 15px;">
            <a href="${idPhotoUrl}" target="_blank" class="btn btn-secondary"><i class="ph-bold ph-identification-card"></i> عرض صورة الهوية</a>
            <a href="${ibanCertUrl}" target="_blank" class="btn btn-secondary"><i class="ph-bold ph-bank"></i> عرض شهادة الآيبان</a>
        </div>
        <hr>
        <h4>3. معلومات التوظيف (للتأكيد)</h4>
        <div class="form-grid">
            <div class="form-group"><label>المسمى الوظيفي</label><input type="text" id="review-title" value="${vacancy.title}" readonly style="background-color: #e9ecef;"></div>
            <div class="form-group"><label>المشروع</label><input type="text" id="review-project" value="${vacancy.project}" readonly style="background-color: #e9ecef;"></div>
            <div class="form-group"><label>الموقع</label><input type="text" id="review-location" value="${vacancy.specific_location}" readonly style="background-color: #e9ecef;"></div>
        </div>
        <hr>
        <h4>4. كلمة المرور</h4>
        <div class="form-group"><label>كلمة مرور مؤقتة</label><input type="text" id="review-password" value="${appData.id_number}"></div>
    `;
}
// نهاية الاستبدال


    // بداية الإضافة: منطق رفض مدير العمليات للمرشح
const opsRejectBtn = event.target.closest('.ops-reject-applicant-btn');
if (opsRejectBtn) {
    const applicationId = opsRejectBtn.dataset.appid;
    const vacancyId = opsRejectBtn.dataset.vid;

    const reason = prompt("الرجاء إدخال سبب الرفض (سيظهر للمشرف):");
    if (!reason) return;

    if (confirm('هل أنت متأكد من رفض هذا المرشح؟ سيتم إعادة فتح باب الترشيح للمشرف.')) {
        try {
            // 1. تحديث حالة الطلب المرفوض
            await supabaseClient.from('job_applications').update({ status: 'rejected', rejection_reason: reason }).eq('id', applicationId);
            
            // 2. إعادة فتح باب الترشيح لباقي المتقدمين لنفس الشاغر
            await supabaseClient.from('job_applications').update({ status: 'pending_supervisor' }).eq('vacancy_id', vacancyId).eq('status', 'not_nominated');
            
            alert('تم رفض المرشح وإعادة الطلب للمشرف.');
            loadOpsNomineesPage(); // تحديث القائمة

        } catch (error) {
            alert('حدث خطأ: ' + error.message);
        }
    }
}
// نهاية الإضافة

// بداية الإضافة: منطق أزرار مراجعة طلبات التوظيف للمشرف

// بداية الاستبدال
// --- عند الضغط على "عرض التفاصيل" (مع أزرار التحميل) ---
const viewApplicantBtn = event.target.closest('.view-applicant-details-btn');
if (viewApplicantBtn) {
    const applicationId = viewApplicantBtn.dataset.appid;
    const modal = document.getElementById('applicant-details-modal');
    const body = document.getElementById('applicant-details-body');
    
    modal.classList.remove('hidden');
    body.innerHTML = '<p style="text-align: center;">جاري تحميل البيانات...</p>';

    const { data: application, error } = await supabaseClient
        .from('job_applications')
        .select('*')
        .eq('id', applicationId)
        .single();

    if (error || !application) {
        body.innerHTML = '<p style="color:red;">خطأ في جلب بيانات المتقدم.</p>';
        return;
    }

    const signedUrlsToGenerate = [];
    if (application.id_photo_url) signedUrlsToGenerate.push(application.id_photo_url);
    if (application.iban_certificate_url) signedUrlsToGenerate.push(application.iban_certificate_url);

    let idPhotoUrl = '#';
    let ibanCertUrl = '#';

    if (signedUrlsToGenerate.length > 0) {
        const { data: signedUrls, error: urlError } = await supabaseClient
            .storage
            .from('job-applications')
            .createSignedUrls(signedUrlsToGenerate, 300); // صلاحية الرابط 5 دقائق

        if (!urlError) {
            idPhotoUrl = signedUrls.find(u => u.path === application.id_photo_url)?.signedUrl || '#';
            ibanCertUrl = signedUrls.find(u => u.path === application.iban_certificate_url)?.signedUrl || '#';
        }
    }
    
    const appData = application.applicant_data;
    body.innerHTML = `
        <div class="contract-display">
            <h4>بيانات المتقدم</h4>
            <p><strong>الاسم:</strong> ${appData.full_name || ''}</p>
            <p><strong>رقم الهوية:</strong> ${appData.id_number || ''}</p>
            <p><strong>رقم الجوال:</strong> ${appData.phone || ''}</p>
            <p><strong>الآيبان:</strong> ${appData.iban || ''}</p>
            <hr>
            <h4>المرفقات</h4>
            <div class="attachments-grid">
                <div>
                    <h5>صورة الهوية</h5>
                    <img src="${idPhotoUrl}" alt="صورة الهوية" class="attachment-image">
                    <a href="${idPhotoUrl}" download="ID-${appData.id_number}" class="btn btn-secondary btn-sm" style="width:100%; margin-top:10px;">
                        <i class="ph-bold ph-download-simple"></i> تحميل
                    </a>
                </div>
                <div>
                    <h5>شهادة الآيبان</h5>
                    <img src="${ibanCertUrl}" alt="شهادة الآيبان" class="attachment-image">
                    <a href="${ibanCertUrl}" download="IBAN-${appData.id_number}" class="btn btn-secondary btn-sm" style="width:100%; margin-top:10px;">
                        <i class="ph-bold ph-download-simple"></i> تحميل
                    </a>
                </div>
            </div>
        </div>
    `;
}
// نهاية الاستبدال

// --- عند الضغط على "ترشيح" ---
const nominateBtn = event.target.closest('.nominate-applicant-btn');
if (nominateBtn) {
    const applicationId = nominateBtn.dataset.appid;
    const vacancyId = nominateBtn.dataset.vid;

    if (!confirm('هل أنت متأكد من ترشيح هذا المتقدم؟ سيتم إخفاء باقي المتقدمين وإرسال هذا الطلب لمدير العمليات.')) {
        return;
    }

    nominateBtn.disabled = true;
    nominateBtn.textContent = 'جاري...';

    try {
        // 1. تحديث حالة المتقدم المرشح إلى "بانتظار موافقة العمليات"
        const { error: e1 } = await supabaseClient
            .from('job_applications')
            .update({ status: 'pending_ops', supervisor_approver_id: currentUser.id })
            .eq('id', applicationId);
        if (e1) throw e1;
        
        // 2. تحديث حالة باقي المتقدمين لنفس الشاغر إلى "لم يتم الترشيح"
        const { error: e2 } = await supabaseClient
            .from('job_applications')
            .update({ status: 'not_nominated' })
            .eq('vacancy_id', vacancyId)
            .not('id', 'eq', applicationId); // كل الطلبات ما عدا الطلب المرشح
        if (e2) console.warn("Could not update other applicants:", e2);

        alert('تم ترشيح المتقدم بنجاح!');
        loadSupervisorApplicationsPage(); // إعادة تحميل الصفحة لإخفاء المجموعة

    } catch (error) {
        alert('حدث خطأ أثناء عملية الترشيح: ' + error.message);
        console.error('Nomination Error:', error);
    } finally {
        nominateBtn.disabled = false;
        nominateBtn.textContent = 'ترشيح';
    }
}
// نهاية الإضافة

// بداية الاستبدال
const supervisorPermissionBtn = event.target.closest('.supervisor-permission-action-btn');
if (supervisorPermissionBtn) {
    // --- التحصين: إيقاف أي أوامر أخرى قد تعمل بالخطأ ---
    event.stopPropagation();

    const requestId = supervisorPermissionBtn.dataset.requestId;
    const action = supervisorPermissionBtn.dataset.action;
    let updateData = {};

    supervisorPermissionBtn.disabled = true;

    try {
        if (action === 'approve') {
            if (!confirm('هل أنت متأكد من الموافقة ورفع الطلب للعمليات؟')) {
                supervisorPermissionBtn.disabled = false;
                return;
            }
            updateData = { 
                status: 'بانتظار موافقة العمليات', 
                supervisor_approver_id: currentUser.id 
            };
        } else { // 'reject'
            const reason = prompt('الرجاء كتابة سبب الرفض:');
            if (!reason) {
                supervisorPermissionBtn.disabled = false;
                return;
            }
            updateData = { 
                status: 'مرفوض', 
                rejection_reason: reason,
                supervisor_approver_id: currentUser.id
            };
        }

        const { error } = await supabaseClient.from('employee_requests').update(updateData).eq('id', requestId);
        if (error) throw error;

        alert('تم تحديث الطلب بنجاح.');
        loadSupervisorPermissionRequestsPage();

    } catch(error) {
        alert('حدث خطأ أثناء تحديث الطلب.');
        console.error(error);
    } finally {
        supervisorPermissionBtn.disabled = false;
    }
    // --- التحصين: إيقاف التنفيذ هنا بشكل كامل ---
    return;
}
// نهاية الاستبدال

// بداية الاستبدال

// نهاية الإضافة
    // بداية الإضافة
// --- منطق عام لإغلاق أي نافذة منبثقة ---
if (event.target.closest('.modal-close-btn')) {
    event.target.closest('.modal-overlay').classList.add('hidden');
    return; // إيقاف التنفيذ هنا لأننا لا نحتاج لفحص أي شيء آخر
}
// نهاية الإضافة
// بداية الاستبدال
const myDirectiveTab = event.target.closest('#page-my-directives .tab-link');
if (myDirectiveTab) {
    event.preventDefault();
    const targetTabId = myDirectiveTab.dataset.tab;

    document.querySelectorAll('#page-my-directives .tab-link').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#page-my-directives .tab-content').forEach(c => c.classList.remove('active'));
    myDirectiveTab.classList.add('active');
    document.getElementById(targetTabId).classList.add('active');

    // استدعاء دالة تحميل السجل عند الضغط على تبويبه
    if (targetTabId === 'supervisor-directives-history') {
        loadSupervisorDirectivesHistory();
    }
}
// نهاية الاستبدال

// بداية الإضافة
// --- منطق التنقل بين تبويبات صفحة الزيارات/الجولات ---
const visitPatrolTab = event.target.closest('#page-visits .tab-link');
if (visitPatrolTab) {
    event.preventDefault();
    const targetTabId = visitPatrolTab.dataset.tab;

    document.querySelectorAll('#page-visits .tab-link').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#page-visits .tab-content').forEach(c => c.classList.remove('active'));
    visitPatrolTab.classList.add('active');
    document.getElementById(targetTabId).classList.add('active');

    if (targetTabId === 'patrols-log') {
        loadPatrolsHistory();
    }
}

// --- منطق عرض مسار الجولة على الخريطة ---
const viewPathBtn = event.target.closest('.view-patrol-path-btn');
if (viewPathBtn) {
    const patrolId = viewPathBtn.dataset.patrolId;
    const { data: patrol, error } = await supabaseClient
        .from('patrols')
        .select('path')
        .eq('id', patrolId)
        .single();

    if (error || !patrol || !patrol.path || patrol.path.length === 0) {
        return alert('لا يوجد مسار مسجل لهذه الجولة أو حدث خطأ.');
    }

    // الانتقال إلى صفحة الخريطة
    document.querySelector('a[data-page="page-geo"]').click();

    // إعطاء مهلة بسيطة للخريطة للتحميل قبل رسم المسار
    setTimeout(() => {
        // مسح أي طبقات قديمة على الخريطة
        markersLayer.clearLayers();

        const latLngs = patrol.path.map(p => [p.lat, p.lng]);
        const polyline = L.polyline(latLngs, { color: 'blue' }).addTo(markersLayer);

        // إضافة علامات البداية والنهاية
        const startMarker = L.marker(latLngs[0]).bindPopup('بداية الجولة').addTo(markersLayer);
        const endMarker = L.marker(latLngs[latLngs.length - 1]).bindPopup('نهاية الجولة').addTo(markersLayer);

        // تكبير الخريطة لتناسب المسار
        map.fitBounds(polyline.getBounds());
    }, 500);
}
// نهاية الإضافة

// بداية الاستبدال
// منطق فتح نافذة تسجيل الزيارة للمشرف (يعتمد على العقد)
const addVisitLogBtn = event.target.closest('#add-visit-log-btn');
if (addVisitLogBtn && currentUser && currentUser.contract_id) {
    const modal = document.getElementById('add-visit-modal');
    const locationSelect = document.getElementById('visit-client-select'); // سنستخدم نفس الحقل ولكن بتسمية مختلفة
    const visitTimeInput = document.getElementById('visit-time-input');

    modal.classList.remove('hidden');
    locationSelect.innerHTML = '<option>جاري تحميل مواقع العقد...</option>';

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    visitTimeInput.value = now.toISOString().slice(0, 16);

    // جلب العقد المحدد للمشرف
    const { data: contract, error } = await supabaseClient
        .from('contracts')
        .select('locations_and_guards')
        .eq('id', currentUser.contract_id)
        .single();

    if (error || !contract || !contract.locations_and_guards) {
        locationSelect.innerHTML = '<option>خطأ أو لا توجد مواقع في عقدك</option>';
        return console.error(error);
    }

    // تعبئة القائمة بالمواقع من داخل العقد
    locationSelect.innerHTML = contract.locations_and_guards.map(loc => 
        `<option value="${loc.location_name}">${loc.location_name}</option>`
    ).join('');
}
// نهاية الاستبدال

// بداية الاستبدال
// منطق الرد على التوجيهات (مع ملاحظات القبول الاختيارية)
const directiveActionBtn = event.target.closest('.directive-action-btn');
if (directiveActionBtn) {
    const directiveId = directiveActionBtn.dataset.directiveId;
    const action = directiveActionBtn.dataset.action;
    let updateData = { status: action, updated_at: new Date() };

    if (action === 'accepted') {
        // اسأل عن ملاحظات اختيارية عند القبول
        const notes = prompt('هل لديك أي ملاحظات؟ (اختياري)');
        // إذا كتب المستخدم ملاحظات (حتى لو كانت مسافة فارغة)، قم بإضافتها
        if (notes !== null) {
            updateData.acceptance_notes = notes;
        }
    } else if (action === 'rejected') {
        const reason = prompt('الرجاء كتابة سبب الرفض:');
        if (reason) {
            updateData.rejection_reason = reason;
        } else {
            return; // أوقف العملية إذا لم يكتب المستخدم سبباً للرفض
        }
    }
    
    directiveActionBtn.disabled = true;

    const { error } = await supabaseClient
        .from('directives')
        .update(updateData)
        .eq('id', directiveId);

    if (error) {
        alert('حدث خطأ أثناء الرد على التوجيه.');
        console.error(error);
        directiveActionBtn.disabled = false;
    } else {
        alert('تم تسجيل ردك بنجاح.');
        loadMyDirectivesPage(); // تحديث الواجهة
    }
}
// نهاية الاستبدال
    // بداية الإضافة: منطق إرسال التوجيه والتحكم بالتبويبات
// --- عند الضغط على زر "إرسال" داخل نافذة التوجيه ---
const sendDirectiveBtn = event.target.closest('#send-directive-btn');
if (sendDirectiveBtn) {
    const recipientId = document.getElementById('directive-recipient-id').value;
    const content = document.getElementById('directive-content').value;

    if (!content.trim()) return alert('الرجاء كتابة نص التوجيه.');

    sendDirectiveBtn.disabled = true;
    sendDirectiveBtn.textContent = 'جاري الإرسال...';

    try {
        // الآن، كل ما نفعله هو حفظ التوجيه. قاعدة البيانات سترسله مباشرة للمستقبل
        const { error } = await supabaseClient
            .from('directives')
            .insert({ sender_id: currentUser.id, recipient_id: recipientId, content: content });

        if (error) throw error;

        alert('تم إرسال التوجيه بنجاح.');
        document.getElementById('send-directive-modal').classList.add('hidden');
        if (currentUser.role === 'ادارة العمليات') loadOpsDirectivesHistory();
        if (currentUser.role === 'مشرف') loadSupervisorDirectivesHistory();

    } catch (error) {
        alert('حدث خطأ أثناء إرسال التوجيه: ' + error.message);
    } finally {
        sendDirectiveBtn.disabled = false;
        sendDirectiveBtn.textContent = 'إرسال';
    }
}
// نهاية الاستبدال

// --- منطق التنقل بين تبويبات صفحة التوجيهات ---
const directiveTab = event.target.closest('#page-directives-ops .tab-link');
if (directiveTab) {
    event.preventDefault();
    const targetTabId = directiveTab.dataset.tab;

    // تفعيل التبويب والصفحة المرتبطة به
    document.querySelectorAll('#page-directives-ops .tab-link').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#page-directives-ops .tab-content').forEach(c => c.classList.remove('active'));
    directiveTab.classList.add('active');
    document.getElementById(targetTabId).classList.add('active');

    // تحميل محتوى التبويب المطلوب
    if (targetTabId === 'ops-directives-history') {
        loadOpsDirectivesHistory();
    }
}
// نهاية الإضافة

    // بداية الإضافة: منطق فتح نافذة إرسال التوجيه
const openDirectiveModalBtn = event.target.closest('.open-directive-modal-btn');
if (openDirectiveModalBtn) {
    const recipientId = openDirectiveModalBtn.dataset.recipientId;
    const recipientName = openDirectiveModalBtn.dataset.recipientName;
    
    const modal = document.getElementById('send-directive-modal');
    document.getElementById('send-directive-modal-title').textContent = `إرسال توجيه إلى: ${recipientName}`;
    document.getElementById('directive-recipient-id').value = recipientId;
    document.getElementById('directive-content').value = ''; // إفراغ الحقل عند الفتح

    modal.classList.remove('hidden');
}
// نهاية الإضافة

    // بداية الاستبدال
// منطق الموارد البشرية للقبول النهائي (مع إنشاء حساب للموظف)
const hrCoverageBtn = event.target.closest('.hr-coverage-action-btn');
if (hrCoverageBtn) {
    const applicantId = hrCoverageBtn.dataset.applicantId;
    const shiftId = hrCoverageBtn.dataset.shiftId;
    const action = hrCoverageBtn.dataset.action;

    hrCoverageBtn.disabled = true;
    hrCoverageBtn.textContent = 'جاري...';

    try {
        if (action === 'approve') {
            if (!confirm('هل أنت متأكد من القبول النهائي؟ سيتم إنشاء حساب للموظف وإغلاق الوردية.')) {
                hrCoverageBtn.disabled = false; hrCoverageBtn.innerHTML = '<i class="ph-bold ph-check-circle"></i> قبول نهائي وتعيين'; return;
            }

            // --- جلب بيانات المتقدم والوردية ---
            const { data: applicant, error: applicantError } = await supabaseClient.from('coverage_applicants').select('*, coverage_shifts(*)').eq('id', applicantId).single();
            if (applicantError || !applicant) throw new Error('لا يمكن العثور على بيانات المتقدم.');
            
            // --- تجهيز بيانات الموظف الجديد ---
            const profileData = {
                name: applicant.full_name,
                id_number: applicant.id_number,
                phone: applicant.phone_number,
                iban: applicant.iban,
                role: 'حارس أمن',
                employee_type: 'تغطية',
                employment_status: 'نشط',
                status: 'active',
                project: applicant.coverage_shifts.project,
                location: applicant.coverage_shifts.location,
                region: applicant.coverage_shifts.region,
                city: applicant.coverage_shifts.city,
                vacancy_id: applicant.coverage_shifts.linked_vacancy_id || null
            };

            // --- استدعاء الدالة السحابية لإنشاء الموظف ---
            // نستخدم رقم الهوية ككلمة مرور افتراضية
            const { data: functionResponse, error: functionError } = await supabaseClient.functions.invoke('create-employee', {
                body: { password: profileData.id_number, ...profileData }
            });

            if (functionError) throw new Error(`فشل في إنشاء الموظف: ${functionError.message}`);
            if (functionResponse.error) throw new Error(`خطأ من الخادم: ${functionResponse.error}`);

            // --- إذا نجح كل شيء، نحدّث حالة الطلبات والوردية ---
            await supabaseClient.from('coverage_applicants').update({ status: 'hr_approved' }).eq('id', applicantId);
            await supabaseClient.from('coverage_shifts').update({ status: 'closed' }).eq('id', shiftId);
            await supabaseClient.from('coverage_applicants').update({ status: 'rejected', rejection_reason: 'تم اختيار متقدم آخر' }).eq('shift_id', shiftId).not('id', 'eq', applicantId);

            alert(`تم إنشاء حساب الموظف بنجاح! \nاسم المستخدم: ${profileData.id_number}\nكلمة المرور: ${profileData.id_number}\nالرجاء إبلاغ الموظف بتغيير كلمة المرور بعد أول تسجيل دخول.`);

        } else { // الرفض
            const reason = prompt("الرجاء كتابة سبب الرفض:");
            if (reason) {
                const { error } = await supabaseClient.from('coverage_applicants').update({ status: 'rejected', rejection_reason: reason }).eq('id', applicantId);
                if (error) throw error;
                alert('تم رفض المتقدم.');
            }
        }
        
        loadCoverageRequestsPage(); // تحديث الواجهة

    } catch (error) {
        alert(`حدث خطأ فادح: ${error.message}`);
    } finally {
        hrCoverageBtn.disabled = false;
        hrCoverageBtn.innerHTML = '<i class="ph-bold ph-check-circle"></i> قبول نهائي وتعيين';
    }
}
// نهاية الاستبدال

// بداية الإضافة
async function loadSupervisorDirectivesHistory() {
    const container = document.getElementById('supervisor-history-list-container');
    if (!container || !currentUser) return;
    container.innerHTML = '<p style="text-align: center;">جاري تحميل السجل...</p>';

    const { data: directives, error } = await supabaseClient
        .from('directives')
        .select(`*, recipient:recipient_id (name)`)
        .eq('sender_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = '<p style="color:red;">خطأ في جلب السجل.</p>';
        return console.error(error);
    }
    if (directives.length === 0) {
        container.innerHTML = '<p style="text-align: center;">لم تقم بإرسال أي توجيهات بعد.</p>';
        return;
    }

    container.innerHTML = directives.map(d => {
        let statusClass, statusText;
        switch(d.status) {
            case 'accepted': statusClass = 'active'; statusText = 'تم القبول'; break;
            case 'rejected': statusClass = 'inactive'; statusText = 'تم الرفض'; break;
            default: statusClass = 'pending'; statusText = 'مرسل';
        }
        const date = new Date(d.created_at).toLocaleString('ar-SA');
        
        let notesFooter = '';
        if (d.status === 'rejected' && d.rejection_reason) {
            notesFooter = `<div class="request-card-footer"><strong>سبب الرفض:</strong> ${d.rejection_reason}</div>`;
        } else if (d.status === 'accepted' && d.acceptance_notes) {
            notesFooter = `<div class="request-card-footer" style="background-color: #e6f7ff; color: #005f8a; border-top: 1px solid #b3e0ff;"><strong>ملاحظات القبول:</strong> ${d.acceptance_notes}</div>`;
        }
        
        return `
            <div class="request-card" style="margin-bottom:15px;">
                <div class="request-card-header">
                    <h4>إلى: ${d.recipient ? d.recipient.name : 'مستخدم محذوف'}</h4>
                    <span class="status ${statusClass}">${statusText}</span>
                </div>
                <div class="request-card-body">
                    <p>${d.content}</p>
                    <small style="color: var(--text-secondary);">${date}</small>
                    ${notesFooter}
                </div>
            </div>`;
    }).join('');
}
// نهاية الإضافة
// بداية الإضافة
// --- منطق تسجيل الخروج ---
if (event.target.closest('#logout-btn, #logout-btn-mobile')) {
    event.preventDefault(); // منع السلوك الافتراضي للرابط
    
    if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج؟')) {
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) {
            alert('حدث خطأ أثناء تسجيل الخروج: ' + error.message);
        } else {
            // مسح أي بيانات محفوظة للمستخدم من الجلسة الحالية
            currentUser = null;
            sessionStorage.removeItem('currentUser');
            
            // إعادة تحميل الصفحة للعودة إلى شاشة تسجيل الدخول
            location.reload();
        }
    }
}
// نهاية الإضافة
    // بداية الإضافة: منطق تعديل وحذف التغطيات
// --- عند الضغط على زر "حذف تغطية" ---
const deleteCoverageBtn = event.target.closest('.delete-coverage-btn');
if (deleteCoverageBtn) {
    const shiftId = deleteCoverageBtn.dataset.shiftId;
    if (confirm('هل أنت متأكد من حذف هذه التغطية بشكل نهائي؟')) {
        const { error } = await supabaseClient.from('coverage_shifts').delete().eq('id', shiftId);
        if (error) {
            alert('حدث خطأ أثناء الحذف.');
            console.error(error);
        } else {
            alert('تم حذف التغطية بنجاح.');
            loadCoveragePage(); // تحديث القائمة
        }
    }
}

// --- عند الضغط على زر "تعديل تغطية" ---
const editCoverageBtn = event.target.closest('.edit-coverage-btn');
if (editCoverageBtn) {
    const shiftId = editCoverageBtn.dataset.shiftId;
    const { data: shift, error } = await supabaseClient.from('coverage_shifts').select('*').eq('id', shiftId).single();

    if (error || !shift) {
        return alert('حدث خطأ في جلب بيانات التغطية.');
    }

    const modal = document.getElementById('create-coverage-modal');
    
    // تعبئة الفورم ببيانات التغطية الحالية
    document.getElementById('coverage-edit-id').value = shift.id; // أهم خطوة: تحديد أننا في وضع التعديل
    document.getElementById('coverage-new-project').value = shift.project;
    document.getElementById('coverage-new-location').value = shift.location;
    document.getElementById('coverage-new-region').value = shift.region;
    document.getElementById('coverage-new-city').value = shift.city;
    document.getElementById('coverage-new-start-time').value = shift.start_time;
    document.getElementById('coverage-new-end-time').value = shift.end_time;
    document.getElementById('coverage-new-pay').value = shift.coverage_pay;
    document.getElementById('coverage-new-reason').value = shift.reason;
    
    // تعطيل خيار ربط الشاغر أثناء التعديل لتبسيط المنطق حالياً
    const vacancySelect = document.getElementById('coverage-link-vacancy');
    vacancySelect.disabled = true;
    vacancySelect.innerHTML = `<option value="">${shift.linked_vacancy_id ? 'مرتبطة بشاغر (لا يمكن التغيير)' : 'غير مرتبطة بشاغر'}</option>`;
    
    modal.classList.remove('hidden');
}

// نهاية الإضافة

    // بداية الإضافة: منطق إنشاء تغطية جديدة من قبل مدير العمليات

// --- عند الضغط على زر "إنشاء تغطية جديدة" ---
const addNewCoverageBtn = event.target.closest('#add-new-coverage-btn');
if (addNewCoverageBtn) {
    const modal = document.getElementById('create-coverage-modal');
    const vacancySelect = document.getElementById('coverage-link-vacancy');
    
    // إعادة تعيين الفورم
    modal.querySelectorAll('input, select').forEach(el => {
        if(el.id !== 'coverage-link-vacancy' && el.id !== 'coverage-new-reason') el.value = '';
        el.disabled = false;
    });
    vacancySelect.innerHTML = '<option value="">جاري تحميل الشواغر...</option>';
    
    // جلب الشواغر المفتوحة فقط
    const { data: vacancies, error } = await supabaseClient
        .from('job_vacancies')
        .select('id, project, specific_location')
        .eq('status', 'open');
        
    if (error) {
        vacancySelect.innerHTML = '<option value="">خطأ في التحميل</option>';
    } else {
        vacancySelect.innerHTML = '<option value="">-- تغطية يدوية بدون ربط بشاغر --</option>';
        vacancies.forEach(v => {
            vacancySelect.innerHTML += `<option value="${v.id}">${v.project} - ${v.specific_location || 'موقع عام'}</option>`;
        });
    }
    
    modal.classList.remove('hidden');
}

// بداية الاستبدال
// --- عند حفظ التغطية (للإنشاء والتعديل) ---
const saveNewCoverageBtn = event.target.closest('#save-new-coverage-btn');
if (saveNewCoverageBtn) {
    const editId = document.getElementById('coverage-edit-id').value; // جلب قيمة حقل التعديل
    const vacancyId = document.getElementById('coverage-link-vacancy').value;
    const coverageData = {
        project: document.getElementById('coverage-new-project').value,
        location: document.getElementById('coverage-new-location').value,
        region: document.getElementById('coverage-new-region').value,
        city: document.getElementById('coverage-new-city').value,
        start_time: document.getElementById('coverage-new-start-time').value,
        end_time: document.getElementById('coverage-new-end-time').value,
        coverage_pay: parseFloat(document.getElementById('coverage-new-pay').value) || 0,
        reason: document.getElementById('coverage-new-reason').value,
        linked_vacancy_id: vacancyId || null,
        created_by: currentUser.id
        // لا نرسل الحالة هنا، حتى لا يتم فتح وردية مغلقة بالخطأ عند التعديل
    };

    if (!coverageData.project || !coverageData.location || !coverageData.start_time || !coverageData.end_time || coverageData.coverage_pay <= 0) {
        return alert('الرجاء تعبئة حقول المشروع، الموقع، الوقت، وقيمة التغطية بشكل صحيح.');
    }
    
    saveNewCoverageBtn.disabled = true;
    saveNewCoverageBtn.textContent = 'جاري الحفظ...';
    
    let error;

    if (editId) {
        // ----- وضع التعديل -----
        ({ error } = await supabaseClient.from('coverage_shifts').update(coverageData).eq('id', editId));
    } else {
        // ----- وضع الإنشاء -----
        coverageData.status = 'open'; // الحالة تكون مفتوحة فقط عند الإنشاء
        ({ error } = await supabaseClient.from('coverage_shifts').insert(coverageData));
        
        // إذا تم الربط بشاغر عند الإنشاء، قم بتغيير حالة الشاغر
        if (vacancyId) {
            const { error: updateVacancyError } = await supabaseClient.from('job_vacancies').update({ status: 'on_coverage' }).eq('id', vacancyId);
            if (updateVacancyError) console.error("Update vacancy status error:", updateVacancyError);
        }
    }
        
    if (error) {
        alert('حدث خطأ أثناء حفظ التغطية.');
        console.error("Save/Edit coverage error:", error);
    } else {
        alert(editId ? 'تم تعديل التغطية بنجاح!' : 'تم طرح وردية التغطية بنجاح!');
        document.getElementById('create-coverage-modal').classList.add('hidden');
        loadCoveragePage();
    }
    
    saveNewCoverageBtn.disabled = false;
    saveNewCoverageBtn.textContent = 'حفظ وطرح للتغطية';
}
// نهاية الاستبدال

// نهاية الإضافة

    // بداية الإضافة: منطق عرض وقبول/رفض المتقدمين للتغطية

// عند الضغط على زر "عرض المتقدمين"
const viewApplicantsBtn = event.target.closest('.view-applicants-btn');
if (viewApplicantsBtn) {
    const shiftId = viewApplicantsBtn.dataset.shiftId;
    const modal = document.getElementById('view-applicants-modal');
    const body = document.getElementById('applicants-list-body');
    
    modal.classList.remove('hidden');
    body.innerHTML = '<p style="text-align:center;">جاري تحميل المتقدمين...</p>';
    
    // جلب المتقدمين الذين حالتهم "معلق" لهذه الوردية
    const { data: applicants, error } = await supabaseClient
        .from('coverage_applicants')
        .select('*')
        .eq('shift_id', shiftId)
        .eq('status', 'pending');
        
    if (error) {
        body.innerHTML = '<p style="text-align:center; color:red;">حدث خطأ.</p>';
        return console.error(error);
    }
    
    if (applicants.length === 0) {
        body.innerHTML = '<p style="text-align:center;">لا يوجد متقدمون جدد لهذه الوردية.</p>';
        return;
    }
    
    // بناء جدول لعرض المتقدمين
    body.innerHTML = `
        <div class="table-container" style="padding:0; box-shadow:none;">
            <table>
                <thead>
                    <tr>
                        <th>الاسم</th>
                        <th>رقم الهوية</th>
                        <th>الجوال</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${applicants.map(applicant => `
                        <tr>
                            <td>${applicant.full_name}</td>
                            <td>${applicant.id_number}</td>
                            <td>${applicant.phone_number}</td>
                            <td>
                                <button class="btn btn-success btn-sm coverage-action-btn" data-action="approve" data-applicant-id="${applicant.id}">
                                    <i class="ph-bold ph-check"></i> قبول مبدئي
                                </button>
                                <button class="btn btn-danger btn-sm coverage-action-btn" data-action="reject" data-applicant-id="${applicant.id}">
                                    <i class="ph-bold ph-x"></i> رفض
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// عند الضغط على زر "قبول مبدئي" أو "رفض" للمتقدم
const coverageActionBtn = event.target.closest('.coverage-action-btn');
if (coverageActionBtn) {
    const applicantId = coverageActionBtn.dataset.applicantId;
    const action = coverageActionBtn.dataset.action;

    if (!confirm(`هل أنت متأكد من ${action === 'approve' ? 'القبول المبدئي' : 'رفض'} هذا المتقدم؟`)) {
        return;
    }
    
    let updateData = {};
    if (action === 'approve') {
        updateData.status = 'ops_approved'; // تحديث الحالة إلى "مقبول من العمليات"
    } else {
        const reason = prompt("الرجاء كتابة سبب الرفض:");
        if (!reason) return; // إذا لم يكتب المستخدم سبباً
        updateData.status = 'rejected';
        updateData.rejection_reason = reason;
    }
    
    coverageActionBtn.disabled = true;
    coverageActionBtn.textContent = 'جاري...';
    
    const { error } = await supabaseClient
        .from('coverage_applicants')
        .update(updateData)
        .eq('id', applicantId);
        
    if (error) {
        alert('حدث خطأ!');
        console.error(error);
        coverageActionBtn.disabled = false;
    } else {
        alert('تم تحديث حالة المتقدم بنجاح.');
        // إزالة الصف من الجدول في الواجهة فوراً
        coverageActionBtn.closest('tr').remove();
        // إعادة تحميل صفحة التغطيات في الخلفية لتحديث عدد المتقدمين
        loadCoveragePage();
    }
}

// نهاية الإضافة

    // بداية الإضافة: منطق إضافة وردية للتغطية
// بداية الاستبدال
// بداية الإضافة: منطق إضافة وردية للتغطية (نسخة مطورة)
// عند الضغط على زر "إضافة للتغطية"
const addToCoverageBtn = event.target.closest('.add-to-coverage-btn');
if (addToCoverageBtn) {
    const modal = document.getElementById('add-to-coverage-modal');
    
    // الحالة الأولى: الزر قادم من صفحة "حضور الحراس" ويحتوي على بيانات وردية
    if (addToCoverageBtn.dataset.shift) {
        const shiftData = JSON.parse(addToCoverageBtn.dataset.shift);

        // تعبئة النافذة ببيانات الوردية للغائب
        document.getElementById('coverage-start-time').value = shiftData.start_time || '';
        document.getElementById('coverage-end-time').value = shiftData.end_time || '';
        document.getElementById('coverage-pay').value = ''; // يترك فارغاً لمدير العمليات
        document.getElementById('coverage-reason').value = 'غياب'; // سبب افتراضي
        
        // حفظ بيانات الوردية الأصلية كاملة
        document.getElementById('coverage-original-shift-details').value = JSON.stringify(shiftData);
        modal.classList.remove('hidden');

    } 
    // الحالة الثانية: الزر قادم من صفحة "التوظيف" ويحتوي على هوية الشاغر
    else if (addToCoverageBtn.dataset.id) { 
        const vacancyId = addToCoverageBtn.dataset.id;
        
        // جلب بيانات الشاغر من قاعدة البيانات
        const { data: vacancy, error } = await supabaseClient
            .from('job_vacancies')
            .select('project, location, region, city, specific_location')
            .eq('id', vacancyId)
            .single();
            
        if (error || !vacancy) {
            return alert('خطأ في جلب بيانات الشاغر المحدد.');
        }

        // تعبئة النافذة، مع ترك الأوقات فارغة للمستخدم
        document.getElementById('coverage-start-time').value = '';
        document.getElementById('coverage-end-time').value = '';
        document.getElementById('coverage-pay').value = '';
        document.getElementById('coverage-reason').value = 'شاغر مؤقت'; // سبب افتراضي مختلف
        
        // تجهيز البيانات التي سيتم حفظها في جدول التغطيات
        const coverageDetails = {
            project: vacancy.project,
            // استخدام الموقع المحدد إذا كان موجوداً، وإلا استخدام موقع المدينة
            location: vacancy.specific_location || vacancy.location, 
            region: vacancy.region,
            city: vacancy.city
        };
        document.getElementById('coverage-original-shift-details').value = JSON.stringify(coverageDetails);
        modal.classList.remove('hidden');
    }
}
// نهاية الاستبدال

// عند الضغط على زر "حفظ وطرح للتغطية"
const saveCoverageBtn = event.target.closest('#save-coverage-shift-btn');
if (saveCoverageBtn) {
    const originalShift = JSON.parse(document.getElementById('coverage-original-shift-details').value);
    
    const newCoverageShift = {
        project: originalShift.project,
        location: originalShift.location,
        region: originalShift.region,
        city: originalShift.city,
        start_time: document.getElementById('coverage-start-time').value,
        end_time: document.getElementById('coverage-end-time').value,
        coverage_pay: parseFloat(document.getElementById('coverage-pay').value) || 0,
        reason: document.getElementById('coverage-reason').value,
        status: 'open', // جاهزة للتقديم عليها
        created_by: currentUser.id
    };

    if (!newCoverageShift.coverage_pay || newCoverageShift.coverage_pay <= 0) {
        return alert('الرجاء إدخال قيمة التغطية بشكل صحيح.');
    }
    
    saveCoverageBtn.disabled = true;
    saveCoverageBtn.textContent = 'جاري الحفظ...';

    // حفظ الوردية الجديدة في جدول 'coverage_shifts'
    const { error } = await supabaseClient.from('coverage_shifts').insert([newCoverageShift]);
    
    if (error) {
        alert('حدث خطأ أثناء حفظ وردية التغطية. تأكد من إنشاء جدول coverage_shifts.');
        console.error("Save Coverage Error:", error);
    } else {
        alert('تم طرح الوردية للتغطية بنجاح!');
        document.getElementById('add-to-coverage-modal').classList.add('hidden');
        // يمكننا هنا لاحقاً إضافة دالة لتحديث صفحة التغطيات
    }

    saveCoverageBtn.disabled = false;
    saveCoverageBtn.textContent = 'حفظ وطرح للتغطية';
}
// نهاية الإضافة

// بداية الاستبدال
if (event.target.id === 'export-payroll-btn') {
    if (payrollExportData && payrollExportData.length > 0) {
        const monthInput = document.getElementById('payroll-month').value || 'report';
        const filename = `payroll-${monthInput}.csv`;
        exportPayrollDataToCsv(payrollExportData, filename);
    } else {
        alert('لا توجد بيانات لتصديرها. يرجى توليد المسير أولاً.');
    }
}
// نهاية الاستبدال
// نهاية الإضافة
    // بداية الإضافة
// زر توليد مسير الرواتب
if (event.target.id === 'generate-payroll-btn') {
    generatePayroll();
}
// نهاية الإضافة

// بداية الإضافة
// زر البحث في صفحة سجل الحضور
if (event.target.id === 'hr-attendance-search-btn') {
    const filters = {
        dateFrom: document.getElementById('hr-attendance-from').value,
        dateTo: document.getElementById('hr-attendance-to').value,
        status: document.getElementById('hr-attendance-status').value
    };
    
    // تعديل تاريخ "إلى" ليشمل اليوم كاملاً
    if (filters.dateTo) {
        let toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        filters.dateTo = toDate.toISOString();
    }
    
    loadHrAttendanceLogPage(filters);
}
// نهاية الإضافة    
// بداية الاستبدال
const requestActionBtn = event.target.closest('.request-action-button');
if (requestActionBtn) {
    event.stopPropagation();
    const btn = requestActionBtn;
    btn.disabled = true;

    try {
        const action = btn.dataset.action;
        const requestId = btn.dataset.requestId;
        const stage = btn.dataset.approvalStage;

        if (action === 'reject') {
            const reason = prompt('الرجاء إدخال سبب الرفض:');
            if (reason) {
                await supabaseClient.from('employee_requests').update({ status: 'مرفوض', rejection_reason: reason }).eq('id', requestId);
                alert('تم رفض الطلب.');
            }
        } else if (action === 'approve') {
            switch (stage) {
                case 'supervisor_escalate':
                    if (!confirm('هل أنت متأكد؟ سيتم رفع الطلب للعمليات.')) break;
                    await supabaseClient.from('employee_requests').update({ status: 'بانتظار موافقة العمليات', supervisor_approver_id: currentUser.id }).eq('id', requestId);
                    alert('تم رفع الطلب بنجاح.');
                    break;
                case 'ops_escalate':
                    if (!confirm('هل أنت متأكد؟ سيتم رفع الطلب للموارد البشرية.')) break;
                    await supabaseClient.from('employee_requests').update({ status: 'بانتظار موافقة الموارد البشرية', ops_approver_id: currentUser.id }).eq('id', requestId);
                    alert('تم رفع الطلب بنجاح.');
                    break;
                case 'ops_permission_final': // <-- هذه هي الحالة الجديدة والمهمة
                    if (!confirm('هل أنت متأكد من قبول طلب الاستئذان؟')) break;
                    const permUserId = btn.dataset.userId;
                    const { data: permUser } = await supabaseClient.from('users').select('*, job_vacancies(*)').eq('id', permUserId).single();
                    if (!permUser || !permUser.job_vacancies) throw new Error('لا يمكن العثور على بيانات الموظف أو شاغره.');
                    
                    await supabaseClient.from('employee_requests').update({ status: 'مقبول', ops_approver_id: currentUser.id }).eq('id', requestId);
                    
                    const modal = document.getElementById('create-coverage-modal');
                    const shift = permUser.job_vacancies.schedule_details[0];
                    document.getElementById('coverage-new-project').value = permUser.project || '';
                    document.getElementById('coverage-new-location').value = permUser.location || '';
                    document.getElementById('coverage-new-start-time').value = new Date().toTimeString().slice(0, 5);
                    document.getElementById('coverage-new-end-time').value = shift.end_time;
                    document.getElementById('coverage-new-reason').value = 'استئذان';
                    alert('تم قبول الاستئذان. يرجى الآن مراجعة تفاصيل التغطية وإضافتها.');
                    modal.classList.remove('hidden');
                    break;
                case 'hr_final':
                    // ... (منطق الموارد البشرية يبقى كما هو) ...
                    break;
                default:
                    alert('خطأ: مرحلة الموافقة غير معروفة.');
            }
        }
    } catch (error) {
        alert(`حدث خطأ: ${error.message}`);
    } finally {
        btn.disabled = false;
        // تحديث الواجهة
        if (document.querySelector('#page-ops-review-requests:not(.hidden)')) loadOpsReviewRequestsPage();
        if (document.querySelector('#page-supervisor-permission-requests:not(.hidden)')) loadSupervisorPermissionRequestsPage();
        if (document.querySelector('#page-permission-requests:not(.hidden)')) loadPermissionRequests();
    }
    return;
}
// نهاية الاستبدال
// نهاية الإضافة

    // بداية الإضافة: منطق عرض نافذة الشواغر المتاحة
    const viewSlotsBtn = event.target.closest('#view-available-slots-btn');
    if (viewSlotsBtn) {
        const modal = document.getElementById('available-slots-modal');
        const body = document.getElementById('available-slots-body');
        modal.classList.remove('hidden');
        body.innerHTML = '<p style="text-align: center;">جاري حساب الشواغر المتاحة...</p>';

        try {
            // 1. جلب كل العقود النشطة وكل الشواغر
            const [
                { data: contracts, error: e1 },
                { data: vacancies, error: e2 }
            ] = await Promise.all([
                supabaseClient.from('contracts').select('id, company_name, locations_and_guards').eq('status', 'active'),
                supabaseClient.from('job_vacancies').select('contract_id, specific_location')
            ]);

            if (e1 || e2) throw new Error('فشل جلب البيانات.');

            let resultsHtml = `<div class="table-container"><table>
                <thead><tr><th>المشروع (العقد)</th><th>الموقع</th><th>العدد المطلوب</th><th>العدد المنشأ</th><th>الشواغر المتبقية</th></tr></thead><tbody>`;
            let hasAvailableSlots = false;
            
            // 2. المرور على كل عقد وموقع لحساب المتبقي
            contracts.forEach(contract => {
                if (!contract.locations_and_guards) return;

                contract.locations_and_guards.forEach(location => {
                    const requiredGuards = location.shifts.reduce((sum, shift) => sum + (parseInt(shift.guards_count) || 0), 0);
                    
                    const createdVacancies = vacancies.filter(v => 
                        v.contract_id === contract.id && v.specific_location === location.location_name
                    ).length;

                    const remaining = requiredGuards - createdVacancies;

                    if (remaining > 0) {
                        hasAvailableSlots = true;
                        resultsHtml += `<tr>
                            <td>${contract.company_name}</td>
                            <td>${location.location_name}</td>
                            <td>${requiredGuards}</td>
                            <td>${createdVacancies}</td>
                            <td><strong style="color: #22c55e;">${remaining}</strong></td>
                        </tr>`;
                    }
                });
            });

            if (!hasAvailableSlots) {
                body.innerHTML = '<p style="text-align: center; padding: 20px;">لا توجد شواغر متاحة حالياً في أي من العقود النشطة.</p>';
            } else {
                resultsHtml += '</tbody></table></div>';
                body.innerHTML = resultsHtml;
            }

        } catch (error) {
            body.innerHTML = `<p style="text-align: center; color: red;">${error.message}</p>`;
        }
    }
// نهاية الإضافة
    // بداية الإضافة: منطق تعديل بيانات الموظف
    const editEmployeeBtn = event.target.closest('.edit-employee-btn');
    if (editEmployeeBtn) {
        const userId = editEmployeeBtn.dataset.id;
        if (!userId) return;

        // 1. جلب بيانات الموظف الكاملة
        const { data: employee, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !employee) {
            return alert('حدث خطأ في جلب بيانات الموظف.');
        }

        const modal = document.getElementById('employee-modal');

        // 2. تعيين وضع التعديل وملء الحقول المخفية
        document.getElementById('employee-modal-title').textContent = 'تعديل بيانات الموظف';
        document.getElementById('employee-creation-mode').value = 'update';
        document.getElementById('employee-id').value = employee.id;
        document.getElementById('employee-auth-id').value = employee.auth_user_id;

        // 3. تعبئة النموذج ببيانات الموظف
        document.getElementById('employee-name').value = employee.name || '';
        document.getElementById('employee-id-number').value = employee.id_number || '';
        document.getElementById('employee-phone').value = employee.phone || '';
        document.getElementById('employee-role').value = employee.role || 'حارس أمن';
        document.getElementById('employee-iban').value = employee.iban || '';
        document.getElementById('employee-insurance').value = employee.insurance_status || 'غير مسجل';
        document.getElementById('employee-account-status').value = employee.status || 'active';
        document.getElementById('employee-type').value = employee.employee_type || 'اساسي';
        document.getElementById('employee-status').value = employee.employment_status || 'نشط';
        
        // اترك حقل كلمة المرور فارغاً للتغيير فقط
        document.getElementById('employee-password').value = '';
        document.getElementById('employee-password').placeholder = 'اتركه فارغاً لعدم التغيير';
        
        // لا تسمح بتعديل رقم الهوية
        document.getElementById('employee-id-number').disabled = true;

        // 4. جلب قوائم العقود والشواغر وتحديد الخيار الحالي
        const contractSelect = document.getElementById('employee-contract');
        const vacancySelect = document.getElementById('employee-vacancy');
        contractSelect.innerHTML = '<option value="">جاري التحميل...</option>';
        vacancySelect.innerHTML = '<option value="">جاري التحميل...</option>';

        const [{ data: contracts }, { data: vacancies }] = await Promise.all([
            supabaseClient.from('contracts').select('id, company_name').eq('status', 'active'),
            supabaseClient.from('job_vacancies').select('id, project, specific_location').eq('status', 'open')
        ]);

        contractSelect.innerHTML = '<option value="">غير تابع لعقد</option>';
        if (contracts) contractSelect.innerHTML += contracts.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('');
        
        vacancySelect.innerHTML = '<option value="">غير مرتبط بشاغر</option>';
        if (vacancies) {
            vacancySelect.innerHTML += vacancies.map(v => `<option value="${v.id}">${v.project} - ${v.specific_location || 'موقع عام'}</option>`).join('');
        }

        // تحديد القيم الحالية للموظف
        contractSelect.value = employee.contract_id || '';
        vacancySelect.value = employee.vacancy_id || '';

        // 5. إظهار النافذة
        modal.classList.remove('hidden');
    }
// نهاية الإضافة

    // --- منطق عرض تفاصيل الشاغر لمدير العمليات ---
if (event.target.closest('.view-vacancy-details-btn')) {
    const vacancyId = event.target.closest('.view-vacancy-details-btn').dataset.id;
    const { data: vacancy, error } = await supabaseClient.from('job_vacancies').select('*').eq('id', vacancyId).single();
    if (error) return alert('خطأ في جلب تفاصيل الشاغر.');

    const detailsBody = document.getElementById('vacancy-details-body');
    const totalSalary = (vacancy.base_salary || 0) + (vacancy.housing_allowance || 0) + (vacancy.transport_allowance || 0) + (vacancy.other_allowances || 0);

    detailsBody.innerHTML = `
        <div class="contract-display">
            <p><strong>المسمى الوظيفي:</strong> ${vacancy.title}</p>
            <p><strong>المشروع:</strong> ${vacancy.project}</p>
            <p><strong>الموقع المحدد:</strong> ${vacancy.specific_location || 'غير محدد'}</p>
            <p><strong>المدينة:</strong> ${vacancy.location}</p>
            <p><strong>المنطقة:</strong> ${vacancy.region}</p>
            <hr>
            <p><strong>الراتب الأساسي:</strong> ${vacancy.base_salary.toLocaleString('ar-SA')} ر.س</p>
            <p><strong>البدلات:</strong> ${(totalSalary - vacancy.base_salary).toLocaleString('ar-SA')} ر.س</p>
            <p><strong>إجمالي الراتب:</strong> ${totalSalary.toLocaleString('ar-SA')} ر.س</p>
        </div>
    `;
    document.getElementById('view-vacancy-details-modal').classList.remove('hidden');
}

    // --- بداية الإضافة: منطق حذف الموظف ---
    const deleteEmployeeBtn = event.target.closest('.delete-employee-btn');
    if (deleteEmployeeBtn) {
        const userId = deleteEmployeeBtn.dataset.id;
        const authUserId = deleteEmployeeBtn.dataset.authId;

        if (confirm('هل أنت متأكد من حذف هذا الموظف بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.')) {
            // تعطيل الزر لمنع الضغطات المتكررة
            deleteEmployeeBtn.disabled = true;
            deleteEmployeeBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i>';

            try {
                // استدعاء دالة الخادم التي أنشأناها
                const { data, error } = await supabaseClient.functions.invoke('delete-employee', {
                    body: { 
                        user_id: userId,
                        auth_user_id: authUserId
                    },
                });

                if (error || data.error) {
                    throw new Error(error?.message || data.error);
                }

                alert('تم حذف الموظف بنجاح!');
                // إعادة تحميل قائمة الموظفين وقائمة الشواغر لتحديث العدادات
                loadEmployeeTabData();
                loadVacancyTabData(); 

            } catch (err) {
                alert(`حدث خطأ أثناء حذف الموظف: ${err.message}`);
                console.error("Delete employee error:", err);
                // إعادة تفعيل الزر في حالة الخطأ
                deleteEmployeeBtn.disabled = false;
                deleteEmployeeBtn.innerHTML = '<i class="ph-bold ph-trash"></i> حذف';
            }
        }
    }
    // --- نهاية الإضافة ---


    // عند الضغط على "حذف شاغر"
    if (event.target.closest('.delete-vacancy-btn')) {
        const vacancyId = event.target.closest('.delete-vacancy-btn').dataset.id;
        if (confirm('هل أنت متأكد من رغبتك في حذف هذا الشاغر؟')) {
            const { error } = await supabaseClient.from('job_vacancies').delete().eq('id', vacancyId);
            if (error) {
                alert('حدث خطأ أثناء حذف الشاغر.');
            } else {
                 // --- تصحيح: تم استدعاء الدالة الصحيحة لتحديث القائمة
                loadVacancyTabData();
            }
        }
    }

// (منطق التعديل والحذف سيتم إضافته لاحقاً بنفس الطريقة)

// نهاية الإضافة
    // بداية الإضافة: منطق الأزرار الديناميكية لنافذة العقود

// عند الضغط على "إضافة موقع"
if (event.target.closest('#add-location-btn')) {
    const container = document.getElementById('locations-container');
    container.insertAdjacentHTML('beforeend', createLocationGroupHtml());
}

// عند الضغط على "حذف موقع"
if (event.target.closest('.delete-location-btn')) {
    event.target.closest('.location-group').remove();
}

// عند الضغط على "إضافة وردية أخرى لهذا الموقع"
if (event.target.closest('.add-shift-btn')) {
    const shiftsContainer = event.target.closest('.shifts-section').querySelector('.shifts-container');
    shiftsContainer.insertAdjacentHTML('beforeend', createShiftGroupHtml());
}

// عند الضغط على زر "حذف وردية"
if (event.target.closest('.delete-shift-btn')) {
    event.target.closest('.shift-group').remove();
}

// بداية الإضافة: منطق تعديل وحذف العقد

// عند الضغط على زر "تعديل العقد"
if (event.target.closest('.edit-contract-btn')) {
    const contractId = event.target.closest('.edit-contract-btn').dataset.id;
    const { data: contract, error } = await supabaseClient.from('contracts').select('*').eq('id', contractId).single();
    if (error) return alert('خطأ في جلب بيانات العقد للتعديل.');

    // فتح النافذة وتعبئة البيانات الأساسية
    const modal = document.getElementById('contract-modal');
    document.getElementById('contract-modal-title').textContent = 'تعديل العقد';
    document.getElementById('contract-id').value = contract.id;
    document.getElementById('contract-client-name').value = contract.company_name || '';
    document.getElementById('contract-region').value = contract.region || '';
    document.getElementById('contract-city').value = contract.city || '';
    document.getElementById('contract-individual-salary').value = contract.individual_salary || 0;
    document.getElementById('contract-status').value = contract.status || 'pending';

    // مسح وإعادة بناء المواقع والورديات المحفوظة
    const locationsContainer = document.getElementById('locations-container');
    locationsContainer.innerHTML = ''; 
    if (contract.locations_and_guards && contract.locations_and_guards.length > 0) {
        contract.locations_and_guards.forEach(location => {
            locationsContainer.insertAdjacentHTML('beforeend', createLocationGroupHtml(location));
        });
    }
    
    modal.classList.remove('hidden');
}

// عند الضغط على زر "حذف العقد"
if (event.target.closest('.delete-contract-btn')) {
    const contractId = event.target.closest('.delete-contract-btn').dataset.id;
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا العقد؟ سيتم حذف كل ما يتعلق به.')) {
        const { error } = await supabaseClient.from('contracts').delete().eq('id', contractId);
        if (error) {
            alert('حدث خطأ أثناء حذف العقد.');
            console.error("Delete contract error:", error);
        } else {
            alert('تم حذف العقد بنجاح.');
            fetchContracts(); // إعادة تحميل القائمة
        }
    }
}

// نهاية الإضافة

// نهاية الإضافة



// بداية الاستبدال
// --- منطق متطور لمعالجة طلبات الموارد البشرية (توظيف وغيره) ---

// 1. منطق الموافقة على طلب توظيف (الأكثر تعقيداً)
const approveHiringBtn = event.target.closest('.approve-request-btn[data-type="hiring"]');
if (approveHiringBtn) {
    const requestId = approveHiringBtn.dataset.requestId;
    if (!requestId) return;

    if (confirm('هل أنت متأكد من الموافقة؟ سيتم إنشاء حساب للموظف وإغلاق الشاغر المرتبط به.')) {
        approveHiringBtn.disabled = true;
        approveHiringBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i>';

        try {
            // الخطوة أ: جلب بيانات الطلب كاملة
            const { data: request, error: requestError } = await supabaseClient
                .from('employee_requests')
                .select('details')
                .eq('id', requestId)
                .single();
            
            if (requestError) throw new Error(`لم يتم العثور على الطلب: ${requestError.message}`);
            
            const employeeDetails = request.details;
            const vacancyId = employeeDetails.vacancy_id;

            if (!employeeDetails.password || employeeDetails.password.length < 6) {
                throw new Error('لا يمكن الموافقة على الطلب. لم يتم تحديد كلمة مرور للموظف أو أنها قصيرة جداً.');
            }

            // الخطوة ب: استدعاء دالة إنشاء الموظف
            const { password, ...profileData } = employeeDetails;
            const { data: functionResponse, error: functionError } = await supabaseClient.functions.invoke('create-employee', {
                body: { password, ...profileData }
            });

            if (functionError) throw new Error(`فشل في إنشاء الموظف: ${functionError.message}`);
            if (functionResponse.error) throw new Error(`خطأ من الخادم: ${functionResponse.error}`);

            // الخطوة ج: إذا نجح إنشاء الموظف، نُغلق الشاغر
            if (vacancyId) {
                const { error: vacancyError } = await supabaseClient
                    .from('job_vacancies')
                    .update({ status: 'closed' }) // <--- هنا يتم إغلاق الشاغر
                    .eq('id', vacancyId);
                
                if (vacancyError) {
                    console.warn(`تم إنشاء الموظف ولكن فشل إغلاق الشاغر ${vacancyId}:`, vacancyError);
                }
            }

            // الخطوة د: تحديث حالة الطلب الأصلي إلى "مقبول"
            const { error: updateRequestError } = await supabaseClient
                .from('employee_requests')
                .update({ status: 'مقبول' })
                .eq('id', requestId);
            
            if (updateRequestError) throw new Error(`فشل تحديث حالة الطلب: ${updateRequestError.message}`);

            alert('تمت الموافقة على الطلب وإنشاء الموظف بنجاح!');
            if (typeof loadOperationsRequestsPage === 'function') loadOperationsRequestsPage();
            if (typeof loadVacancyTabData === 'function') loadVacancyTabData();


        } catch (error) {
            alert(`حدث خطأ: ${error.message}`);
            console.error("Hiring Approval Error:", error);
            approveHiringBtn.disabled = false;
            approveHiringBtn.innerHTML = '<i class="ph-bold ph-check"></i> قبول';
        }
    }
}

// 2. منطق رفض طلب توظيف
const rejectHiringBtn = event.target.closest('.reject-request-btn[data-type="hiring"]');
if (rejectHiringBtn) {
    const requestId = rejectHiringBtn.dataset.requestId;
    if (!requestId) return;

    const reason = prompt('الرجاء إدخال سبب الرفض:');
    if (reason && reason.trim() !== '') {
        rejectHiringBtn.disabled = true;
        rejectHiringBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i>';

        const { error } = await supabaseClient
            .from('employee_requests')
            .update({ status: 'مرفوض', rejection_reason: reason })
            .eq('id', requestId);

        if (error) {
            alert('حدث خطأ أثناء رفض الطلب.');
            rejectHiringBtn.disabled = false;
            rejectHiringBtn.innerHTML = '<i class="ph-bold ph-x"></i> رفض';
        } else {
            alert('تم رفض طلب التوظيف.');
            if (typeof loadOperationsRequestsPage === 'function') loadOperationsRequestsPage();
        }
    }
}


// نهاية الاستبدال

    /// ================================================================
// ===   منطق فتح نوافذ إضافة الموظفين وتعيين وضع الإنشاء   ===
// ================================================================

// --- عند الضغط على "إضافة موظف جديد" (من صفحة الموارد البشرية) ---
if (event.target.closest('#add-employee-btn')) {
    const modal = document.getElementById('employee-modal');
    
    // إعادة تعيين الفورم بالكامل
    modal.querySelector('.modal-body').querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'select-one') el.selectedIndex = 0;
        else el.value = '';
    });
    document.getElementById('employee-modal-title').textContent = 'إضافة موظف جديد';
    document.getElementById('employee-creation-mode').value = 'direct'; // الوضع: إنشاء مباشر
    document.getElementById('employee-id-number').disabled = false;

    // جلب العقود والشواغر
    const contractSelect = document.getElementById('employee-contract');
    const vacancySelect = document.getElementById('employee-vacancy');
    contractSelect.innerHTML = '<option value="">جاري التحميل...</option>';
    vacancySelect.innerHTML = '<option value="">جاري التحميل...</option>';

    const [{ data: contracts }, { data: vacancies }] = await Promise.all([
        supabaseClient.from('contracts').select('id, company_name').eq('status', 'active'),
        supabaseClient.from('job_vacancies').select('id, project, specific_location').eq('status', 'open')
    ]);

    contractSelect.innerHTML = '<option value="">غير تابع لعقد</option>';
    if (contracts) contractSelect.innerHTML += contracts.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('');
    
    vacancySelect.innerHTML = '<option value="">غير مرتبط بشاغر</option>';
    if (vacancies) {
        const vacancyOptions = vacancies.map(v => `<option value="${v.id}">${v.project} - ${v.specific_location || 'موقع عام'}</option>`).join('');
        vacancySelect.innerHTML += vacancyOptions;
    }

    modal.classList.remove('hidden');
}

// بداية الاستبدال
// --- عند الضغط على "توظيف جديد" (من صفحة العمليات) ---
if (event.target.closest('.hire-new-btn')) {
    const hireNewBtn = event.target.closest('.hire-new-btn');
    const modal = document.getElementById('employee-modal');
    
    // إعادة تعيين الفورم بالكامل
    modal.querySelector('.modal-body').querySelectorAll('input, select, textarea').forEach(el => { el.value = ''; });
    document.getElementById('employee-modal-title').textContent = 'طلب توظيف جديد';
    document.getElementById('employee-creation-mode').value = 'request';
    document.getElementById('employee-id-number').disabled = false;

    // جلب البيانات من الزر الذي تم الضغط عليه
    const vacancyId = hireNewBtn.dataset.vacancyId;
    const contractId = hireNewBtn.dataset.contractId;
    const project = hireNewBtn.dataset.project;
    const role = hireNewBtn.dataset.role;

    // تعبئة الحقول المخفية والظاهرة
    document.getElementById('employee-role').value = role;
    document.getElementById('employee-vacancy-id').value = vacancyId;
    document.getElementById('employee-project-hidden').value = project;
    
    // جلب وتعبئة قوائم العقود والشواغر
    const contractSelect = document.getElementById('employee-contract');
    const vacancySelect = document.getElementById('employee-vacancy');
    contractSelect.innerHTML = '<option value="">جاري التحميل...</option>';
    vacancySelect.innerHTML = '<option value="">جاري التحميل...</option>';
    modal.classList.remove('hidden'); // إظهار النافذة بسرعة

    const [{ data: contracts }, { data: vacancies }] = await Promise.all([
        supabaseClient.from('contracts').select('id, company_name').eq('status', 'active'),
        supabaseClient.from('job_vacancies').select('id, project, specific_location').eq('status', 'open')
    ]);

    // تعبئة قائمة العقود
    contractSelect.innerHTML = '<option value="">غير تابع لعقد</option>';
    if (contracts) contractSelect.innerHTML += contracts.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('');
    
    // تعبئة قائمة الشواغر
    vacancySelect.innerHTML = '<option value="">غير مرتبط بشاغر</option>';
    if (vacancies) {
        vacancySelect.innerHTML += vacancies.map(v => `<option value="${v.id}">${v.project} - ${v.specific_location || 'موقع عام'}</option>`).join('');
    }
    
    // **الخطوة الأهم: تحديد العقد والشاغر تلقائياً**
    if (contractId) contractSelect.value = contractId;
    if (vacancyId) vacancySelect.value = vacancyId;
}
// نهاية الاستبدال
// بداية الإضافة: منطق زر تعديل الموظف
if (event.target.closest('.edit-employee-btn')) {
    const userId = event.target.closest('.edit-employee-btn').dataset.id;
    if (!userId) return;

    // جلب بيانات الموظف الكاملة
    const { data: employee, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !employee) {
        return alert('حدث خطأ في جلب بيانات الموظف.');
    }

    const modal = document.getElementById('employee-modal');

    // تعيين وضع التعديل وملء الحقول المخفية
    document.getElementById('employee-modal-title').textContent = 'تعديل بيانات الموظف';
    document.getElementById('employee-creation-mode').value = 'update';
    document.getElementById('employee-id').value = employee.id;
    document.getElementById('employee-auth-id').value = employee.auth_user_id;

    // تعبئة النموذج ببيانات الموظف
    document.getElementById('employee-name').value = employee.name || '';
    document.getElementById('employee-id-number').value = employee.id_number || '';
    document.getElementById('employee-phone').value = employee.phone || '';
    document.getElementById('employee-role').value = employee.role || 'حارس أمن';
    document.getElementById('employee-iban').value = employee.iban || '';
    document.getElementById('employee-insurance').value = employee.insurance_status || 'غير مسجل';
    document.getElementById('employee-account-status').value = employee.status || 'active';
    document.getElementById('employee-type').value = employee.employee_type || 'اساسي';
    document.getElementById('employee-status').value = employee.employment_status || 'نشط';
    document.getElementById('employee-password').value = '';
    document.getElementById('employee-password').placeholder = 'اتركه فارغاً لعدم التغيير';
    
    // تعبئة الحقول الجديدة
    document.getElementById('employee-region').value = employee.region || '';
    document.getElementById('employee-city').value = employee.city || '';
    document.getElementById('employee-project-display').value = employee.project || 'غير معين';
    document.getElementById('employee-location-display').value = employee.location || 'غير محدد';
    
    document.getElementById('employee-id-number').disabled = true;

    // جلب قوائم العقود والشواغر وتحديد الخيار الحالي
    const contractSelect = document.getElementById('employee-contract');
    const vacancySelect = document.getElementById('employee-vacancy');
    contractSelect.innerHTML = '<option value="">جاري التحميل...</option>';
    vacancySelect.innerHTML = '<option value="">جاري التحميل...</option>';

    const [{ data: contracts }, { data: vacancies }] = await Promise.all([
        supabaseClient.from('contracts').select('id, company_name').eq('status', 'active'),
        supabaseClient.from('job_vacancies').select('id, project, specific_location').eq('status', 'open')
    ]);

    contractSelect.innerHTML = '<option value="">غير تابع لعقد</option>';
    if (contracts) contractSelect.innerHTML += contracts.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('');
    
    vacancySelect.innerHTML = '<option value="">غير مرتبط بشاغر</option>';
    if (vacancies) {
        vacancySelect.innerHTML += vacancies.map(v => `<option value="${v.id}">${v.project} - ${v.specific_location || 'موقع عام'}</option>`).join('');
    }

    contractSelect.value = employee.contract_id || '';
    vacancySelect.value = employee.vacancy_id || '';
     // --- إضافة جديدة: تفعيل حدث التغيير يدوياً لجلب الورديات وعرض الوردية المحفوظة ---
    if(vacancySelect.value) {
        vacancySelect.dispatchEvent(new Event('change')); // تفعيل الحدث لجلب الورديات
        // نعطي مهلة بسيطة ليتم تحميل الورديات قبل تحديد القيمة
        setTimeout(() => {
            const shiftSelect = document.getElementById('employee-shift');
            if (employee.assigned_shift) {
                shiftSelect.value = JSON.stringify(employee.assigned_shift);
            }
        }, 500);
    }

    modal.classList.remove('hidden');
}
// نهاية الإضافة
// بداية الاستبدال
// --- عند الضغط على زر "حفظ الموظف" (نسخة مطورة تعالج جميع الأدوار) ---
if (event.target.closest('#save-employee-btn')) {
    const saveBtn = event.target.closest('#save-employee-btn');
    const creationMode = document.getElementById('employee-creation-mode').value;
    const employeeId = document.getElementById('employee-id').value;
    const authId = document.getElementById('employee-auth-id').value;

    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';

    try {
        const selectedShiftElement = document.getElementById('employee-shift');
        const assignedShift = selectedShiftElement.value ? JSON.parse(selectedShiftElement.value) : null;
        
        const profileData = {
            name: document.getElementById('employee-name').value,
            phone: document.getElementById('employee-phone').value,
            iban: document.getElementById('employee-iban').value,
            role: document.getElementById('employee-role').value,
            status: document.getElementById('employee-account-status').value,
            employment_status: document.getElementById('employee-status').value,
            employee_type: document.getElementById('employee-type').value,
            insurance_status: document.getElementById('employee-insurance').value,
            contract_id: document.getElementById('employee-contract').value || null,
            vacancy_id: document.getElementById('employee-vacancy').value || null,
            region: document.getElementById('employee-region').value,
            city: document.getElementById('employee-city').value,
            assigned_shift: assignedShift
        };
        const newPassword = document.getElementById('employee-password').value;

        if (!profileData.name || !profileData.role) {
            throw new Error('الرجاء تعبئة حقول الاسم والدور.');
        }

        // --- هذا هو الجزء الذي تم تصحيحه ---
        if (profileData.vacancy_id) {
            // إذا تم تحديد شاغر (خاص بالحراس)
            const { data: vacancy, error } = await supabaseClient
                .from('job_vacancies').select('project, specific_location').eq('id', profileData.vacancy_id).single();
            if (error) throw new Error('لا يمكن العثور على تفاصيل الشاغر المحدد.');
            profileData.project = vacancy.project;
            profileData.location = vacancy.specific_location;
        } else if (profileData.contract_id) {
            // إذا لم يحدد شاغر ولكن حدد عقد (خاص بالمدراء والمشرفين)
            const { data: contract, error } = await supabaseClient
                .from('contracts').select('company_name').eq('id', profileData.contract_id).single();
            if (error) throw new Error('لا يمكن العثور على تفاصيل العقد المحدد.');
            profileData.project = contract.company_name;
            profileData.location = null; // المدير ليس له موقع محدد، بل مشروع كامل
        } else {
            // إذا لم يتم تحديد أي منهما
            profileData.project = null;
            profileData.location = null;
        }
        // --- نهاية الجزء الذي تم تصحيحه ---

        if (creationMode === 'update') {
            const { error: updateError } = await supabaseClient.from('users').update(profileData).eq('id', employeeId);
            if (updateError) throw updateError;
            if (profileData.vacancy_id) {
                await supabaseClient.from('job_vacancies').update({ status: 'closed' }).eq('id', profileData.vacancy_id);
            }
            if (newPassword) {
                if (newPassword.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
                const { error: passwordError } = await supabaseClient.functions.invoke('update-employee-password', { body: { auth_id: authId, new_password: newPassword } });
                if (passwordError) throw passwordError;
            }
            alert('تم تحديث بيانات الموظف بنجاح.');

        } else if (creationMode === 'request') {
            const requestDetails = { ...profileData, id_number: document.getElementById('employee-id-number').value, password: newPassword };
            if (!requestDetails.id_number || !requestDetails.password) throw new Error('عند تقديم طلب، يجب إدخال رقم الهوية وكلمة المرور.');
            const { error } = await supabaseClient.from('employee_requests').insert([{ request_type: 'hiring', user_id: currentUser.id, details: requestDetails, status: 'معلق' }]);
            if (error) throw error;
            alert('تم إرسال طلب التوظيف بنجاح.');

        } else { // direct creation
            const fullProfileData = { ...profileData, id_number: document.getElementById('employee-id-number').value };
            if (!fullProfileData.id_number || !newPassword || newPassword.length < 6) throw new Error('يجب إدخال رقم هوية وكلمة مرور (6 أحرف على الأقل) للموظف الجديد.');
            const { data, error } = await supabaseClient.functions.invoke('create-employee', { body: { password: newPassword, ...fullProfileData } });
            if (error) throw error;
            if (data.error) throw new Error(data.error);
            if (profileData.vacancy_id) {
                 await supabaseClient.from('job_vacancies').update({ status: 'closed' }).eq('id', profileData.vacancy_id);
            }
            alert('تم إنشاء الموظف بنجاح.');
        }

        document.getElementById('employee-modal').classList.add('hidden');
        if (typeof loadEmployeeTabData === 'function') loadEmployeeTabData();
        if (typeof loadVacancyTabData === 'function') loadVacancyTabData();

    } catch (error) {
        alert(`حدث خطأ: ${error.message}`);
        console.error("Save/Update Error:", error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ الموظف';
        document.getElementById('employee-id-number').disabled = false;
    }
}
// نهاية الاستبدال
// ================================================================
    // ===                    منطق إدارة العقود (نسخة مطورة)                    ===
    // ================================================================
// --- منطق تبويبات صفحة الموارد البشرية ---
    if (event.target.closest('.tab-link')) {
        event.preventDefault();
        const tabLink = event.target.closest('.tab-link');
        const targetTabId = tabLink.dataset.tab;

        // إزالة active من كل التبويبات والمحتوى
        tabLink.parentElement.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // إضافة active للتبويب والمحتوى المستهدف
        tabLink.classList.add('active');
        document.getElementById(targetTabId).classList.add('active');

        // تحميل بيانات التبويب المطلوب
        if (targetTabId === 'hr-tab-vacancies') loadVacancyTabData();
        if (targetTabId === 'hr-tab-employees') loadEmployeeTabData();
    }


    
    // --- دوال مساعدة لنظام البنود الديناميكي ---

    // دالة لإنشاء HTML الخاص ببند واحد
    function createClauseItemHtml(clauseText = '') {
        return `
            <div class="clause-item">
                <input type="text" class="clause-item-input" placeholder="اكتب نص البند هنا..." value="${clauseText}">
                <button class="delete-btn delete-clause-item-btn" title="حذف البند"><i class="ph-bold ph-trash"></i></button>
            </div>
        `;
    }

    // دالة لإنشاء HTML الخاص بمجموعة بنود كاملة
    function createClauseGroupHtml(group = { title: '', clauses: [''] }) {
        const groupId = `group_${Date.now()}_${Math.random()}`;
        const clausesHtml = group.clauses.map(clause => createClauseItemHtml(clause)).join('');

        return `
            <div class="clause-group" id="${groupId}">
                <div class="clause-group-header">
                    <div class="form-group">
                        <label>عنوان المجموعة</label>
                        <input type="text" class="clause-group-title" placeholder="مثال: التزامات الطرف الأول" value="${group.title}">
                    </div>
                    <button class="delete-btn delete-clause-group-btn" title="حذف المجموعة كاملة"><i class="ph-bold ph-x-circle"></i></button>
                </div>
                <div class="clause-items-list">
                    ${clausesHtml}
                </div>
                <div class="clause-group-footer">
                    <button class="btn btn-secondary add-clause-item-btn"><i class="ph-bold ph-plus"></i> إضافة بند لهذه المجموعة</button>
                </div>
            </div>
        `;
    }

    // --- معالجات الأحداث (Event Handlers) ---

    // عند الضغط على "إضافة عقد جديد"
    // ================================================================
// ===                    منطق إدارة العقود (نسخة مطورة)                    ===
// ================================================================

// --- الأزرار الرئيسية لفتح النوافذ ---

// عند الضغط على "إضافة عقد جديد"
if (event.target.closest('#add-contract-btn')) {
    const modal = document.getElementById('contract-modal');
    
    // إعادة تعيين الفورم بالكامل لوضع الإضافة
    document.getElementById('contract-modal-title').textContent = 'إضافة عقد جديد';
    document.getElementById('contract-id').value = '';
    document.getElementById('contract-client-name').value = '';
    document.getElementById('contract-region').value = '';
    document.getElementById('contract-city').value = '';
    document.getElementById('contract-individual-salary').value = '';
    document.getElementById('contract-status').value = 'pending';
    
    // مسح أي مواقع قديمة من الإضافات السابقة
    const locationsContainer = document.getElementById('locations-container');
    locationsContainer.innerHTML = ''; 

    modal.classList.remove('hidden');
}

// عند الضغط على زر "تعديل العقد"
if (event.target.closest('.edit-contract-btn')) {
    const contractId = event.target.closest('.edit-contract-btn').dataset.id;
    const { data: contract, error } = await supabaseClient.from('contracts').select('*').eq('id', contractId).single();
    if (error) return alert('خطأ في جلب بيانات العقد للتعديل.');

    // فتح النافذة وتعبئة البيانات الأساسية
    const modal = document.getElementById('contract-modal');
    document.getElementById('contract-modal-title').textContent = 'تعديل العقد';
    document.getElementById('contract-id').value = contract.id;
    document.getElementById('contract-client-name').value = contract.company_name || '';
    document.getElementById('contract-region').value = contract.region || '';
    document.getElementById('contract-city').value = contract.city || '';
    document.getElementById('contract-individual-salary').value = contract.individual_salary || 0;
    document.getElementById('contract-status').value = contract.status || 'pending';

    // مسح وإعادة بناء المواقع والورديات المحفوظة من قاعدة البيانات
    const locationsContainer = document.getElementById('locations-container');
    locationsContainer.innerHTML = ''; 
    if (contract.locations_and_guards && contract.locations_and_guards.length > 0) {
        contract.locations_and_guards.forEach(location => {
            locationsContainer.insertAdjacentHTML('beforeend', createLocationGroupHtml(location));
        });
    }
    
    modal.classList.remove('hidden');
}


// عند الضغط على "حفظ العقد"
if (event.target.closest('#save-contract-btn')) {
    const saveBtn = event.target.closest('#save-contract-btn');
    const id = document.getElementById('contract-id').value;

    // --- 1. تجميع البيانات الأساسية للعقد ---
    const contractData = {
        company_name: document.getElementById('contract-client-name').value,
        region: document.getElementById('contract-region').value,
        city: document.getElementById('contract-city').value,
        individual_salary: parseFloat(document.getElementById('contract-individual-salary').value) || 0,
        status: document.getElementById('contract-status').value,
    };

    if (!contractData.company_name || !contractData.city) {
        return alert('الرجاء تعبئة الحقول الأساسية للعقد (اسم الشركة والمدينة).');
    }

    // --- 2. تجميع بيانات المواقع والورديات الديناميكية ---
    const locationsData = [];
    document.querySelectorAll('#locations-container .location-group').forEach(locationGroup => {
        const locationName = locationGroup.querySelector('.location-name-input').value;
        const shifts = [];

        locationGroup.querySelectorAll('.shift-group').forEach(shiftGroup => {
            const selectedDays = [];
            shiftGroup.querySelectorAll('.weekdays-selector input[type="checkbox"]:checked').forEach(checkbox => {
                selectedDays.push(checkbox.value);
            });

            shifts.push({
                guards_count: parseInt(shiftGroup.querySelector('.shift-guards-input').value) || 1,
                days: selectedDays,
                start_time: shiftGroup.querySelector('.shift-start-time-input').value,
                end_time: shiftGroup.querySelector('.shift-end-time-input').value,
            });
        });

        if (locationName) {
            locationsData.push({
                location_name: locationName,
                shifts: shifts
            });
        }
    });
    
    // --- 3. دمج البيانات في الحقل المخصص لها في قاعدة البيانات ---
    contractData.locations_and_guards = locationsData; // هذا سيتم حفظه في عمود jsonb

    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';

    // --- 4. عملية الحفظ في قاعدة البيانات ---
    const { error } = id
        ? await supabaseClient.from('contracts').update(contractData).eq('id', id)
        : await supabaseClient.from('contracts').insert([contractData]);

    if (error) {
        alert('حدث خطأ أثناء حفظ العقد.');
        console.error('Save Contract Error:', error);
    } else {
        alert('تم حفظ العقد بنجاح!');
        document.getElementById('contract-modal').classList.add('hidden');
        fetchContracts(); // إعادة تحميل قائمة العقود
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ العقد';
}

// عند الضغط على "عرض العقد"
if (event.target.closest('.view-contract-btn')) {
    const contractId = event.target.closest('.view-contract-btn').dataset.id;
    const { data: contract, error } = await supabaseClient.from('contracts').select('*').eq('id', contractId).single();
    if (error) return alert('خطأ في جلب بيانات العقد.');

    const viewBody = document.getElementById('contract-view-body');
    
    // بناء تفاصيل المواقع والورديات
    let locationsHtml = '<p>لا توجد مواقع محددة في هذا العقد.</p>';
    if (contract.locations_and_guards && contract.locations_and_guards.length > 0) {
        locationsHtml = contract.locations_and_guards.map(location => {
            const shiftsHtml = location.shifts.map(shift => `
                <div class="shift-view-item">
                    <p><strong>عدد الحراس:</strong> ${shift.guards_count}</p>
                    <p><strong>الأيام:</strong> ${shift.days.join(', ').replace(/Sat/g, 'السبت').replace(/Sun/g, 'الأحد').replace(/Mon/g, 'الاثنين').replace(/Tue/g, 'الثلاثاء').replace(/Wed/g, 'الأربعاء').replace(/Thu/g, 'الخميس').replace(/Fri/g, 'الجمعة') || 'غير محدد'}</p>
                    <p><strong>الوقت:</strong> من ${shift.start_time || 'غير محدد'} إلى ${shift.end_time || 'غير محدد'}</p>
                </div>
            `).join('');

            return `
                <div class="location-view-group">
                    <h4><i class="ph-bold ph-map-pin-line"></i> موقع: ${location.location_name}</h4>
                    <div class="shifts-view-container">${shiftsHtml}</div>
                </div>
            `;
        }).join('');
    }

    // بناء الهيكل الكامل للعرض
    viewBody.innerHTML = `
        <div class="contract-display">
            <h2>تفاصيل العقد</h2>
            <p><strong>اسم العميل:</strong> ${contract.company_name || 'غير محدد'}</p>
            <p><strong>المنطقة:</strong> ${contract.region || 'غير محدد'}</p>
            <p><strong>المدينة:</strong> ${contract.city || 'غير محدد'}</p>
            <p><strong>راتب الفرد:</strong> ${contract.individual_salary || 0} ر.س</p>
            <p><strong>حالة العقد:</strong> ${contract.status || 'غير محدد'}</p>
            <hr>
            <h3>المواقع والورديات</h3>
            ${locationsHtml}
        </div>
    `;
    
    document.getElementById('view-contract-modal').classList.remove('hidden');
}

// عند الضغط على "حذف عقد"
if (event.target.closest('.delete-contract-btn')) {
    const contractId = event.target.closest('.delete-contract-btn').dataset.id;
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا العقد؟')) {
        const { error } = await supabaseClient.from('contracts').delete().eq('id', contractId);
        if (error) {
            alert('حدث خطأ أثناء حذف العقد.');
        } else {
            alert('تم حذف العقد بنجاح.');
            fetchContracts();
        }
    }
}

    // --- الأزرار الديناميكية داخل نافذة العقود ---

    // عند الضغط على "إضافة مجموعة"
    if (event.target.closest('#add-clause-group-btn')) {
        document.getElementById('clause-groups-container').insertAdjacentHTML('beforeend', createClauseGroupHtml());
    }

    // عند الضغط على "إضافة بند لهذه المجموعة"
    if (event.target.closest('.add-clause-item-btn')) {
        const list = event.target.closest('.clause-group').querySelector('.clause-items-list');
        list.insertAdjacentHTML('beforeend', createClauseItemHtml());
    }

    // عند الضغط على "حذف مجموعة"
    if (event.target.closest('.delete-clause-group-btn')) {
        event.target.closest('.clause-group').remove();
    }
    
    // عند الضغط على "حذف بند"
    if (event.target.closest('.delete-clause-item-btn')) {
        event.target.closest('.clause-item').remove();
    }
    
// ================================================================
// ===                 منطق إدارة الموارد البشرية (الشواغر)                 ===
// ================================================================

// عند الضغط على زر "إضافة شاغر جديد"
if (event.target.closest('#add-vacancy-btn')) {
    const modal = document.getElementById('vacancy-modal');
    // إعادة تعيين الفورم
    document.getElementById('vacancy-modal-title').textContent = 'إضافة شاغر جديد';
    document.getElementById('vacancy-id').value = '';
    modal.querySelector('form')?.reset(); // طريقة أسهل لإعادة تعيين النموذج

    // جلب العقود النشطة لملء القائمة
    const contractSelect = document.getElementById('vacancy-contract');
    contractSelect.innerHTML = '<option value="">جاري تحميل العقود...</option>';
    const { data: contracts } = await supabaseClient.from('contracts').select('id, company_name').eq('status', 'active');
    if (contracts) {
        contractSelect.innerHTML = '<option value="">بدون عقد محدد</option>';
        contractSelect.innerHTML += contracts.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('');
    }
    
    modal.classList.remove('hidden');
}

// عند الضغط على زر "تعديل شاغر"
if (event.target.closest('.edit-vacancy-btn')) {
    const vacancyId = event.target.closest('.edit-vacancy-btn').dataset.id;
    const { data: vacancy, error } = await supabaseClient.from('job_vacancies').select('*').eq('id', vacancyId).single();
    if (error) return alert('خطأ في جلب بيانات الشاغر.');

    // جلب العقود لملء القائمة
    const contractSelect = document.getElementById('vacancy-contract');
    contractSelect.innerHTML = '<option value="">جاري تحميل العقود...</option>';
    const { data: contracts } = await supabaseClient.from('contracts').select('id, company_name').eq('status', 'active');
    if (contracts) {
        contractSelect.innerHTML = '<option value="">بدون عقد محدد</option>';
        contractSelect.innerHTML += contracts.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('');
    }

    // ملء الفورم بالبيانات
    document.getElementById('vacancy-modal-title').textContent = 'تعديل شاغر وظيفي';
    document.getElementById('vacancy-id').value = vacancy.id;
    document.getElementById('vacancy-title').value = vacancy.title;
    document.getElementById('vacancy-contract').value = vacancy.contract_id || '';
    document.getElementById('vacancy-project').value = vacancy.project;
    document.getElementById('vacancy-region').value = vacancy.region;
    document.getElementById('vacancy-location').value = vacancy.location;
    document.getElementById('vacancy-status').value = vacancy.status;
    document.getElementById('vacancy-base-salary').value = vacancy.base_salary;
    document.getElementById('vacancy-housing').value = vacancy.housing_allowance;
    document.getElementById('vacancy-transport').value = vacancy.transport_allowance;
    document.getElementById('vacancy-other').value = vacancy.other_allowances;
    
    document.getElementById('vacancy-modal').classList.remove('hidden');
}

// بداية الاستبدال
if (event.target.closest('#save-vacancy-btn')) {
    const saveBtn = event.target.closest('#save-vacancy-btn');
    const id = document.getElementById('vacancy-id').value;
    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';

    try {
        const vacancyData = {
            title: document.getElementById('vacancy-title').value,
            contract_id: document.getElementById('vacancy-contract').value || null,
            project: document.getElementById('vacancy-project').value,
            region: document.getElementById('vacancy-region').value,
            location: document.getElementById('vacancy-location').value,
            specific_location: document.getElementById('vacancy-specific-location').value,
            status: document.getElementById('vacancy-status').value,
            base_salary: parseFloat(document.getElementById('vacancy-base-salary').value) || 0,
            housing_allowance: parseFloat(document.getElementById('vacancy-housing').value) || 0,
            transport_allowance: parseFloat(document.getElementById('vacancy-transport').value) || 0,
            other_allowances: parseFloat(document.getElementById('vacancy-other').value) || 0,
        };

        if (!vacancyData.title || !vacancyData.project) throw new Error('الرجاء إدخال المسمى الوظيفي والمشروع.');
        
        // --- الجزء الجديد والمُحسّن ---
        vacancyData.schedule_details = null; // إعادة التعيين بشكل افتراضي

        if (vacancyData.contract_id && vacancyData.specific_location) {
            const { data: contract, error: contractError } = await supabaseClient
                .from('contracts').select('locations_and_guards').eq('id', vacancyData.contract_id).single();

            if (contractError) throw new Error('خطأ في جلب بيانات العقد للجدول.');
            
            const locationInfo = contract.locations_and_guards?.find(l => l.location_name === vacancyData.specific_location);
            if (locationInfo && locationInfo.shifts) {
                vacancyData.schedule_details = locationInfo.shifts; // حفظ مصفوفة الورديات
                console.log('تم العثور على الجدول وحفظه في الشاغر:', locationInfo.shifts);
            } else {
                 console.warn(`لم يتم العثور على جدول للموقع المحدد "${vacancyData.specific_location}" في العقد.`);
            }
        }
        // --- نهاية الجزء الجديد ---

        const { error } = id
            ? await supabaseClient.from('job_vacancies').update(vacancyData).eq('id', id)
            : await supabaseClient.from('job_vacancies').insert([vacancyData]);
        
        if (error) throw error;

        document.getElementById('vacancy-modal').classList.add('hidden');
        loadVacancyTabData();

    } catch (error) {
        alert('حدث خطأ أثناء حفظ الشاغر: ' + error.message);
        console.error(error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ الشاغر';
    }
}
// نهاية الاستبدال

// عند الضغط على "حذف شاغر"
if (event.target.closest('.delete-vacancy-btn')) {
    const vacancyId = event.target.closest('.delete-vacancy-btn').dataset.id;
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا الشاغر؟')) {
        const { error } = await supabaseClient.from('job_vacancies').delete().eq('id', vacancyId);
        if (error) {
            alert('حدث خطأ أثناء حذف الشاغر.');
        } else {
            // --- تصحيح: تم استدعاء الدالة الصحيحة "loadVacancyTabData"
            loadVacancyTabData();
        }
    }
}
// --- منطق تسجيل زيارة ميدانية ---
const addVisitBtn = event.target.closest('#add-visit-btn');
if (addVisitBtn) {
    const modal = document.getElementById('add-visit-modal');
    const clientSelect = document.getElementById('visit-client-select');
    const visitTimeInput = document.getElementById('visit-time-input');

    // إظهار النافذة وعرض رسالة تحميل مبدئية
    modal.classList.remove('hidden');
    clientSelect.innerHTML = '<option>جاري تحميل المواقع...</option>';
    
    // تعيين الوقت الحالي كوقت افتراضي للزيارة
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    visitTimeInput.value = now.toISOString().slice(0, 16);

    // جلب قائمة كل العملاء (المواقع)
    const { data: clients, error } = await supabaseClient.from('clients').select('id, name');

    if (error || !clients) {
        clientSelect.innerHTML = '<option>خطأ في تحميل المواقع</option>';
    } else {
        clientSelect.innerHTML = clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

// بداية الاستبدال
// منطق حفظ الزيارة (النسخة الجديدة)
const submitVisitBtn = event.target.closest('#submit-visit-btn');
if (submitVisitBtn) {
    const modal = document.getElementById('add-visit-modal');
    const locationName = document.getElementById('visit-client-select').value;
    const visitTime = document.getElementById('visit-time-input').value;
    const notes = document.getElementById('visit-notes-textarea').value;

    if (!locationName || !visitTime || !notes.trim()) {
        return alert('الرجاء تعبئة جميع الحقول.');
    }

    submitVisitBtn.disabled = true;
    submitVisitBtn.textContent = 'جاري الحفظ...';

    const { error } = await supabaseClient
        .from('visits')
        .insert({
            user_id: currentUser.id,
            contract_id: currentUser.contract_id, // من بيانات المشرف
            location_name: locationName, // من القائمة المنسدلة
            visit_time: visitTime,
            notes: notes
        });

    if (error) {
        alert('حدث خطأ أثناء حفظ الزيارة.');
        console.error('Visit Log Error:', error);
    } else {
        alert('تم تسجيل الزيارة بنجاح.');
        modal.classList.add('hidden');
        if (typeof fetchVisits === 'function') fetchVisits();
        if (typeof loadMyVisitsPage === 'function') loadMyVisitsPage();
    }

    submitVisitBtn.disabled = false;
    submitVisitBtn.textContent = 'حفظ الزيارة';
}
// نهاية الاستبدال
    // --- منطق طلب نقل حارس ---
 const requestTransferBtn = event.target.closest('#request-transfer-btn');
if (requestTransferBtn) {
    const modal = document.getElementById('guard-transfer-modal');
    const guardSelect = document.getElementById('transfer-guard-select');
    const clientSelect = document.getElementById('transfer-client-select');

    // إظهار النافذة وعرض رسالة تحميل مبدئية
    modal.classList.remove('hidden');
    guardSelect.innerHTML = '<option>جاري تحميل الحراس...</option>';
    clientSelect.innerHTML = '<option>جاري تحميل المواقع...</option>';

    // جلب قائمة الحراس التابعين للمشرف
    const { data: guards, error: guardsError } = await supabaseClient
        .from('users')
        .select('id, name')
        .eq('supervisor_id', currentUser.id);

    if (guardsError || !guards) {
        guardSelect.innerHTML = '<option>خطأ في تحميل الحراس</option>';
    } else {
        guardSelect.innerHTML = guards.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    }

    // جلب قائمة كل العملاء (المواقع)
    const { data: clients, error: clientsError } = await supabaseClient.from('clients').select('id, name');

    if (clientsError || !clients) {
        clientSelect.innerHTML = '<option>خطأ في تحميل المواقع</option>';
    } else {
        clientSelect.innerHTML = clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

// عند الضغط على زر "إرسال طلب النقل" داخل النافذة
const submitTransferBtn = event.target.closest('#submit-transfer-request-btn');
if (submitTransferBtn) {
    const modal = document.getElementById('guard-transfer-modal');
    const guardId = document.getElementById('transfer-guard-select').value;
    const clientId = document.getElementById('transfer-client-select').value;
    const reason = document.getElementById('transfer-reason').value;

    if (!guardId || !clientId || !reason.trim()) {
        alert('الرجاء تعبئة جميع الحقول.');
        return;
    }

    submitTransferBtn.disabled = true;
    submitTransferBtn.textContent = 'جاري الإرسال...';

    //  تصحيح: تم تغيير اسم العمود من user_id إلى supervisor_id ليطابق قاعدة البيانات
    const { error } = await supabaseClient
        .from('visits')
        .insert({
            supervisor_id: currentUser.id, // هذا هو الاسم الصحيح لعمود المشرف
            client_id: clientId,
            visit_time: visitTime,
            notes: notes
        });

    if (error) {
        alert('حدث خطأ أثناء إرسال الطلب.');
        console.error('Transfer Request Error:', error);
    } else {
        alert('تم إرسال طلب النقل بنجاح.');
        modal.classList.add('hidden');
    }

    submitTransferBtn.disabled = false;
    submitTransferBtn.textContent = 'إرسال طلب النقل';
}
    // --- A. Guard Request Cards Logic ---
    const requestCard = event.target.closest('.request-action-card');
    if (requestCard) {
        const requestType = requestCard.dataset.requestType;
        if (requestType) {
            const modalId = `${requestType}-request-modal`;
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.remove('hidden');
        }
    }

    // ==================== بداية الإضافة ====================
// --- منطق بدء وإنهاء الجولة للمشرف ---
// بداية الاستبدال
// --- منطق بدء وإنهاء الجولة للمشرف (النسخة الجديدة) ---
const startPatrolBtn = event.target.closest('#start-patrol-btn');
// بداية الاستبدال
if (startPatrolBtn) {
    if (!confirm('هل أنت متأكد من رغبتك في بدء جولة ميدانية الآن؟')) return;

    startPatrolBtn.disabled = true;
    startPatrolBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i> جاري البدء...';

    const { data: newPatrol, error } = await supabaseClient
        .from('patrols')
        .insert({ supervisor_id: currentUser.id, status: 'active' })
        .select() // <-- طلب إعادة بيانات السجل الجديد
        .single();

    if (error || !newPatrol) {
        alert('حدث خطأ أثناء بدء الجولة.');
        console.error(error);
    } else {
        alert('تم بدء الجولة بنجاح! التتبع المباشر فعال الآن.');
        startPatrolTracking(newPatrol.id); // <-- تشغيل التتبع باستخدام معرف الجولة الجديدة
    }
    loadSupervisorPatrolPage();
    startPatrolBtn.disabled = false;
    startPatrolBtn.innerHTML = 'بدء الجولة';
}
// نهاية الاستبدال

// عند الضغط على "إنهاء الجولة" (يفتح النافذة فقط)
const endPatrolBtn = event.target.closest('#end-patrol-btn');
if (endPatrolBtn) {
    const patrolId = endPatrolBtn.dataset.patrolId;
    const modal = document.getElementById('end-patrol-modal');
    document.getElementById('active-patrol-id').value = patrolId;
    document.getElementById('patrol-notes').value = ''; // إفراغ الحقل
    modal.classList.remove('hidden');
}

// عند الضغط على "تأكيد وإنهاء الجولة" داخل النافذة
const confirmEndPatrolBtn = event.target.closest('#confirm-end-patrol-btn');
// بداية الاستبدال
if (confirmEndPatrolBtn) {
    const patrolId = document.getElementById('active-patrol-id').value;
    const notes = document.getElementById('patrol-notes').value;

    confirmEndPatrolBtn.disabled = true;
    confirmEndPatrolBtn.textContent = 'جاري الحفظ...';

    stopPatrolTracking(); // <-- إيقاف التتبع أولاً

    const { error } = await supabaseClient
        .from('patrols')
        .update({ end_time: new Date(), status: 'completed', notes: notes })
        .eq('id', patrolId);

    if (error) {
        alert('حدث خطأ أثناء إنهاء الجولة. قد تحتاج لبدء التتبع مرة أخرى.');
        console.error(error);
    } else {
        alert('تم إنهاء الجولة وحفظ المسار بنجاح.');
        document.getElementById('end-patrol-modal').classList.add('hidden');
    }
    loadSupervisorPatrolPage();
    confirmEndPatrolBtn.disabled = false;
    confirmEndPatrolBtn.textContent = 'تأكيد وإنهاء الجولة';
}
// نهاية الاستبدال
// نهاية الاستبدال
    // --- NEW: Attendance Check-in/Check-out Logic (نسخة مصححة) ---
    const checkInBtn = event.target.closest('#check-in-btn');
    const checkOutBtn = event.target.closest('#check-out-btn');

    // عند الضغط على زر "تسجيل حضور"
// ==================== بداية الاستبدال ====================
    // عند الضغط على زر "تسجيل حضور"
    // ==================== بداية الاستبدال ====================
// عند الضغط على زر "تسجيل حضور"
// ==================== بداية الاستبدال ====================
// عند الضغط على زر "تسجيل حضور"
if (checkInBtn) {
    checkInBtn.disabled = true;
    checkInBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i> جاري ...';

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const { error } = await supabaseClient.from('attendance').insert({
            guard_id: currentUser.id,
            guard_name: currentUser.name,
            checkin_lat: latitude,
            checkin_lon: longitude,
            status: 'حاضر'
        });

        if (error) {
            alert('حدث خطأ أثناء تسجيل الحضور.');
        } else {
            alert('تم تسجيل حضورك بنجاح.');
        }
        loadAttendancePage(); // إعادة تحميل الواجهة لتبدأ التتبع
    }, (error) => {
        alert('لا يمكن تسجيل الحضور. يرجى تمكين صلاحية الوصول للموقع.');
        checkInBtn.disabled = false;
        checkInBtn.innerHTML = 'تسجيل حضور';
    });
}

// عند الضغط على زر "تسجيل انصراف"
// ==================== بداية الاستبدال ====================
// عند الضغط على زر "تسجيل انصراف"
if (checkOutBtn) {
    if (confirm('هل أنت متأكد من أنك تريد تسجيل الانصراف الآن؟')) {

        // تعطيل الزر لمنع الضغطات المتكررة وعرض مؤشر التحميل
        checkOutBtn.disabled = true;
        checkOutBtn.innerHTML = '<i class="ph-fill ph-spinner-gap animate-spin"></i> جاري ...';

        // أولاً: إيقاف التتبع المباشر
        stopPersistentTracking(); 

        // ثانياً: محاولة تحديث قاعدة البيانات
        const { error } = await supabaseClient
            .from('attendance')
            .update({
                checkout_at: new Date(),
                status: 'اكمل المناوبة'
            })
            .eq('id', checkOutBtn.dataset.attendanceId);

        // ثالثاً: إبلاغ المستخدم بالنتيجة الحقيقية
        if (error) {
            alert('فشل تسجيل الانصراف. سيتم تحديث الواجهة لتعكس الحالة الصحيحة.');
            console.error('Checkout Error:', error);
        } else {
            alert('تم تسجيل انصرافك بنجاح.');
        }

        // رابعاً (الأهم): دائماً نُعيد تحميل الواجهة من قاعدة البيانات
        // لضمان عرض الحالة الصحيحة 100%
        loadAttendancePage(); 
    }
}
// ===================== نهاية الاستبدال =====================
// ===================== نهاية الاستبدال =====================
// ===================== نهاية الاستبدال =====================
// ===================== نهاية الاستبدال =====================

    // عند الضغط على زر "تسجيل انصراف"
    // ==================== بداية الاستبدال ====================
// عند الضغط على زر "تسجيل انصراف"

// ===================== نهاية الاستبدال =====================
// --- NEW: Guard Request Submission Logic ---
    const submitRequestBtn = event.target.closest('.btn-submit-request');
    if (submitRequestBtn) {
        event.preventDefault(); // منع أي سلوك افتراضي للزر
        
        const requestType = submitRequestBtn.dataset.requestType;
        if (!requestType || !currentUser) return; // الخروج إذا لم يتم تحديد نوع الطلب أو لم يسجل المستخدم دخوله

        const modal = submitRequestBtn.closest('.modal-overlay');
        let details = {};
        let isValid = true;

        // تجميع البيانات من النموذج الصحيح بناءً على نوع الطلب
        switch (requestType) {
            case 'permission':
                const permissionReason = modal.querySelector('#permission-reason').value;
                if (!permissionReason.trim()) { alert('الرجاء كتابة سبب الاستئذان.'); isValid = false; }
                details = { reason: permissionReason };
                break;
            case 'leave':
                const leaveStartDate = modal.querySelector('#leave-start-date').value;
                const leaveDays = modal.querySelector('#leave-days').value;
                const leaveReason = modal.querySelector('#leave-reason').value;
                if (!leaveStartDate || !leaveDays || !leaveReason.trim()) { alert('الرجاء تعبئة جميع حقول طلب الإجازة.'); isValid = false; }
                details = { start_date: leaveStartDate, days: leaveDays, reason: leaveReason };
                break;
            case 'loan':
                const loanAmount = modal.querySelector('#loan-amount').value;
                const loanReason = modal.querySelector('#loan-reason').value;
                if (!loanAmount || !loanReason.trim()) { alert('الرجاء تحديد مبلغ السلفة وكتابة السبب.'); isValid = false; }
                details = { amount: loanAmount, reason: loanReason };
                break;
            case 'resignation':
                const resignationReason = modal.querySelector('#resignation-reason').value;
                if (!resignationReason.trim()) { alert('الرجاء كتابة سبب الاستقالة.'); isValid = false; }
                details = { reason: resignationReason };
                break;
        }

        if (!isValid) return; // إيقاف التنفيذ إذا كانت البيانات غير صالحة

        // تعطيل الزر وإظهار رسالة "جاري الإرسال"
        submitRequestBtn.disabled = true;
        submitRequestBtn.textContent = 'جاري الإرسال...';

        // تجهيز البيانات لإرسالها إلى قاعدة البيانات
        const requestData = {
            user_id: currentUser.id,
            request_type: requestType,
            details: details
            // حقل الحالة 'status' سيتم تعيينه إلى 'معلق' تلقائيًا من قاعدة البيانات
        };

        // إرسال البيانات إلى جدول 'employee_requests'
        const { error } = await supabaseClient.from('employee_requests').insert([requestData]);

        if (error) {
            console.error('Error submitting request:', error);
            alert('حدث خطأ أثناء إرسال طلبك. يرجى المحاولة مرة أخرى.');
            // إعادة تفعيل الزر في حالة الخطأ
            submitRequestBtn.disabled = false;
            // يمكنك إعادة النص الأصلي للزر هنا إذا أردت
        } else {
            // في حالة النجاح
            alert('تم إرسال طلبك بنجاح.');
            modal.classList.add('hidden'); // إخفاء النافذة المنبثقة
            loadMyRequestsPage(); // إعادة تحميل قائمة الطلبات لتظهر الطلب الجديد
        }
    }
    // ==================== بداية الإضافة ====================
// --- منطق قبول ورفض طلبات الاستئذان للمشرف ---
const actionBtn = event.target.closest('[data-action]');
if (actionBtn && actionBtn.dataset.requestId) {
    const requestId = actionBtn.dataset.requestId;
    const action = actionBtn.dataset.action;
    let success = false; // متغير لتتبع نجاح العملية

    if (action === 'approve') {
        if (confirm('هل أنت متأكد من قبول هذا الطلب؟')) {
            const { error } = await supabaseClient
                .from('employee_requests')
                .update({ status: 'مقبول' }) // تحديث الحالة إلى "مقبول"
                .eq('id', requestId);

            if (error) {
                alert('حدث خطأ أثناء قبول الطلب.');
                console.error('Approval error:', error);
            } else {
                alert('تم قبول الطلب بنجاح.');
                success = true;
            }
        }
    } else if (action === 'reject') {
        const reason = prompt('الرجاء إدخال سبب الرفض:');
        if (reason) { // نتأكد أن المشرف أدخل سبباً ولم يضغط "إلغاء"
            const { error } = await supabaseClient
                .from('employee_requests')
                .update({ status: 'مرفوض', rejection_reason: reason }) // تحديث الحالة وسبب الرفض
                .eq('id', requestId);

            if (error) {
                alert('حدث خطأ أثناء رفض الطلب.');
                console.error('Rejection error:', error);
            } else {
                alert('تم رفض الطلب.');
                success = true;
            }
        }
    }

    if (success) {
        // إذا نجحت العملية، نُعيد تحميل قائمة الطلبات
        // ليختفي الطلب الذي تمت معالجته
        loadPermissionRequests();
    }
}
// ===================== نهاية الإضافة =====================
    
});

}); // <-- هذا هو القوس المهم الذي كان مفقوداً ويغلق DOMContentLoaded

// --- 3. منطق تسجيل الدخول (خارج DOMContentLoaded لأنه يتعامل مع نموذج جاهز) ---
// ==================== بداية الاستبدال الكامل لمنطق الدخول ====================
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        console.log('%c--- بدأنا عملية تسجيل الدخول (النظام الجديد) ---', 'color: blue; font-weight: bold;');

        const idNumber = document.getElementById('id-number').value;
        const password = document.getElementById('password').value;
        const loginBtn = loginForm.querySelector('button[type="submit"]');

        if (!idNumber || !password) {
            return alert('الرجاء إدخال رقم الهوية وكلمة المرور.');
        }

        loginBtn.innerHTML = 'جاري التحقق...';
        loginBtn.disabled = true;

        // إنشاء الإيميل الوهمي من رقم الهوية
       const loginEmail = `${idNumber}@arknat-system.com`;

        // استخدام دالة تسجيل الدخول الرسمية من Supabase
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: loginEmail,
            password: password,
        });

        if (authError) {
            console.error('!!! فشل تسجيل الدخول:', authError.message);
            alert('رقم الهوية أو كلمة المرور غير صحيحة.');
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'تسجيل الدخول';
            return;
        }

        // إذا نجحت المصادقة، نجلب بيانات المستخدم الإضافية من جدول users
        if (authData.user) {
            const { data: userProfile, error: profileError } = await supabaseClient
                .from('users')
                .select('*')
                .eq('auth_user_id', authData.user.id) // الربط باستخدام هوية المصادقة
                .single();

            if (profileError || !userProfile) {
                console.error('!!! لم يتم العثور على ملف تعريف للمستخدم:', profileError);
                alert('حدث خطأ أثناء جلب بيانات المستخدم.');
                // نقوم بتسجيل الخروج كإجراء احترازي
                await supabaseClient.auth.signOut();
                loginBtn.disabled = false;
                loginBtn.innerHTML = 'تسجيل الدخول';
                return;
            }

            console.log('%cنجاح! تم العثور على المستخدم:', 'color: green; font-weight: bold;', userProfile);
            currentUser = userProfile;
            startPollingForDirectives(userProfile.id);
            

            // حفظ الجلسة الحقيقية (Supabase يقوم بذلك تلقائياً)
            // لم نعد بحاجة لـ sessionStorage

            updateUIVisibility(userProfile.role);
            document.getElementById('login-page').style.display = 'none';
            document.querySelector('.dashboard-container').classList.remove('hidden');

            const userProfileSpan = document.querySelector('.user-profile span');
            if (userProfileSpan) userProfileSpan.textContent = `مرحباً، ${userProfile.name}`;

            const firstVisibleLink = document.querySelector('.sidebar-nav li[style*="display: block"] a');
            if (firstVisibleLink) firstVisibleLink.click();
        }

        loginBtn.disabled = false;
        loginBtn.innerHTML = 'تسجيل الدخول';
        console.log('%c--- انتهت عملية تسجيل الدخول ---', 'color: blue; font-weight: bold;');
    });

// ==================== نهاية الاستبدال الكامل لمنطق الدخول ====================
    // ------------------------------------

// --- الخطوة 31: دالة لبناء واجهة صفحة الحضور للحارس ---
// --- الخطوة 31: دالة لبناء واجهة صفحة الحضور للحارس مع التحقق من الحالة ---


// ==================== بداية الاستبدال ====================

// ------------------------------------
}
// ------------------------------------

// --- الخطوة 33: دالة لبناء واجهة صفحة "طلباتي" للحارس ---
// --- الخطوة 35: تحديث دالة "طلباتي" بتصميم جديد ---
async function loadMyRequestsPage() {
    // 1. إعادة بناء هيكل الصفحة (هذا الجزء لا يتغير)
    const requestsContent = document.querySelector('#page-my-requests');
    requestsContent.innerHTML = `
        <div class="page-header"><h3>رفع طلب جديد</h3></div>
        <div class="requests-actions-container">
            <button class="request-action-card" data-request-type="permission" style="--card-color: #0d6efd;"><i class="ph-fill ph-clock-countdown"></i><h4>طلب استئذان</h4></button>
            <button class="request-action-card" data-request-type="leave" style="--card-color: #198754;"><i class="ph-fill ph-calendar-blank"></i><h4>طلب إجازة</h4></button>
            <button class="request-action-card" data-request-type="loan" style="--card-color: #ffc107;"><i class="ph-fill ph-hand-coins"></i><h4>طلب سلفة</h4></button>
            <button class="request-action-card" data-request-type="resignation" style="--card-color: #dc3545;"><i class="ph-fill ph-file-x"></i><h4>طلب استقالة</h4></button>
        </div>
        <div class="page-header" style="margin-top: 40px;"><h3>متابعة طلباتك السابقة</h3></div>
        <div id="past-requests-list"><p style="text-align: center; padding: 20px; color: var(--text-secondary);">جاري تحميل طلباتك...</p></div>
    `;

    // 2. الوصول إلى حاوية عرض الطلبات وقائمة الطلبات السابقة
    const pastRequestsList = document.getElementById('past-requests-list');

    // 3. التحقق من وجود مستخدم مسجل دخوله
    if (!currentUser) {
        pastRequestsList.innerHTML = '<p>الرجاء تسجيل الدخول لعرض طلباتك.</p>';
        return;
    }

    // 4. جلب الطلبات الخاصة بالمستخدم الحالي من قاعدة البيانات
    const { data: requests, error } = await supabaseClient
        .from('employee_requests')
        .select('*')
        .eq('user_id', currentUser.id) // فلترة الطلبات للمستخدم الحالي فقط
        .order('created_at', { ascending: false }); // عرض الأحدث أولاً

    if (error) {
        console.error('خطأ في جلب الطلبات:', error);
        pastRequestsList.innerHTML = '<p>حدث خطأ أثناء تحميل الطلبات.</p>';
        return;
    }

    // 5. التحقق إذا لم يكن هناك طلبات
    if (requests.length === 0) {
        pastRequestsList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">لا توجد طلبات سابقة لعرضها.</p>';
        return;
    }

    // 6. مسح رسالة التحميل وتجهيز لعرض الطلبات
    pastRequestsList.innerHTML = '';

    // 7. المرور على كل طلب وإنشاء بطاقة عرض له
    requests.forEach(request => {
        // تحديد النص واللون الخاص بحالة الطلب
        let statusClass, statusText;
        switch (request.status) {
            case 'مقبول':
                statusClass = 'approved'; statusText = 'مقبول'; break;
            case 'مرفوض':
                statusClass = 'denied'; statusText = 'مرفوض'; break;
            default:
                statusClass = 'pending'; statusText = 'معلق';
        }
        
        // ترجمة نوع الطلب للعربية
        let requestTypeText;
        switch(request.request_type) {
            case 'leave': requestTypeText = 'طلب إجازة'; break;
            case 'loan': requestTypeText = 'طلب سلفة'; break;
            case 'permission': requestTypeText = 'طلب استئذان'; break;
            case 'resignation': requestTypeText = 'طلب استقالة'; break;
            default: requestTypeText = request.request_type;
        }

        const requestCard = `
            <div class="request-card">
                <div class="request-card-header">
                    <h4>${requestTypeText}</h4>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="request-card-body">
                    <p><strong>تاريخ الطلب:</strong> ${new Date(request.created_at).toLocaleDateString('ar-SA')}</p>
                    ${request.details && request.details.reason ? `<p><strong>السبب:</strong> ${request.details.reason}</p>` : ''}
                    ${request.details && request.details.days ? `<p><strong>عدد الأيام:</strong> ${request.details.days}</p>` : ''}
                    ${request.details && request.details.amount ? `<p><strong>المبلغ:</strong> ${request.details.amount} ر.س</p>` : ''}
                </div>
                ${request.status === 'مرفوض' && request.rejection_reason ? `
                <div class="request-card-footer">
                    <strong>سبب الرفض:</strong> ${request.rejection_reason}
                </div>` : ''}
            </div>
        `;
        pastRequestsList.insertAdjacentHTML('beforeend', requestCard);
    });



// نهاية الإضافة
// ==================== بداية الإضافة ====================

// ===================== نهاية الإضافة =====================

}
// ------------------------------------
// ------------------------------------

// =========================================================================

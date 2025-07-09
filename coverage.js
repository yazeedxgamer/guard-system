// coverage.js - الكود الخاص بالصفحة الخارجية للتغطيات
// بداية الإضافة: أضف هذا الكود في أول الملف
function formatTimeAMPM(timeString) {
    if (!timeString) return 'غير محدد';
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'م' : 'ص';
    h = h % 12;
    h = h ? h : 12; // الساعة 0 تصبح 12
    const m = minutes.padStart(2, '0');
    return `${h}:${m} ${ampm}`;
}
// نهاية الإضافة
// --- 1. إعداد الاتصال مع قاعدة البيانات ---
const SUPABASE_URL = 'https://tlgyxbdjdhdjgkcndxoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZ3l4YmRqZGhkamdrY25keG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwOTU4NzMsImV4cCI6MjA2NTY3MTg3M30.fX6ek2_xIdSzu_71cmsXWweZXP6cSeFlv8NTlVFKzZg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// بداية الاستبدال
// --- 2. دالة لجلب وعرض ورديات التغطية المفتوحة (نسخة محسّنة) ---
async function fetchAndDisplayOpenShifts() {
    const container = document.getElementById('public-coverage-list');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الفرص المتاحة...</p>';

    const { data: shifts, error } = await supabaseClient
        .from('coverage_shifts')
        .select('*')
        .eq('status', 'open') 
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching coverage shifts:', error);
        container.innerHTML = '<p class="no-shifts">حدث خطأ أثناء تحميل البيانات.</p>';
        return;
    }

    if (shifts.length === 0) {
        container.innerHTML = '<p class="no-shifts">لا توجد فرص تغطية متاحة في الوقت الحالي. يرجى المحاولة لاحقاً.</p>';
        return;
    }

    container.innerHTML = '';
    shifts.forEach(shift => {
        // تنسيق الموقع والوقت بالشكل الجديد
        const displayLocation = `${shift.city || ''} - ${shift.location || ''}`;
        const displayTime = `من ${formatTimeAMPM(shift.start_time)} إلى ${formatTimeAMPM(shift.end_time)}`;

        const cardHtml = `
            <div class="contract-card">
                <div class="contract-card-header"><h4>${shift.project}</h4></div>
                <div class="contract-card-body">
                    <p><i class="ph-bold ph-map-pin"></i> <strong>الموقع:</strong> ${displayLocation}</p>
                    <p><i class="ph-bold ph-clock"></i> <strong>الوقت:</strong> ${displayTime}</p>
                    <p><i class="ph-bold ph-money"></i> <strong>قيمة التغطية:</strong> ${shift.coverage_pay} ر.س</p>
                </div>
                <div class="contract-card-footer">
                    <button class="btn btn-primary apply-now-btn" data-shift-id="${shift.id}">
                        <i class="ph-bold ph-paper-plane-tilt"></i> قدم الآن
                    </button>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
// نهاية الاستبدال

// --- 3. التعامل مع الأحداث (فتح نافذة التقديم وإرسال الطلب) ---
document.addEventListener('click', async (event) => {
    // فتح نافذة التقديم عند الضغط على "قدم الآن"
    const applyBtn = event.target.closest('.apply-now-btn');
    if (applyBtn) {
        const shiftId = applyBtn.dataset.shiftId;
        const modal = document.getElementById('apply-modal');
        document.getElementById('apply-shift-id').value = shiftId;
        modal.classList.remove('hidden');
    }

    // إغلاق النافذة
    const closeBtn = event.target.closest('.modal-close-btn');
    if (closeBtn) {
        closeBtn.closest('.modal-overlay').classList.add('hidden');
    }

    // إرسال طلب التقديم عند الضغط على "إرسال الطلب"
    const submitBtn = event.target.closest('#submit-application-btn');
    if (submitBtn) {
        const shiftId = document.getElementById('apply-shift-id').value;
        const fullName = document.getElementById('apply-full-name').value;
        const idNumber = document.getElementById('apply-id-number').value;
        const phone = document.getElementById('apply-phone').value;
        const iban = document.getElementById('apply-iban').value;

        if (!fullName || !idNumber || !phone || !iban) {
            return alert('الرجاء تعبئة جميع الحقول.');
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الإرسال...';
        
        const { error } = await supabaseClient
            .from('coverage_applicants')
            .insert({
                shift_id: shiftId,
                full_name: fullName,
                id_number: idNumber,
                phone_number: phone,
                iban: iban
            });
            
        if (error) {
            console.error('Application submission error:', error);
            alert('حدث خطأ أثناء إرسال طلبك. قد يكون رقم الهوية مسجل مسبقاً لهذه الوردية.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'إرسال الطلب';
        } else {
            alert('تم إرسال طلبك بنجاح! سيتم التواصل معك قريباً.');
            document.getElementById('apply-modal').classList.add('hidden');
        }
    }
});

// --- 4. تشغيل الدالة الرئيسية عند تحميل الصفحة ---
document.addEventListener('DOMContentLoaded', fetchAndDisplayOpenShifts);
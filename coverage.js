// =======================================================
// ===   بداية الكود الكامل والنهائي لملف coverage.js    ===
// =======================================================

function formatTimeAMPM(timeString) {
    if (!timeString) return 'غير محدد';
    const [hours, minutes] = timeString.split(':');
    let h = parseInt(hours); const ampm = h >= 12 ? 'م' : 'ص'; h = h % 12; h = h ? h : 12;
    const m = minutes.padStart(2, '0');
    return `${h}:${m} ${ampm}`;
}

const SUPABASE_URL = 'https://tlgyxbdjdhdjgkcndxoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZ3l4YmRqZGhkamdrY25keG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwOTU4NzMsImV4cCI6MjA2NTY3MTg3M30.fX6ek2_xIdSzu_71cmsXWweZXP6cSeFlv8NTlVFKzZg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAndDisplayOpenShifts() {
    const container = document.getElementById('public-coverage-list');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل فرص التغطية...</p>';
    const { data, error } = await supabaseClient.from('coverage_shifts').select('*').eq('status', 'open').order('created_at', { ascending: false });
    if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="no-shifts">لا توجد فرص تغطية متاحة حالياً.</p>'; return;
    }
    container.innerHTML = '';
    data.forEach(shift => {
        const displayLocation = `${shift.city || ''} - ${shift.location || ''}`;
        const displayTime = `من ${formatTimeAMPM(shift.start_time)} إلى ${formatTimeAMPM(shift.end_time)}`;
        container.insertAdjacentHTML('beforeend', `<div class="contract-card"><div class="contract-card-header"><h4>${shift.project}</h4></div><div class="contract-card-body"><p><i class="ph-bold ph-map-pin"></i> <strong>الموقع:</strong> ${displayLocation}</p><p><i class="ph-bold ph-clock"></i> <strong>الوقت:</strong> ${displayTime}</p><p><i class="ph-bold ph-money"></i> <strong>قيمة التغطية:</strong> ${shift.coverage_pay} ر.س</p></div><div class="contract-card-footer"><button class="btn btn-primary apply-now-btn" data-shift-id="${shift.id}"><i class="ph-bold ph-paper-plane-tilt"></i> قدم الآن</button></div></div>`);
    });
}

async function fetchAndDisplayOpenJobs() {
    const container = document.getElementById('public-jobs-list');
    container.innerHTML = '<p style="text-align: center;">جاري تحميل الوظائف...</p>';
    const { data: jobs, error } = await supabaseClient.from('job_vacancies').select('id, title, city, location, specific_location, project, base_salary, housing_allowance, transport_allowance, other_allowances').eq('status', 'open').order('created_at', { ascending: false });
    if (error || !jobs || jobs.length === 0) {
        container.innerHTML = '<p class="no-shifts">لا توجد وظائف شاغرة حالياً.</p>'; return;
    }
    container.innerHTML = '';
    jobs.forEach(job => {
        const totalSalary = (job.base_salary || 0) + (job.housing_allowance || 0) + (job.transport_allowance || 0) + (job.other_allowances || 0);
        const cityName = job.city || job.location || 'غير محدد';
        const siteName = job.specific_location || job.project;
        container.insertAdjacentHTML('beforeend', `<div class="contract-card"><div class="contract-card-header"><h4>${job.title}</h4></div><div class="contract-card-body"><p><i class="ph-bold ph-map-pin"></i> <strong>الموقع:</strong> ${cityName} - ${siteName}</p><p><i class="ph-bold ph-money"></i> <strong>الراتب الإجمالي:</strong> ${totalSalary.toLocaleString('ar-SA')} ر.س</p></div><div class="contract-card-footer"><button class="btn btn-primary apply-for-job-btn" data-job-id="${job.id}" data-job-title="${job.title}"><i class="ph-bold ph-paper-plane-tilt"></i> قدم الآن</button></div></div>`);
    });
}

document.addEventListener('click', async (event) => {
    // --- منطق النقر على التبويبات ---
    const publicTab = event.target.closest('.tabs .tab-link');
    if (publicTab) {
        event.preventDefault();
        const targetTabId = publicTab.dataset.tab;
        document.querySelectorAll('.tabs .tab-link').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        publicTab.classList.add('active');
        document.getElementById(targetTabId)?.classList.add('active');
        const jobsContainer = document.getElementById('public-jobs-list');
        if (targetTabId === 'jobs-tab' && !jobsContainer.hasChildNodes()) {
            fetchAndDisplayOpenJobs();
        }
        return;
    }

    // --- منطق فتح النوافذ ---
    const applyCoverageBtn = event.target.closest('.apply-now-btn');
    if (applyCoverageBtn) {
        document.getElementById('apply-shift-id').value = applyCoverageBtn.dataset.shiftId;
        document.getElementById('apply-modal').classList.remove('hidden');
        return;
    }

    const applyJobBtn = event.target.closest('.apply-for-job-btn');
    if (applyJobBtn) {
        document.getElementById('apply-job-id').value = applyJobBtn.dataset.jobId;
        document.getElementById('job-application-modal-title').textContent = `التقديم على وظيفة: ${applyJobBtn.dataset.jobTitle}`;
        document.getElementById('job-application-modal').classList.remove('hidden');
        return;
    }

    // --- منطق إغلاق أي نافذة ---
    const closeBtn = event.target.closest('.modal-close-btn');
    if (closeBtn) {
        closeBtn.closest('.modal-overlay').classList.add('hidden');
        return;
    }
    
    // --- منطق إرسال طلب التغطية ---
    const submitCoverageBtn = event.target.closest('#submit-application-btn');
    if(submitCoverageBtn){
        const shiftId = document.getElementById('apply-shift-id').value;
        const fullName = document.getElementById('apply-full-name').value;
        const idNumber = document.getElementById('apply-id-number').value;
        const phone = document.getElementById('apply-phone').value;
        const iban = document.getElementById('apply-iban').value;
        if (!fullName || !idNumber || !phone || !iban) return alert('الرجاء تعبئة جميع الحقول.');
        submitCoverageBtn.disabled = true;
        submitCoverageBtn.textContent = 'جاري الإرسال...';
        try {
            const { error } = await supabaseClient.from('coverage_applicants').insert({ shift_id: shiftId, full_name: fullName, id_number: idNumber, phone_number: phone, iban: iban });
            if (error) throw error;
            alert('تم إرسال طلبك بنجاح!');
            document.getElementById('apply-modal').classList.add('hidden');
        } catch(error){
            alert('حدث خطأ أثناء إرسال طلبك: ' + error.message);
        } finally {
            submitCoverageBtn.disabled = false;
            submitCoverageBtn.textContent = 'إرسال الطلب';
        }
    }
});

// منطق إرسال طلب التوظيف
document.getElementById('job-application-form')?.addEventListener('submit', async function(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('submit-job-application-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الرفع والإرسال...';
    try {
        const vacancyId = document.getElementById('apply-job-id').value;
        const idPhoto = document.getElementById('job-app-id-photo').files[0];
        const ibanCert = document.getElementById('job-app-iban-cert').files[0];
        if (!idPhoto || !ibanCert) throw new Error('الرجاء إرفاق الملفات المطلوبة.');

        const idPhotoPath = `public/${vacancyId}-${Date.now()}-id-${idPhoto.name}`;
        const ibanCertPath = `public/${vacancyId}-${Date.now()}-iban-${ibanCert.name}`;
        
        const [idUploadResult, ibanUploadResult] = await Promise.all([
            supabaseClient.storage.from('job-applications').upload(idPhotoPath, idPhoto),
            supabaseClient.storage.from('job-applications').upload(ibanCertPath, ibanCert)
        ]);
        
        if (idUploadResult.error) throw idUploadResult.error;
        if (ibanUploadResult.error) throw ibanUploadResult.error;

        const applicationData = {
            vacancy_id: vacancyId,
            applicant_data: { full_name: document.getElementById('job-app-full-name').value, id_number: document.getElementById('job-app-id-number').value, phone: document.getElementById('job-app-phone').value, iban: document.getElementById('job-app-iban').value, },
            id_photo_url: idUploadResult.data.path,
            iban_certificate_url: ibanUploadResult.data.path,
            status: 'pending_supervisor'
        };

        const { error: insertError } = await supabaseClient.from('job_applications').insert(applicationData);
        if (insertError) throw insertError;
        
        alert('تم إرسال طلب التوظيف بنجاح! سيتم مراجعته والتواصل معك.');
        document.getElementById('job-application-modal').classList.add('hidden');
        this.reset();
    } catch (error) {
        alert('حدث خطأ أثناء تقديم الطلب: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'إرسال طلب التوظيف';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // تحميل التغطيات عند فتح الصفحة لأنها التبويب الافتراضي
    fetchAndDisplayOpenShifts();
});
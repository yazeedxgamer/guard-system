document.addEventListener('DOMContentLoaded', () => {
    const runApp = async () => {
        // --- Supabase Client Setup ---
        const SUPABASE_URL = 'https://tlgyxbdjdhdjgkcndxoi.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZ3l4YmRqZGhkamdrY25keG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwOTU4NzMsImV4cCI6MjA2NTY3MTg3M30.fX6ek2_xIdSzu_71cmsXWweZXP6cSeFlv8NTlVFKzZg';
        const { createClient } = supabase;
        const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // --- State Management ---
        let state = { 
            currentGuard: null, 
            currentUser: null, 
            currentRole: null, 
            allGuardsData: [], 
            allStaffData: [], 
            allCoverageGuardsData: [], 
            activeAttendanceId: null, 
            allLeaveRequests: [],
            allContractsData: []
        };

        // --- DOM Elements Cache ---
        const dom = {
            pages: document.querySelectorAll('.page'), 
            loading: document.getElementById('loading-overlay'), 
            alertModal: document.getElementById('alert-modal'), 
            alertMessage: document.getElementById('alert-message'), 
            modalContainer: document.getElementById('modal-container'), 
            modalContents: document.querySelectorAll('.modal-content'), 
            loginTitle: document.getElementById('login-title'), 
            guardNameDisplay: document.getElementById('guard-name-display'), 
            coverageGuardNameDisplay: document.getElementById('coverage-guard-name-display'),
            adminDashboardTitle: document.getElementById('admin-dashboard-title'), 
            adminTabContent: document.getElementById('admin-tab-content'), 
            hrTabs: document.getElementById('hr-tabs'), 
            hrTabContent: document.getElementById('hr-tab-content'), 
            checkInBtn: document.getElementById('check-in-btn'), 
            checkOutBtn: document.getElementById('check-out-btn'),
            coverageGuardTabs: document.getElementById('coverage-guard-tabs'),
            coverageGuardTabContent: document.getElementById('coverage-guard-tab-content'),
            scheduleModal: { title: document.getElementById('schedule-modal-title'), body: document.getElementById('schedule-modal-body') },
            confirmModal: { title: document.getElementById('confirm-title'), message: document.getElementById('confirm-message'), okBtn: document.getElementById('confirm-ok-btn'), cancelBtn: document.getElementById('confirm-cancel-btn') },
            contractsUserNameDisplay: document.getElementById('contracts-user-name-display'),
            contractsListContainer: document.getElementById('contracts-list-container'),
            contractViewPage: document.getElementById('contract-view-page'),
            partiesSection: document.getElementById('parties-section'),
            detailsSection: document.getElementById('details-section'),
            financialsSection: document.getElementById('financials-section'),
            notesSection: document.getElementById('notes-section'),
            secondPartyName: document.getElementById('second-party-name'),
            contractFooterInfo: document.getElementById('contract-footer-info')
        };
        
        // --- UI Helper Functions ---
        const showPage = (pageId) => { dom.pages.forEach(p => p.classList.remove('active')); document.getElementById(pageId)?.classList.add('active'); };
        const showLoading = (isLoading) => dom.loading.style.display = isLoading ? 'flex' : 'none';
        const showAlert = (message) => { dom.alertMessage.textContent = message; dom.alertModal.style.display = 'flex'; };
        const showModal = (modalId) => { dom.modalContainer.style.display = 'flex'; dom.modalContents.forEach(m => m.classList.remove('active')); document.getElementById(modalId)?.classList.add('active'); };
        const closeModal = () => { dom.modalContainer.style.display = 'none'; };
        const confirmAction = (title, message) => { return new Promise((resolve) => { dom.confirmModal.title.textContent = title; dom.confirmModal.message.textContent = message; showModal('confirm-modal'); dom.confirmModal.okBtn.onclick = () => { closeModal(); resolve(true); }; dom.confirmModal.cancelBtn.onclick = () => { closeModal(); resolve(false); }; }); };
        
        const logActivity = async (actor, action, details = '') => { 
            await _supabase.from('activity_log').insert({ actor, action, details }); 
        };
        
        const formatDuration = (ms) => { 
            if (ms < 0) ms = 0; 
            const s = Math.floor(ms / 1000); 
            const h = Math.floor(s / 3600); 
            const m = Math.floor((s % 3600) / 60); 
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; 
        };
        
        const formatTime12Hour = (timeString) => {
            if (!timeString || !timeString.includes(':')) return 'غير محدد';
            const [hours, minutes] = timeString.split(':');
            const h = parseInt(hours, 10);
            const m = parseInt(minutes, 10);
            const ampm = h >= 12 ? 'مساءً' : 'صباحًا';
            const h12 = h % 12 || 12; // Convert 0 to 12
            const mPadded = m.toString().padStart(2, '0');
            return `${h12}:${mPadded} ${ampm}`;
        };

        const findNextShift = (schedule) => {
            if (!schedule) return null;
            const now = new Date();
            const daysOrder = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
            const todayIndex = now.getDay();

            // 1. Check for a shift later today
            const todayName = daysOrder[todayIndex];
            if (schedule[todayName] && schedule[todayName].start) {
                const [h, m] = schedule[todayName].start.split(':');
                const shiftTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
                if (shiftTimeToday > now) {
                    return { dayName: todayName, shiftDate: shiftTimeToday, isToday: true };
                }
            }

            // 2. Check for a shift in the next 7 days
            for (let i = 1; i <= 7; i++) {
                const nextDayIndex = (todayIndex + i) % 7;
                const nextDayName = daysOrder[nextDayIndex];
                if (schedule[nextDayName] && schedule[nextDayName].start) {
                    const [h, m] = schedule[nextDayName].start.split(':');
                    const nextShiftDate = new Date();
                    nextShiftDate.setDate(now.getDate() + i);
                    nextShiftDate.setHours(h, m, 0, 0);
                    return { dayName: nextDayName, shiftDate: nextShiftDate, isToday: false };
                }
            }

            return null; // No upcoming shift found
        };
        
        const formatRemainingTime = (futureDate) => {
            const now = new Date();
            let diff = (futureDate - now) / 1000; // difference in seconds
            
            const hours = Math.floor(diff / 3600);
            diff %= 3600;
            const minutes = Math.floor(diff / 60);

            let parts = [];
            if (hours > 0) {
                if (hours === 1) parts.push("ساعة واحدة");
                else if (hours === 2) parts.push("ساعتان");
                else parts.push(`${hours} ساعات`);
            }
            if (minutes > 0) {
                if (minutes === 1) parts.push("دقيقة واحدة");
                else if (minutes === 2) parts.push("دقيقتان");
                else parts.push(`${minutes} دقيقة`);
            }
            
            if (parts.length === 0) {
                return "أقل من دقيقة";
            }
            
            return parts.join(" و ");
        };

        const renderScheduleForm = (container, scheduleData = {}) => {
            container.innerHTML = ''; // Clear previous content
            const days = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
            days.forEach(day => {
                const daySchedule = scheduleData[day] || { start: '', end: '' };
                const row = document.createElement('div');
                row.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2 items-center';
                row.innerHTML = `
                    <label class="font-medium text-gray-300">${day}</label>
                    <input type="time" data-day="${day}" data-type="start" class="p-2 border bg-slate-700 border-slate-600 rounded-md" value="${daySchedule.start}">
                    <input type="time" data-day="${day}" data-type="end" class="p-2 border bg-slate-700 border-slate-600 rounded-md" value="${daySchedule.end}">
                `;
                container.appendChild(row);
            });
        };






        // --- Geolocation ---
        const getGeolocation = () => {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation is not supported by your browser.'));
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (position) => resolve(position.coords),
                    (error) => reject(error)
                );
            });
        };

        // --- Business Logic ---
        const calculateEntitlement = (guard, workDurationMs) => {
            if (!guard) return 0;
            const totalSalary = (guard.basic_salary || 0) + (guard.housing_allowance || 0) + (guard.transport_allowance || 0) + (guard.other_allowances || 0);
            if (totalSalary === 0) return 0;
            const dailyRate = totalSalary / 30;
            const hourlyRate = dailyRate / 8; // Standard 8-hour day
            const workHours = workDurationMs / (1000 * 60 * 60);
            const entitlement = workHours * hourlyRate;
            return parseFloat(entitlement.toFixed(2));
        };

        const getShiftForGuard = (guard, checkinTime) => {
            if (!guard || !guard.weekly_schedule) return 'غير محدد';
            const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
            const dayName = dayNames[checkinTime.getDay()];
            const schedule = guard.weekly_schedule[dayName];
            if (schedule && schedule.start && schedule.end) {
                return `${schedule.start} - ${schedule.end}`;
            }
            return 'راحة';
        };
        
        // --- Data Fetching ---
        const fetchAllGuards = async () => {
            const { data, error } = await _supabase.from('guards').select('*');
            if (error) { console.error("Failed to fetch guards data:", error); showAlert("فشل تحميل بيانات الحراس."); return []; }
            state.allGuardsData = data;
            return data;
        };

        const fetchAllStaff = async () => {
            const { data, error } = await _supabase.from('staff').select('*');
            if (error) { console.error("Failed to fetch staff data:", error); showAlert("فشل تحميل بيانات الموظفين."); return []; }
            state.allStaffData = data;
            return data;
        };

        const fetchAllCoverageGuards = async () => {
            const { data, error } = await _supabase.from('coverage_guards').select('*');
            if (error) { console.error("Failed to fetch coverage guards data:", error); showAlert("فشل تحميل بيانات حراس التغطية."); return []; }
            state.allCoverageGuardsData = data;
            return data;
        };

         const fetchAllLeaveRequests = async () => {
            const { data, error } = await _supabase.from('leave_requests').select('*').eq('status', 'Approved');
            if (error) { console.error("Failed to fetch leave requests:", error); return; }
            state.allLeaveRequests = data;
        };
        
        const fetchAllContracts = async () => {
            const { data, error } = await _supabase.from('contracts').select('*').order('created_at', { ascending: false });
             if (error) { console.error("Failed to fetch contracts:", error); showAlert("فشل تحميل بيانات العقود."); return []; }
             state.allContractsData = data;
             return data;
        };

        const getGuardStatus = (guardId) => {
            const today = new Date();
            today.setHours(0,0,0,0);
            const activeLeave = state.allLeaveRequests.find(leave => {
                const startDate = new Date(leave.created_at);
                startDate.setHours(0,0,0,0);
                const endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + leave.days_requested);
                return leave.guard_id === guardId && today >= startDate && today < endDate;
            });
            
            if (activeLeave) {
                const endDate = new Date(new Date(activeLeave.created_at).setDate(new Date(activeLeave.created_at).getDate() + activeLeave.days_requested));
                const remainingDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
                return { onLeave: true, totalDays: activeLeave.days_requested, remainingDays: remainingDays > 0 ? remainingDays : 0 };
            }
            return { onLeave: false };
        }

        // --- UI Rendering & Page Loaders ---
        const updateGuardButtonState = async (guardId) => {
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0); const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
            const { data, error } = await _supabase.from('attendance').select('id, checkout_at').eq('guard_id', guardId).gte('created_at', todayStart.toISOString()).lte('created_at', todayEnd.toISOString()).is('checkout_at', null).order('created_at', { ascending: false }).limit(1);
            if (error || !data || data.length === 0) { dom.checkInBtn.disabled = false; dom.checkOutBtn.disabled = true; state.activeAttendanceId = null; }
            else { dom.checkInBtn.disabled = true; dom.checkOutBtn.disabled = false; state.activeAttendanceId = data[0].id; }
        };
        
        const renderTable = (container, columns, data) => {
            if (!container) return;
            let tableHTML = `<div class="table-container"><table class="w-full text-right text-sm text-gray-300">
                                    <thead class="bg-slate-700 text-xs uppercase"><tr>`;
            columns.forEach(col => tableHTML += `<th class="p-3 font-bold text-gray-300 whitespace-nowrap">${col.header}</th>`);
            tableHTML += `</tr></thead><tbody class="divide-y divide-slate-700">`;
            if (!data || data.length === 0) { tableHTML += `<tr><td colspan="${columns.length}" class="text-center p-8 text-gray-400">لا توجد بيانات لعرضها.</td></tr>`; }
            else { data.forEach(row => { let rowClass = row.status === 'Approved' ? 'bg-green-500/10' : (row.status === 'Rejected' || row.status === 'Cancelled by HR' ? 'bg-red-500/10' : ''); tableHTML += `<tr id="row-${row.id}" class="${rowClass} hover:bg-slate-700/50 transition-colors duration-300">`; columns.forEach(col => { tableHTML += `<td class="p-3 break-words align-middle">${col.render(row)}</td>`; }); tableHTML += `</tr>`; }); }
            tableHTML += `</tbody></table></div>`; container.innerHTML = tableHTML;
        };

        const loadCoverageGuardDashboard = async (initialTab = 'available_coverages') => {
            showPage('coverage-guard-dashboard-page');
            dom.coverageGuardNameDisplay.textContent = state.currentGuard.name;

            const loadTabData = async (tab) => {
                showLoading(true);
                if (dom.coverageGuardTabs) {
                    dom.coverageGuardTabs.querySelectorAll('.custom-tab').forEach(t => t.classList.remove('active-tab'));
                    dom.coverageGuardTabs.querySelector(`.custom-tab[data-tab="${tab}"]`)?.classList.add('active-tab');
                }
                const contentContainer = dom.coverageGuardTabContent;
                if (!contentContainer) { showLoading(false); return; }
                contentContainer.innerHTML = '';
                let error;

                if (tab === 'available_coverages') {
                    const { data: coverages, error: covError } = await _supabase.from('coverages').select('*').eq('status', 'Available').order('coverage_date');
                    const { data: applications, error: appError } = await _supabase.from('coverage_applications').select('coverage_id').eq('guard_id', state.currentGuard.id);
                    error = covError || appError;
                    
                    if (error) {
                        showAlert('فشل تحميل التغطيات المتاحة.');
                    } else if (!coverages || coverages.length === 0) {
                        contentContainer.innerHTML = '<p class="text-center p-8 text-gray-400">لا توجد تغطيات متاحة حالياً.</p>';
                    } else {
                        const appliedCoverageIds = new Set(applications.map(app => app.coverage_id));
                        const cardsHTML = coverages.map(c => {
                            const hasApplied = appliedCoverageIds.has(c.id);
                            const shiftInfo = c.shift_details || `${c.shift_day} (${c.shift_start} - ${c.shift_end})`;
                            return `
                            <div class="coverage-card">
                                <div class="flex-grow">
                                    <h3 class="text-lg font-bold text-white">${c.project} - ${c.location}</h3>
                                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-300 mt-2">
                                        <span><i class="ph-fill ph-calendar-blank"></i> ${new Date(c.coverage_date).toLocaleDateString('ar-SA')}</span>
                                        <span><i class="ph-fill ph-clock"></i> ${shiftInfo}</span>
                                        <span class="font-bold text-green-400"><i class="ph-fill ph-money"></i> ${c.payout_amount} ريال</span>
                                    </div>
                                </div>
                                <button 
                                    class="action-btn mt-3 sm:mt-0 ${hasApplied ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} apply-for-coverage-btn" 
                                    data-coverage-id="${c.id}" 
                                    ${hasApplied ? 'disabled' : ''}>
                                    <i class="ph ph-paper-plane-tilt"></i> ${hasApplied ? 'تم التقديم' : 'تقديم'}
                                </button>
                            </div>`;
                        }).join('');
                        contentContainer.innerHTML = `<div class="space-y-4">${cardsHTML}</div>`;
                    }
                } else if (tab === 'my_coverages') {
                    const { data, error: myCovError } = await _supabase
                        .from('coverages')
                        .select('*')
                        .eq('assigned_guard_id', state.currentGuard.id)
                        .order('coverage_date');
                    error = myCovError;

                    if (error) {
                         showAlert('فشل تحميل تغطياتك.');
                    } else if (!data || data.length === 0) {
                        contentContainer.innerHTML = '<p class="text-center p-8 text-gray-400">لم يتم قبولك في أي تغطية بعد.</p>';
                    } else {
                        const cardsHTML = data.map(c => {
                            const shiftInfo = c.shift_details || `${c.shift_day} (${c.shift_start} - ${c.shift_end})`;
                            return `
                            <div class="coverage-card bg-slate-700/50">
                                <div>
                                    <h3 class="text-lg font-bold text-white">${c.project} - ${c.location}</h3>
                                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-300 mt-2">
                                        <span><i class="ph-fill ph-calendar-check"></i> ${new Date(c.coverage_date).toLocaleDateString('ar-SA')}</span>
                                        <span><i class="ph-fill ph-clock"></i> ${shiftInfo}</span>
                                        <span class="font-bold text-green-400"><i class="ph-fill ph-money"></i> ${c.payout_amount} ريال</span>
                                    </div>
                                </div>
                                <span class="font-bold text-green-400">مقبول</span>
                            </div>`;
                        }).join('');
                         contentContainer.innerHTML = `<div class="space-y-4">${cardsHTML}</div>`;
                    }
                }
                showLoading(false);
            };
            
            if (dom.coverageGuardTabs) {
                dom.coverageGuardTabs.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tabLink = e.target.closest('.custom-tab');
                    if (tabLink) {
                        loadTabData(tabLink.dataset.tab);
                    }
                });
            }
            loadTabData(initialTab);
        };
        
        const loadContractsDashboard = async () => {
    showPage('contracts-dashboard-page');
    dom.contractsUserNameDisplay.textContent = state.currentUser.name;
    showLoading(true);
    await fetchAllContracts();
    
    const renderContracts = (filterText = '') => {
       const filteredContracts = state.allContractsData.filter(c => 
           c.company_name.toLowerCase().includes(filterText) ||
           (c.project && c.project.toLowerCase().includes(filterText))
       );

       const container = dom.contractsListContainer;
       if (!container) return;
       
       if (!filteredContracts || filteredContracts.length === 0) {
           container.innerHTML = '<p class="text-center p-8 text-gray-400">لا توجد عقود تطابق بحثك.</p>';
           return;
       }
       
       const statusStyles = {
           'نشط': 'bg-green-500/20 text-green-400',
           'منتهي': 'bg-red-500/20 text-red-400',
           'متوقف': 'bg-yellow-500/20 text-yellow-400'
       };

       const contractsHTML = filteredContracts.map(contract => `
           <div class="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4 mb-3">
               <div class="flex-grow">
                   <h3 class="text-lg font-bold text-white">عقد ${contract.company_name}</h3>
                   <p class="text-sm text-gray-400">${contract.project || 'بدون مشروع'}</p>
               </div>
               <div class="flex items-center gap-4">
                  <span class="text-sm font-bold px-3 py-1 rounded-full ${statusStyles[contract.status] || 'bg-gray-500/20 text-gray-400'}">
                      ${contract.status}
                  </span>
                  <button class="action-btn bg-yellow-500 hover:bg-yellow-600 edit-contract-btn" data-contract-id="${contract.id}">
                      <i class="ph ph-pencil-simple"></i> تعديل
                  </button>
                   <button class="action-btn bg-blue-600 hover:bg-blue-700 view-contract-btn" data-contract-id="${contract.id}">
                       <i class="ph ph-eye"></i> عرض
                   </button>
               </div>
           </div>
       `).join('');

       container.innerHTML = contractsHTML;
    }

    renderContracts();
    document.getElementById('search-contracts').addEventListener('input', (e) => {
       renderContracts(e.target.value.toLowerCase());
    });

    showLoading(false);
};



        const loadAdminDashboard = async (initialTab = 'attendance') => {
    showPage('admin-dashboard-page');
    const role = state.currentRole;
    dom.adminDashboardTitle.textContent = {admin: 'لوحة تحكم المشرف', operations: 'لوحة تحكم العمليات'}[role];
    
    const adminHeaderActions = document.getElementById('admin-header-actions');
    adminHeaderActions.innerHTML = ''; 
    if (role === 'admin') {
         adminHeaderActions.insertAdjacentHTML('afterbegin', `<button id="transfer-request-btn" class="header-btn bg-purple-600 hover:bg-purple-700">رفع نقل حارس</button>`);
    }
     adminHeaderActions.insertAdjacentHTML('beforeend', `<button id="admin-export-csv-btn" class="header-btn bg-blue-600 hover:bg-blue-700">تصدير CSV</button>
                                                         <button class="logout-btn header-btn bg-red-600 hover:bg-red-700">تسجيل الخروج</button>`);

    const tabsContainer = document.getElementById('admin-ops-tabs');
    tabsContainer.innerHTML = '';
    const availableTabs = {
        attendance: { label: 'الحضور اليومي', roles: ['admin', 'operations'] },
        permissions: { label: 'طلبات الإستئذان', roles: ['admin', 'operations'] },
        overtime: { label: 'طلبات العمل الإضافي', roles: ['admin', 'operations'] },
        transfers: { label: 'طلبات النقل', roles: ['operations'] },
        // --- Tabs moved from HR to Operations ---
        coverage_recruitment: { label: 'توظيف تغطيات', roles: ['operations'] },
        coverage_sites: { label: 'إدارة التغطيات', roles: ['operations'] },
        coverage_applicants: { label: 'مقدمين التغطيات', roles: ['operations'] }
    };
    Object.entries(availableTabs).forEach(([key, tabInfo]) => {
        if (tabInfo.roles.includes(role)) {
            tabsContainer.innerHTML += `<a href="#" data-tab="${key}" class="custom-tab">${tabInfo.label}</a>`;
        }
    });
    
    const loadTabData = async (tab) => {
        showLoading(true);
        document.querySelectorAll('#admin-ops-tabs .custom-tab').forEach(t => t.classList.remove('active-tab'));
        document.querySelector(`#admin-ops-tabs .custom-tab[data-tab="${tab}"]`)?.classList.add('active-tab');
        const contentContainer = dom.adminTabContent;
        contentContainer.innerHTML = '';
        let columns, data, error;
        await fetchAllGuards();
        await fetchAllStaff();
        await fetchAllCoverageGuards(); // Fetch coverage data for the new tabs
        
        const tableId = `admin-table-${tab}`;
        const hasAddButton = ['coverage_recruitment', 'coverage_sites'].includes(tab);
        let addButtonHTML = '';
        if(hasAddButton) {
            const btnInfo = {
                coverage_recruitment: { id: 'add-coverage-guard-btn', text: 'إضافة حارس تغطية' },
                coverage_sites: { id: 'add-coverage-site-btn', text: 'إنشاء تغطية جديدة' }
            };
            addButtonHTML = `<div class="mb-4"><button id="${btnInfo[tab].id}" class="header-btn bg-blue-600 hover:bg-blue-700">${btnInfo[tab].text}</button></div>`;
        }

        contentContainer.innerHTML = `${addButtonHTML}<div id="${tableId}"></div>`;
        const tableContainer = contentContainer.querySelector(`#${tableId}`);
        document.getElementById('admin-export-csv-btn').dataset.targetTable = `#${tableId} table`;

        switch(tab) {
            case 'attendance':
                ({ data, error } = await _supabase.from('attendance').select('*').order('created_at', { ascending: false }));
                const fullData = data.map(att => ({ ...att, guard: state.allGuardsData.find(g => g.id === att.guard_id) }));
                columns = [
                    { header: 'اسم الحارس', render: r => r.guard_name },
                    { header: 'وقت الحضور', render: r => new Date(r.created_at).toLocaleString('ar-SA') },
                    { header: 'الوردية', render: r => r.guard ? getShiftForGuard(r.guard, new Date(r.created_at)) : 'غير محدد' },
                    { header: 'لوكيشن الحضور', render: r => r.checkin_lat ? `<button class="action-btn bg-blue-500 view-map-btn" data-lat="${r.checkin_lat}" data-lon="${r.checkin_lon}"><i class="ph ph-map-pin"></i> عرض الخريطة</button>` : 'لم يسجل' },
                    { header: 'الحالة', render: r => {
                        if (!r.checkout_at) {
                            return `<div class="flex items-center gap-2"><span class="on-duty-status">في موقع العمل</span> 
                                      <button class="action-btn bg-yellow-600 hover:bg-yellow-700 supervisor-checkout-btn" data-attendance-id="${r.id}" data-guard-id="${r.guard_id}">
                                          <i class="ph ph-sign-out"></i> خروج
                                      </button>
                                    </div>`;
                        }
                        return `<span>تم الانصراف (${r.work_duration})</span>`;
                    }},
                    { header: 'لوكيشن الانصراف', render: r => r.checkout_lat ? `<button class="action-btn bg-blue-500 view-map-btn" data-lat="${r.checkout_lat}" data-lon="${r.checkout_lon}"><i class="ph ph-map-pin"></i> عرض الخريطة</button>` : 'لم يسجل' },
                    { header: 'الإجراء', render: r => {
                          const statusMap = { Approved: 'معتمد', Cancelled: 'ملغي' };
                          if(statusMap[r.status]) {
                               let button = '';
                               if (role === 'operations') {
                                   button = `<button class="action-btn bg-orange-600 hover:bg-orange-700 modify-attendance-btn" data-id="${r.id}"><i class="ph ph-pencil-simple"></i> تعديل</button>`
                               }
                               return `<div class="flex items-center gap-2"><span class="font-bold ${r.status === 'Approved' ? 'text-green-400' : 'text-red-400'}">${statusMap[r.status]}</span> ${button}</div>
                                        <span class="text-xs text-gray-400 block">بواسطة: ${r.action_by || '-'}</span>`;
                          }
                          return `<div class="flex gap-2">
                                      <button class="action-btn bg-green-600 hover:bg-green-700 approve-attendance-btn" data-id="${r.id}"><i class="ph ph-check-circle"></i> اعتماد</button>
                                      <button class="action-btn bg-red-600 hover:bg-red-700 cancel-attendance-btn" data-id="${r.id}"><i class="ph ph-x-circle"></i> إلغاء</button>
                                  </div>`;
                    }}
                ];
                renderTable(tableContainer, columns, fullData);
                break;
            
            case 'permissions':
            case 'overtime':
                const requestType = tab === 'permissions' ? 'permission_requests' : 'overtime_requests';
                ({ data, error } = await _supabase.from(requestType).select('*').order('created_at', { ascending: false }));
                 columns = [
                    { header: 'اسم الحارس', render: r => r.guard_name },
                    { header: 'السبب', render: r => r.reason },
                    { header: 'تاريخ الطلب', render: r => new Date(r.created_at).toLocaleString('ar-SA') },
                    { header: 'الحالة', render: r => {
                        if(r.status !== 'Pending') {
                            return `<span class="font-bold ${r.status === 'Approved' ? 'text-green-400' : 'text-red-400'}">${r.status === 'Approved' ? 'معتمد' : 'مرفوض'}</span>
                                    <span class="text-xs text-gray-400 block">بواسطة: ${r.processed_by || '-'}</span>`;
                        }
                        if(['admin', 'operations'].includes(role)) {
                           return `<div class="flex gap-2">
                                       <button class="action-btn bg-green-600 hover:bg-green-700 approve-request-btn" data-id="${r.id}" data-type="${requestType}"><i class="ph ph-check"></i> موافقة</button>
                                       <button class="action-btn bg-red-600 hover:bg-red-700 reject-request-btn" data-id="${r.id}" data-type="${requestType}"><i class="ph ph-x"></i> رفض</button>
                                   </div>`;
                        }
                        return '<span class="text-yellow-400">معلق</span>';
                    }}
                ];
                renderTable(tableContainer, columns, data);
                break;
            
            case 'transfers':
                 ({ data, error } = await _supabase.from('transfer_requests').select('*').order('created_at', { ascending: false }));
                 columns = [
                    { header: 'اسم الحارس', render: r => r.guard_name },
                    { header: 'من مشروع', render: r => r.current_project },
                    { header: 'إلى موقع', render: r => r.new_location },
                    { header: 'إلى مشروع', render: r => r.new_project },
                    { header: 'السبب', render: r => r.reason },
                    { header: 'مقدم الطلب', render: r => r.from_supervisor_name },
                    { header: 'الحالة', render: r => {
                        if(r.status !== 'Pending') {
                            return `<span class="font-bold ${r.status === 'Approved' ? 'text-green-400' : 'text-red-400'}">${r.status === 'Approved' ? 'معتمد' : 'مرفوض'}</span>
                                    <span class="text-xs text-gray-400 block">بواسطة: ${r.processed_by || '-'}</span>
                                    ${r.rejection_reason ? `<span class="text-xs text-red-300 block">سبب الرفض: ${r.rejection_reason}</span>` : ''}
                                    `;
                        }
                        return `<div class="flex gap-2">
                                    <button class="action-btn bg-green-600 hover:bg-green-700 approve-transfer-btn" data-id="${r.id}" data-guard-id="${r.guard_id}" data-location="${r.new_location}" data-project="${r.new_project}"><i class="ph ph-check"></i> موافقة</button>
                                    <button class="action-btn bg-red-600 hover:bg-red-700 reject-request-btn" data-id="${r.id}" data-type="transfer_requests"><i class="ph ph-x"></i> رفض</button>
                                </div>`;
                    }}
                       ];
                       renderTable(tableContainer, columns, data);
                       break;
            // --- Logic moved from HR to Operations ---
            case 'coverage_recruitment':
                data = state.allCoverageGuardsData;
                columns = [
                    { header: 'الاسم', render: r => r.name },
                    { header: 'رقم الهوية', render: r => r.id },
                    { header: 'رقم الجوال', render: r => r.mobile_number || '-' },
                    { header: 'الإجراءات', render: r => `<div class="flex gap-2">
                        <button class="action-btn bg-yellow-500 hover:bg-yellow-600 edit-coverage-guard-btn" data-guard-id="${r.id}"><i class="ph ph-pencil-simple"></i> تعديل</button>
                        <button class="action-btn bg-red-600 hover:bg-red-700 delete-coverage-guard-btn" data-guard-id="${r.id}" data-guard-name="${r.name}"><i class="ph ph-trash"></i> حذف</button>
                        </div>` }
                ];
                renderTable(tableContainer, columns, data);
                break;
            case 'coverage_sites':
                const { data: covSites, error: covSitesErr } = await _supabase.from('coverages').select('*').order('coverage_date', { ascending: false });
                if(covSitesErr) showAlert('فشل تحميل التغطيات.');
                else {
                    columns = [
                        { header: 'المشروع', render: r => r.project },
                        { header: 'الموقع', render: r => r.location },
                        { header: 'التاريخ', render: r => new Date(r.coverage_date).toLocaleDateString('ar-SA') },
                        { header: 'الوردية', render: r => r.shift_details },
                        { header: 'المبلغ', render: r => `${r.payout_amount} ريال` },
                        { header: 'الحالة', render: r => r.status === 'Available' ? 'متاحة' : `مأخوذة (${r.assigned_guard_name || 'غير محدد'})` },
                        { header: 'الإجراءات', render: r => `<div class="flex gap-2">
                            <button class="action-btn bg-yellow-500 hover:bg-yellow-600 edit-coverage-site-btn" data-site-id="${r.id}"><i class="ph ph-pencil-simple"></i> تعديل</button>
                            <button class="action-btn bg-red-600 hover:bg-red-700 delete-coverage-site-btn" data-site-id="${r.id}"><i class="ph ph-trash"></i> حذف</button>
                            </div>` }
                    ];
                    renderTable(tableContainer, columns, covSites);
                }
                break;
            case 'coverage_applicants':
                const { data: apps, error: appsErr } = await _supabase
                    .from('coverage_applications')
                    .select('*, coverage_guards(*), coverages(*)')
                    .eq('status', 'Pending');
                if (appsErr) showAlert('فشل تحميل طلبات التقديم.');
                else {
                     columns = [
                        { header: 'اسم الحارس', render: r => r.coverage_guards.name },
                        { header: 'رقم الهوية', render: r => r.coverage_guards.id },
                        { header: 'تفاصيل التغطية', render: r => `${r.coverages.project} - ${r.coverages.location} (${new Date(r.coverages.coverage_date).toLocaleDateString('ar-SA')})` },
                        { header: 'ملاحظات', render: r => r.notes || '-' },
                        { header: 'الإجراءات', render: r => `<div class="flex gap-2">
                            <button class="action-btn bg-green-600 hover:bg-green-700 accept-coverage-app-btn" data-app-id="${r.id}" data-coverage-id="${r.coverage_id}" data-guard-id="${r.guard_id}" data-guard-name="${r.coverage_guards.name}"><i class="ph ph-check"></i> قبول</button>
                            <button class="action-btn bg-red-600 hover:bg-red-700 reject-coverage-app-btn" data-app-id="${r.id}"><i class="ph ph-x"></i> رفض</button>
                            <button class="action-btn bg-gray-600 hover:bg-gray-700 delete-coverage-app-btn" data-app-id="${r.id}"><i class="ph ph-trash"></i> حذف</button>
                            </div>` }
                    ];
                    renderTable(tableContainer, columns, apps);
                }
                break;
        }
        if(error) showAlert('فشل تحميل البيانات.');
        showLoading(false);
    };
    
    tabsContainer.addEventListener('click', (e) => {
        e.preventDefault();
        const tabLink = e.target.closest('.custom-tab');
        if (tabLink) {
            loadTabData(tabLink.dataset.tab);
        }
    });

    const firstAvailableTab = Object.keys(availableTabs).find(key => availableTabs[key].roles.includes(role));
    loadTabData(initialTab in availableTabs && availableTabs[initialTab].roles.includes(role) ? initialTab : firstAvailableTab);
};


        const loadHrDashboard = async (view = null) => {
            showPage('hr-dashboard-page');
            const menuView = document.getElementById('hr-menu-view');
            const contentView = document.getElementById('hr-content-view');
            const headerContent = document.getElementById('hr-header-content');
            const headerActions = document.getElementById('hr-header-actions');

            const menuItems = {
                guards: { label: 'إدارة الحراس', icon: 'ph-users-three' },
                salaries: { label: 'الرواتب', icon: 'ph-money' },
                leaves: { label: 'طلبات الإجازات', icon: 'ph-calendar-plus', table: 'leave_requests' },
                loans: { label: 'طلبات السلف', icon: 'ph-hand-coins', table: 'loan_requests' },
                resignations: { label: 'طلبات الاستقالات', icon: 'ph-door-open', table: 'resignation_requests' },
                transfers: { label: 'طلبات النقل', icon: 'ph-arrows-left-right', table: 'transfer_requests' },
                hr_staff: { label: 'موظفو الموارد البشرية', icon: 'ph-user-list' },
                supervisors: { label: 'المشرفون', icon: 'ph-user-shield' },
                operations: { label: 'موظفو العمليات', icon: 'ph-chart-line-up' },
                contracts_staff: { label: 'موظفو العقود', icon: 'ph-file-text' },
            };
            
            // --- دالة لإضافة أو تحديث شارة التنبيه ---
            const updateNotificationBadge = (viewKey, count) => {
                const menuItemElem = document.querySelector(`#hr-menu-grid [data-view="${viewKey}"]`);
                if (!menuItemElem) return;

                let badge = menuItemElem.querySelector('.notification-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'notification-badge absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center';
                    menuItemElem.style.position = 'relative'; // Important for positioning
                    menuItemElem.appendChild(badge);
                }
                
                if (count > 0) {
                    badge.textContent = count > 9 ? '9+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            };
            
            const renderMenu = async () => {
                const menuGrid = document.getElementById('hr-menu-grid');
                menuGrid.innerHTML = '';
                Object.entries(menuItems).forEach(([key, item]) => {
                    const card = document.createElement('div');
                    card.className = 'dashboard-action-btn h-32 text-base cursor-pointer';
                    card.dataset.view = key;
                    card.innerHTML = `<i class="ph-fill ${item.icon} text-4xl text-blue-400"></i><span class="font-bold text-white">${item.label}</span>`;
                    card.onclick = () => loadHrDashboard(key);
                    menuGrid.appendChild(card);
                });

                // --- جلب عدد التنبيهات الأولية عند تحميل القائمة ---
                for (const key in menuItems) {
                    if (menuItems[key].table) {
                        const { count, error } = await _supabase.from(menuItems[key].table).select('*', { count: 'exact', head: true }).eq('is_seen', false);
                        if (!error && count > 0) {
                            updateNotificationBadge(key, count);
                        }
                    }
                }
            };
            
            if (!view) {
                menuView.classList.remove('hidden');
                contentView.classList.add('hidden');
                headerContent.innerHTML = `<h2 class="text-xl sm:text-2xl font-bold text-white">لوحة تحكم الموارد البشرية</h2>`;
                headerActions.innerHTML = `<button class="logout-btn header-btn bg-red-600 hover:bg-red-700">تسجيل الخروج</button>`;
                await renderMenu();
                showLoading(false);
                return;
            }

            // --- عرض المحتوى المحدد وتحديث التنبيهات ---
            showLoading(true);

            // --- [مهم] تحديث الطلبات إلى "مقروءة" عند عرضها ---
            if (menuItems[view] && menuItems[view].table) {
                await _supabase.from(menuItems[view].table).update({ is_seen: true }).eq('is_seen', false);
                updateNotificationBadge(view, 0); // تصفير التنبيه في الواجهة
            }

            menuView.classList.add('hidden');
            contentView.classList.remove('hidden');

            // ... (باقي الكود الخاص بعرض الجداول كما هو في تعديلك الأخير)
            // The rest of your table-rendering logic remains unchanged.
            // I'm providing the full function here again for completeness.

            headerContent.innerHTML = `
                <div class="flex items-center gap-4">
                    <button id="hr-back-to-menu" class="header-btn bg-slate-600 hover:bg-slate-500 p-2 rounded-full"><i class="ph-bold ph-arrow-left text-xl"></i></button>
                    <h2 class="text-xl sm:text-2xl font-bold text-white">${menuItems[view].label}</h2>
                </div>`;
            document.getElementById('hr-back-to-menu').onclick = () => loadHrDashboard();
            
            const tableId = `hr-table-${view}`;
            const hasAddButton = ['guards', 'hr_staff', 'supervisors', 'operations', 'contracts_staff'].includes(view);
            let addButtonHTML = '';
            if (hasAddButton) {
                const btnInfo = { guards: { id: 'add-guard-btn', text: 'إضافة حارس جديد', role: '' }, hr_staff: { id: 'add-staff-btn', text: 'إضافة موظف موارد بشرية', role: 'hr' }, supervisors: { id: 'add-staff-btn', text: 'إضافة مشرف جديد', role: 'admin' }, operations: { id: 'add-staff-btn', text: 'إضافة موظف عمليات', role: 'operations' }, contracts_staff: { id: 'add-staff-btn', text: 'إضافة موظف عقود', role: 'contracts' }};
                addButtonHTML = `<div class="mb-4"><button id="${btnInfo[view].id}" data-role="${btnInfo[view].role}" class="header-btn bg-green-600 hover:bg-green-700 flex items-center gap-2"><i class="ph ph-plus-circle"></i> ${btnInfo[view].text}</button></div>`;
            }
            contentView.innerHTML = `${addButtonHTML}<div id="${tableId}"></div>`;
            const tableContainer = document.getElementById(tableId);

            headerActions.innerHTML = `<button id="hr-export-csv-btn" data-target-table="#${tableId} table" class="header-btn bg-blue-600 hover:bg-blue-700">تصدير CSV</button>
                                     <button class="logout-btn header-btn bg-red-600 hover:bg-red-700">تسجيل الخروج</button>`;

            await Promise.all([fetchAllGuards(), fetchAllLeaveRequests(), fetchAllStaff()]);
            let columns, data;

            switch(view) {
                case 'guards':
                    columns = [ { header: 'الاسم', render: r => r.name }, { header: 'رقم الهوية', render: r => r.id }, { header: 'الجوال', render: r => r.mobile_number || '-' }, { header: 'المشروع', render: r => r.project || r.location || '-' }, { header: 'الإجراءات', render: r => `<div class="flex gap-2 flex-wrap justify-start"><button class="action-btn bg-yellow-500 hover:bg-yellow-600 edit-guard-btn" data-guard-id="${r.id}"><i class="ph ph-pencil-simple"></i> تعديل</button><button class="action-btn bg-indigo-500 hover:bg-indigo-600 view-schedule-btn" data-guard-id="${r.id}"><i class="ph ph-calendar"></i> الجدول</button><button class="action-btn bg-red-600 hover:bg-red-700 delete-guard-btn" data-guard-id="${r.id}" data-guard-name="${r.name}"><i class="ph ph-trash"></i> حذف</button></div>` }];
                    renderTable(tableContainer, columns, state.allGuardsData);
                    break;
                case 'salaries':
                    const { data: attendanceData } = await _supabase.from('attendance').select('guard_id, created_at').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
                    const { data: financialData } = await _supabase.from('financial_transactions').select('*');
                    data = state.allGuardsData.map(guard => {
                        const totalSalary = (guard.basic_salary || 0) + (guard.housing_allowance || 0) + (guard.transport_allowance || 0) + (guard.other_allowances || 0);
                        const dailyRate = totalSalary > 0 ? totalSalary / 30 : 0; let absenceDays = 0; let absenceDeduction = 0;
                        if (guard.weekly_schedule && dailyRate > 0) {
                            const today = new Date(); const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                            for (let d = new Date(startOfMonth); d <= today; d.setDate(d.getDate() + 1)) {
                                const dayName = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][d.getDay()];
                                const isWorkDay = guard.weekly_schedule[dayName] && guard.weekly_schedule[dayName].start;
                                if (isWorkDay) {
                                    const hasAttended = attendanceData.some(att => att.guard_id == guard.id && new Date(att.created_at).toDateString() === d.toDateString());
                                    const isOnLeave = state.allLeaveRequests.some(l => l.guard_id == guard.id && d >= new Date(l.created_at) && d < new Date(new Date(l.created_at).setDate(new Date(l.created_at).getDate() + l.days_requested)));
                                    if (!hasAttended && !isOnLeave) absenceDays++;
                                }
                            }
                            absenceDeduction = absenceDays * dailyRate;
                        }
                        const guardTransactions = financialData.filter(t => t.guard_id == guard.id);
                        const totalDeductions = guardTransactions.filter(t => t.type === 'deduction').reduce((sum, t) => sum + t.amount, 0) + absenceDeduction;
                        const totalAdditions = guardTransactions.filter(t => t.type === 'addition').reduce((sum, t) => sum + t.amount, 0);
                        return { ...guard, totalSalary, absenceDays, totalDeductions: totalDeductions.toFixed(2), totalAdditions: totalAdditions.toFixed(2), netSalary: (totalSalary - totalDeductions + totalAdditions).toFixed(2) };
                    });
                    columns = [ { header: 'اسم الحارس', render: r => r.name }, { header: 'الراتب الإجمالي', render: r => r.totalSalary.toFixed(2) }, { header: 'أيام الغياب', render: r => r.absenceDays }, { header: 'الخصومات والإضافات', render: r => `<div><span class="text-red-400">خصم: ${r.totalDeductions}</span><br><span class="text-green-400">إضافة: ${r.totalAdditions}</span></div>` }, { header: 'صافي الراتب', render: r => `<span class="font-bold text-lg">${r.netSalary}</span>` }, { header: 'الإجراءات', render: r => `<div class="flex gap-2"><button class="action-btn bg-red-500 hover:bg-red-600 financial-btn" data-guard-id="${r.id}" data-type="deduction"><i class="ph ph-minus-circle"></i></button><button class="action-btn bg-green-500 hover:bg-green-600 financial-btn" data-guard-id="${r.id}" data-type="addition"><i class="ph ph-plus-circle"></i></button></div>` }];
                    renderTable(tableContainer, columns, data);
                    break;
                case 'leaves': case 'loans': case 'resignations': case 'transfers':
                    const requestMap = { leaves: 'leave_requests', loans: 'loan_requests', resignations: 'resignation_requests', transfers: 'transfer_requests' };
                    const { data: requestData } = await _supabase.from(requestMap[view]).select('*').order('created_at', { ascending: false });
                    columns = [ { header: 'اسم الحارس', render: r => r.guard_name }, { header: 'تفاصيل الطلب', render: r => r.reason || `مبلغ ${r.amount_requested || ''}` || `${r.days_requested || ''} يوم` || `نقل إلى ${r.new_location}` }, { header: 'تاريخ الطلب', render: r => new Date(r.created_at).toLocaleString('ar-SA') }, { header: 'الحالة', render: r => { if(r.status !== 'Pending') { const statusText = r.status === 'Approved' ? 'معتمد' : (r.status === 'Cancelled by HR' ? 'تم قطعها' : 'مرفوض'); const statusColor = r.status === 'Approved' ? 'text-green-400' : 'text-red-400'; return `<span class="font-bold ${statusColor}">${statusText}</span><br><span class="text-xs text-gray-400">بواسطة: ${r.processed_by || '-'}</span>`; } return `<div class="flex gap-2"><button class="hr-action-btn action-btn bg-green-600" data-id="${r.id}" data-table="${requestMap[view]}" data-action="Approved">موافقة</button><button class="hr-action-btn action-btn bg-red-600" data-id="${r.id}" data-table="${requestMap[view]}" data-action="Rejected">رفض</button></div>`; } }, { header: 'إجراءات إضافية', render: r => { if(r.status === 'Approved' && view === 'leaves') { return `<button class="action-btn bg-orange-600 cancel-leave-btn" data-id="${r.id}" data-table="leave_requests">قطع الإجازة</button>`; } if(r.status !== 'Pending') { return `<button class="action-btn bg-gray-600 delete-record-btn" data-id="${r.id}" data-table="${requestMap[view]}">حذف السجل</button>`; } return ''; } } ];
                    renderTable(tableContainer, columns, requestData || []);
                    break;
                case 'hr_staff': case 'supervisors': case 'operations': case 'contracts_staff':
                    const roleMap = { hr_staff: 'hr', supervisors: 'admin', operations: 'operations', contracts_staff: 'contracts' };
                    data = state.allStaffData.filter(s => s.role === roleMap[view]);
                    columns = [ { header: 'الاسم', render: r => r.name }, { header: 'اسم المستخدم', render: r => r.username }, { header: 'المسمى الوظيفي', render: r => r.job_title || '-' }, { header: 'الإجراءات', render: r => `<div class="flex gap-2"><button class="action-btn bg-yellow-500 edit-staff-btn" data-staff-id="${r.id}">تعديل</button><button class="action-btn bg-red-600 delete-staff-btn" data-staff-id="${r.id}" data-staff-name="${r.name}">حذف</button></div>` }];
                    renderTable(tableContainer, columns, data);
                    break;
            }
            showLoading(false);
        };


        const logout = () => { sessionStorage.clear(); state = { currentGuard: null, currentUser: null, currentRole: null, allGuardsData: [], activeAttendanceId: null, allContractsData: [] }; showPage('landing-page'); };
        const setupRealtimeNotifications = () => {
            console.log('Setting up realtime notifications...');
            const tablesToWatch = ['leave_requests', 'loan_requests', 'resignation_requests', 'transfer_requests'];
            
            const channel = _supabase.channel('hr-requests-channel');

            channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: '*' }, async (payload) => {
                // Check if the insert happened on one of the tables we care about
                if (tablesToWatch.includes(payload.table)) {
                    console.log(`New request in ${payload.table}:`, payload.new);
                    
                    // Find the menu key associated with this table
                    const menuKey = Object.keys(menuItems).find(key => menuItems[key].table === payload.table);
                    if (menuKey) {
                        // Fetch the new total count of unseen items
                        const { count, error } = await _supabase.from(payload.table).select('*', { count: 'exact', head: true }).eq('is_seen', false);
                        if (!error) {
                            // Find the updateNotificationBadge function inside loadHrDashboard
                            // This is a bit of a workaround to access the function
                            const dashboardElement = document.getElementById('hr-dashboard-page');
                            if(dashboardElement.classList.contains('active')) {
                                // If the dashboard is active, we can likely find the function
                                // or simply re-call the menu rendering part.
                                // For simplicity and robustness, we just update the badge directly.
                                const menuItemElem = document.querySelector(`#hr-menu-grid [data-view="${menuKey}"]`);
                                if(menuItemElem){
                                     let badge = menuItemElem.querySelector('.notification-badge');
                                     if (!badge) {
                                         badge = document.createElement('div');
                                         badge.className = 'notification-badge absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center';
                                         menuItemElem.style.position = 'relative';
                                         menuItemElem.appendChild(badge);
                                     }
                                     badge.textContent = count > 9 ? '9+' : count;
                                     badge.classList.remove('hidden');
                                }
                            }
                        }
                    }
                }
            }).subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Successfully subscribed to HR requests channel!');
                }
            });
        };
        const checkSession = () => {
            const guard = sessionStorage.getItem('arkanatGuard'); 
            const user = sessionStorage.getItem('arkanatUser');
            const role = sessionStorage.getItem('arkanatRole');
            const coverageGuard = sessionStorage.getItem('arkanatCoverageGuard');

            if (coverageGuard) {
                state.currentGuard = JSON.parse(coverageGuard);
                state.currentRole = 'coverage_guard';
                loadCoverageGuardDashboard();
            } else if (guard) { 
                state.currentGuard = JSON.parse(guard); 
                dom.guardNameDisplay.textContent = state.currentGuard.name; 
                showPage('guard-dashboard-page'); 
                updateGuardButtonState(state.currentGuard.id); 
            } else if (user && role) { 
                state.currentUser = JSON.parse(user); 
                state.currentRole = role; 
                if (role === 'hr') {
                    setupRealtimeNotifications(); // <-- أضف هذا السطر هنا
                    loadHrDashboard(); 
                } else if (role === 'contracts') {
                    loadContractsDashboard();
                } else {
                    loadAdminDashboard(); 
                }
            } else { 
                showPage('landing-page'); 
            }
        };

        // --- Contract View Renderer ---
        const loadContractView = (contract) => {
            if (!contract) return;

            const formatDate = (dateString) => {
                if (!dateString) return 'غير محدد';
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                return new Date(dateString).toLocaleDateString('ar-SA-u-nu-latn', options);
            };

            const formatCurrency = (num) => {
                if (num === null || num === undefined) return 'غير محدد';
                return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(num);
            };

            const contractBody = document.getElementById('contract-body');
            if (!contractBody) {
                console.error("Critical Error: #contract-body element not found.");
                return;
            }

            // Clear previous dynamic content
            contractBody.innerHTML = '';
            
            // --- Create and append sections dynamically ---

            // 1. Parties Section
            const partiesDiv = document.createElement('div');
            partiesDiv.id = "parties-section";
            partiesDiv.innerHTML = `
                <p class="mb-4">
                    تم إبرام هذا العقد في يوم ${formatDate(new Date())} بمدينة الرياض، المملكة العربية السعودية، بين كل من:
                </p>
                <ol class="list-decimal list-inside space-y-4">
                    <li>
                        <strong>الطرف الأول:</strong> شركة اركانات للحراسات الأمنية، سجل تجاري رقم (123456789)، ويمثلها في هذا العقد السيد/ يزيد الصايل، بصفته المدير العام.
                    </li>
                    <li>
                        <strong>الطرف الثاني:</strong> شركة ${contract.company_name}، ويمثلها في هذا العقد السيد/ (اسم الممثل)، بصفته (المنصب).
                    </li>
                </ol>
                <p class="mt-4">يشار إليهما فيما بعد بـ "الطرفين".</p>
            `;
            contractBody.appendChild(partiesDiv);

            // 2. Details Section
            const detailsDiv = document.createElement('div');
            detailsDiv.id = "details-section";
            detailsDiv.innerHTML = `
                <h3 class="text-xl font-bold mb-4 text-center border-t border-slate-200 pt-8">تفاصيل الخدمة</h3>
                <ul class="space-y-3">
                    <li class="flex justify-between border-b pb-2"><strong>الخدمة المقدمة:</strong> <span>توفير خدمات حراسات أمنية</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>المشروع:</strong> <span>${contract.project || 'غير محدد'}</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>موقع تقديم الخدمة:</strong> <span>${contract.location || 'غير محدد'}، ${contract.region || ''}</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>عدد الحراس المطلوب:</strong> <span>${contract.guards_count} حارس</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>مدة العقد:</strong> <span>${contract.contract_duration || 'غير محدد'}</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>تاريخ بداية العقد:</strong> <span>${formatDate(contract.start_date)}</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>تاريخ نهاية العقد:</strong> <span>${formatDate(contract.end_date)}</span></li>
                    <li class="flex justify-between border-b pb-2"><strong>حالة العقد الحالية:</strong> <span class="font-bold">${contract.status}</span></li>
                </ul>
            `;
            contractBody.appendChild(detailsDiv);
            
            // 3. Render Dynamic Clauses
            if (contract.contract_clauses && contract.contract_clauses.length > 0) {
                contract.contract_clauses.forEach(group => {
                    const groupDiv = document.createElement('div');
                    let itemsHTML = group.items.map(item => `<li class="text-slate-600">${item}</li>`).join('');
                    groupDiv.innerHTML = `
                        <h3 class="text-xl font-bold mb-4 text-center border-t border-slate-200 pt-8">${group.title}</h3>
                        <ul class="list-disc list-inside space-y-2 pr-4">${itemsHTML}</ul>
                    `;
                    contractBody.appendChild(groupDiv);
                });
            }

            // 4. Financials Section
            const financialsDiv = document.createElement('div');
            financialsDiv.id = "financials-section";
            financialsDiv.innerHTML = `
                 <h3 class="text-xl font-bold mb-4 text-center border-t border-slate-200 pt-8">البنود المالية</h3>
                 <div class="bg-slate-50 p-4 rounded-lg">
                     <p class="flex justify-between text-lg"><strong>القيمة الإجمالية للعقد:</strong> <span class="font-bold text-green-700">${formatCurrency(contract.contract_value)}</span></p>
                     <p class="text-xs text-slate-500 mt-1">شاملة ضريبة القيمة المضافة. يتم إصدار الفواتير بشكل شهري.</p>
                 </div>
            `;
            contractBody.appendChild(financialsDiv);

            // 5. Notes Section
            const notesDiv = document.createElement('div');
            notesDiv.id = "notes-section";
            notesDiv.innerHTML = `
                <h3 class="text-xl font-bold mb-4 text-center border-t border-slate-200 pt-8">ملاحظات إضافية</h3>
                <div class="bg-slate-50 p-4 rounded-lg min-h-[100px]">
                    <p class="text-slate-700">${contract.notes || 'لا توجد ملاحظات إضافية مسجلة.'}</p>
                </div>
            `;
            contractBody.appendChild(notesDiv);

            // 6. Signatures Section
            const signaturesDiv = document.createElement('div');
            signaturesDiv.id = "signatures-section";
            signaturesDiv.className = "pt-16";
            signaturesDiv.innerHTML = `
                <h3 class="text-xl font-bold mb-8 text-center border-t border-slate-200 pt-8">التواقيع / Signatures</h3>
                <div class="grid grid-cols-2 gap-16">
                    <div class="text-center">
                        <p class="font-bold">الطرف الأول</p>
                        <p class="text-sm text-slate-600">First Party (Arkanat)</p>
                        <div class="border-b-2 border-slate-400 border-dashed mt-16 mb-2"></div>
                        <p class="text-xs">الاسم والتوقيع</p>
                    </div>
                    <div class="text-center">
                        <p class="font-bold">الطرف الثاني</p>
                        <p id="second-party-name" class="text-sm text-slate-600">Second Party (${contract.company_name})</p>
                        <div class="border-b-2 border-slate-400 border-dashed mt-16 mb-2"></div>
                        <p class="text-xs">الاسم والتوقيع والختم الرسمي</p>
                    </div>
                </div>
            `;
            contractBody.appendChild(signaturesDiv);
            
            dom.contractFooterInfo.textContent = `رقم العقد المرجعي: ${contract.id} | تاريخ الإنشاء: ${formatDate(contract.created_at)}`;

            showPage('contract-view-page');
        };




        
        // --- CSV Export ---
        const exportTableToCSV = (tableSelector, filename) => {
            const table = document.querySelector(tableSelector);
            if (!table) {
                showAlert('لا يوجد جدول لتصديره.');
                return;
            }
            let csv = [];
            const rows = table.querySelectorAll("tr");
            
            for (const row of rows) {
                const cols = row.querySelectorAll("td, th");
                const rowData = [];
                for (const col of cols) {
                    let data = col.innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/,/g, ";").trim();
                    if (col.querySelector('button')) {
                       const mainText = Array.from(col.childNodes).find(node => node.nodeType === Node.TEXT_NODE)?.textContent.trim();
                       const spanText = col.querySelector('span')?.textContent.trim();
                       data = mainText || spanText || 'Action';
                    }
                    rowData.push(`"${data}"`);
                }
                csv.push(rowData.join(","));
            }

            const csvFile = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(csvFile);
            link.download = filename || 'export.csv';
            link.click();
        }

        // --- Event Listeners Setup ---
        const setupEventListeners = () => {
            document.querySelectorAll('.login-option-card').forEach(b => b.addEventListener('click', (e) => { 
                state.currentRole = e.currentTarget.dataset.role; 
                const isStaff = ['admin', 'operations', 'hr', 'contracts'].includes(state.currentRole);
                document.querySelector('#login-page label[for="login-id"]').textContent = isStaff ? 'اسم المستخدم / رقم الهوية' : 'رقم الهوية';
                dom.loginTitle.textContent = { guard: 'تسجيل دخول الحارس', coverage_guard: 'دخول حراس التغطيات', admin: 'دخول المشرف', operations: 'دخول إدارة العمليات', hr: 'دخول الموارد البشرية', contracts: 'دخول إدارة العقود' }[state.currentRole];
                showPage('login-page'); 
            }));

            document.getElementById('login-btn').addEventListener('click', async () => {
                const id = document.getElementById('login-id').value.trim(); 
                const pass = document.getElementById('login-password').value.trim(); 
                if (!id || !pass) return showAlert("يرجى إدخال البيانات."); 
                showLoading(true);

                if (state.currentRole === 'guard') {
                     const { data, error } = await _supabase.from('guards').select('*').eq('id', id).single(); 
                     if (error || !data) { showAlert("رقم الهوية غير صحيح."); }
                     else if (data.password === pass) { 
                         state.currentGuard = data; 
                         sessionStorage.setItem('arkanatGuard', JSON.stringify(data)); 
                         dom.guardNameDisplay.textContent = state.currentGuard.name; 
                         showPage('guard-dashboard-page'); 
                         await updateGuardButtonState(state.currentGuard.id); 
                     } else { showAlert("كلمة المرور غير صحيحة."); }
                } else if (state.currentRole === 'coverage_guard') {
                    const { data, error } = await _supabase.from('coverage_guards').select('*').eq('id', id).single();
                    if (error || !data) { showAlert("رقم الهوية غير صحيح."); }
                    else if (data.password === pass) {
                        state.currentGuard = data;
                        state.currentRole = 'coverage_guard';
                        sessionStorage.setItem('arkanatCoverageGuard', JSON.stringify(data));
                        loadCoverageGuardDashboard();
                    } else { showAlert("كلمة المرور غير صحيحة."); }
                } else { // Admin, Ops, HR, Contracts
                    if (id === 'admin' && pass === 'admin') {
                        const superAdminUser = {
                            id: '00000000-0000-0000-0000-000000000000',
                            name: 'Super Admin', 
                            role: state.currentRole
                        };
                        state.currentUser = superAdminUser; 
                        sessionStorage.setItem('arkanatUser', JSON.stringify(superAdminUser));
                        sessionStorage.setItem('arkanatRole', state.currentRole);

                        if (state.currentRole === 'hr') {
                            loadHrDashboard();
                        } else if (state.currentRole === 'contracts') {
                            loadContractsDashboard();
                        } else {
                            loadAdminDashboard();
                        }
                    } else {
                        const { data, error } = await _supabase.from('staff').select('*').eq('username', id).eq('role', state.currentRole).single();
                        if (error || !data) { showAlert("اسم المستخدم غير صحيح أو ليس لديه الصلاحية."); }
                        else if (data.password === pass) { 
                            state.currentUser = data; 
                            sessionStorage.setItem('arkanatUser', JSON.stringify(data)); 
                            sessionStorage.setItem('arkanatRole', data.role); 
                            if (data.role === 'hr') loadHrDashboard(); 
                            else if (data.role === 'contracts') loadContractsDashboard(); 
                            else loadAdminDashboard(); 
                        } else { showAlert("كلمة المرور غير صحيحة."); }
                    }
                }
                showLoading(false);
            });

            document.getElementById('guard-buttons-container').addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;
                
                if (button.id === 'check-in-btn') {
                    if (!button.disabled) {
                        showModal('attendance-modal');
                        document.getElementById('guard-notes').value = '';
                    }
                } else if (button.id === 'check-out-btn') {
                     if (!button.disabled) dom.checkOutBtn.dispatchEvent(new Event('checkout'));
                } else if (button.id === 'view-my-schedule-btn') {
                    // --- [اﻟﺠﺪﻳﺪ] --- برمجة زر عرض الجدول
                    const guard = state.currentGuard;
                    if (guard) {
                        dom.scheduleModal.title.textContent = `جدول دوامك الأسبوعي`;
                        const scheduleBody = dom.scheduleModal.body;
                        scheduleBody.innerHTML = '';
                        if (guard.weekly_schedule && Object.keys(guard.weekly_schedule).length > 0) {
                            const daysInOrder = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
                            let scheduleHTML = '';
                            
                            daysInOrder.forEach(day => {
                                const times = guard.weekly_schedule[day];
                                if (times && times.start && times.end) {
                                     scheduleHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-600">
                                                        <span class="font-bold text-white">${day}</span>
                                                        <span class="text-green-400 font-mono tracking-wider">${formatTime12Hour(times.start)} - ${formatTime12Hour(times.end)}</span>
                                                      </div>`;
                                } else {
                                     scheduleHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-700">
                                                        <span class="font-bold text-gray-400">${day}</span>
                                                        <span class="text-yellow-400">راحة</span>
                                                      </div>`;
                                }
                            });

                            scheduleBody.innerHTML = `<div class="space-y-1">${scheduleHTML}</div>`;
                        } else {
                            scheduleBody.innerHTML = '<p class="text-center text-gray-400 p-4">لم يتم تسجيل جدول لك بعد. يرجى مراجعة الإدارة.</p>';
                        }
                        showModal('schedule-display-modal');
                    }
                } else if (button.classList.contains('request')) {
                    showModal(button.dataset.modal);
                }
            });
            
            document.getElementById('submit-attendance-btn').addEventListener('click', async () => {
                const now = new Date();
                const guard = state.currentGuard;

                if (!guard || !guard.weekly_schedule) {
                    showAlert('لم يتم العثور на جدول عمل لك. يرجى مراجعة الإدارة.');
                    closeModal();
                    return;
                }

                const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
                const dayName = dayNames[now.getDay()];
                const todaySchedule = guard.weekly_schedule[dayName];
                const graceMinutes = 15;
                let canCheckIn = false;

                if (todaySchedule && todaySchedule.start && typeof todaySchedule.start === 'string' && todaySchedule.start.includes(':')) {
                    const [hours, minutes] = todaySchedule.start.split(':');
                    const scheduledStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours, 10), parseInt(minutes, 10), 0);
                    const earliestCheckinTime = new Date(scheduledStartTime.getTime() - graceMinutes * 60 * 1000);
                    if (now >= earliestCheckinTime) {
                        canCheckIn = true;
                    }
                }

                if (!canCheckIn) {
                    closeModal(); // أغلق نافذة الحضور أولاً
                    const nextShift = findNextShift(guard.weekly_schedule);
                    let message = "لا يمكنك تسجيل الحضور في الوقت الحالي. ";

                    if (nextShift) {
                        if (nextShift.isToday) {
                            const remainingTime = formatRemainingTime(nextShift.shiftDate);
                            message += `ورديتك القادمة تبدأ بعد حوالي ${remainingTime}.`;
                        } else {
                            message += `ورديتك القادمة يوم ${nextShift.dayName} الساعة ${formatTime12Hour(nextShift.shiftDate.toTimeString().slice(0,5))}.`;
                        }
                    } else {
                        message += "لا توجد لديك ورديات مجدولة قريباً. يرجى مراجعة الإدارة.";
                    }
                    showAlert(message); // ثم أظهر التنبيه
                    return;
                }

                // --- إذا كان يمكنه تسجيل الحضور، نستكمل الكود الأصلي ---
                showLoading(true);
                let coords = {};
                try {
                    const position = await getGeolocation();
                    coords = { checkin_lat: position.latitude, checkin_lon: position.longitude };
                } catch (geoError) {
                    showAlert('لم نتمكن من تحديد موقعك. سيتم تسجيل الحضور بدون موقع.');
                }

                try {
                    const checkinTime = new Date();
                    const [hours, minutes] = todaySchedule.start.split(':');
                    const scheduledStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours, 10), parseInt(minutes, 10), 0);
                    let scheduled_start_time = scheduledStartTime.toISOString();
                    let scheduled_end_time = null;

                    if (todaySchedule.end) {
                        const [endHours, endMinutes] = todaySchedule.end.split(':');
                        const scheduledEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHours, endMinutes);
                        if (scheduledEndTime < scheduledStartTime) {
                            scheduledEndTime.setDate(scheduledEndTime.getDate() + 1);
                        }
                        scheduled_end_time = scheduledEndTime.toISOString();
                    }

                    const payload = { 
                        guard_id: guard.id, 
                        guard_name: guard.name, 
                        notes: document.getElementById('guard-notes').value.trim(), 
                        status: 'Pending',
                        ...coords,
                        scheduled_start_time,
                        scheduled_end_time
                    };
                    const { data, error } = await _supabase.from('attendance').insert(payload).select().single();
                    closeModal();
                    if (error) throw error;
                    await logActivity(`الحارس: ${guard.name}`, 'قام بتسجيل الحضور', `رقم السجل: ${data?.id}`);
                    showAlert("تم تسجيل حضورك بنجاح!"); 
                    await updateGuardButtonState(guard.id); 
                } catch (error) {
                    showAlert(`فشل تسجيل الحضور: ${error.message}`);
                } finally {
                    showLoading(false);
                }
            });
            
            if (dom.checkOutBtn) {
                dom.checkOutBtn.addEventListener('checkout', async () => {
                    if (dom.checkOutBtn.disabled || !state.activeAttendanceId) return; 
                    if (!await confirmAction('تأكيد الانصراف', 'هل أنت متأكد من رغبتك في الانصراف الآن؟')) return; 
                    showLoading(true);
                    let coords = {};
                    try {
                        const position = await getGeolocation();
                        coords = { checkout_lat: position.latitude, checkout_lon: position.longitude };
                    } catch (geoError) {
                        showAlert('لم نتمكن من تحديد موقعك. سيتم تسجيل الانصراف بدون موقع.');
                    }
                    try {
                        await fetchAllGuards();
                        const checkoutTime = new Date();
                        const {data: attendanceRecord, error: fetchError} = await _supabase.from('attendance').select('created_at').eq('id', state.activeAttendanceId).single();
                        if (fetchError || !attendanceRecord) { throw new Error('لم يتم العثور على سجل الحضور النشط.'); }
                        const workDurationMs = checkoutTime - new Date(attendanceRecord.created_at);
                        const durationString = formatDuration(workDurationMs);
                        const currentGuardData = state.allGuardsData.find(g => g.id === state.currentGuard.id);
                        const entitlement = calculateEntitlement(currentGuardData, workDurationMs);
                        
                        const updatePayload = { 
                            checkout_at: checkoutTime.toISOString(), 
                            work_duration: durationString, 
                            daily_entitlement: entitlement,
                            ...coords
                        };

                        const { error } = await _supabase.from('attendance').update(updatePayload).eq('id', state.activeAttendanceId);
                        if(error) throw error;
                        await logActivity(`الحارس: ${state.currentGuard.name}`, 'قام بالانصراف', `مدة العمل: ${durationString}`);
                        showAlert("تم تسجيل انصرافك بنجاح."); await updateGuardButtonState(state.currentGuard.id);
                    } catch (error) {
                        showAlert(`فشل الانصراف: ${error.message}`);
                    } finally {
                        showLoading(false);
                    }
                });
            }

            const handleGuardRequest = async (tableName, payload, successMsg, logAction, logDetails) => {
    showLoading(true);

    // Add guard's details to the payload
    const guard = state.currentGuard;
    if (guard) {
        payload.guard_mobile = guard.mobile_number || '-';
        payload.guard_region = guard.region || '-';
        payload.guard_location = guard.location || '-';
        payload.guard_project = guard.project || '-';
    }

    const { error } = await _supabase.from(tableName).insert(payload);
    if (error) {
        console.error(`Error submitting request to ${tableName}:`, error);
        showLoading(false);
        closeModal();
        showAlert('فشل إرسال الطلب');
        return;
    }
    await logActivity(`الحارس: ${state.currentGuard.name}`, logAction, logDetails);
    showLoading(false);
    closeModal();
    showAlert(successMsg);
};


            document.getElementById('submit-leave-btn').addEventListener('click', () => { const days = document.getElementById('leave-days').value; const reason = document.getElementById('leave-reason').value.trim(); if(!days || !reason) return showAlert('يرجى ملء كل الحقول.'); handleGuardRequest('leave_requests', { guard_id: state.currentGuard.id, guard_name: state.currentGuard.name, days_requested: days, reason, status: 'Pending' }, "تم إرسال طلب الإجازة بنجاح.", 'قدم طلب إجازة', `لمدة ${days} يوم`); });
            document.getElementById('submit-loan-btn').addEventListener('click', () => { const amount = document.getElementById('loan-amount').value; const reason = document.getElementById('loan-reason').value.trim(); if(!amount || !reason) return showAlert('يرجى ملء כל الحقول.'); handleGuardRequest('loan_requests', { guard_id: state.currentGuard.id, guard_name: state.currentGuard.name, amount_requested: amount, reason, status: 'Pending' }, "تم إرسال طلب السلفة بنجاح.", 'قدم طلب سلفة', `بمبلغ ${amount} ريال`); });
            document.getElementById('submit-permission-btn').addEventListener('click', () => { const reason = document.getElementById('permission-reason').value.trim(); if(!reason) return showAlert('يرجى ذكر السبب.'); handleGuardRequest('permission_requests', { guard_id: state.currentGuard.id, guard_name: state.currentGuard.name, reason, status: 'Pending' }, "تم إرسال طلب الإستئذان بنجاح.", 'قدم طلب استئذان', `السبب: ${reason}`); });
            document.getElementById('submit-overtime-btn').addEventListener('click', () => { const reason = document.getElementById('overtime-reason').value.trim(); if(!reason) return showAlert('يرجى ذكر التفاصيل.'); handleGuardRequest('overtime_requests', { guard_id: state.currentGuard.id, guard_name: state.currentGuard.name, reason, status: 'Pending' }, "تم إرسال طلب العمل الإضافي بنجاح.", 'قدم طلب عمل إضافي', `السبب: ${reason}`); });
            document.getElementById('submit-resignation-btn').addEventListener('click', () => { const reason = document.getElementById('resignation-reason').value.trim(); if(!reason) return showAlert('يرجى ذكر السبب.'); handleGuardRequest('resignation_requests', { guard_id: state.currentGuard.id, guard_name: state.currentGuard.name, reason, status: 'Pending' }, "تم إرسال طلب الاستقالة.", 'قدم طلب استقالة', `السبب: ${reason}`); });
            
            

            // --- [[ START OF FULLY CONSOLIDATED EVENT LISTENER FIX ]] ---
            document.body.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const currentHrTab = document.querySelector('#hr-tabs .active-tab')?.dataset.tab;
    const currentAdminTab = document.querySelector('#admin-ops-tabs .active-tab')?.dataset.tab;

    // ---- Global Buttons ----
    if (button.classList.contains('logout-btn')) { logout(); return; }
    if (button.id === 'add-assignment-btn') { addAssignmentRow(); return; }
    if (button.id === 'admin-export-csv-btn' || button.id === 'hr-export-csv-btn') {
        const targetTableSelector = button.dataset.targetTable;
        const activeTab = currentAdminTab || currentHrTab || 'export';
        const filename = `Arkanat-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
        exportTableToCSV(targetTableSelector, filename);
        return;
    }
    if (button.id === 'print-contract-btn') { window.print(); return; }
    if (button.id === 'contract-view-back-btn') { loadContractsDashboard(); return; }
    
    if (button.closest('#modal-container')) {
            if (button.id === 'submit-coverage-notes-btn') {
                const coverageId = document.getElementById('coverage-notes-coverage-id').value;
                const notes = document.getElementById('coverage-notes-textarea').value.trim();
                showLoading(true);
                const { error } = await _supabase.from('coverage_applications').insert({
                    coverage_id: coverageId,
                    guard_id: state.currentGuard.id,
                    status: 'Pending',
                    notes: notes || null
                });
                showLoading(false);
                closeModal();

                if(error) {
                    if (error.message.includes('unique_application')) {
                        showAlert('لقد قدمت على هذه التغطية بالفعل.');
                    } else {
                        showAlert('فشل التقديم على التغطية. الرجاء المحاولة مرة أخرى.');
                        console.error('Apply for coverage error:', error);
                    }
                } else {
                    showAlert('تم التقديم بنجاح!');
                    loadCoverageGuardDashboard('available_coverages');
                }
            }

            // Handle adding a new clause group in the contract form
            if (button.id === 'add-clause-group-btn') {
                const clausesContainer = document.getElementById('clauses-container');
                if (clausesContainer) {
                    addClauseGroup(clausesContainer);
                }
            }
            
            return; // Stop further processing for modal buttons
        }
    
    // ---- Page/Dashboard Specific Buttons ----
    const parentPage = button.closest('.page');
    if (parentPage) {
        switch (parentPage.id) {
    case 'admin-dashboard-page':
        // --- Approve/Cancel Attendance (Admin/Ops) ---
        if (button.classList.contains('approve-attendance-btn') || button.classList.contains('cancel-attendance-btn')) {
            const attendanceId = button.dataset.id;
            const action = button.classList.contains('approve-attendance-btn') ? 'Approved' : 'Cancelled';
            if (!await confirmAction('تأكيد الإجراء', `هل أنت متأكد من ${action === 'Approved' ? 'اعتماد' : 'إلغاء'} هذا السجل؟`)) return;

            showLoading(true);
            const { error } = await _supabase.from('attendance').update({ status: action, action_by: state.currentUser.name }).eq('id', attendanceId);
            showLoading(false);

            if (error) { showAlert(`فشل الإجراء: ${error.message}`); } 
            else { showAlert('تم تحديث الحالة بنجاح.'); loadAdminDashboard(currentAdminTab); }
            return;
        }

        // --- Approve/Reject Permission or Overtime Requests (Admin/Ops) ---
        if (button.classList.contains('approve-request-btn') || button.classList.contains('reject-request-btn')) {
            const requestId = button.dataset.id;
            const requestType = button.dataset.type;
            const action = button.classList.contains('approve-request-btn') ? 'Approved' : 'Rejected';

            if (action === 'Rejected') {
                document.getElementById('rejection-item-id').value = requestId;
                document.getElementById('rejection-table-name').value = requestType;
                document.getElementById('rejection-reason-input').value = '';
                showModal('rejection-reason-modal');
            } else {
                if (!await confirmAction('تأكيد الموافقة', `هل أنت متأكد من الموافقة على هذا الطلب؟`)) return;
                
                showLoading(true);
                const { error } = await _supabase.from(requestType).update({ status: 'Approved', processed_by: state.currentUser.name }).eq('id', requestId);
                showLoading(false);

                if (error) { showAlert(`فشلت الموافقة: ${error.message}`); } 
                else { showAlert('تمت الموافقة على الطلب بنجاح.'); loadAdminDashboard(currentAdminTab); }
            }
            return;
        }

        // --- Raise Guard Transfer Request Button (Admin) ---
        if (button.id === 'transfer-request-btn') {
            const guardSelect = document.getElementById('transfer-guard-select');
            guardSelect.innerHTML = '<option value="">اختر حارسًا...</option>' + state.allGuardsData.map(g => `<option value="${g.id}">${g.name} (${g.id})</option>`).join('');
            document.getElementById('transfer-request-modal').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
            showModal('transfer-request-modal');
            return;
        }
        
        // --- Coverage Buttons (Now in Admin/Ops dashboard) ---
        if (button.id === 'add-coverage-guard-btn') {
            document.getElementById('coverage-guard-form-title').textContent = 'إضافة حارس تغطية';
            document.getElementById('coverage-guard-form-id').value = '';
            document.getElementById('coverage-guard-form-modal').querySelectorAll('input').forEach(el => el.value = '');
            showModal('coverage-guard-form-modal');
        } else if (button.classList.contains('edit-coverage-guard-btn')) {
            const guardId = button.dataset.guardId;
            const guard = state.allCoverageGuardsData.find(g => g.id.toString() === guardId);
            if (guard) {
                document.getElementById('coverage-guard-form-title').textContent = `تعديل: ${guard.name}`;
                document.getElementById('coverage-guard-form-id').value = guard.id;
                document.getElementById('coverage-guard-form-name').value = guard.name || '';
                document.getElementById('coverage-guard-form-national-id').value = guard.id;
                document.getElementById('coverage-guard-form-mobile').value = guard.mobile_number || '';
                document.getElementById('coverage-guard-form-password').value = '';
                showModal('coverage-guard-form-modal');
            }
        } else if (button.classList.contains('delete-coverage-guard-btn')) {
            const guardId = button.dataset.guardId;
            const guardName = button.dataset.guardName;
            if (await confirmAction('تأكيد الحذف', `هل أنت متأكد من حذف حارس التغطية ${guardName}؟`)) {
                showLoading(true);
                const { error } = await _supabase.from('coverage_guards').delete().eq('id', guardId);
                showLoading(false);
                if (error) showAlert(`فشل الحذف: ${error.message}`); else loadAdminDashboard('coverage_recruitment');
            }
        } else if (button.id === 'add-coverage-site-btn') {
            document.getElementById('coverage-site-form-title').textContent = 'إنشاء تغطية جديدة';
            document.getElementById('coverage-site-form-id').value = '';
            document.getElementById('coverage-site-form-modal').querySelectorAll('input, select').forEach(el => el.value = '');
            showModal('coverage-site-form-modal');
        } else if (button.classList.contains('edit-coverage-site-btn')) {
            const siteId = button.dataset.siteId;
            const { data: site } = await _supabase.from('coverages').select('*').eq('id', siteId).single();
            if (site) {
                document.getElementById('coverage-site-form-title').textContent = 'تعديل تغطية';
                document.getElementById('coverage-site-form-id').value = site.id;
                document.getElementById('coverage-site-project').value = site.project;
                document.getElementById('coverage-site-location').value = site.location;
                document.getElementById('coverage-site-date').value = site.coverage_date;
                document.getElementById('coverage-site-day').value = site.shift_day;
                document.getElementById('coverage-site-start-time').value = site.shift_start;
                document.getElementById('coverage-site-end-time').value = site.shift_end;
                document.getElementById('coverage-site-payout').value = site.payout_amount;
                showModal('coverage-site-form-modal');
            }
        } else if (button.classList.contains('delete-coverage-site-btn')) {
            const siteId = button.dataset.siteId;
            if (await confirmAction('تأكيد الحذف', 'هل أنت متأكد من حذف هذه التغطية؟')) {
                showLoading(true);
                const { error } = await _supabase.from('coverages').delete().eq('id', siteId);
                showLoading(false);
                if (error) showAlert(`فشل الحذف: ${error.message}`); else loadAdminDashboard('coverage_sites');
            }
        } else if (button.classList.contains('accept-coverage-app-btn')) {
            const appId = button.dataset.appId;
            const coverageId = button.dataset.coverageId;
            const guardId = button.dataset.guardId;
            const guardName = button.dataset.guardName;
            if (await confirmAction('تأكيد القبول', `هل تؤكد قبول ${guardName} لهذه التغطية؟`)) {
                showLoading(true);
                const [covUpdate, appUpdate] = await Promise.all([
                    _supabase.from('coverages').update({ status: 'Assigned', assigned_guard_id: guardId, assigned_guard_name: guardName }).eq('id', coverageId),
                    _supabase.from('coverage_applications').update({ status: 'Accepted' }).eq('id', appId)
                ]);
                showLoading(false);
                if (covUpdate.error || appUpdate.error) showAlert('فشلت عملية القبول.'); else loadAdminDashboard('coverage_applicants');
            }
        } else if (button.classList.contains('reject-coverage-app-btn')) {
            const appId = button.dataset.appId;
            if (await confirmAction('تأكيد الرفض', 'هل أنت متأكد من رفض هذا الطلب؟')) {
                showLoading(true);
                const { error } = await _supabase.from('coverage_applications').update({ status: 'Rejected' }).eq('id', appId);
                showLoading(false);
                if (error) showAlert('فشل الرفض.'); else loadAdminDashboard('coverage_applicants');
            }
        } else if (button.classList.contains('delete-coverage-app-btn')) {
            const appId = button.dataset.appId;
            if (await confirmAction('تأكيد الحذف', 'هل أنت متأكد من حذف طلب التقديم هذا؟')) {
                showLoading(true);
                const { error } = await _supabase.from('coverage_applications').delete().eq('id', appId);
                showLoading(false);
                if (error) showAlert('فشل الحذف.'); else loadAdminDashboard('coverage_applicants');
            }
        }
        break;
    case 'hr-dashboard-page':
        if (button.id === 'add-guard-btn') {
            document.getElementById('guard-form-title-text').textContent = 'إضافة حارس جديد';
            document.getElementById('guard-form-id').value = '';
            document.getElementById('guard-form-national-id').disabled = false;
            document.getElementById('guard-form-modal').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
            document.getElementById('guard-form-status').value = 'اساسي';
            renderScheduleForm(document.getElementById('guard-form-schedule-container'));
            showModal('guard-form-modal');
        } else if (button.classList.contains('edit-guard-btn')) {
            const guardId = button.dataset.guardId;
            const guard = state.allGuardsData.find(g => g.id.toString() === guardId);
            if (guard) {
               document.getElementById('guard-form-title-text').textContent = `تعديل بيانات: ${guard.name}`;
               document.getElementById('guard-form-id').value = guard.id;
               document.getElementById('guard-form-national-id').value = guard.id;
               document.getElementById('guard-form-national-id').disabled = true;
               document.getElementById('guard-form-name').value = guard.name || '';
               document.getElementById('guard-form-mobile').value = guard.mobile_number || '';
               document.getElementById('guard-form-password').value = '';
               document.getElementById('guard-form-job-title').value = guard.job_title || '';
               document.getElementById('guard-form-location').value = guard.location || '';
               document.getElementById('guard-form-region').value = guard.region || '';
               document.getElementById('guard-form-project').value = guard.project || '';
               document.getElementById('guard-form-status').value = guard.status || 'اساسي';
               document.getElementById('guard-form-basic-salary').value = guard.basic_salary || '';
               document.getElementById('guard-form-housing-allowance').value = guard.housing_allowance || '';
               document.getElementById('guard-form-transport-allowance').value = guard.transport_allowance || '';
               document.getElementById('guard-form-other-allowances').value = guard.other_allowances || '';
               renderScheduleForm(document.getElementById('guard-form-schedule-container'), guard.weekly_schedule);
               showModal('guard-form-modal');
            }
        } else if (button.classList.contains('view-schedule-btn')) {
                    const guardId = button.dataset.guardId;
                    const guard = state.allGuardsData.find(g => g.id.toString() === guardId);
                    if (guard) {
                        dom.scheduleModal.title.textContent = `جدول دوام: ${guard.name}`;
                        const scheduleBody = dom.scheduleModal.body;
                        scheduleBody.innerHTML = '';
                        if (guard.weekly_schedule && Object.keys(guard.weekly_schedule).length > 0) {
                            const daysInOrder = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
                            let scheduleHTML = '';
                            
                            daysInOrder.forEach(day => {
                                const times = guard.weekly_schedule[day];
                                if (times && times.start && times.end) {
                                     scheduleHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-600">
                                                        <span class="font-bold text-white">${day}</span>
                                                        <span class="text-green-400 font-mono tracking-wider">${formatTime12Hour(times.start)} - ${formatTime12Hour(times.end)}</span>
                                                      </div>`;
                                } else {
                                     scheduleHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-700">
                                                        <span class="font-bold text-gray-400">${day}</span>
                                                        <span class="text-yellow-400">راحة</span>
                                                      </div>`;
                                }
                            });

                            scheduleBody.innerHTML = `<div class="space-y-1">${scheduleHTML}</div>`;
                        } else {
                            scheduleBody.innerHTML = '<p class="text-center text-gray-400 p-4">لا يوجد جدول مسجل لهذا الحارس.</p>';
                        }
                        showModal('schedule-display-modal');
                    }
        } else if (button.classList.contains('delete-guard-btn')) {
             const guardId = button.dataset.guardId;
             const guardName = button.dataset.guardName;
             if (await confirmAction('تأكيد الحذف', `هل أنت متأكد من حذف الحارس ${guardName}؟ لا يمكن التراجع.`)) {
                showLoading(true);
                const { error } = await _supabase.from('guards').delete().eq('id', guardId);
                showLoading(false);
                if (error) showAlert(`فشل الحذف: ${error.message}`); else loadHrDashboard('guards');
             }
        } else if (button.id === 'add-staff-btn') {
            const role = button.dataset.role;
            document.getElementById('staff-form-title').textContent = {hr: 'إضافة موظف موارد بشرية', admin: 'إضافة مشرف جديد', operations: 'إضافة موظف عمليات', contracts: 'إضافة موظف عقود'}[role];
            document.getElementById('staff-form-id').value = '';
            document.getElementById('staff-form-role').value = role;
            document.getElementById('staff-form-modal').querySelectorAll('input').forEach(el => el.value = '');
            document.getElementById('staff-form-assignments-list').innerHTML = '';
            document.getElementById('staff-form-assignment-container').style.display = (role === 'admin' || role === 'operations') ? 'block' : 'none';
            addAssignmentRow();
            showModal('staff-form-modal');
        } else if (button.classList.contains('edit-staff-btn')) {
            const staffId = button.dataset.staffId;
            const staffMember = state.allStaffData.find(s => s.id.toString() === staffId);
            if (staffMember) {
                document.getElementById('staff-form-title').textContent = `تعديل بيانات: ${staffMember.name}`;
                document.getElementById('staff-form-id').value = staffMember.id;
                document.getElementById('staff-form-role').value = staffMember.role;
                document.getElementById('staff-form-name').value = staffMember.name;
                document.getElementById('staff-form-username').value = staffMember.username;
                document.getElementById('staff-form-password').value = '';
                document.getElementById('staff-form-title-input').value = staffMember.job_title || '';
                const assignmentContainer = document.getElementById('staff-form-assignment-container');
                const assignmentsList = document.getElementById('staff-form-assignments-list');
                assignmentsList.innerHTML = '';
                if (staffMember.role === 'admin' || staffMember.role === 'operations') {
                    assignmentContainer.style.display = 'block';
                    const assignments = staffMember.assignments && staffMember.assignments.length > 0 ? staffMember.assignments : [{}];
                    assignments.forEach(assignment => addAssignmentRow(assignment));
                } else {
                    assignmentContainer.style.display = 'none';
                }
                showModal('staff-form-modal');
            }
        } else if (button.classList.contains('delete-staff-btn')) {
            const staffId = button.dataset.staffId;
            const staffName = button.dataset.staffName;
            if (await confirmAction('تأكيد الحذف', `هل أنت متأكد من حذف ${staffName}؟ لا يمكن التراجع.`)) {
               showLoading(true);
               const { error } = await _supabase.from('staff').delete().eq('id', staffId);
               showLoading(false);
               if (error) showAlert(`فشل الحذف: ${error.message}`); else loadHrDashboard(currentHrTab);
            }
        } else if (button.classList.contains('hr-action-btn')) {
            const id = button.dataset.id;
            const table = button.dataset.table;
            const action = button.dataset.action;
            
            if (action === 'Rejected') {
                document.getElementById('rejection-item-id').value = id;
                document.getElementById('rejection-table-name').value = table;
                document.getElementById('rejection-reason-input').value = '';
                showModal('rejection-reason-modal');
            } else if (action === 'Approved') {
                if (await confirmAction('تأكيد الموافقة', 'هل أنت متأكد من الموافقة على هذا الطلب؟')) {
                    showLoading(true);
                    const { error } = await _supabase.from(table).update({ status: 'Approved', processed_by: state.currentUser.name }).eq('id', id);
                    showLoading(false);
                    if (error) showAlert('فشلت الموافقة.'); else loadHrDashboard(currentHrTab);
                }
            }
        } else if (button.classList.contains('delete-record-btn')) {
            const id = button.dataset.id;
            const table = button.dataset.table;
            if (await confirmAction('تأكيد الحذف', 'هل أنت متأكد من حذف هذا السجل نهائياً؟')) {
                showLoading(true);
                const { error } = await _supabase.from(table).delete().eq('id', id);
                showLoading(false);
                if (error) showAlert('فشل الحذف.'); else loadHrDashboard(currentHrTab);
            }
        } else if (button.classList.contains('cancel-leave-btn')) {
            const id = button.dataset.id;
            const table = button.dataset.table;
            if (await confirmAction('قطع الإجازة', 'هل أنت متأكد من قطع هذه الإجازة المعتمدة؟')) {
                 showLoading(true);
                const { error } = await _supabase.from(table).update({ status: 'Cancelled by HR', processed_by: state.currentUser.name }).eq('id', id);
                showLoading(false);
                if (error) showAlert('فشلت العملية.'); else loadHrDashboard(currentHrTab);
            }
        } else if (button.classList.contains('financial-btn')) {
            document.getElementById('financial-transaction-guard-id').value = button.dataset.guardId;
            const type = button.dataset.type;
            document.getElementById('financial-transaction-type').value = type;
            document.getElementById('financial-transaction-title').textContent = type === 'deduction' ? 'إضافة خصم' : 'إضافة زيادة';
            document.getElementById('financial-transaction-modal').querySelectorAll('input, textarea').forEach(i => { if(i.type !== 'hidden') i.value = ''; });
            showModal('financial-transaction-modal');
        }
        break;
    
    case 'contracts-dashboard-page':
        if (button.id === 'add-contract-btn') {
            document.getElementById('contract-form-title').textContent = 'إنشاء عقد جديد';
            document.getElementById('contract-form-id').value = '';
            document.getElementById('contract-form-modal').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
            document.getElementById('contract-form-status').value = 'نشط';
            // Clear old clauses and add one empty group for new contracts
            const clausesContainer = document.getElementById('clauses-container');
            clausesContainer.innerHTML = '';
            addClauseGroup(clausesContainer);
            showModal('contract-form-modal');
        } else if (button.classList.contains('view-contract-btn')) {
             const contractId = button.dataset.contractId;
             const contract = state.allContractsData.find(c => c.id.toString() === contractId);
             if(contract) loadContractView(contract);
        } else if (button.classList.contains('edit-contract-btn')) {
            const contractId = button.dataset.contractId;
            const contract = state.allContractsData.find(c => c.id.toString() === contractId);
            if (contract) {
                document.getElementById('contract-form-title').textContent = `تعديل عقد: ${contract.company_name}`;
                document.getElementById('contract-form-id').value = contract.id;
                document.getElementById('contract-form-company-name').value = contract.company_name;
                document.getElementById('contract-form-region').value = contract.region || '';
                document.getElementById('contract-form-location').value = contract.location || '';
                document.getElementById('contract-form-project').value = contract.project || '';
                document.getElementById('contract-form-guards-count').value = contract.guards_count || '';
                document.getElementById('contract-form-duration').value = contract.contract_duration || '';
                document.getElementById('contract-form-value').value = contract.contract_value || '';
                document.getElementById('contract-form-start-date').value = contract.start_date;
                document.getElementById('contract-form-end-date').value = contract.end_date;
                document.getElementById('contract-form-status').value = contract.status;
                document.getElementById('contract-form-notes').value = contract.notes || '';

                // Render existing clauses
                const clausesContainer = document.getElementById('clauses-container');
                clausesContainer.innerHTML = '';
                if (contract.contract_clauses && contract.contract_clauses.length > 0) {
                    contract.contract_clauses.forEach(group => addClauseGroup(clausesContainer, group));
                } else {
                    // Add one empty group if no clauses exist
                    addClauseGroup(clausesContainer);
                }

                showModal('contract-form-modal');
            }
        }
        break;

    case 'coverage-guard-dashboard-page':
        if (button.classList.contains('apply-for-coverage-btn')) {
            const coverageId = button.dataset.coverageId;
            // Set the coverage ID in the modal's hidden input
            document.getElementById('coverage-notes-coverage-id').value = coverageId;
            // Clear previous notes
            document.getElementById('coverage-notes-textarea').value = '';
            // Show the notes modal for applying
            showModal('coverage-notes-modal');
        }
        break;
}
    }
});

            // --- [[ END OF FULLY CONSOLIDATED EVENT LISTENER FIX ]] ---

            // --- Global Listeners ---
            document.getElementById('login-back-btn').addEventListener('click', () => showPage('landing-page'));
            document.getElementById('alert-close-btn').addEventListener('click', () => dom.alertModal.style.display = 'none');
            document.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', closeModal));
        };
        const addClauseItem = (container, itemText = '') => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'flex items-center gap-2 clause-item';
    itemDiv.innerHTML = `
        <textarea class="flex-grow p-2 border bg-slate-600 border-slate-500 rounded-md text-sm" rows="1">${itemText}</textarea>
        <button type="button" class="remove-clause-item-btn text-red-400 hover:text-red-300 p-1"><i class="ph ph-trash"></i></button>
    `;
    container.appendChild(itemDiv);

    itemDiv.querySelector('.remove-clause-item-btn').addEventListener('click', () => {
        itemDiv.remove();
    });
};

const addClauseGroup = (container, group = { title: '', items: [''] }) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'space-y-2 border border-slate-700 p-3 rounded-lg clause-group';
    
    groupDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <input type="text" placeholder="عنوان مجموعة البنود" class="flex-grow p-2 border bg-slate-700 border-slate-600 rounded-md font-bold clause-group-title" value="${group.title}">
            <button type="button" class="remove-clause-group-btn text-red-400 hover:text-red-300 p-1"><i class="ph-bold ph-x-circle text-xl"></i></button>
        </div>
        <div class="space-y-2 clause-items-container pl-4 border-r-2 border-slate-600">
            <!-- Clause items will be added here -->
        </div>
        <button type="button" class="add-clause-item-btn text-xs text-green-400 hover:text-green-300 flex items-center gap-1"><i class="ph ph-plus"></i> إضافة بند فرعي</button>
    `;

    const itemsContainer = groupDiv.querySelector('.clause-items-container');
    group.items.forEach(itemText => addClauseItem(itemsContainer, itemText));
    
    container.appendChild(groupDiv);

    // Add listeners for the new group
    groupDiv.querySelector('.remove-clause-group-btn').addEventListener('click', () => {
        groupDiv.remove();
    });
    groupDiv.querySelector('.add-clause-item-btn').addEventListener('click', () => {
        addClauseItem(itemsContainer);
    });
};

        const addAssignmentRow = (assignment = {}) => {
            const list = document.getElementById('staff-form-assignments-list');
            const row = document.createElement('div');
            row.className = 'assignment-row grid grid-cols-3 gap-2';
            row.innerHTML = `
                <input type="text" data-type="region" placeholder="المنطقة" class="p-2 w-full border bg-slate-700 border-slate-600 rounded-md" value="${assignment.region || ''}">
                <input type="text" data-type="location" placeholder="الموقع" class="p-2 w-full border bg-slate-700 border-slate-600 rounded-md" value="${assignment.location || ''}">
                <input type="text" data-type="project" placeholder="المشروع" class="p-2 w-full border bg-slate-700 border-slate-600 rounded-md" value="${assignment.project || ''}">
            `;
            list.appendChild(row);
        };
        
        // --- Form Submission Handlers ---
        document.getElementById('submit-financial-transaction-btn').addEventListener('click', async () => {
    const guardId = document.getElementById('financial-transaction-guard-id').value;
    const type = document.getElementById('financial-transaction-type').value;
    const amount = parseFloat(document.getElementById('financial-transaction-amount').value);
    const reason = document.getElementById('financial-transaction-reason').value.trim();

    if (!guardId || !type || !amount || amount <= 0) {
        return showAlert('يرجى إدخال مبلغ صحيح.');
    }

    const payload = {
        guard_id: guardId,
        type: type,
        amount: amount,
        reason: reason,
        processed_by_id: state.currentUser.id,
        processed_by_name: state.currentUser.name
    };

    showLoading(true);
    const { error } = await _supabase.from('financial_transactions').insert(payload);
    showLoading(false);

    if (error) {
        showAlert(`فشلت العملية: ${error.message}`);
    } else {
        showAlert('تم تسجيل العملية المالية بنجاح.');
        closeModal();
        loadHrDashboard('salaries');
    }
});
        document.getElementById('admin-tab-content').addEventListener('click', async (e) => {
    const button = e.target.closest('button.approve-transfer-btn');
    if (!button) return;

    const requestId = button.dataset.id;
    const guardId = button.dataset.guardId;
    const newLocation = button.dataset.location;
    const newProject = button.dataset.project;

    if (!await confirmAction('تأكيد الموافقة على النقل', 'هل أنت متأكد من الموافقة على نقل هذا الحارس؟ سيتم تحديث بياناته فورًا.')) return;

    showLoading(true);
    try {
        // Perform both updates concurrently
        const [transferUpdateResult, guardUpdateResult] = await Promise.all([
            _supabase.from('transfer_requests').update({ status: 'Approved', processed_by: state.currentUser.name }).eq('id', requestId),
            _supabase.from('guards').update({ location: newLocation, project: newProject }).eq('id', guardId)
        ]);

        if (transferUpdateResult.error) throw transferUpdateResult.error;
        if (guardUpdateResult.error) throw guardUpdateResult.error;

        showAlert('تمت الموافقة على النقل وتحديث بيانات الحارس بنجاح.');
        const activeTab = document.querySelector('#admin-ops-tabs .active-tab')?.dataset.tab;
        loadAdminDashboard(activeTab);

    } catch (error) {
        showAlert(`فشلت العملية: ${error.message}`);
    } finally {
        showLoading(false);
    }
});
document.getElementById('admin-tab-content').addEventListener('click', async (e) => {
    const button = e.target.closest('button.modify-attendance-btn');
    if (!button) return;

    const attendanceId = button.dataset.id;
    showLoading(true);
    const { data: record, error } = await _supabase.from('attendance').select('*').eq('id', attendanceId).single();
    showLoading(false);

    if (error || !record) {
        return showAlert('فشل في جلب بيانات السجل.');
    }

    // Pre-fill the modal
    document.getElementById('edit-attendance-id').value = record.id;
    
    // Format dates correctly for datetime-local input
    const formatForInput = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    };

    document.getElementById('edit-checkin-time').value = formatForInput(record.created_at);
    document.getElementById('edit-checkout-time').value = formatForInput(record.checkout_at);
    document.getElementById('edit-attendance-notes').value = record.notes || '';

    showModal('edit-attendance-modal');
});

document.getElementById('submit-attendance-edit-btn').addEventListener('click', async () => {
    const attendanceId = document.getElementById('edit-attendance-id').value;
    const checkinTime = document.getElementById('edit-checkin-time').value;
    const checkoutTime = document.getElementById('edit-checkout-time').value;
    const notes = document.getElementById('edit-attendance-notes').value.trim();

    if (!attendanceId || !checkinTime) {
        return showAlert('بيانات غير مكتملة.');
    }

    const payload = {
        created_at: new Date(checkinTime).toISOString(),
        checkout_at: checkoutTime ? new Date(checkoutTime).toISOString() : null,
        notes: notes
    };

    // Recalculate duration and entitlement if checkout time is present
    if (payload.checkout_at) {
        const workDurationMs = new Date(payload.checkout_at) - new Date(payload.created_at);
        payload.work_duration = formatDuration(workDurationMs);
        // Note: Recalculating entitlement might require fetching guard's salary info again.
        // For simplicity, we are only updating times and duration for now.
    }

    showLoading(true);
    const { error } = await _supabase.from('attendance').update(payload).eq('id', attendanceId);
    showLoading(false);

    if (error) {
        showAlert(`فشل تحديث السجل: ${error.message}`);
    } else {
        showAlert('تم حفظ التعديلات بنجاح.');
        closeModal();
        const activeTab = document.querySelector('#admin-ops-tabs .active-tab')?.dataset.tab;
        loadAdminDashboard(activeTab);
    }
});
        document.getElementById('submit-rejection-btn').addEventListener('click', async () => {
    const itemId = document.getElementById('rejection-item-id').value;
    const tableName = document.getElementById('rejection-table-name').value;
    const reason = document.getElementById('rejection-reason-input').value.trim();

    if (!reason) {
        return showAlert('يرجى كتابة سبب الرفض.');
    }

    showLoading(true);
    const { error } = await _supabase.from(tableName)
        .update({ status: 'Rejected', processed_by: state.currentUser.name, rejection_reason: reason })
        .eq('id', itemId);
    showLoading(false);

    if (error) {
        showAlert(`فشل رفض الطلب: ${error.message}`);
    } else {
        showAlert('تم رفض الطلب بنجاح.');
        closeModal();
        // Reload the correct dashboard based on the user's current role
        if (state.currentRole === 'hr') {
            const activeTab = document.querySelector('#hr-tabs .active-tab')?.dataset.tab;
            loadHrDashboard(activeTab);
        } else {
            const activeTab = document.querySelector('#admin-ops-tabs .active-tab')?.dataset.tab;
            loadAdminDashboard(activeTab);
        }
    }
});

document.getElementById('submit-transfer-request-btn').addEventListener('click', async () => {
    const guardId = document.getElementById('transfer-guard-select').value;
    const newLocation = document.getElementById('transfer-new-location').value.trim();
    const newProject = document.getElementById('transfer-new-project').value.trim();
    const reason = document.getElementById('transfer-reason').value.trim();

    if (!guardId || !newLocation || !newProject || !reason) {
        return showAlert('يرجى ملء جميع الحقول.');
    }

    const selectedGuard = state.allGuardsData.find(g => g.id.toString() === guardId);
    if (!selectedGuard) {
        return showAlert('لم يتم العثور على الحارس المختار.');
    }

    const payload = {
        guard_id: selectedGuard.id,
        guard_name: selectedGuard.name,
        current_project: selectedGuard.project || 'غير محدد',
        current_location: selectedGuard.location || 'غير محدد',
        new_location: newLocation,
        new_project: newProject,
        reason: reason,
        from_supervisor_id: state.currentUser.id,
        from_supervisor_name: state.currentUser.name,
        status: 'Pending'
    };

    showLoading(true);
    const { error } = await _supabase.from('transfer_requests').insert(payload);
    showLoading(false);

    if (error) {
        showAlert(`فشل إرسال الطلب: ${error.message}`);
    } else {
        showAlert('تم إرسال طلب النقل بنجاح.');
        closeModal();
        // Optionally, reload the current tab if needed, but for now it just closes.
    }
});
        document.getElementById('submit-coverage-guard-form-btn').addEventListener('click', async () => {
            const formId = document.getElementById('coverage-guard-form-id').value;
            const name = document.getElementById('coverage-guard-form-name').value.trim();
            const mobile_number = document.getElementById('coverage-guard-form-mobile').value.trim();
            const password = document.getElementById('coverage-guard-form-password').value.trim();
            
            const payload = { name, mobile_number };
            if (password) {
                payload.password = password;
            }
        
            showLoading(true);
            let error;
        
            if (formId) {
                if (!name) {
                    showLoading(false);
                    return showAlert('الاسم حقل إلزامي.');
                }
                ({ error } = await _supabase.from('coverage_guards').update(payload).eq('id', formId));
            } else {
                const id = document.getElementById('coverage-guard-form-national-id').value.trim();
                if (!id || !name || !password) {
                    showLoading(false);
                    return showAlert('رقم الهوية، الاسم، وكلمة المرور حقول إلزامية.');
                }
                payload.id = id;
                ({ error } = await _supabase.from('coverage_guards').insert(payload));
            }
            
            showLoading(false);
            if (error) {
                if (error.message.includes('duplicate key')) showAlert('فشل الإضافة. رقم الهوية هذا مسجل بالفعل.');
                else showAlert(`حدث خطأ: ${error.message}`);
            } else {
                closeModal();
                showAlert(formId ? 'تم تحديث البيانات بنجاح.' : 'تمت إضافة حارس التغطية بنجاح.');
                loadHrDashboard('coverage_recruitment');
            }
        });

        document.getElementById('submit-staff-form-btn').addEventListener('click', async () => {
            const formId = document.getElementById('staff-form-id').value;
            const role = document.getElementById('staff-form-role').value;
            const assignments = Array.from(document.querySelectorAll('#staff-form-assignments-list .assignment-row')).map(row => ({
                region: row.querySelector('[data-type="region"]').value.trim(),
                location: row.querySelector('[data-type="location"]').value.trim(),
                project: row.querySelector('[data-type="project"]').value.trim(),
            })).filter(a => a.region || a.location || a.project);
        
            const payload = {
                name: document.getElementById('staff-form-name').value.trim(),
                username: document.getElementById('staff-form-username').value.trim(),
                job_title: document.getElementById('staff-form-title-input').value.trim() || null,
                role: role,
                assignments: (role === 'admin' || role === 'operations') && assignments.length > 0 ? assignments : null,
            };
            const password = document.getElementById('staff-form-password').value;
            if(password) {
                payload.password = password;
            }
        
            if (!payload.name || !payload.username) {
                return showAlert('الاسم واسم المستخدم / الهوية حقول إلزامية.');
            }
        
            showLoading(true);
            let error;
        
            if (formId) {
                ({error} = await _supabase.from('staff').update(payload).eq('id', formId));
            } else {
                if (!password) {
                    showLoading(false);
                    return showAlert('كلمة المرور مطلوبة للموظف الجديد.');
                }
                ({error} = await _supabase.from('staff').insert(payload));
            }
        
            showLoading(false);
            if (error) {
                showAlert(`فشلت العملية: ${error.message}`);
            } else {
                showAlert(formId ? 'تم تحديث بيانات الموظف بنجاح.' : 'تمت إضافة الموظف بنجاح.');
                closeModal();
                const roleToTabMap = { 'hr': 'hr_staff', 'admin': 'supervisors', 'operations': 'operations', 'contracts': 'contracts_staff'};
                loadHrDashboard(roleToTabMap[role]);
            }
        });

        document.getElementById('submit-coverage-site-form-btn').addEventListener('click', async () => {
            const project = document.getElementById('coverage-site-project').value.trim();
            const location = document.getElementById('coverage-site-location').value.trim();
            const coverage_date = document.getElementById('coverage-site-date').value;
            const shift_day = document.getElementById('coverage-site-day').value;
            const shift_start = document.getElementById('coverage-site-start-time').value;
            const shift_end = document.getElementById('coverage-site-end-time').value;
            const payout_amount = parseFloat(document.getElementById('coverage-site-payout').value);
            const formId = document.getElementById('coverage-site-form-id').value;
            
            if (!project || !location || !coverage_date || !shift_start || !shift_end || !payout_amount) {
                return showAlert('يرجى ملء جميع الحقول.');
            }
            
            const shift_details = `${shift_day} (${shift_start} - ${shift_end})`;

            const payload = { project, location, coverage_date, shift_day, shift_start, shift_end, shift_details, payout_amount, status: 'Available' };

            showLoading(true);
            let error, successMessage;

            if(formId) {
                ({error} = await _supabase.from('coverages').update(payload).eq('id', formId));
                successMessage = "تم تحديث التغطية بنجاح!";
            } else {
                ({error} = await _supabase.from('coverages').insert(payload));
                successMessage = "تم إنشاء التغطية بنجاح!";
            }

            showLoading(false);
            if (error) {
                showAlert(`حدث خطأ: ${error.message}`);
            } else {
                closeModal();
                showAlert(successMessage);
                loadHrDashboard('coverage_sites');
            }
        });

        document.getElementById('submit-contract-form-btn').addEventListener('click', async () => {
    const formId = document.getElementById('contract-form-id').value;
    
    // Collect dynamic clauses
    const contract_clauses = [];
    document.querySelectorAll('#clauses-container .clause-group').forEach(groupDiv => {
        const title = groupDiv.querySelector('.clause-group-title').value.trim();
        const items = [];
        groupDiv.querySelectorAll('.clause-item textarea').forEach(itemTextarea => {
            const item = itemTextarea.value.trim();
            if (item) {
                items.push(item);
            }
        });
        if (title && items.length > 0) {
            contract_clauses.push({ title, items });
        }
    });

    const payload = {
        company_name: document.getElementById('contract-form-company-name').value.trim(),
        region: document.getElementById('contract-form-region').value.trim() || null,
        location: document.getElementById('contract-form-location').value.trim() || null,
        project: document.getElementById('contract-form-project').value.trim() || null,
        guards_count: parseInt(document.getElementById('contract-form-guards-count').value) || 0,
        contract_duration: document.getElementById('contract-form-duration').value.trim() || null,
        contract_value: parseFloat(document.getElementById('contract-form-value').value) || null,
        start_date: document.getElementById('contract-form-start-date').value || null,
        end_date: document.getElementById('contract-form-end-date').value || null,
        status: document.getElementById('contract-form-status').value,
        notes: document.getElementById('contract-form-notes').value.trim() || null,
        contract_clauses: contract_clauses.length > 0 ? contract_clauses : null, // Add clauses to payload
        // Include creator details only for new contracts
    };

    if (!payload.company_name || !payload.guards_count) {
        return showAlert('اسم الشركة وعدد الحراس حقول إلزامية.');
    }

    showLoading(true);
    let error, successMessage;

    if (formId) {
        // Update existing contract
        ({ error } = await _supabase.from('contracts').update(payload).eq('id', formId));
        successMessage = "تم تحديث العقد بنجاح!";
    } else {
        // Create new contract
        payload.created_by_id = state.currentUser.id;
        payload.created_by_name = state.currentUser.name;
        ({ error } = await _supabase.from('contracts').insert(payload));
        successMessage = "تم إنشاء العقد بنجاح!";
    }
    
    showLoading(false);
    if(error) {
         showAlert(`فشلت العملية: ${error.message}`);
    } else {
        showAlert(successMessage);
        closeModal();
        loadContractsDashboard();
    }
});


        document.getElementById('submit-guard-form-btn').addEventListener('click', async () => {
            const formId = document.getElementById('guard-form-id').value;
            const weekly_schedule = {};
            document.querySelectorAll('#guard-form-schedule-container .grid').forEach(row => {
                const day = row.querySelector('input[type="time"]').dataset.day;
                const start = row.querySelector('input[data-type="start"]').value;
                const end = row.querySelector('input[data-type="end"]').value;
                if(start && end) {
                    weekly_schedule[day] = { start, end };
                }
            });

            const payload = {
                name: document.getElementById('guard-form-name').value.trim(),
                mobile_number: document.getElementById('guard-form-mobile').value.trim(),
                job_title: document.getElementById('guard-form-job-title').value.trim(),
                location: document.getElementById('guard-form-location').value.trim(),
                region: document.getElementById('guard-form-region').value.trim(),
                project: document.getElementById('guard-form-project').value.trim(),
                status: document.getElementById('guard-form-status').value,
                basic_salary: parseFloat(document.getElementById('guard-form-basic-salary').value) || 0,
                housing_allowance: parseFloat(document.getElementById('guard-form-housing-allowance').value) || 0,
                transport_allowance: parseFloat(document.getElementById('guard-form-transport-allowance').value) || 0,
                other_allowances: parseFloat(document.getElementById('guard-form-other-allowances').value) || 0,
                weekly_schedule
            };
            
            const password = document.getElementById('guard-form-password').value;
            if(password) {
                payload.password = password;
            }

            showLoading(true);
            let error;

            if(formId) {
                ({error} = await _supabase.from('guards').update(payload).eq('id', formId));
            } else {
                payload.id = document.getElementById('guard-form-national-id').value.trim();
                if(!payload.id || !payload.password) {
                    showLoading(false);
                    return showAlert('رقم الهوية وكلمة المرور مطلوبان للحارس الجديد.');
                }
                ({error} = await _supabase.from('guards').insert(payload));
            }
            
            showLoading(false);
            if (error) {
                showAlert(`فشلت العملية: ${error.message}`);
            } else {
                showAlert(formId ? 'تم تحديث بيانات الحارس بنجاح.' : 'تمت إضافة الحارس بنجاح.');
                closeModal();
                loadHrDashboard('guards');
            }
        });
        
        // --- Initial Application Start ---
        showLoading(true);
        setupEventListeners();
        checkSession();
        showLoading(false);
    };
    runApp();
});
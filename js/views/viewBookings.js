// View Bookings View Module
window.ViewBookingsView = (function() {
    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        bookedOn: { from: '', to: '' },
        hall: { name: '', type: '' },
        purpose: '',
        dateTime: { from: '', to: '' },
        bookedBy: { name: '' },
        belongsTo: { school: '', department: '' },
        status: ''
    });

    let state = {
        allBookings: [],
        filteredBookings: [],
        filters: defaultFilters(),
        schoolsDataCache: null,
        departmentsDataCache: null,
        employeeDataCache: null,
    };
    let abortController;

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) className = 'text-red-400';
        if (status.includes('CONFIRMED')) className = 'text-green-400';
        return { text, className };
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    // --- API & DATA HANDLING ---
    async function fetchViewBookingsData() {
        // This assumes an API service method exists to fetch all bookings, which is more
        // appropriate for a "View All" page than fetching only pending approvals.
        // Ensure `ApiService.bookings.getAllBookings()` is correctly defined in your api.js file.
        return await ApiService.bookings.getMyBookings();
    }

    async function getSchoolsAndDepartments() {
        if (state.schoolsDataCache && state.departmentsDataCache) {
            return { schools: state.schoolsDataCache, departments: state.departmentsDataCache };
        }
        const [schools, departments] = await Promise.all([
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);
        state.schoolsDataCache = schools;
        state.departmentsDataCache = departments;
        return { schools, departments };
    }

    async function getEmployees() {
        if (state.employeeDataCache) return state.employeeDataCache;
        const employees = await ApiService.employees.getAll();
        state.employeeDataCache = employees;
        return employees;
    }

    // --- FILTERING LOGIC ---
    function applyFiltersAndRender() {
        const { bookedOn, hall, purpose, dateTime, bookedBy, belongsTo, status } = state.filters;

        state.filteredBookings = state.allBookings.filter(b => {
            if (bookedOn.from && new Date(b.created_at) < new Date(bookedOn.from)) return false;
            if (bookedOn.to) {
                const toDate = new Date(bookedOn.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.created_at) > toDate) return false;
            }
            if (hall.name && !b.hall?.name.toLowerCase().includes(hall.name.toLowerCase())) return false;
            if (hall.type && b.hall?.type !== hall.type) return false;
            if (purpose && !b.purpose.toLowerCase().includes(purpose.toLowerCase())) return false;
            if (dateTime.from && new Date(b.start_date) < new Date(dateTime.from)) return false;
            if (dateTime.to) {
                const toDate = new Date(dateTime.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.end_date) > toDate) return false;
            }
            if (bookedBy.name && !b.user?.employee?.employee_name.toLowerCase().includes(bookedBy.name.toLowerCase())) return false;
            if (belongsTo.school && !b.user?.employee?.school?.school_name.toLowerCase().includes(belongsTo.school.toLowerCase())) return false;
            if (belongsTo.department && !b.user?.employee?.department?.department_name.toLowerCase().includes(belongsTo.department.toLowerCase())) return false;
            if (status && b.status !== status) return false;

            return true;
        });

        renderViewBookingsTable();
    }

    // --- RENDERING ---
    function renderViewBookingsTable() {
        const data = state.filteredBookings;
        const tableBody = document.getElementById('view-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">No bookings found for the current filters.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const { text: statusText, className: statusClass } = formatStatus(booking.status);
            const hallName = booking.hall?.name || 'N/A';
            const hallType = formatTitleCase(booking.hall?.type);
            const dateRange = `${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}`;
            const timeRange = `${booking.start_time} - ${booking.end_time}`;
            const userName = booking.user?.employee?.employee_name || 'N/A';
            const userDepartment = booking.user?.employee?.department?.department_name || 'N/A';
            const userSchool = booking.user?.employee?.school?.school_name || 'N/A';
            
            const hallBelongsTo = formatTitleCase(booking.hall?.belongs_to);
            const hallDepartment = booking.hall?.department?.department_name || 'N/A';
            const hallSchool = booking.hall?.school?.school_name || 'N/A';

            return `
                <tbody class="booking-item">
                    <tr class="booking-row cursor-pointer hover:bg-slate-800/50 transition-colors border-b border-slate-700">
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${formatDate(booking.created_at)}</td>
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${hallName}</div><div class="text-slate-400">${hallType}</div></td>
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${booking.purpose}</div><div class="text-slate-400">${booking.class_code || ''}</div></td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300"><div>${dateRange}</div><div class="text-slate-400">${timeRange}</div></td>
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${userName}</div><div class="text-slate-400 text-xs break-all">${booking.user_id || ''}</div></td>
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${userDepartment}</div><div class="text-slate-400">${userSchool}</div></td>
                        <td class="px-3 py-4 text-sm font-semibold ${statusClass}">${statusText}</td>
                        <td class="px-3 py-4 text-sm text-slate-400 text-center"><i data-lucide="chevron-down" class="expand-icon w-4 h-4 transition-transform inline-block"></i></td>
                    </tr>
                    <tr class="details-row bg-slate-900/70 hidden">
                        <td colspan="8" class="p-0">
                            <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                                <div class="space-y-3">
                                    <h4 class="font-semibold text-white border-b border-slate-600 pb-2">Hall Details</h4>
                                    <p><strong class="text-slate-400 w-24 inline-block">Type:</strong> <span class="text-white">${hallType}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Belongs To:</strong> <span class="text-white">${hallBelongsTo}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Hall School:</strong> <span class="text-white">${hallSchool}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Hall Dept:</strong> <span class="text-white">${hallDepartment}</span></p>
                                </div>
                                <div class="space-y-3">
                                    <h4 class="font-semibold text-white border-b border-slate-600 pb-2">User Details</h4>
                                    <p><strong class="text-slate-400 w-24 inline-block">Name:</strong> <span class="text-white">${userName}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Affiliation:</strong> <span class="text-white">${formatTitleCase(booking.user?.employee?.belongs_to)}</span></p>
                                     <p><strong class="text-slate-400 w-24 inline-block">User School:</strong> <span class="text-white">${userSchool}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">User Dept:</strong> <span class="text-white">${userDepartment}</span></p>
                                </div>
                                 <div class="space-y-3">
                                    <h4 class="font-semibold text-white border-b border-slate-600 pb-2">Booking Info</h4>
                                    <p><strong class="text-slate-400 w-24 inline-block">Status:</strong> <span class="font-semibold ${statusClass}">${statusText}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Booking ID:</strong> <span class="text-white font-mono text-xs">${booking.unique_id || 'N/A'}</span></p>
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            `;
        }).join('');
        tableBody.innerHTML = tableHtml;
        updateFilterIcons();
        if (window.lucide) lucide.createIcons();
    }

    function updateFilterIcons() {
        document.querySelectorAll('#view-bookings-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'bookedOn': isActive = state.filters.bookedOn.from || state.filters.bookedOn.to; break;
                case 'hall': isActive = !!state.filters.hall.name || !!state.filters.hall.type; break;
                case 'purpose': isActive = !!state.filters.purpose; break;
                case 'dateTime': isActive = state.filters.dateTime.from || state.filters.dateTime.to; break;
                case 'bookedBy': isActive = !!state.filters.bookedBy.name; break;
                case 'belongsTo': isActive = state.filters.belongsTo.school || state.filters.belongsTo.department; break;
                case 'status': isActive = !!state.filters.status; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    // --- MODAL HANDLING ---
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        const backdrop = document.getElementById('modal-backdrop');
        if (!modal || !backdrop) return;
        backdrop.classList.remove('hidden', 'opacity-0');
        modal.classList.remove('hidden');
    }

    function closeModal() {
        const backdrop = document.getElementById('modal-backdrop');
        if(backdrop) {
            backdrop.classList.add('opacity-0');
            setTimeout(() => backdrop.classList.add('hidden'), 300);
        }
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.id.startsWith('filter-modal-')) {
                modal.remove();
            } else {
                modal.classList.add('hidden');
            }
        });
    }

    function createFilterModal(column, title, contentHtml) {
        const container = document.getElementById('filter-modal-container');
        if (!container) return;
        const modalId = `filter-modal-${column}`;
        if (document.getElementById(modalId)) document.getElementById(modalId).remove();
        const modalHtml = `<div id="${modalId}" class="modal fixed inset-0 z-50 flex items-center justify-center p-4"><div class="modal-content relative bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all"><h3 class="text-lg font-bold text-white mb-4">${title}</h3><div id="filter-form-${column}" class="space-y-4 text-slate-300">${contentHtml}</div><div class="mt-6 flex justify-between gap-4"><button data-action="clear-filter" data-column="${column}" class="px-4 py-2 text-sm font-semibold text-blue-400 hover:text-blue-300">Clear Filter</button><div class="flex gap-4"><button class="modal-close-btn px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-600 hover:bg-slate-700 rounded-lg transition">Cancel</button><button data-action="apply-filter" data-column="${column}" class="glowing-btn px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Apply</button></div></div></div></div>`;
        container.insertAdjacentHTML('beforeend', modalHtml);
    }

    function setupSearchableDropdown(inputId, optionsId, hiddenId, data, initialValue = '') {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);
        if (!input || !optionsContainer || !hiddenInput) return;

        hiddenInput.value = initialValue;
        if(initialValue) input.value = initialValue;

        const populateOptions = (term = '') => {
            const filteredData = data.filter(item => item.toLowerCase().includes(term.toLowerCase()));
            optionsContainer.innerHTML = filteredData.map(item => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${item}">${item}</div>`).join('');
        };
        input.addEventListener('focus', () => { populateOptions(input.value); optionsContainer.classList.remove('hidden'); });
        input.addEventListener('input', () => populateOptions(input.value));
        optionsContainer.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                hiddenInput.value = value;
                input.value = value;
                optionsContainer.classList.add('hidden');
            }
        });
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !optionsContainer.contains(e.target)) {
                 optionsContainer.classList.add('hidden');
            }
        });
    }

    async function openFilterModalFor(column) {
        let title, contentHtml;
        switch (column) {
            case 'bookedOn':
                title = 'Filter by Booked On Date';
                contentHtml = `<div class="grid grid-cols-2 gap-4"><div><label for="filter-booked-from" class="block text-sm font-medium mb-1">From</label><input type="date" id="filter-booked-from" value="${state.filters.bookedOn.from}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"></div><div><label for="filter-booked-to" class="block text-sm font-medium mb-1">To</label><input type="date" id="filter-booked-to" value="${state.filters.bookedOn.to}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"></div></div>`;
                break;
            case 'hall':
                title = 'Filter by Hall';
                const hallTypes = [...new Set(state.allBookings.map(b => b.hall?.type).filter(Boolean))];
                const hallTypeOptions = hallTypes.map(s => `<option value="${s}" ${state.filters.hall.type === s ? 'selected' : ''}>${formatTitleCase(s)}</option>`).join('');
                contentHtml = `
                    <div>
                        <label for="filter-hall-name" class="block text-sm font-medium mb-1">Hall Name contains</label>
                        <input type="text" id="filter-hall-name" value="${state.filters.hall.name}" placeholder="e.g., Test_CSE_Hall" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>
                    <div>
                        <label for="filter-hall-type" class="block text-sm font-medium mb-1">Hall Type</label>
                        <select id="filter-hall-type" class="glowing-select w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                            <option value="">Any Type</option>
                            ${hallTypeOptions}
                        </select>
                    </div>
                `;
                break;
            case 'purpose':
                title = 'Filter by Purpose';
                contentHtml = `<div><label for="filter-purpose" class="block text-sm font-medium mb-1">Purpose contains</label><input type="text" id="filter-purpose" value="${state.filters.purpose}" placeholder="e.g., Meeting, Class" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"></div>`;
                break;
            case 'dateTime':
                title = 'Filter by Booking Date Range';
                contentHtml = `<div class="grid grid-cols-2 gap-4"><div><label for="filter-datetime-from" class="block text-sm font-medium mb-1">From</label><input type="date" id="filter-datetime-from" value="${state.filters.dateTime.from}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"></div><div><label for="filter-datetime-to" class="block text-sm font-medium mb-1">To</label><input type="date" id="filter-datetime-to" value="${state.filters.dateTime.to}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"></div></div>`;
                break;
            case 'bookedBy':
                title = 'Filter by User';
                 contentHtml = `<div>
                    <label for="filter-user-name-input" class="block text-sm font-medium mb-1">User Name</label>
                    <div class="relative"><input type="text" id="filter-user-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a user..." autocomplete="off"><div id="filter-user-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div>
                    <input type="hidden" id="filter-user-name" value="${state.filters.bookedBy.name}"></div>`;
                break;
            case 'belongsTo':
                 title = 'Filter by User School/Department';
                 contentHtml = `<div><label for="filter-school-input" class="block text-sm font-medium mb-1">School</label><div class="relative"><input type="text" id="filter-school-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search..." autocomplete="off"><div id="filter-school-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-school" value="${state.filters.belongsTo.school}"></div><div><label for="filter-department-input" class="block text-sm font-medium mb-1">Department</label><div class="relative"><input type="text" id="filter-department-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search..." autocomplete="off"><div id="filter-department-options" class="absolute z-10 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-department" value="${state.filters.belongsTo.department}"></div>`;
                 break;
            case 'status':
                title = 'Filter by Status';
                const statuses = [...new Set(state.allBookings.map(b => b.status))];
                const statusOptions = statuses.map(s => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${formatStatus(s).text}</option>`).join('');
                contentHtml = `<select id="filter-status" class="glowing-select w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"><option value="">Any</option>${statusOptions}</select>`;
                break;
            default: return;
        }

        createFilterModal(column, title, contentHtml);
        
        if (column === 'bookedBy') {
            const employees = await getEmployees();
            const userNames = [...new Set(employees.map(e => e.employee_name))].sort();
            setupSearchableDropdown('filter-user-name-input', 'filter-user-name-options', 'filter-user-name', userNames, state.filters.bookedBy.name);
        }
        if (column === 'belongsTo') {
            const { schools, departments } = await getSchoolsAndDepartments();
            const schoolNames = schools.map(s => s.school_name).sort();
            const departmentNames = departments.map(d => d.department_name).sort();
            setupSearchableDropdown('filter-school-input', 'filter-school-options', 'filter-school', schoolNames, state.filters.belongsTo.school);
            setupSearchableDropdown('filter-department-input', 'filter-department-options', 'filter-department', departmentNames, state.filters.belongsTo.department);
        }

        openModal(`filter-modal-${column}`);
    }

    function handleApplyFilter(column) {
        const form = document.getElementById(`filter-form-${column}`);
        if (!form) return;

        switch (column) {
            case 'bookedOn':
                state.filters.bookedOn.from = form.querySelector('#filter-booked-from').value;
                state.filters.bookedOn.to = form.querySelector('#filter-booked-to').value;
                break;
            case 'hall':
                state.filters.hall.name = form.querySelector('#filter-hall-name').value;
                state.filters.hall.type = form.querySelector('#filter-hall-type').value;
                break;
            case 'purpose':
                state.filters.purpose = form.querySelector('#filter-purpose').value;
                break;
            case 'dateTime':
                state.filters.dateTime.from = form.querySelector('#filter-datetime-from').value;
                state.filters.dateTime.to = form.querySelector('#filter-datetime-to').value;
                break;
            case 'bookedBy':
                state.filters.bookedBy.name = form.querySelector('#filter-user-name').value;
                break;
            case 'belongsTo':
                state.filters.belongsTo.school = form.querySelector('#filter-school').value;
                state.filters.belongsTo.department = form.querySelector('#filter-department').value;
                break;
            case 'status':
                state.filters.status = form.querySelector('#filter-status').value;
                break;
        }
        applyFiltersAndRender();
        closeModal();
    }

    function handleClearFilter(column) {
        state.filters[column] = defaultFilters()[column];
        applyFiltersAndRender();
        closeModal();
    }

    // --- EVENT HANDLING ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('view-bookings-view');
        if(!view) return;

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }
            if (e.target.closest('#clear-view-bookings-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }
            
            const bookingRow = e.target.closest('.booking-row');
            if (bookingRow) {
                const detailsRow = bookingRow.nextElementSibling;
                const icon = bookingRow.querySelector('.expand-icon');
                if (detailsRow && detailsRow.classList.contains('details-row')) {
                    detailsRow.classList.toggle('hidden');
                    icon.classList.toggle('rotate-180');
                }
            }
        }, { signal });

        document.getElementById('filter-modal-container')?.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'apply-filter') handleApplyFilter(button.dataset.column);
            if (button.dataset.action === 'clear-filter') handleClearFilter(button.dataset.column);
            if (button.classList.contains('modal-close-btn')) closeModal();
        }, { signal });
    }

    // --- INITIALIZATION ---
    async function initialize() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const tableBody = document.getElementById('view-bookings-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10"><div class="spinner"></div></td></tr>`;

        try {
            const responseData = await fetchViewBookingsData();
            
            let bookingsArray = [];
            if (Array.isArray(responseData)) {
                bookingsArray = responseData;
            } else if (responseData && typeof responseData === 'object' && Array.isArray(responseData.data)) {
                bookingsArray = responseData.data;
            }
            
            state.allBookings = bookingsArray;
            
            await Promise.all([
                getSchoolsAndDepartments(),
                getEmployees()
            ]);
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Detailed error in ViewBookingsView initialize:', error);
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-red-400">Failed to load bookings. Please try again.</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = {
            allBookings: [],
            filteredBookings: [],
            filters: defaultFilters(),
            schoolsDataCache: null,
            departmentsDataCache: null,
            employeeDataCache: null,
        };
        closeModal();
    }

    return { initialize, cleanup };
})();


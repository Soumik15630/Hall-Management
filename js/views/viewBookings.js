// View Bookings View Module (Updated to use FilterManager)
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
        if (status.includes('REJECTED') || status.includes('CANCELLED')) className = 'text-red-400';
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
            if (hall.name && b.hall?.name !== hall.name) return false;
            if (hall.type && b.hall?.type !== hall.type) return false;
            if (purpose && !b.purpose.toLowerCase().includes(purpose.toLowerCase())) return false;
            if (dateTime.from && new Date(b.start_date) < new Date(dateTime.from)) return false;
            if (dateTime.to) {
                const toDate = new Date(dateTime.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.end_date) > toDate) return false;
            }
            if (bookedBy.name && b.user?.employee?.employee_name !== bookedBy.name) return false;
            if (belongsTo.school && b.user?.employee?.school?.school_name !== belongsTo.school) return false;
            if (belongsTo.department && b.user?.employee?.department?.department_name !== belongsTo.department) return false;
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
                            <div class="p-4 text-sm">
                                <!-- Expanded details can be added here if needed -->
                                <p><strong class="text-slate-400">Booking ID:</strong> <span class="text-white font-mono text-xs">${booking.unique_id || 'N/A'}</span></p>
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

    // --- FILTER MANAGER INTEGRATION ---
    async function openFilterModalFor(column) {
        const context = {
            currentFilters: state.filters,
            allData: {
                bookings: state.allBookings,
                schools: state.schoolsDataCache,
                departments: state.departmentsDataCache,
                employees: state.employeeDataCache,
            }
        };
        FilterManager.openFilterModalFor(column, context);
    }

    function handleApplyFilter(newValues) {
        state.filters = { ...state.filters, ...newValues };
        applyFiltersAndRender();
    }

    function handleClearFilter(column) {
        if (state.filters.hasOwnProperty(column)) {
            state.filters[column] = defaultFilters()[column];
            applyFiltersAndRender();
        }
    }

    // --- EVENT HANDLING ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('view-bookings-view');
        if(!view) return;

        // Initialize FilterManager for this view
        FilterManager.initialize({
            onApply: handleApplyFilter,
            onClear: handleClearFilter,
        });

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
    }

    // --- INITIALIZATION ---
    async function initialize() {
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
        FilterManager.close();
    }

    return { initialize, cleanup };
})();

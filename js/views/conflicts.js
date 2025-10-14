// Booking Conflicts View Module (Updated to use FilterManager)
window.ConflictsView = (function() {
    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        bookedOn: { from: '', to: '' },
        hall: { name: '' },
        purpose: '',
        dateTime: { from: '', to: '' },
        bookedBy: { name: '' },
        status: ''
    });

    let state = {
        allConflicts: [],
        filteredConflicts: [],
        filters: defaultFilters(),
        employeeDataCache: null,
    };
    let abortController;

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) className = 'text-red-400';
        else if (status.includes('APPROVED')) className = 'text-green-400';
        return { text, className };
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // --- API & DATA HANDLING ---
    async function getEmployees() {
        if (state.employeeDataCache) return state.employeeDataCache;
        const employees = await ApiService.employees.getAll();
        state.employeeDataCache = employees;
        return employees;
    }

    async function fetchBookingConflictsData() {
        // This endpoint might need to be adjusted to one that specifically returns conflicts
        return await ApiService.bookings.getForApproval();
    }

    async function handleBookingAction(bookingId, action) {
        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if(row) {
            row.style.opacity = '0.5';
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
        try {
            await ApiService.bookings.updateStatus(bookingId, action);
            await initialize(); // Re-fetch the list to see if the conflict is resolved
        } catch (error) {
            console.error(`Failed to ${action} booking ${bookingId}:`, error);
            alert(`Error: Could not ${action} the booking. ${error.message}`);
            if(row) {
                 row.style.opacity = '1';
                 row.querySelectorAll('button').forEach(btn => btn.disabled = false);
            }
        }
    }

    // --- FILTERING ---
    function applyFiltersAndRender() {
        const { bookedOn, hall, purpose, dateTime, bookedBy, status } = state.filters;

        state.filteredConflicts = state.allConflicts.filter(b => {
            if (bookedOn.from && new Date(b.created_at) < new Date(bookedOn.from)) return false;
            if (bookedOn.to) {
                const toDate = new Date(bookedOn.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.created_at) > toDate) return false;
            }
            if (hall.name && b.hall?.name !== hall.name) return false;
            if (purpose && !b.purpose.toLowerCase().includes(purpose.toLowerCase())) return false;
            if (dateTime.from && new Date(b.start_date) < new Date(dateTime.from)) return false;
            if (dateTime.to) {
                const toDate = new Date(dateTime.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.end_date) > toDate) return false;
            }
            if (bookedBy.name && b.user?.employee?.employee_name !== bookedBy.name) return false;
            if (status && b.status !== status) return false;

            return true;
        });
        renderBookingConflictsTable();
    }

    // --- RENDERING ---
    function renderBookingConflictsTable() {
        const data = state.filteredConflicts;
        const tableBody = document.getElementById('booking-conflicts-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No booking conflicts found.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => `
            <tr class="bg-red-900/20 hover:bg-red-900/40" data-booking-id="${booking.unique_id}">
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${formatDate(booking.created_at)}</td>
                <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${booking.hall?.name || 'N/A'}</div><div class="text-slate-400 text-xs break-all">${booking.hall_id}</div></td>
                <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${booking.purpose}</div><div class="text-slate-400">${booking.class_code || ''}</div></td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${new Date(booking.start_date).toLocaleDateString()} ${booking.start_time} - ${booking.end_time}</td>
                <td class="px-3 py-4 text-sm"><div class="font-medium text-blue-400">${booking.user?.employee?.employee_name || 'N/A'}</div></td>
                <td class="px-3 py-4 text-sm font-semibold text-yellow-400">${formatStatus(booking.status).text}</td>
                <td class="px-3 py-4 text-sm text-center">
                    <div class="flex flex-col sm:flex-row gap-2">
                        <button data-action="approve" class="px-2 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="reject" class="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');

        tableBody.innerHTML = tableHtml;
        updateFilterIcons();
        if (window.lucide) lucide.createIcons();
    }

    function updateFilterIcons() {
        document.querySelectorAll('#booking-conflicts-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'bookedOn': isActive = state.filters.bookedOn.from || state.filters.bookedOn.to; break;
                case 'hall': isActive = !!state.filters.hall.name; break;
                case 'purpose': isActive = !!state.filters.purpose; break;
                case 'dateTime': isActive = state.filters.dateTime.from || state.filters.dateTime.to; break;
                case 'bookedBy': isActive = !!state.filters.bookedBy.name; break;
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
                // Use a consistent key 'bookings' for the FilterManager
                bookings: state.allConflicts,
                employees: state.employeeDataCache
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

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('booking-conflicts-view');
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

            if (e.target.closest('#clear-conflicts-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }

            const button = e.target.closest('button[data-action]');
            if (!button || button.disabled) return;
            const action = button.dataset.action;
            const row = e.target.closest('tr[data-booking-id]');
            const bookingId = row ? row.dataset.bookingId : null;
            if (bookingId && (action === 'approve' || action === 'reject')) {
                 if (confirm(`Are you sure you want to ${action} this booking? This may resolve the conflict.`)) {
                    handleBookingAction(bookingId, action);
                }
            }
        }, { signal });
    }

    async function initialize() {
        const tableBody = document.getElementById('booking-conflicts-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10"><div class="spinner"></div></td></tr>`;

        try {
            // Pre-fetch data for filters
            await getEmployees();
            state.allConflicts = await fetchBookingConflictsData();
            
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading booking conflicts:', error);
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load conflict data. ${error.message}</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = { allConflicts: [], filteredConflicts: [], filters: defaultFilters(), employeeDataCache: null };
        FilterManager.close();
    }

    return { initialize, cleanup };
})();

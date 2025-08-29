// Booking Conflicts View Module
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
    async function apiCall(endpoint, method = 'GET', body = null) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const options = { method, headers };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        const response = await fetch(fullUrl, options);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${method} ${endpoint}: ${response.status} - ${errorText}`);
        }
        const text = await response.text();
        if (!text) return null;
        const result = JSON.parse(text);
        return result.data || result;
    }

    async function getEmployees() {
        if (state.employeeDataCache) return state.employeeDataCache;
        const employees = await apiCall(AppConfig.endpoints.allemp);
        state.employeeDataCache = employees;
        return employees;
    }

async function fetchBookingConflictsData() {
    // FIXED: The second argument to apiCall should be a string, not an object.
    return await apiCall('api/booking/approvals?filter=internal', 'GET');
}
    async function handleBookingAction(bookingId, action) {
        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if(row) {
            row.style.opacity = '0.5';
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
        try {
            const endpoint = `api/booking/${bookingId}/${action}`;
            await apiCall(endpoint, 'PUT');
            // After an action, re-fetch the conflicts list to see if the action resolved it.
            await initialize();
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

    // --- MODAL & EVENT HANDLING (No changes needed here) ---
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
            if (modal.id.startsWith('filter-modal-')) modal.remove();
            else modal.classList.add('hidden');
        });
    }
    
    function createFilterModal(column, title, contentHtml) {
        const container = document.getElementById('filter-modal-container');
        if (!container) return;
        const modalId = `filter-modal-${column}`;
        if (document.getElementById(modalId)) document.getElementById(modalId).remove();
        const modalHtml = `
        <div id="${modalId}" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="modal-content relative bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 class="text-lg font-bold text-white mb-4">${title}</h3>
                <div id="filter-form-${column}" class="space-y-4 text-slate-300">${contentHtml}</div>
                <div class="mt-6 flex justify-between gap-4">
                    <button data-action="clear-filter" data-column="${column}" class="px-4 py-2 text-sm font-semibold text-blue-400 hover:text-blue-300">Clear Filter</button>
                    <div class="flex gap-4">
                        <button class="modal-close-btn px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-600 hover:bg-slate-700 rounded-lg">Cancel</button>
                        <button data-action="apply-filter" data-column="${column}" class="glowing-btn px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Apply</button>
                    </div>
                </div>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    function setupSearchableDropdown(inputId, optionsId, hiddenId, data) {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);
        if (!input || !optionsContainer || !hiddenInput) return;

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
        input.addEventListener('blur', () => setTimeout(() => optionsContainer.classList.add('hidden'), 150));
        if (hiddenInput.value) input.value = hiddenInput.value;
    }

    async function openFilterModalFor(column) {
        let title, contentHtml;
        switch (column) {
            case 'bookedOn':
                title = 'Filter by Booked On Date';
                contentHtml = `<div class="grid grid-cols-2 gap-4"><div><label for="filter-booked-from" class="block text-sm font-medium mb-1">From</label><input type="date" id="filter-booked-from" value="${state.filters.bookedOn.from}" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div><div><label for="filter-booked-to" class="block text-sm font-medium mb-1">To</label><input type="date" id="filter-booked-to" value="${state.filters.bookedOn.to}" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div></div>`;
                break;
            case 'hall':
                title = 'Filter by Hall';
                contentHtml = `<div><label for="filter-hall-name-input" class="block text-sm font-medium mb-1">Hall Name</label><div class="relative"><input type="text" id="filter-hall-name-input" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search..." autocomplete="off"><div id="filter-hall-name-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-hall-name" value="${state.filters.hall.name}"></div>`;
                break;
            case 'purpose':
                title = 'Filter by Purpose';
                contentHtml = `<div><label for="filter-purpose" class="block text-sm font-medium mb-1">Purpose contains</label><input type="text" id="filter-purpose" value="${state.filters.purpose}" placeholder="e.g., Meeting" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div>`;
                break;
            case 'dateTime':
                title = 'Filter by Booking Date';
                contentHtml = `<div class="grid grid-cols-2 gap-4"><div><label for="filter-datetime-from" class="block text-sm font-medium mb-1">From</label><input type="date" id="filter-datetime-from" value="${state.filters.dateTime.from}" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div><div><label for="filter-datetime-to" class="block text-sm font-medium mb-1">To</label><input type="date" id="filter-datetime-to" value="${state.filters.dateTime.to}" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"></div></div>`;
                break;
            case 'bookedBy':
                title = 'Filter by User';
                contentHtml = `<div><label for="filter-user-name-input" class="block text-sm font-medium mb-1">User Name</label><div class="relative"><input type="text" id="filter-user-name-input" class="glowing-input w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search..." autocomplete="off"><div id="filter-user-name-options" class="absolute z-20 w-full bg-slate-900 border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div></div><input type="hidden" id="filter-user-name" value="${state.filters.bookedBy.name}"></div>`;
                break;
            case 'status':
                title = 'Filter by Status';
                const statuses = [...new Set(state.allConflicts.map(b => b.status))];
                const statusOptions = statuses.map(s => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${formatStatus(s).text}</option>`).join('');
                contentHtml = `<select id="filter-status" class="glowing-select w-full bg-slate-700 border-slate-600 rounded-lg px-3 py-2 text-white"><option value="">Any</option>${statusOptions}</select>`;
                break;
        }
        createFilterModal(column, title, contentHtml);

        if (column === 'hall') {
            const hallNames = [...new Set(state.allConflicts.map(b => b.hall?.name).filter(Boolean))].sort();
            setupSearchableDropdown('filter-hall-name-input', 'filter-hall-name-options', 'filter-hall-name', hallNames);
        }
        if (column === 'bookedBy') {
            const employees = await getEmployees();
            const userNames = [...new Set(employees.map(e => e.employee_name))].sort();
            setupSearchableDropdown('filter-user-name-input', 'filter-user-name-options', 'filter-user-name', userNames);
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

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('booking-conflicts-view');
        if(!view) return;

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) openFilterModalFor(filterIcon.dataset.filterColumn);
            
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

        document.getElementById('filter-modal-container')?.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'apply-filter') handleApplyFilter(button.dataset.column);
            if (button.dataset.action === 'clear-filter') handleClearFilter(button.dataset.column);
            if (button.classList.contains('modal-close-btn')) closeModal();
        }, { signal });
    }

    async function initialize() {
        const tableBody = document.getElementById('booking-conflicts-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10"><div class="spinner"></div></td></tr>`;
        
        try {
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
        closeModal();
    }

    return { initialize, cleanup };
})();

// Approve Bookings View Module
window.ApproveBookingsView = (function() {
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
        bookings: [],
        filteredBookings: [],
        filters: defaultFilters()
    };
    let abortController;

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        
        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) {
            className = 'text-red-400';
        } else if (status.includes('APPROVED')) {
            className = 'text-green-400';
        }
        return { text, className };
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        if (isJson) {
            const text = await response.text();
            if (!text) return null;
            const result = JSON.parse(text);
            return result.data || result;
        }
        return response;
    }

    async function fetchApprovalData() {
        return await fetchFromAPI(AppConfig.endpoints.pendingApprovals);
    }

    async function updateBookingStatus(bookingId, status) {
        const action = status === 'APPROVED' ? 'approve' : 'reject';
        const endpoint = `${AppConfig.endpoints.booking}/${bookingId}/${action}`;
        return await fetchFromAPI(endpoint, { method: 'PUT' });
    }
    
    // --- FILTERING ---
    function applyFiltersAndRender() {
        const { bookedOn, hall, purpose, dateTime, bookedBy, status } = state.filters;

        state.filteredBookings = state.bookings.filter(b => {
            if (bookedOn.from && new Date(b.created_at) < new Date(bookedOn.from)) return false;
            if (bookedOn.to) {
                const toDate = new Date(bookedOn.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.created_at) > toDate) return false;
            }
            if (hall.name && b.hall.name !== hall.name) return false;
            if (purpose && !b.purpose.toLowerCase().includes(purpose.toLowerCase())) return false;
            if (dateTime.from && new Date(b.start_date) < new Date(dateTime.from)) return false;
            if (dateTime.to) {
                const toDate = new Date(dateTime.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.start_date) > toDate) return false;
            }
            if (bookedBy.name && b.user.employee.employee_name !== bookedBy.name) return false;
            if (status && b.status !== status) return false;
            
            return true;
        });

        renderApproveBookingsTable();
    }

    // --- RENDERING ---
    function renderApproveBookingsTable() {
        const data = state.filteredBookings;
        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No pending requests match the current filters.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const hallName = booking.hall?.name || 'N/A';
            const userName = booking.user?.employee?.employee_name?.trim() || 'N/A';
            const startDateTime = new Date(`${booking.start_date.substring(0, 10)}T${booking.start_time}`);
            const endDateTime = new Date(`${booking.end_date.substring(0, 10)}T${booking.end_time}`);
            const statusInfo = formatStatus(booking.status);

            return `
            <tr class="hover:bg-slate-800/50 transition-colors" data-booking-id="${booking.unique_id}">
     
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${formatDate(booking.created_at)}</td>
                
  
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-white">${hallName}</div>
                    <div class="text-slate-400 text-xs break-all">${booking.hall_id}</div>
                </td>
                
     
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.purpose}</div>
                    <div class="text-slate-400">${booking.class_code || ''}</div>
                </td>

          
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${startDateTime.toLocaleString()} - ${endDateTime.toLocaleTimeString()}</td>
                
   
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-white">${userName}</div>
                    <div class="text-slate-400 text-xs break-all">${booking.user_id}</div>
                </td>
                
                <td class="px-3 py-4 text-sm font-semibold ${statusInfo.className}">${statusInfo.text}</td>
                
                <td class="px-3 py-4 text-sm">
                    <div class="flex flex-col sm:flex-row gap-2">
                        <button data-action="approve" class="px-2 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="reject" class="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                    </div>
                </td>
            </tr>
        `
        }).join('');

        tableBody.innerHTML = tableHtml;
        updateFilterIcons();
        if(window.lucide) lucide.createIcons();
    }
    
    function updateFilterIcons() {
        document.querySelectorAll('#approve-bookings-view .filter-icon').forEach(icon => {
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
        const existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();

        const modalHtml = `
        <div id="${modalId}" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="modal-content relative bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all">
                <h3 class="text-lg font-bold text-white mb-4">${title}</h3>
                <div id="filter-form-${column}" class="space-y-4 text-slate-300">
                    ${contentHtml}
                </div>
                <div class="mt-6 flex justify-between gap-4">
                    <button data-action="clear-filter" data-column="${column}" class="px-4 py-2 text-sm font-semibold text-blue-400 hover:text-blue-300">Clear Filter</button>
                    <div class="flex gap-4">
                        <button class="modal-close-btn px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-600 hover:bg-slate-700 rounded-lg transition">Cancel</button>
                        <button data-action="apply-filter" data-column="${column}" class="glowing-btn px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Apply</button>
                    </div>
                </div>
            </div>
        </div>
        `;
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

        input.addEventListener('focus', () => {
            populateOptions(input.value);
            optionsContainer.classList.remove('hidden');
        });

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
        
        if (hiddenInput.value) {
            input.value = hiddenInput.value;
        }
    }

    async function openFilterModalFor(column) {
        let title, contentHtml;
        switch (column) {
            case 'bookedOn':
                title = 'Filter by Booked On Date';
                contentHtml = `
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="filter-booked-from" class="block text-sm font-medium mb-1">From</label>
                            <input type="date" id="filter-booked-from" value="${state.filters.bookedOn.from}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label for="filter-booked-to" class="block text-sm font-medium mb-1">To</label>
                            <input type="date" id="filter-booked-to" value="${state.filters.bookedOn.to}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>`;
                break;
            case 'hall':
                title = 'Filter by Hall';
                const hallNames = [...new Set(state.bookings.map(b => b.hall.name))].sort();
                contentHtml = `
                    <div>
                        <label for="filter-hall-name-input" class="block text-sm font-medium mb-1">Hall Name</label>
                        <div class="relative">
                            <input type="text" id="filter-hall-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a hall..." autocomplete="off">
                            <div id="filter-hall-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-hall-name" value="${state.filters.hall.name}">
                    </div>`;
                break;
            case 'purpose':
                title = 'Filter by Purpose';
                contentHtml = `
                    <div>
                        <label for="filter-purpose" class="block text-sm font-medium mb-1">Purpose contains</label>
                        <input type="text" id="filter-purpose" value="${state.filters.purpose}" placeholder="e.g., Meeting, Class" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>`;
                break;
            case 'dateTime':
                title = 'Filter by Booking Date';
                contentHtml = `
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="filter-datetime-from" class="block text-sm font-medium mb-1">From</label>
                            <input type="date" id="filter-datetime-from" value="${state.filters.dateTime.from}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label for="filter-datetime-to" class="block text-sm font-medium mb-1">To</label>
                            <input type="date" id="filter-datetime-to" value="${state.filters.dateTime.to}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>`;
                break;
            case 'bookedBy':
                title = 'Filter by User';
                const userNames = [...new Set(state.bookings.map(b => b.user.employee.employee_name))].sort();
                contentHtml = `
                    <div>
                        <label for="filter-user-name-input" class="block text-sm font-medium mb-1">User Name</label>
                        <div class="relative">
                            <input type="text" id="filter-user-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a user..." autocomplete="off">
                            <div id="filter-user-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-user-name" value="${state.filters.bookedBy.name}">
                    </div>`;
                break;
            case 'status':
                title = 'Filter by Status';
                const statuses = [...new Set(state.bookings.map(b => b.status))];
                const statusOptions = statuses.map(s => {
                    const statusInfo = formatStatus(s);
                    return `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${statusInfo.text}</option>`;
                }).join('');
                contentHtml = `
                    <select id="filter-status" class="glowing-select w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        <option value="">Any</option>
                        ${statusOptions}
                    </select>`;
                break;
        }
        createFilterModal(column, title, contentHtml);

        if (column === 'hall') {
            setupSearchableDropdown('filter-hall-name-input', 'filter-hall-name-options', 'filter-hall-name', hallNames);
        }
        if (column === 'bookedBy') {
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

    // --- EVENT HANDLING ---
    async function handleBookingAction(bookingId, action) {
        const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
        try {
            // Find the row in the UI
            const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
            if (row) {
                // Dim the row and show a spinner
                row.style.opacity = '0.5';
                const actionCell = row.querySelector('td:last-child');
                if (actionCell) {
                    actionCell.innerHTML = `<div class="flex justify-center items-center"><svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>`;
                }
            }

            const response = await updateBookingStatus(bookingId, status);
            
            // Update the state locally to avoid a full re-fetch
            const bookingIndex = state.bookings.findIndex(b => b.unique_id === bookingId);
            if (bookingIndex !== -1) {
                state.bookings.splice(bookingIndex, 1); // Remove the booking from the list
            }
            applyFiltersAndRender(); // Re-render the table with the updated data
            
            showToast(response.message || `Booking ${action}ed successfully.`);

        } catch (error) {
            console.error(`Failed to ${action} booking:`, error);
            showToast(`Error: Could not ${action} the booking. ${error.message}`, 'error');
            // Restore the row if the API call failed
            applyFiltersAndRender();
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('approve-bookings-view');
        if(!view) return;

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }
            if (e.target.closest('#clear-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }
        }, { signal });

        document.getElementById('filter-modal-container')?.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'apply-filter') handleApplyFilter(button.dataset.column);
            if (button.dataset.action === 'clear-filter') handleClearFilter(button.dataset.column);
            if (button.classList.contains('modal-close-btn')) closeModal();
        }, { signal });

        const tableBody = document.getElementById('approve-bookings-body');
        if (tableBody) {
            tableBody.addEventListener('click', (e) => {
                const button = e.target.closest('button[data-action]');
                if (!button) return;

                const row = button.closest('tr');
                const bookingId = row.dataset.bookingId;
                const action = button.dataset.action;

                if (bookingId && (action === 'approve' || action === 'reject')) {
                    // Replace confirm with a custom modal if available, for now, it's ok
                    if (confirm(`Are you sure you want to ${action} this booking?`)) {
                        handleBookingAction(bookingId, action);
                    }
                }
            }, { signal });
        }
    }

    async function initialize() {
        try {
            const data = await fetchApprovalData();
            state.bookings = data;
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading approval data:', error);
            const tableBody = document.getElementById('approve-bookings-body');
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load approval data. ${error.message}</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = { bookings: [], filteredBookings: [], filters: defaultFilters() };
        closeModal();
    }

    return {
        initialize,
        cleanup
    };
})();

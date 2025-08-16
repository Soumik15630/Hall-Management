// My Bookings View Module
window.MyBookingsView = (function() {
    const defaultFilters = () => ({
        bookedOn: { from: '', to: '' },
        hall: { name: '', capacity: '', type: '' },
        purpose: '',
        dateTime: { from: '', to: '' },
        status: ''
    });

    let state = {
        bookings: [],
        filteredBookings: [],
        selectedRows: [], // Stores booking unique_ids
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
        } else if (status.includes('CONFIRMED')) {
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

    function formatHallType(apiType) {
        if (!apiType) return 'N/A';
        return apiType.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
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

    async function fetchMyBookingsData() {
        return await fetchFromAPI(AppConfig.endpoints.myBookings);
    }

    async function cancelBookings(bookingIds) {
        const cancelPromises = bookingIds.map(id =>
            fetchFromAPI(`${AppConfig.endpoints.booking}/${id}`, { method: 'DELETE' }, false)
        );
        return await Promise.all(cancelPromises);
    }
    
    // --- FILTERING ---
    function applyFiltersAndRender() {
        const { bookedOn, hall, purpose, dateTime, status } = state.filters;

        state.filteredBookings = state.bookings.filter(b => {
            if (bookedOn.from && new Date(b.created_at) < new Date(bookedOn.from)) return false;
            if (bookedOn.to) {
                const toDate = new Date(bookedOn.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(b.created_at) > toDate) return false;
            }
            
            // --- REWRITTEN HALL FILTER LOGIC ---
            // If any hall filter is active, the booking must have a hall object to be considered.
            if (hall.name || hall.capacity || hall.type) {
                if (!b.hall) return false; 
                if (hall.name && b.hall.name !== hall.name) return false;
                if (hall.capacity && b.hall.capacity < parseInt(hall.capacity, 10)) return false;
                if (hall.type && b.hall.type !== hall.type) return false;
            }
            // --- END REWRITTEN LOGIC ---

            if (purpose && !b.purpose.toLowerCase().includes(purpose.toLowerCase())) return false;
            
            // A booking is valid if its period (start_date to end_date) overlaps with the filter's period (dateTime.from to dateTime.to)
            const bookingStart = new Date(b.start_date);
            const bookingEnd = new Date(b.end_date);

            if (dateTime.from) {
                const filterStart = new Date(dateTime.from);
                // The booking must end on or after the filter start date to be included.
                if (bookingEnd < filterStart) return false;
            }
            if (dateTime.to) {
                const filterEnd = new Date(dateTime.to);
                filterEnd.setHours(23, 59, 59, 999);
                // The booking must start on or before the filter end date to be included.
                if (bookingStart > filterEnd) return false;
            }

            if (status && b.status !== status) return false;
            
            return true;
        });

        renderMyBookingsTable();
    }


    // --- RENDERING ---
    function renderMyBookingsTable() {
        const data = state.filteredBookings;
        const tableBody = document.getElementById('my-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400">You have no bookings that match the current filters.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const bookingId = booking.unique_id;
            const isSelected = state.selectedRows.includes(bookingId);
            const { text: statusText, className: statusClass } = formatStatus(booking.status);
            
            const hallName = booking.hall ? booking.hall.name : 'Hall name not available';
            const dateRange = `${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}`;
            const timeRange = `${booking.start_time} - ${booking.end_time}`;
            const days = booking.days_of_week.map(day => day.substring(0, 3).toUpperCase()).join(', ');

            return `
                <tr data-booking-id="${bookingId}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                    <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                        <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="text-slate-300">${formatDate(booking.created_at)}</div>
                        <div class="text-blue-400 text-xs mt-1">${booking.unique_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-white">${hallName}</div>
                        <div class="text-slate-400">${booking.hall_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-white">${booking.purpose}</div>
                        <div class="text-slate-400">${booking.class_code || 'N/A'}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">
                        <div>${dateRange}</div>
                        <div class="text-slate-400">${timeRange}</div>
                        <div class="text-slate-500 text-xs mt-1">${days}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusClass}">${statusText}</td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = tableHtml;
        updateCancelButtonState();
        updateFilterIcons();
        if(window.lucide) lucide.createIcons();
    }

    function updateFilterIcons() {
        document.querySelectorAll('#my-bookings-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'bookedOn': isActive = state.filters.bookedOn.from || state.filters.bookedOn.to; break;
                case 'hall': isActive = state.filters.hall.name || state.filters.hall.capacity || state.filters.hall.type; break;
                case 'purpose': isActive = !!state.filters.purpose; break;
                case 'dateTime': isActive = state.filters.dateTime.from || state.filters.dateTime.to; break;
                case 'status': isActive = !!state.filters.status; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    function updateCancelButtonState() {
        const cancelBtn = document.getElementById('cancel-bookings-btn');
        if (cancelBtn) {
            cancelBtn.disabled = state.selectedRows.length === 0;
        }
    }

    function handleRowSelection(bookingId, isChecked) {
        if (isChecked) {
            if (!state.selectedRows.includes(bookingId)) {
                state.selectedRows.push(bookingId);
            }
        } else {
            state.selectedRows = state.selectedRows.filter(id => id !== bookingId);
        }
        renderMyBookingsTable();
    }
    
    // --- MODAL HANDLING ---
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        const backdrop = document.getElementById('modal-backdrop');
        if (!modal || !backdrop) return;
        backdrop.classList.remove('hidden', 'opacity-0');
        modal.classList.remove('hidden', 'opacity-0');
    }

    function closeModal() {
        const backdrop = document.getElementById('modal-backdrop');
        const modals = document.querySelectorAll('.modal');
        backdrop?.classList.add('opacity-0');
        modals.forEach(modal => {
            modal.classList.add('opacity-0');
        });
        setTimeout(() => {
            backdrop?.classList.add('hidden');
            modals.forEach(modal => {
                 if (modal.id.startsWith('filter-modal-')) {
                    modal.remove();
                } else {
                    modal.classList.add('hidden');
                }
            });
        }, 300);
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
    
    // REWRITTEN: More robust dropdown logic to prevent focus/click race conditions.
    function setupSearchableDropdown(inputId, optionsId, hiddenId, data, displayFormatter = (item) => item) {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);

        if (!input || !optionsContainer || !hiddenInput) {
            console.error(`Dropdown setup failed for ${inputId}: element not found.`);
            return;
        }

        const sourceData = Array.isArray(data) ? data : [];

        const populateOptions = (term = '') => {
            const lowerCaseTerm = term.toLowerCase();
            const filteredData = sourceData.filter(item => 
                displayFormatter(item).toLowerCase().includes(lowerCaseTerm)
            );
            optionsContainer.innerHTML = filteredData.map(item => 
                `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${item}">${displayFormatter(item)}</div>`
            ).join('');
        };
        
        const selectOption = (value) => {
            hiddenInput.value = value;
            input.value = displayFormatter(value);
            optionsContainer.classList.add('hidden');
        };

        input.addEventListener('focus', () => {
            populateOptions(''); // Show all options on focus
            optionsContainer.classList.remove('hidden');
        });

        input.addEventListener('input', () => {
            populateOptions(input.value);
            if (!sourceData.some(item => displayFormatter(item) === input.value)) {
                hiddenInput.value = '';
            }
        });

        optionsContainer.addEventListener('mousedown', e => {
            e.preventDefault(); // Prevents the input from losing focus before the click is registered
            const target = e.target.closest('[data-value]');
            if (target) {
                selectOption(target.dataset.value);
            }
        });

        input.addEventListener('blur', () => {
            // Use a timeout to allow the mousedown event to register before hiding
            setTimeout(() => {
                optionsContainer.classList.add('hidden');
            }, 150);
        });

        if (hiddenInput.value) {
            input.value = displayFormatter(hiddenInput.value);
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
                const hallNames = [...new Set(state.bookings.map(b => b.hall?.name).filter(Boolean))].sort();
                const hallTypes = [...new Set(state.bookings.map(b => b.hall?.type).filter(Boolean))].sort();
                contentHtml = `
                    <div>
                        <label for="filter-hall-name-input" class="block text-sm font-medium mb-1">Hall Name</label>
                        <div class="relative">
                            <input type="text" id="filter-hall-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a hall..." autocomplete="off">
                            <div id="filter-hall-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-hall-name" value="${state.filters.hall.name}">
                    </div>
                    <div>
                        <label for="filter-hall-type-input" class="block text-sm font-medium mb-1">Hall Type</label>
                        <div class="relative">
                            <input type="text" id="filter-hall-type-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a type..." autocomplete="off">
                            <div id="filter-hall-type-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-hall-type" value="${state.filters.hall.type}">
                    </div>
                    <div>
                        <label for="filter-hall-capacity" class="block text-sm font-medium mb-1">Minimum Capacity</label>
                        <input type="number" id="filter-hall-capacity" value="${state.filters.hall.capacity}" placeholder="e.g., 50" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>`;
                break;
            case 'purpose':
                title = 'Filter by Purpose';
                contentHtml = `
                    <div>
                        <label for="filter-purpose" class="block text-sm font-medium mb-1">Purpose</label>
                        <input type="text" id="filter-purpose" value="${state.filters.purpose}" placeholder="Contains..." class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
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
            case 'status':
                const statuses = [...new Set(state.bookings.map(b => b.status).filter(Boolean))];
                const statusOptions = statuses.map(s => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${formatStatus(s).text}</option>`).join('');
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
            setupSearchableDropdown('filter-hall-type-input', 'filter-hall-type-options', 'filter-hall-type', hallTypes, formatHallType);
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
                state.filters.hall.capacity = form.querySelector('#filter-hall-capacity').value;
                state.filters.hall.type = form.querySelector('#filter-hall-type').value;
                break;
            case 'purpose':
                state.filters.purpose = form.querySelector('#filter-purpose').value;
                break;
            case 'dateTime':
                state.filters.dateTime.from = form.querySelector('#filter-datetime-from').value;
                state.filters.dateTime.to = form.querySelector('#filter-datetime-to').value;
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
        const view = document.getElementById('my-bookings-view');
        if(!view) return;

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }
            if (e.target.closest('#clear-my-bookings-filters-btn')) {
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

        const tableBody = document.getElementById('my-bookings-body');
        if (tableBody) {
            tableBody.addEventListener('change', e => {
                if (e.target.classList.contains('row-checkbox')) {
                    const row = e.target.closest('tr');
                    const bookingId = row.dataset.bookingId;
                    handleRowSelection(bookingId, e.target.checked);
                }
            }, { signal });
        }

        const cancelBtn = document.getElementById('cancel-bookings-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async () => {
                if (state.selectedRows.length === 0) return;

                if (confirm(`Are you sure you want to request cancellation for ${state.selectedRows.length} booking(s)?`)) {
                    try {
                        await cancelBookings(state.selectedRows);
                        alert('Cancellation request sent for selected booking(s).');
                        state.selectedRows = [];
                        await initialize();
                    } catch (error) {
                        console.error('Failed to cancel bookings:', error);
                        alert('An error occurred while cancelling bookings. Please try again.');
                    }
                }
            }, { signal });
        }
    }

    async function initialize() {
        try {
            const data = await fetchMyBookingsData();
            state.bookings = Array.isArray(data) ? data : [];
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading my bookings:', error);
            const tableBody = document.getElementById('my-bookings-body');
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-400">Failed to load bookings. Please try again later.</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = { bookings: [], filteredBookings: [], selectedRows: [], filters: defaultFilters() };
    }

    return {
        initialize,
        cleanup
    };
})();

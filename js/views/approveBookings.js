// Approve Bookings View Module (Updated to use FilterManager)
window.ApproveBookingsView = (function() {
    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        bookedOn: { from: '', to: '' },
        hall: { name: '' },
        purpose: '',
        dateTime: { from: '', to: '' },
        bookedBy: { name: '' }
    });

    let state = {
        bookings: [],
        filteredBookings: [],
        filters: defaultFilters(),
        employeeDataCache: null,
        bookingType: 'internal', // 'internal' or 'external'
    };
    let abortController;

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) className = 'text-red-400';
        else if (status.includes('APPROVED') || status.includes('CONFIRMED')) className = 'text-green-400';
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

    async function fetchInternalApprovalData() {
        return await ApiService.bookings.getForApproval();
    }

    async function fetchExternalApprovalData() {
        return await ApiService.bookings.getForApprovalExternal();
    }
    
    async function loadBookings() {
        const tableBody = document.getElementById('approve-bookings-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10"><div class="spinner"></div></td></tr>`;

        try {
            const data = state.bookingType === 'internal'
                ? await fetchInternalApprovalData()
                : await fetchExternalApprovalData();

            state.bookings = Array.isArray(data) ? data : [];
            state.filters = defaultFilters(); // Reset filters when switching types
            applyFiltersAndRender();
        } catch (error) {
            console.error(`Error loading ${state.bookingType} approval data:`, error);
            if (tableBody) {
                const errorMessage = `No ${state.bookingType} booking requests found or failed to load data.`;
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">${errorMessage}</td></tr>`;
            }
        }
    }


    async function updateBookingStatus(bookingId, action) {
        return await ApiService.bookings.updateStatus(bookingId, action);
    }

    // --- FILTERING ---
    function applyFiltersAndRender() {
        const { bookedOn, hall, purpose, dateTime, bookedBy } = state.filters;

        state.filteredBookings = state.bookings.filter(b => {
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
                if (new Date(b.start_date) > toDate) return false;
            }
            if (bookedBy.name && b.user?.employee?.employee_name !== bookedBy.name) return false;

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
            const userName = booking.user?.employee?.employee_name || 'N/A';
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
                    <div class="text-slate-400 text-xs break-all">${booking.user?.employee?.department_name || 'N/A'}</div>
                </td>
                <td class="px-3 py-4 text-sm font-semibold ${statusInfo.className}">${statusInfo.text}</td>
                <td class="px-3 py-4 text-sm">
                    <div class="flex flex-col sm:flex-row gap-2">
                        <button data-action="approve" class="px-2 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="check-conflicts" class="px-2 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition">Conflicts</button>
                        <button data-action="reject" class="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                    </div>
                </td>
            </tr>`;
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
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    // --- MODAL & EVENT HANDLING ---
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        const backdrop = document.getElementById('modal-backdrop');
        if (!modal || !backdrop) return;
        backdrop.classList.remove('hidden', 'opacity-0');
        modal.classList.remove('hidden');
    }

    function closeModal(modalId) {
        // If a specific modalId is given (like the conflict modal), close it.
        if (modalId) {
            const modal = document.getElementById(modalId);
            if(modal) modal.classList.add('hidden');
        } else {
            // Otherwise, close all non-filter modals
            document.querySelectorAll('.modal').forEach(modal => {
                if (!modal.id.startsWith('filter-modal-')) {
                    modal.classList.add('hidden');
                }
            });
        }

        // Always hide the main backdrop if no other modals are visible
        const anyModalVisible = document.querySelector('.modal:not(.hidden)');
        if (!anyModalVisible) {
            const backdrop = document.getElementById('modal-backdrop');
            if(backdrop) {
                backdrop.classList.add('opacity-0');
                setTimeout(() => backdrop.classList.add('hidden'), 300);
            }
        }
        
        // Let FilterManager handle its own modals
        FilterManager.close();
    }

    // --- Conflict Resolution Modal Logic ---
    function displayConflictModal(originalRequest, conflictingRequests) {
        const container = document.getElementById('conflict-list-container');
        const modal = document.getElementById('conflict-resolution-modal');
        if (!container || !modal) return;
        
        const allRequests = [originalRequest, ...conflictingRequests];
        const allRequestIds = allRequests.map(r => r.unique_id);

        container.innerHTML = allRequests.map(booking => {
            const rejectIds = allRequestIds.filter(id => id !== booking.unique_id);
            const userName = booking.user?.employee?.employee_name || 'N/A';
            const department = booking.user?.employee?.department_name || 'N/A';
            
            return `
            <div class="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <p class="font-bold text-white">${booking.purpose}</p>
                    <p class="text-sm text-slate-400">By: ${userName} (${department})</p>
                    <p class="text-xs text-slate-500">Booked On: ${formatDate(booking.created_at)}</p>
                </div>
                <div class="flex-shrink-0 flex gap-2">
                    <button data-action="resolve-approve" data-approve-id="${booking.unique_id}" data-reject-ids="${rejectIds.join(',')}" class="glowing-btn px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md">Approve This</button>
                    <button data-action="resolve-reject" data-reject-id="${booking.unique_id}" class="glowing-btn px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md">Reject</button>
                </div>
            </div>`;
        }).join('');

        openModal('conflict-resolution-modal');
    }

    // --- REFACTORED: Integration with FilterManager ---
    
    /**
     * Opens a filter modal using the centralized FilterManager.
     * It constructs a context object with current filters and all necessary data.
     * @param {string} column - The filter column to open (e.g., 'hall', 'bookedBy').
     */
    async function openFilterModalFor(column) {
        const employees = await getEmployees();
        const context = {
            currentFilters: state.filters,
            allData: {
                bookings: state.bookings,
                employees: employees
            }
        };
        FilterManager.openFilterModalFor(column, context);
    }
    
    /**
     * Callback for when a filter is applied via FilterManager.
     * Merges the new filter values into the component's state.
     * @param {object} newValues - The filter values from the modal.
     */
    function handleApplyFilter(newValues) {
        state.filters = { ...state.filters, ...newValues };
        applyFiltersAndRender();
    }

    /**
     * Callback for when a filter is cleared via FilterManager.
     * Resets the specified filter column to its default state.
     * @param {string} column - The filter column to clear.
     */
    function handleClearFilter(column) {
        // The 'column' parameter directly corresponds to the key in the state.filters object.
        if (state.filters.hasOwnProperty(column)) {
            state.filters[column] = defaultFilters()[column];
            applyFiltersAndRender();
        }
    }


    async function handleBookingAction(bookingId, action) {
        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if (row) {
            row.style.opacity = '0.5';
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
        try {
            await updateBookingStatus(bookingId, action);
            state.bookings = state.bookings.filter(b => b.unique_id !== bookingId);
            applyFiltersAndRender();
        } catch (error) {
            console.error(`Failed to ${action} booking:`, error);
            alert(`Error: Could not ${action} the booking.`);
            if (row) {
                row.style.opacity = '1';
                row.querySelectorAll('button').forEach(btn => btn.disabled = false);
            }
        }
    }

    async function handleCheckConflicts(bookingId) {
        const originalRequest = state.bookings.find(b => b.unique_id === bookingId);
        if (!originalRequest) {
            alert('Could not find the original booking request.');
            return;
        }

        try {
            const conflicts = await ApiService.bookings.getConflictsFor(bookingId);
            if (conflicts && conflicts.length > 0) {
                displayConflictModal(originalRequest, conflicts);
            } else {
                alert('No conflicts found for this booking. It is safe to approve.');
            }
        } catch (error) {
            console.error('Error checking for conflicts:', error);
            alert('Failed to check for conflicts. Please try again.');
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('approve-bookings-view');
        if (!view) return;

        // --- Initialize FilterManager for this view ---
        FilterManager.initialize({
            onApply: handleApplyFilter,
            onClear: handleClearFilter,
        });

        const switchContainer = document.getElementById('booking-type-switch');
        if (switchContainer) {
            switchContainer.addEventListener('click', e => {
                const button = e.target.closest('.booking-type-btn');
                if (!button) return;
                const type = button.dataset.type;
                if (type === state.bookingType) return;
                state.bookingType = type;
                switchContainer.querySelectorAll('.booking-type-btn').forEach(btn => {
                    btn.classList.toggle('bg-blue-600', btn.dataset.type === type);
                    btn.classList.toggle('text-white', btn.dataset.type === type);
                    btn.classList.toggle('text-slate-300', btn.dataset.type !== type);
                });
                loadBookings();
            }, { signal });
        }

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }

            if (e.target.closest('#clear-approve-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }
        }, { signal });

        // REMOVED: The listener for 'filter-modal-container' is now handled by FilterManager.

        document.getElementById('approve-bookings-body')?.addEventListener('click', e => {
            const button = e.target.closest('button[data-action]');
            if (!button || button.disabled) return;
            const row = e.target.closest('tr[data-booking-id]');
            const bookingId = row ? row.dataset.bookingId : null;
            if (!bookingId) return;

            const action = button.dataset.action;
            if (action === 'check-conflicts') {
                handleCheckConflicts(bookingId);
            } else if (action === 'approve' || action === 'reject') {
                if (confirm(`Are you sure you want to ${action} this booking?`)) {
                    handleBookingAction(bookingId, action);
                }
            }
        }, { signal });
        
        document.getElementById('conflict-resolution-modal')?.addEventListener('click', async e => {
            const button = e.target.closest('button');
            if (!button) return;
            
            const action = button.dataset.action;

            if (action === 'resolve-approve') {
                const approveId = button.dataset.approveId;
                const rejectIds = button.dataset.rejectIds.split(',').filter(Boolean);
                
                try {
                    await ApiService.bookings.resolveConflict({ approveId, rejectIds });
                    alert('Conflict resolved successfully.');
                    
                    const idsToRemove = [approveId, ...rejectIds];
                    state.bookings = state.bookings.filter(b => !idsToRemove.includes(b.unique_id));
                    applyFiltersAndRender();
                    closeModal('conflict-resolution-modal');
                } catch (error) {
                    console.error('Failed to resolve conflict:', error);
                    alert(`Failed to resolve conflict: ${error.message}`);
                }
            }

            if (action === 'resolve-reject') {
                const rejectId = button.dataset.rejectId;
                await handleBookingAction(rejectId, 'reject');
                button.closest('.flex-col.md\\:flex-row').remove();
            }

            if (button.classList.contains('modal-close-btn')) {
                closeModal('conflict-resolution-modal');
            }
        }, { signal });
    }

    async function initialize() {
        if (!state.employeeDataCache) {
            try {
                await getEmployees();
            } catch (error) {
                console.error('Failed to preload employee data:', error);
            }
        }
        await loadBookings();
        setupEventHandlers();
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = { bookings: [], filteredBookings: [], filters: defaultFilters(), employeeDataCache: null, bookingType: 'internal' };
        closeModal(); // Close any open modals
    }

    return { initialize, cleanup };
})();


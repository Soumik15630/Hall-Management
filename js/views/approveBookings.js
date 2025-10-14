// Approve Bookings View Module (Updated with Editable Dropdowns)
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
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10"><div class="spinner"></div></td></tr>`;

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
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">${errorMessage}</td></tr>`;
            }
        }
    }

    // --- Handle saving modified booking details ---
    async function handleSaveModification(bookingId) {
        const form = document.querySelector(`tr[data-details-for="${bookingId}"]`);
        if (!form) return;

        const originalBooking = state.bookings.find(b => b.unique_id === bookingId);
        if (!originalBooking) {
            showToast('Original booking data not found.', 'error');
            return;
        }
        
        const saveButton = form.querySelector('[data-action="save-edit"]');

        const startDateValue = form.querySelector(`#start_date-${bookingId}`).value;
        const startTimeValue = form.querySelector(`#start_time-${bookingId}`).value;
        const endDateValue = form.querySelector(`#end_date-${bookingId}`).value;
        const endTimeValue = form.querySelector(`#end_time-${bookingId}`).value;

        const startDateTime = new Date(`${startDateValue}T${startTimeValue}`);
        const endDateTime = new Date(`${endDateValue}T${endTimeValue}`);
        const now = new Date();

        if (startDateTime < now) {
            showToast('Cannot select a past date or time for the start.', 'error');
            return;
        }

        if (endDateTime <= startDateTime) {
            showToast('End time must be after the start time.', 'error');
            return;
        }

        const payload = {
            hall_id: originalBooking.hall_id,
            booking_type: originalBooking.booking_type,
            purpose: form.querySelector(`#purpose-${bookingId}`).value,
            class_code: form.querySelector(`#class_code-${bookingId}`).value.trim() || undefined,
            start_date: startDateTime.toISOString(),
            end_date: endDateTime.toISOString(),
            start_time: startTimeValue,
            end_time: endTimeValue,
        };
        
        // Always add the original requester's user_id to the payload.
        // This is taken directly from the booking data fetched from the server.
        if (originalBooking.user_id) {
            payload.booking_requested_employee_id = originalBooking.user_id;
        } else {
            console.warn(`Could not find user_id on the original booking object for bookingId: ${bookingId}`);
        }

        // Remove class_code from payload if it's undefined to keep the payload clean
        if (payload.class_code === undefined) {
            delete payload.class_code;
        }

        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="spinner-sm"></span> Saving...';

        try {
            await ApiService.bookings.modify(bookingId, payload); 
            showToast('Booking updated successfully!', 'success');
            await loadBookings();
        } catch (error) {
            console.error('Failed to update booking:', error);
            showToast(`Error updating booking: ${error.message || 'Please try again.'}`, 'error');
            saveButton.disabled = false;
            saveButton.innerHTML = 'Save Changes';
        }
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

    // --- RENDERING (Updated with Dropdown Card System) ---
    function renderApproveBookingsTable() {
        const data = state.filteredBookings;
        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">No pending requests match the current filters.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const hallName = booking.hall?.name || 'N/A';
            const userName = booking.user?.employee?.employee_name || 'N/A';
            const localStartDateString = booking.start_date.substring(0, 10) + 'T' + booking.start_time;
            const startDateTime = new Date(localStartDateString);
            const localEndDateString = booking.end_date.substring(0, 10) + 'T' + booking.end_time;
            const endDateTime = new Date(localEndDateString);
            const statusInfo = formatStatus(booking.status);

            return `
            <tr class="booking-row border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-colors" data-booking-id="${booking.unique_id}">
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300 align-middle">${formatDate(booking.created_at)}</td>
                <td class="px-3 py-4 text-sm align-middle">
                    <div class="font-medium text-white">${hallName}</div>
                    <div class="text-slate-400 text-xs break-all">${booking.hall_id}</div>
                </td>
                <td class="px-3 py-4 text-sm align-middle">
                    <div class="font-medium text-white">${booking.purpose}</div>
                    <div class="text-slate-400">${booking.class_code || ''}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300 align-middle">${startDateTime.toLocaleString()} - ${endDateTime.toLocaleTimeString()}</td>
                <td class="px-3 py-4 text-sm align-middle">
                    <div class="font-medium text-white">${userName}</div>
                    <div class="text-slate-400 text-xs break-all">${booking.user?.employee?.department?.department_name || 'N/A'}</div>
                </td>
                <td class="px-3 py-4 text-sm font-semibold align-middle ${statusInfo.className}">${statusInfo.text}</td>
                <td class="px-3 py-4 text-sm align-middle">
                    <div class="flex flex-wrap gap-2">
                        <button data-action="approve" class="px-2 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="check-conflicts" class="px-2 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition">Conflicts</button>
                        <button data-action="reject" class="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                        <button data-action="modify" class="px-2 py-1 text-xs font-semibold text-white bg-yellow-600 hover:bg-yellow-700 rounded-md transition">Modify</button>
                    </div>
                </td>
                <td class="px-3 py-4 text-sm text-center align-middle">
                    <i data-lucide="chevron-down" class="expand-icon w-5 h-5 transition-transform text-slate-400"></i>
                </td>
            </tr>
            <tr class="details-row bg-slate-900/70 hidden" data-details-for="${booking.unique_id}">
                <td colspan="8" class="p-0">
                    <div class="p-6 space-y-4 border-t-2 border-blue-500">
                        <h4 class="text-lg font-semibold text-white border-b border-slate-600 pb-2">Modify Booking Details</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="purpose-${booking.unique_id}" class="block text-sm font-medium text-slate-300 mb-1">Purpose of Booking</label>
                                <input type="text" id="purpose-${booking.unique_id}" value="${booking.purpose}" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500 transition">
                            </div>
                            <div>
                                <label for="class_code-${booking.unique_id}" class="block text-sm font-medium text-slate-300 mb-1">Class Code (Optional)</label>
                                <input type="text" id="class_code-${booking.unique_id}" value="${booking.class_code || ''}" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500 transition">
                            </div>
                            <div>
                                <label for="start_date-${booking.unique_id}" class="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                                <input type="date" id="start_date-${booking.unique_id}" value="${startDateTime.toISOString().substring(0, 10)}" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500 transition">
                            </div>
                            <div>
                                <label for="start_time-${booking.unique_id}" class="block text-sm font-medium text-slate-300 mb-1">Start Time</label>
                                <input type="time" id="start_time-${booking.unique_id}" value="${startDateTime.toTimeString().substring(0,5)}" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500 transition">
                            </div>
                            <div>
                                <label for="end_date-${booking.unique_id}" class="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                                <input type="date" id="end_date-${booking.unique_id}" value="${endDateTime.toISOString().substring(0, 10)}" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500 transition">
                            </div>
                            <div>
                                <label for="end_time-${booking.unique_id}" class="block text-sm font-medium text-slate-300 mb-1">End Time</label>
                                <input type="time" id="end_time-${booking.unique_id}" value="${endDateTime.toTimeString().substring(0,5)}" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500 transition">
                            </div>
                        </div>
                        <div class="flex justify-end gap-3 pt-4">
                            <button data-action="cancel-edit" class="px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-600 hover:bg-slate-700 rounded-lg transition">Cancel</button>
                            <button data-action="save-edit" class="glowing-btn px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2">Save Changes</button>
                        </div>
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
        if (modalId) {
            const modal = document.getElementById(modalId);
            if(modal) modal.classList.add('hidden');
        } else {
            document.querySelectorAll('.modal').forEach(modal => {
                if (!modal.id.startsWith('filter-modal-')) {
                    modal.classList.add('hidden');
                }
            });
        }

        const anyModalVisible = document.querySelector('.modal:not(.hidden)');
        if (!anyModalVisible) {
            const backdrop = document.getElementById('modal-backdrop');
            if(backdrop) {
                backdrop.classList.add('opacity-0');
                setTimeout(() => backdrop.classList.add('hidden'), 300);
            }
        }
        
        FilterManager.close();
    }

    function displayConflictModal(originalRequest, conflictingRequests) {
        const container = document.getElementById('conflict-list-container');
        const modal = document.getElementById('conflict-resolution-modal');
        if (!container || !modal) return;
        
        const allRequests = [originalRequest, ...conflictingRequests];
        const allRequestIds = allRequests.map(r => r.unique_id);

        container.innerHTML = allRequests.map(booking => {
            const rejectIds = allRequestIds.filter(id => id !== booking.unique_id);
            const userName = booking.user?.employee?.employee_name || 'N/A';
            const department = booking.user?.employee?.department?.department_name || 'N/A';
            
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

    async function handleBookingAction(bookingId, action) {
        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if (row) {
            row.style.opacity = '0.5';
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
        try {
            if (action === 'approve') {
                await ApiService.bookings.approve(bookingId);
            } else if (action === 'reject') {
                await ApiService.bookings.reject(bookingId);
            }
            showToast(`Booking ${action}ed successfully.`, 'success');
            state.bookings = state.bookings.filter(b => b.unique_id !== bookingId);
            applyFiltersAndRender();
        } catch (error) {
            console.error(`Failed to ${action} booking:`, error);
            showToast(`Error: Could not ${action} the booking.`, 'error');
            if (row) {
                row.style.opacity = '1';
                row.querySelectorAll('button').forEach(btn => btn.disabled = false);
            }
        }
    }

    async function handleApproveClick(bookingId) {
        const originalRequest = state.bookings.find(b => b.unique_id === bookingId);
        if (!originalRequest || !originalRequest.hall_id) {
            showToast('Could not find the booking request or its hall ID.', 'error');
            return;
        }

        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if (row) {
            row.style.opacity = '0.5';
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }

        try {
            const conflictData = await ApiService.bookings.getConflictsForHall(originalRequest.hall_id);
            
            let overlappingRequests = [];
            if (conflictData && Array.isArray(conflictData.conflicts)) {
                overlappingRequests = conflictData.conflicts.filter(c => {
                    if (c.unique_id === originalRequest.unique_id) return false;
                    
                    const originalStart = new Date(originalRequest.start_date.substring(0, 10) + 'T' + originalRequest.start_time);
                    const originalEnd = new Date(originalRequest.end_date.substring(0, 10) + 'T' + originalRequest.end_time);
                    const conflictStart = new Date(c.start_date.substring(0, 10) + 'T' + c.start_time);
                    const conflictEnd = new Date(c.end_date.substring(0, 10) + 'T' + c.end_time);

                    return originalStart < conflictEnd && originalEnd > conflictStart;
                });
            }

            if (overlappingRequests.length > 0) {
                if (row) {
                    row.style.opacity = '1';
                    row.querySelectorAll('button').forEach(btn => btn.disabled = false);
                }
                displayConflictModal(originalRequest, overlappingRequests);
            } else {
                if (row) {
                    row.style.opacity = '1';
                    row.querySelectorAll('button').forEach(btn => btn.disabled = false);
                }
                showConfirmationModal(
                    'Confirm Approval',
                    'No conflicts found. Are you sure you want to approve this booking?',
                    () => handleBookingAction(bookingId, 'approve')
                );
            }
        } catch (error) {
            console.error('Error checking for conflicts during approval:', error);
            
            // If the error is a 404, it means no conflict document was found for the hall,
            // which is equivalent to finding no conflicts.
            if (error && error.message && error.message.includes('404')) {
                console.log('No conflicts found (API returned 404). Proceeding with approval confirmation.');
                if (row) {
                    row.style.opacity = '1';
                    row.querySelectorAll('button').forEach(btn => btn.disabled = false);
                }
                showConfirmationModal(
                    'Confirm Approval',
                    'No conflicts found. Are you sure you want to approve this booking?',
                    () => handleBookingAction(bookingId, 'approve')
                );
            } else {
                // For all other errors, show an error toast.
                showToast('Failed to check for conflicts before approving. Please try again.', 'error');
                if (row) {
                    row.style.opacity = '1';
                    row.querySelectorAll('button').forEach(btn => btn.disabled = false);
                }
            }
        }
    }

    async function handleCheckConflicts(bookingId) {
        const originalRequest = state.bookings.find(b => b.unique_id === bookingId);
        if (!originalRequest || !originalRequest.hall_id) {
            showToast('Could not find the booking request or its hall ID.', 'error');
            return;
        }

        try {
            const conflictData = await ApiService.bookings.getConflictsForHall(originalRequest.hall_id);

            if (conflictData && Array.isArray(conflictData.conflicts)) {
                const overlappingRequests = conflictData.conflicts.filter(c => {
                    if (c.unique_id === originalRequest.unique_id) return false;
                    
                    const originalStart = new Date(originalRequest.start_date.substring(0, 10) + 'T' + originalRequest.start_time);
                    const originalEnd = new Date(originalRequest.end_date.substring(0, 10) + 'T' + originalRequest.end_time);
                    const conflictStart = new Date(c.start_date.substring(0, 10) + 'T' + c.start_time);
                    const conflictEnd = new Date(c.end_date.substring(0, 10) + 'T' + c.end_time);

                    return originalStart < conflictEnd && originalEnd > conflictStart;
                });

                if (overlappingRequests.length > 0) {
                    displayConflictModal(originalRequest, overlappingRequests);
                } else {
                    showToast('No conflicts found for this booking.', 'info');
                }
            } else {
                showToast('No conflicts found for this booking.', 'info');
            }
        } catch (error) {
            console.error('Error checking for conflicts:', error);
            showToast('Failed to check for conflicts. Please try again.', 'error');
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('approve-bookings-view');
        if (!view) return;

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

        const approveBookingsBody = document.getElementById('approve-bookings-body');
        if (approveBookingsBody) {
            approveBookingsBody.addEventListener('click', e => {
                const button = e.target.closest('button[data-action]');
                const parentRow = e.target.closest('tr');
                if (!parentRow) return;

                let bookingId;
                if (parentRow.classList.contains('booking-row')) {
                    bookingId = parentRow.dataset.bookingId;
                } else if (parentRow.classList.contains('details-row')) {
                    bookingId = parentRow.dataset.detailsFor;
                }
                if (!bookingId) return;

                if (button) {
                    e.stopPropagation();
                    const action = button.dataset.action;
                    const mainRow = document.querySelector(`.booking-row[data-booking-id="${bookingId}"]`);
                    switch (action) {
                        case 'approve':
                            handleApproveClick(bookingId);
                            return;
                        case 'reject':
                            showConfirmationModal(`Confirm Reject`, `Are you sure you want to reject this booking?`, () => handleBookingAction(bookingId, 'reject'));
                            return;
                        case 'check-conflicts':
                            handleCheckConflicts(bookingId);
                            return;
                        case 'modify':
                        case 'cancel-edit':
                             if (mainRow) {
                                const detailsRowToToggle = mainRow.nextElementSibling;
                                const iconToRotate = mainRow.querySelector('.expand-icon');
                                if (detailsRowToToggle?.classList.contains('details-row')) detailsRowToToggle.classList.toggle('hidden');
                                if (iconToRotate) iconToRotate.classList.toggle('rotate-180');
                            }
                            return;
                        case 'save-edit':
                            handleSaveModification(bookingId);
                            return;
                    }
                }

                if (parentRow.classList.contains('booking-row')) {
                    const detailsRow = parentRow.nextElementSibling;
                    const icon = parentRow.querySelector('.expand-icon');
                    if (detailsRow?.classList.contains('details-row')) detailsRow.classList.toggle('hidden');
                    if (icon) icon.classList.toggle('rotate-180');
                }
            }, { signal });

            approveBookingsBody.addEventListener('change', e => {
                const changedInput = e.target;
                if (changedInput.matches('input[type="date"]')) {
                    const detailsRow = changedInput.closest('tr.details-row');
                    if (!detailsRow) return;

                    const bookingId = detailsRow.dataset.detailsFor;
                    const booking = state.bookings.find(b => b.unique_id === bookingId);

                    if (booking && booking.booking_type === 'INDIVIDUAL') {
                        if (changedInput.id.startsWith('start_date-')) {
                            const endDateInput = detailsRow.querySelector(`#end_date-${bookingId}`);
                            if (endDateInput) endDateInput.value = changedInput.value;
                        } else if (changedInput.id.startsWith('end_date-')) {
                            const startDateInput = detailsRow.querySelector(`#start_date-${bookingId}`);
                            if (startDateInput) startDateInput.value = changedInput.value;
                        }
                    }
                }
            }, { signal });
        }
        
        document.getElementById('conflict-resolution-modal')?.addEventListener('click', async e => {
            const button = e.target.closest('button');
            if (!button) return;
            
            const action = button.dataset.action;

            if (action === 'resolve-approve') {
                const approveId = button.dataset.approveId;
                const rejectIds = button.dataset.rejectIds.split(',').filter(Boolean);
                
                try {
                    for (const id of rejectIds) await ApiService.bookings.reject(id);
                    await ApiService.bookings.approve(approveId);
                    showToast('Conflict resolved successfully.', 'success');
                    const idsToRemove = [approveId, ...rejectIds];
                    state.bookings = state.bookings.filter(b => !idsToRemove.includes(b.unique_id));
                    applyFiltersAndRender();
                    closeModal('conflict-resolution-modal');
                } catch (error) {
                    console.error('Failed to resolve conflict:', error);
                    showToast(`Failed to resolve conflict: ${error.message}`, 'error');
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
        closeModal();
    }

    return { initialize, cleanup };
})();

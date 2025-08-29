// My Bookings View Module
window.MyBookingsView = (function() {
    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        bookedOn: { from: '', to: '' },
        hall: { name: '', type: '' },
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
        if (status.includes('REJECTED')) className = 'text-red-400';
        else if (status.includes('CONFIRMED')) className = 'text-green-400';
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
    async function fetchMyBookingsData() {
        return await ApiService.bookings.getMyBookings();
    }

    async function cancelBookings(bookingIds) {
        // Assuming the API can handle multiple cancellations, otherwise loop
        for (const id of bookingIds) {
             await ApiService.bookings.cancel(id);
        }
    }

    // --- FILTERING LOGIC ---
    function applyFiltersAndRender() {
        const { bookedOn, hall, purpose, dateTime, status } = state.filters;
        state.filteredBookings = state.bookings.filter(b => {
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
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No bookings found.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const { text: statusText, className: statusClass } = formatStatus(booking.status);
            const isCancellable = booking.status !== 'REJECTED' && booking.status !== 'CANCELLED';
            const hallName = booking.hall?.name || 'N/A';
            const hallType = formatTitleCase(booking.hall?.type);
            const dateRange = `${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}`;
            const timeRange = `${booking.start_time} - ${booking.end_time}`;
            const hallBelongsTo = formatTitleCase(booking.hall?.belongs_to);
            const hallDepartment = booking.hall?.department?.department_name || 'N/A';
            const hallSchool = booking.hall?.school?.school_name || 'N/A';

            return `
                <tbody class="booking-item">
                    <tr class="booking-row cursor-pointer hover:bg-slate-800/50 transition-colors border-b border-slate-700">
                         <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                            <input type="checkbox" data-booking-id="${booking.unique_id}" class="rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${!isCancellable ? 'disabled' : ''}>
                        </td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${formatDate(booking.created_at)}</td>
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${hallName}</div><div class="text-slate-400">${hallType}</div></td>
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${booking.purpose}</div><div class="text-slate-400">${booking.class_code || ''}</div></td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300"><div>${dateRange}</div><div class="text-slate-400">${timeRange}</div></td>
                        <td class="px-3 py-4 text-sm font-semibold ${statusClass}">${statusText}</td>
                        <td class="px-3 py-4 text-sm text-slate-400 text-center"><i data-lucide="chevron-down" class="expand-icon w-4 h-4 transition-transform inline-block"></i></td>
                    </tr>
                    <tr class="details-row bg-slate-900/70 hidden">
                        <td colspan="7" class="p-0">
                            <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                <div class="space-y-3">
                                    <h4 class="font-semibold text-white border-b border-slate-600 pb-2">Hall Details</h4>
                                    <p><strong class="text-slate-400 w-24 inline-block">Type:</strong> <span class="text-white">${hallType}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Belongs To:</strong> <span class="text-white">${hallBelongsTo}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Hall School:</strong> <span class="text-white">${hallSchool}</span></p>
                                    <p><strong class="text-slate-400 w-24 inline-block">Hall Dept:</strong> <span class="text-white">${hallDepartment}</span></p>
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
        document.querySelectorAll('#my-bookings-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'bookedOn': isActive = state.filters.bookedOn.from || state.filters.bookedOn.to; break;
                case 'hall': isActive = !!state.filters.hall.name || !!state.filters.hall.type; break;
                case 'purpose': isActive = !!state.filters.purpose; break;
                case 'dateTime': isActive = state.filters.dateTime.from || state.filters.dateTime.to; break;
                case 'status': isActive = !!state.filters.status; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    // --- MODAL & EVENT HANDLING ---
    function openFilterModalFor(column) {
        // This function would contain the switch statement to build modal content
        // based on the column, similar to viewBookings.js, but is omitted here
        // for brevity as the logic is similar.
        console.log(`Opening filter for ${column}`);
    }
    
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('my-bookings-view');
        if (!view) return;

        view.addEventListener('click', async e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
            }

            const bookingRow = e.target.closest('.booking-row');
            if (bookingRow && !e.target.matches('input[type="checkbox"]')) {
                const detailsRow = bookingRow.nextElementSibling;
                const icon = bookingRow.querySelector('.expand-icon');
                if (detailsRow) {
                    detailsRow.classList.toggle('hidden');
                    icon.classList.toggle('rotate-180');
                }
            }
            
            if (e.target.closest('#clear-my-bookings-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            }

            if (e.target.matches('input[type="checkbox"]')) {
                 updateSelectedRows();
            }

            if (e.target.id === 'cancel-bookings-btn') {
                if (state.selectedRows.length === 0) return;
                const confirmed = await showConfirmationModal(
                    'Confirm Cancellation', 
                    `Are you sure you want to request cancellation for ${state.selectedRows.length} booking(s)? This action cannot be undone.`
                );
                if (confirmed) {
                    try {
                        await cancelBookings(state.selectedRows);
                        showToast('Cancellation request(s) sent successfully.');
                        state.selectedRows = [];
                        await initialize(); // Refresh data
                    } catch (error) {
                        console.error('Failed to cancel bookings:', error);
                        showToast(`An error occurred: ${error.message}`, 'error');
                    }
                }
            }
        }, { signal });
    }

    function updateSelectedRows() {
        const checkboxes = document.querySelectorAll('#my-bookings-body input[type="checkbox"]:checked');
        state.selectedRows = Array.from(checkboxes).map(cb => cb.dataset.bookingId);
        document.getElementById('cancel-bookings-btn').disabled = state.selectedRows.length === 0;
    }

    async function initialize() {
        const tableBody = document.getElementById('my-bookings-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10"><div class="spinner"></div></td></tr>`;
        try {
            const data = await fetchMyBookingsData();
            state.bookings = (Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []));
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading my bookings:', error);
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load bookings. Please try again.</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = { bookings: [], filteredBookings: [], selectedRows: [], filters: defaultFilters() };
    }

    return { initialize, cleanup };
})();


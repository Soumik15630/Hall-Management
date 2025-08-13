// My Bookings View Module
window.MyBookingsView = (function() {
    let state = {
        bookings: [],
        selectedRows: [] // Stores booking unique_ids
    };
    let abortController;

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        
        // Example: "REJECTED_BY_HOD" -> "Rejected By Hod"
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        
        let className = 'text-yellow-400'; // Default for PENDING or other statuses
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

    async function fetchMyBookingsData() {
        return await fetchFromAPI(AppConfig.endpoints.myBookings);
    }

    async function cancelBookings(bookingIds) {
        // This function assumes a DELETE endpoint for individual bookings exists.
        // e.g., DELETE /api/booking/{unique_id}
        const cancelPromises = bookingIds.map(id =>
            fetchFromAPI(`${AppConfig.endpoints.booking}/${id}`, { method: 'DELETE' }, false)
        );
        return await Promise.all(cancelPromises);
    }


    // --- RENDERING ---
    function renderMyBookingsTable() {
        const data = state.bookings;
        const tableBody = document.getElementById('my-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400">You have no bookings.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const bookingId = booking.unique_id; // Use the correct unique identifier
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
        // Re-render the table to reflect the selection state consistently
        renderMyBookingsTable();
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const tableBody = document.getElementById('my-bookings-body');
        if (tableBody) {
            tableBody.addEventListener('change', e => {
                if (e.target.classList.contains('row-checkbox')) {
                    const row = e.target.closest('tr');
                    // Use the correct dataset key from the <tr> element
                    const bookingId = row.dataset.bookingId;
                    handleRowSelection(bookingId, e.target.checked);
                }
            }, { signal });
        }

        const cancelBtn = document.getElementById('cancel-bookings-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async () => {
                if (state.selectedRows.length === 0) return;

                // Using a custom modal instead of confirm() would be a good improvement
                if (confirm(`Are you sure you want to request cancellation for ${state.selectedRows.length} booking(s)?`)) {
                    try {
                        await cancelBookings(state.selectedRows);
                        // Using a custom modal instead of alert() would be a good improvement
                        alert('Cancellation request sent for selected booking(s).');
                        state.selectedRows = [];
                        await initialize(); // Refresh view
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
            state.bookings = data;
            renderMyBookingsTable();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading my bookings:', error);
            const tableBody = document.getElementById('my-bookings-body');
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-400">Failed to load bookings. Please try again later.</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        state = { bookings: [], selectedRows: [] };
    }

    return {
        initialize,
        cleanup
    };
})();

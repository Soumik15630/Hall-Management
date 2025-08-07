// My Bookings View Module
window.MyBookingsView = (function() {
    let state = {
        bookings: [],
        selectedRows: [] // Stores booking IDs
    };
    let abortController;

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
        // e.g., DELETE /api/booking/{bookingId}
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
            const isSelected = state.selectedRows.includes(booking.bookingId);
            const statusClass = booking.status === 'Approved' ? 'text-green-400' : (booking.status === 'Rejected' ? 'text-red-400' : 'text-yellow-400');
            // Assuming the API provides all necessary fields directly
            return `
                <tr data-booking-id="${booking.bookingId}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                    <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                        <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="text-slate-300">${new Date(booking.created_at).toLocaleDateString()}</div>
                        <div class="text-blue-400">${booking.unique_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-white">${booking.hall_name}</div>
                        <div class="text-slate-400">${booking.hall_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-white">${booking.purpose}</div>
                        <div class="text-slate-400">${booking.class_code || ''}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${new Date(booking.start_date).toLocaleString()} - ${new Date(booking.end_date).toLocaleTimeString()}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusClass}">${booking.status}</td>
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
                    const bookingId = row.dataset.bookingId;
                    handleRowSelection(bookingId, e.target.checked);
                }
            }, { signal });
        }

        const cancelBtn = document.getElementById('cancel-bookings-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async () => {
                if (state.selectedRows.length === 0) return;

                if (confirm(`Are you sure you want to cancel ${state.selectedRows.length} booking(s)?`)) {
                    try {
                        // Calling the local cancelBookings function
                        await cancelBookings(state.selectedRows);
                        alert('Selected booking(s) cancelled successfully.');
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
            // Calling the local fetch function
            const data = await fetchMyBookingsData();
            state.bookings = data;
            renderMyBookingsTable();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading my bookings:', error);
            const tableBody = document.getElementById('my-bookings-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-400">Failed to load bookings.</td></tr>`;
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

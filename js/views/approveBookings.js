// Approve Bookings View Module
window.ApproveBookingsView = (function() {
    let abortController;

    // --- API & DATA HANDLING ---
    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @param {object} options - Fetch options (method, body, etc.).
     * @returns {Promise<any>} - The JSON response data.
     */
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

    /**
     * Fetches bookings that are pending approval.
     */
    async function fetchApprovalData() {
        return await fetchFromAPI(AppConfig.endpoints.pendingApprovals);
    }

    /**
     * Updates the status of a booking (approve or reject).
     * @param {string} bookingId - The ID of the booking to update.
     * @param {string} status - The new status ('APPROVED' or 'REJECTED').
     */
    async function updateBookingStatus(bookingId, status) {
        const action = status === 'APPROVED' ? 'approve' : 'reject';
        // This assumes an endpoint structure like /api/booking/{id}/approve or /api/booking/{id}/reject
        return await fetchFromAPI(`${AppConfig.endpoints.booking}/${bookingId}/${action}`, { method: 'PUT' }, false);
    }

    // --- RENDERING ---
    function renderApproveBookingsTable(data) {
        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No pending requests.</td></tr>`;
            return;
        }
        
        const tableHtml = data.map(booking => `
            <tr class="hover:bg-slate-800/50 transition-colors" data-booking-id="${booking.unique_id}">
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${new Date(booking.created_at).toLocaleDateString()}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.hall_name}</div>
                    <div class="text-slate-400">${booking.hall_id}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.purpose}</div>
                    <div class="text-slate-400">${booking.class_code || ''}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${new Date(booking.start_date).toLocaleString()} - ${new Date(booking.end_date).toLocaleTimeString()}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.user_name}</div>
                    <div class="text-slate-400">${booking.user_department}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold text-yellow-400">${booking.status}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="flex gap-2">
                        <button data-action="approve" class="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="reject" class="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');

        tableBody.innerHTML = tableHtml;
    }

    // --- EVENT HANDLING ---
    async function handleBookingAction(bookingId, action) {
        const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
        try {
            await updateBookingStatus(bookingId, status);
            alert(`Booking ${bookingId} has been ${status.toLowerCase()}.`);
            await initialize(); // Refresh the list
        } catch (error) {
            console.error(`Failed to ${action} booking:`, error);
            alert(`Error: Could not ${action} the booking. ${error.message}`);
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const row = button.closest('tr');
            const bookingId = row.dataset.bookingId;
            const action = button.dataset.action;

            if (bookingId && (action === 'approve' || action === 'reject')) {
                if (confirm(`Are you sure you want to ${action} this booking?`)) {
                    handleBookingAction(bookingId, action);
                }
            }
        }, { signal });
    }

    async function initialize() {
        try {
            const data = await fetchApprovalData();
            renderApproveBookingsTable(data);
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading approval data:', error);
            const tableBody = document.getElementById('approve-bookings-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load approval data. ${error.message}</td></tr>`;
        }
    }
    
    function cleanup() {
        if (abortController) abortController.abort();
    }

    return {
        initialize,
        cleanup
    };
})();

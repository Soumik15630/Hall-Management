// Approve Bookings View Module
window.ApproveBookingsView = (function() {
    let abortController;

    // --- API & DATA HANDLING ---

    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @param {object} options - Fetch options (method, body, etc.).
     * @param {boolean} isJson - Whether to parse the response as JSON.
     * @returns {Promise<any>} - The JSON response data or the raw response.
     */
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        // This function assumes getAuthHeaders() and AppConfig are defined globally
        // and that logout() is available to handle authentication failures.
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options,
            headers
        };

        const response = await fetch(fullUrl, config);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }

        if (isJson) {
            // The backend might return an empty body for some successful responses (e.g., 204 No Content)
            const text = await response.text();
            if (!text) return null;
            // The API response wraps data in a 'data' or 'message' property.
            const result = JSON.parse(text);
            return result; // Return the full response object {success, message, data}
        }
        return response;
    }

    /**
     * Fetches bookings that are pending approval from the backend.
     */
    async function fetchApprovalData() {
        const response = await fetchFromAPI(AppConfig.endpoints.pendingApprovals);
        return response.data || []; // Ensure we return an array
    }

    /**
     * Updates the status of a booking (approve or reject) by calling the backend.
     * @param {string} bookingId - The ID of the booking to update.
     * @param {string} status - The new status ('APPROVED' or 'REJECTED').
     */
    async function updateBookingStatus(bookingId, status) {
        const action = status === 'APPROVED' ? 'approve' : 'reject';
        // Construct the endpoint as per the API documentation: /api/booking/:id/approve or /api/booking/:id/reject
        const endpoint = `${AppConfig.endpoints.booking}/${bookingId}/${action}`;

        // Call the API with the PUT method. We expect a JSON response.
        return await fetchFromAPI(endpoint, {
            method: 'PUT'
        });
    }


    // --- RENDERING ---

    /**
     * Renders the table of pending bookings.
     * @param {Array} data - An array of booking objects.
     */
    function renderApproveBookingsTable(data) {
        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No pending requests.</td></tr>`;
            return;
        }

        // Generate a table row for each pending booking request
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

    /**
     * Handles the click event for the approve/reject buttons.
     * @param {string} bookingId - The unique ID of the booking.
     * @param {string} action - The action to perform ('approve' or 'reject').
     */
    async function handleBookingAction(bookingId, action) {
        const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
        try {
            // Await the API response to get the success message.
            const response = await updateBookingStatus(bookingId, status);

            // Use the dynamic message from the API response for the alert.
            alert(response.message || `Booking action completed successfully.`);

            // Refresh the list to show the updated data.
            await initialize();
        } catch (error) {
            console.error(`Failed to ${action} booking:`, error);
            alert(`Error: Could not ${action} the booking. ${error.message}`);
        }
    }

    /**
     * Sets up event listeners for the page, delegating clicks from the table body.
     */
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const {
            signal
        } = abortController;

        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        // Use event delegation to handle clicks on buttons inside the table
        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const row = button.closest('tr');
            const bookingId = row.dataset.bookingId;
            const action = button.dataset.action;

            if (bookingId && (action === 'approve' || action === 'reject')) {
                // Use a standard confirm dialog to prevent accidental clicks
                if (confirm(`Are you sure you want to ${action} this booking?`)) {
                    handleBookingAction(bookingId, action);
                }
            }
        }, {
            signal
        });
    }

    /**
     * Initializes the module by fetching data and setting up handlers.
     */
    async function initialize() {
        try {
            const data = await fetchApprovalData();
            renderApproveBookingsTable(data);
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading approval data:', error);
            const tableBody = document.getElementById('approve-bookings-body');
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load approval data. ${error.message}</td></tr>`;
        }
    }

    /**
     * Cleans up event listeners when the view is changed to prevent memory leaks.
     */
    function cleanup() {
        if (abortController) abortController.abort();
    }

    // Expose public methods for the module
    return {
        initialize,
        cleanup
    };
})();

// View Bookings View Module
window.ViewBookingsView = (function() {
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

    async function fetchViewBookingsData() {
        // Assuming 'myBookings' endpoint returns all relevant bookings for the user's role.
        // For an admin, this would be all bookings.
        return await fetchFromAPI(AppConfig.endpoints.myBookings);
    }

    // --- DATE FORMATTING HELPERS ---

    /**
     * Formats an ISO date string to a readable date format (DD/MM/YYYY).
     * @param {string} isoString - The date string in ISO 8601 format.
     * @returns {string} The formatted date string.
     */
    function formatDate(isoString) {
        if (!isoString) return 'N/A';
        try {
            const date = new Date(isoString);
            const day = String(date.getUTCDate()).padStart(2, '0');
            const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // JS months are 0-indexed.
            const year = date.getUTCFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) {
            console.error("Error formatting date:", isoString, e);
            return isoString.split('T')[0] || 'Invalid Date';
        }
    }

    /**
     * Formats a 24-hour time string (HH:mm) to a 12-hour AM/PM format.
     * @param {string} timeString - The time string, e.g., "09:30" or "17:30".
     * @returns {string} The formatted time string, e.g., "09:30 AM".
     */
    function formatTime12Hour(timeString) {
        if (!timeString) return '';
        try {
            const [hours, minutes] = timeString.split(':');
            const hoursInt = parseInt(hours, 10);
            const ampm = hoursInt >= 12 ? 'PM' : 'AM';
            let hours12 = hoursInt % 12;
            hours12 = hours12 || 12; // The hour '0' should be '12'.
            return `${String(hours12).padStart(2, '0')}:${minutes} ${ampm}`;
        } catch(e) {
            console.error("Error formatting time:", timeString, e);
            return timeString || ''; // Fallback
        }
    }


    // --- RENDERING ---
    function renderViewBookingsTable(data) {
        const tableBody = document.getElementById('view-bookings-body');
        if (!tableBody) {
            console.error("Table body 'view-bookings-body' not found.");
            return;
        }

        tableBody.innerHTML = ''; 

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400">No bookings found.</td></tr>`;
            return;
        }
        
        const tableHtml = data.map(booking => {
            const statusClass = booking.status === 'Approved' ? 'text-green-400' : (booking.status === 'Rejected' ? 'text-red-400' : 'text-yellow-400');
            
            // Correctly combine the date from `start_date` with the time from `start_time`.
            const createdAtDate = formatDate(booking.created_at);
            const startDate = formatDate(booking.start_date);
            const startTime = formatTime12Hour(booking.start_time);
            const endDate = formatDate(booking.end_date);
            const endTime = formatTime12Hour(booking.end_time);

            const startDateTime = `${startDate}, ${startTime}`;
            const endDateTime = `${endDate}, ${endTime}`;

            return `
                 <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="text-slate-300">${createdAtDate}</div>
                        <div class="text-blue-400">${booking.unique_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-white">${booking.hall.name}</div>
                        <div class="text-slate-400">${booking.hall_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-white">${booking.purpose}</div>
                        <div class="text-slate-400">${booking.class_code || ''}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${startDateTime} - ${endDateTime}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        <div class="font-medium text-blue-400">${booking.user_name}</div>
                        <div class="text-slate-400">${booking.user_department || ''}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusClass}">${booking.status}</td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = tableHtml;
    }

    // --- INITIALIZATION ---
    async function initialize() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        
        // Show loading spinner while fetching
        const tableBody = document.getElementById('view-bookings-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10"><div class="spinner"></div></td></tr>`;
        }

        try {
            const data = await fetchViewBookingsData();
            renderViewBookingsTable(data);
        } catch (error) {
            console.error('Error loading view bookings:', error);
            if(tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-400">Failed to load bookings. Please try again.</td></tr>`;
            }
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
    }

    // Public API
    return {
        initialize,
        cleanup
    };
})();

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

    // --- RENDERING ---
    function renderViewBookingsTable(data) {
        const tableBody = document.getElementById('view-bookings-body');
        if (!tableBody) {
            // If the table body isn't on the page yet, stop.
            console.error("Table body 'view-bookings-body' not found.");
            return;
        }

        // Clear loading spinner
        tableBody.innerHTML = ''; 

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400">No bookings found.</td></tr>`;
            return;
        }
        
        const tableHtml = data.map(booking => {
            const statusClass = booking.status === 'Approved' ? 'text-green-400' : (booking.status === 'Rejected' ? 'text-red-400' : 'text-yellow-400');
            return `
                 <tr class="hover:bg-slate-800/50 transition-colors">
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

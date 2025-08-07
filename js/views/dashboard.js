// Dashboard View Module
window.DashboardView = (function() {

    let calendar = null;
    let abortController;

    // --- API & DATA HANDLING ---
    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @returns {Promise<any>} - The JSON response data.
     */
    async function fetchFromAPI(endpoint) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const response = await fetch(fullUrl, { headers });
        if (!response.ok) {
            throw new Error(`API Error on ${endpoint}: ${response.status}`);
        }
        const result = await response.json();
        return result.data || result;
    }

    /**
     * Fetches all bookings and formats them for FullCalendar.
     * @returns {Promise<Array>} A promise that resolves to an array of FullCalendar event objects.
     */
    async function fetchCalendarEvents() {
        try {
            // Fetches all bookings from the 'myBookings' endpoint as a stand-in for a general bookings endpoint
            const bookings = await fetchFromAPI(AppConfig.endpoints.myBookings);
            if (!bookings) return [];

            return bookings.map(booking => {
                let color = '#3b82f6'; // Default blue for pending
                if (booking.status === 'Approved') color = '#22c55e'; // Green for approved
                if (booking.status === 'Rejected') color = '#ef4444'; // Red for rejected

                return {
                    title: `${booking.hallName}: ${booking.purpose}`,
                    start: new Date(booking.start_date), // Assuming start_date and end_date are available
                    end: new Date(booking.end_date),
                    backgroundColor: color,
                    borderColor: color,
                    extendedProps: {
                        bookingId: booking.unique_id,
                        department: booking.user_department
                    }
                };
            });
        } catch (error) {
            console.error("Failed to fetch calendar events:", error);
            return []; // Return an empty array on error to prevent calendar from crashing
        }
    }


    // --- CALENDAR RENDERING & LOGIC ---
    /**
     * Initializes the FullCalendar instance with events.
     */
    async function initializeCalendar() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;

        if (calendar) {
            calendar.destroy();
        }

        const events = await fetchCalendarEvents();

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: events,
            editable: false, // Set to false as it's a view-only dashboard calendar
            eventClick: function(info) {
                // Optional: Show more details on click
                alert(
                    `Event: ${info.event.title}\n` +
                    `Status: ${info.event.extendedProps.status || 'N/A'}\n` +
                    `Department: ${info.event.extendedProps.department || 'N/A'}`
                );
            }
        });

        calendar.render();
        setupViewToggle();
    }

    /**
     * Sets up the view toggle buttons (Month, Week, Day).
     */
    function setupViewToggle() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const viewToggleContainer = document.getElementById('calendar-view-toggle');
        const viewButtons = viewToggleContainer?.querySelectorAll('.view-btn');
        if (!viewButtons) return;

        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (!calendar) return;
                const view = button.dataset.view;
                calendar.changeView(view);
                updateActiveButton(view);
            }, { signal });
        });

        // Set initial active state
        if (calendar) {
            updateActiveButton(calendar.view.type);
        }
    }
    
    /**
     * Updates the visual state of the active view button.
     * @param {string} activeView - The name of the currently active view (e.g., 'dayGridMonth').
     */
    function updateActiveButton(activeView) {
        const viewButtons = document.querySelectorAll('#calendar-view-toggle .view-btn');
        viewButtons.forEach(button => {
            const isActive = button.dataset.view === activeView;
            button.classList.toggle('bg-blue-600', isActive);
            button.classList.toggle('text-white', isActive);
            button.classList.toggle('text-slate-300', !isActive);
        });
    }

    // --- PUBLIC MODULE METHODS ---
    /**
     * Initializes the dashboard view by setting up the calendar.
     */
    function initialize() {
        initializeCalendar();
        return Promise.resolve();
    }

    /**
     * Cleans up the view, destroying the calendar instance and aborting listeners.
     */
    function cleanup() {
        if (abortController) {
            abortController.abort();
        }
        if (calendar) {
            calendar.destroy();
            calendar = null;
        }
    }

    return {
        initialize,
        cleanup
    };
})();
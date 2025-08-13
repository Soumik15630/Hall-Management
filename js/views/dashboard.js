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
        // This function is assumed to be globally available or defined elsewhere
        // For example: const getAuthHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}` });
        // const AppConfig = { apiBaseUrl: 'http://localhost:3000/api', endpoints: { myBookings: '/bookings/all' } };
        // const logout = () => { window.location.href = '/login'; };

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
            const bookings = await fetchFromAPI(AppConfig.endpoints.myBookings);
            if (!bookings || !Array.isArray(bookings)) {
                console.error("Fetched bookings is not an array:", bookings);
                return [];
            }

            const events = [];
            bookings.forEach(booking => {
                const color = booking.status.startsWith('APPROVED') ? '#22c55e' :
                              booking.status.startsWith('REJECTED') ? '#ef4444' :
                              '#3b82f6';

                // FIX: Handle recurring events specified by `days_of_week`.
                if (booking.days_of_week && booking.days_of_week.length > 0) {
                    const startDate = new Date(booking.start_date.split('T')[0]);
                    const endDate = new Date(booking.end_date.split('T')[0]);
                    const daysOfWeekMap = booking.days_of_week.map(d => parseInt(d, 10)); // e.g., [1, 2] for Mon, Tue

                    // Loop through each day between start and end date
                    for (let day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
                        // FullCalendar's getDay() is 0=Sun, 6=Sat. Adjust if your server uses a different standard.
                        if (daysOfWeekMap.includes(day.getDay())) {
                            const eventDateStr = day.toISOString().split('T')[0];
                            events.push({
                                title: `${booking.hall.name}: ${booking.purpose}`,
                                start: `${eventDateStr}T${booking.start_time}`,
                                end: `${eventDateStr}T${booking.end_time}`,
                                backgroundColor: color,
                                borderColor: color,
                                extendedProps: {
                                    bookingId: booking.unique_id,
                                    status: booking.status,
                                    department: booking.user_department || 'N/A'
                                }
                            });
                        }
                    }
                } else {
                    // This is the original logic for single or continuous multi-day events.
                    const startDate = new Date(`${booking.start_date.split('T')[0]}T${booking.start_time}`);
                    const endDate = new Date(`${booking.end_date.split('T')[0]}T${booking.end_time}`);
                    events.push({
                        title: `${booking.hall.name}: ${booking.purpose}`,
                        start: startDate,
                        end: endDate,
                        backgroundColor: color,
                        borderColor: color,
                        extendedProps: {
                            bookingId: booking.unique_id,
                            status: booking.status,
                            department: booking.user_department || 'N/A'
                        }
                    });
                }
            });

            return events;

        } catch (error) {
            console.error("Failed to fetch calendar events:", error);
            return [];
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
            editable: false, // It's a view-only dashboard calendar
            eventClick: function(info) {
                // This alert now correctly shows the status and department
                alert(
                    `Event: ${info.event.title}\n` +
                    `Status: ${info.event.extendedProps.status}\n` +
                    `Department: ${info.event.extendedProps.department}`
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
        // Mock missing functions for standalone execution if they are not defined globally
        if (typeof getAuthHeaders === 'undefined') {
            window.getAuthHeaders = () => ({ 'Authorization': 'Bearer mock-token' });
        }
        if (typeof AppConfig === 'undefined') {
            window.AppConfig = {
                apiBaseUrl: '', // Provide a mock API base URL or leave empty if using a proxy
                endpoints: { myBookings: 'https://run.mocky.io/v3/e63c76d6-1a6a-4a6c-8515-38435185a146' } // Mock endpoint with recurring data
            };
        }
        if (typeof logout === 'undefined') {
            window.logout = () => console.log("Logout triggered");
        }
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

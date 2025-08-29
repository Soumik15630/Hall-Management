// Dashboard View Module
window.DashboardView = (function() {

    let calendar = null;
    let abortController;
    let tooltip = null; // To hold the tooltip element

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) className = 'text-red-400';
        else if (status.includes('CONFIRMED')) className = 'text-green-400';
        return { text, className };
    }

    // --- API & DATA HANDLING ---
    async function fetchCalendarEvents() {
        try {
            const bookings = await ApiService.bookings.getMyBookings();
            if (!bookings || !Array.isArray(bookings)) {
                console.error("Fetched bookings is not an array:", bookings);
                return [];
            }

            const dayNameToNumber = { 'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3, 'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6 };
            const events = [];

            bookings.forEach(booking => {
                const color = booking.status.startsWith('APPROVED') || booking.status.startsWith('CONFIRMED') ? '#22c55e' :
                              booking.status.startsWith('REJECTED') ? '#ef4444' : '#f59e0b';

                const eventProps = {
                    bookingId: booking.unique_id,
                    status: booking.status,
                    purpose: booking.purpose,
                    classCode: booking.class_code,
                    hallName: booking.hall.name,
                };
                
                if (booking.days_of_week && booking.days_of_week.length > 0) {
                    events.push({
                        title: `${booking.hall.name}: ${booking.purpose}`,
                        startTime: booking.start_time,
                        endTime: booking.end_time,
                        startRecur: booking.start_date,
                        endRecur: booking.end_date,
                        daysOfWeek: booking.days_of_week.map(day => dayNameToNumber[day.toUpperCase()]),
                        backgroundColor: color,
                        borderColor: color,
                        extendedProps: eventProps
                    });
                } else {
                    events.push({
                        title: `${booking.hall.name}: ${booking.purpose}`,
                        start: `${booking.start_date.split('T')[0]}T${booking.start_time}`,
                        end: `${booking.end_date.split('T')[0]}T${booking.end_time}`,
                        backgroundColor: color,
                        borderColor: color,
                        extendedProps: eventProps
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
     * Creates and styles the tooltip element for a more beautiful hover effect.
     */
    function createTooltip() {
        if (document.getElementById('calendar-tooltip')) return;
        tooltip = document.createElement('div');
        tooltip.id = 'calendar-tooltip';
        tooltip.className = 'absolute z-50 hidden p-4 text-sm bg-slate-800 text-white rounded-lg shadow-2xl border border-slate-700 transition-opacity duration-200 ease-in-out opacity-0 min-w-[250px]';
        document.body.appendChild(tooltip);
    }

    /**
     * Intelligently positions the tooltip to avoid going off-screen.
     */
    function positionTooltip(eventEl, tooltipEl) {
        const eventRect = eventEl.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        
        let top, left;
        const margin = 10;

        // Position vertically: Prefer below, but go above if space is limited.
        if (window.innerHeight - eventRect.bottom > tooltipRect.height + margin) {
            top = eventRect.bottom + window.scrollY + margin / 2;
        } else {
            top = eventRect.top + window.scrollY - tooltipRect.height - margin / 2;
        }

        // Position horizontally: Start at the event's left, but shift if off-screen.
        left = eventRect.left + window.scrollX;
        if (left + tooltipRect.width > window.innerWidth) {
            left = window.innerWidth - tooltipRect.width - margin;
        }
        
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    }

    /**
     * Initializes the FullCalendar instance with events and beautiful hover tooltips.
     */
    async function initializeCalendar() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;
        if (calendar) calendar.destroy();
        
        createTooltip();

        const events = await fetchCalendarEvents();

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: events,
            editable: false,
            dayMaxEvents: true, // This is the fix!
            eventMouseEnter: function(info) {
                if (!tooltip) return;
                
                const props = info.event.extendedProps;
                const statusFormatted = formatStatus(props.status);
                const startTime = info.event.start.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
                const endTime = info.event.end ? info.event.end.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }) : '';

                tooltip.innerHTML = `
                    <div class="flex items-center border-b border-slate-700 pb-2 mb-3">
                        <div class="w-2.5 h-2.5 rounded-full mr-3" style="background-color: ${info.event.backgroundColor};"></div>
                        <div class="font-bold text-base text-white">${props.hallName}</div>
                    </div>
                    <div class="space-y-2 text-sm">
                        <p><strong class="font-medium text-slate-400 w-16 inline-block">Purpose:</strong> ${props.purpose}</p>
                        ${props.classCode ? `<p><strong class="font-medium text-slate-400 w-16 inline-block">Class:</strong> ${props.classCode}</p>` : ''}
                        <p><strong class="font-medium text-slate-400 w-16 inline-block">Time:</strong> ${startTime} - ${endTime}</p>
                        <p><strong class="font-medium text-slate-400 w-16 inline-block">Status:</strong> <span class="font-semibold ${statusFormatted.className}">${statusFormatted.text}</span></p>
                    </div>
                `;
                
                tooltip.classList.remove('opacity-0', 'hidden');
                tooltip.classList.add('opacity-100');
                
                positionTooltip(info.el, tooltip);
            },
            eventMouseLeave: function() {
                if (tooltip) {
                    tooltip.classList.remove('opacity-100');
                    tooltip.classList.add('opacity-0');
                    setTimeout(() => {
                        // Check if the mouse isn't back over the tooltip before hiding
                        if (!tooltip.matches(':hover')) {
                            tooltip.classList.add('hidden');
                        }
                    }, 200);
                }
            }
        });

        calendar.render();
        setupViewToggle();
    }
    
    // --- UI & EVENT HANDLING ---
    function setupViewToggle() {
        // Unchanged from original
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

        if (calendar) {
            updateActiveButton(calendar.view.type);
        }
    }

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
    function initialize() {
        initializeCalendar();
        return Promise.resolve();
    }

    function cleanup() {
        if (abortController) abortController.abort();
        if (calendar) {
            calendar.destroy();
            calendar = null;
        }
        const existingTooltip = document.getElementById('calendar-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
            tooltip = null;
        }
    }

    return {
        initialize,
        cleanup
    };
})();


// Dashboard View Module
window.DashboardView = (function() {

    let calendar = null;
    let abortController;
    let tooltip = null;
    let originalDashboardHTML = null; // To store the initial empty state

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', color: 'yellow', dotColor: '#f59e0b', className: 'text-yellow-400' };
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        if (status.includes('REJECTED')) return { text, color: 'red', dotColor: '#ef4444', className: 'text-red-400' };
        if (status.includes('CONFIRMED') || status.includes('APPROVED')) return { text, color: 'green', dotColor: '#22c55e', className: 'text-green-400' };
        return { text, color: 'yellow', dotColor: '#f59e0b', className: 'text-yellow-400' };
    }
    
    // --- DASHBOARD UI RENDERING ---

    function animateCountUp(el, target) {
        let start = 0;
        const duration = 1500; // Animation duration in ms
        const frameDuration = 1000 / 60; // 60fps
        const totalFrames = Math.round(duration / frameDuration);
        let currentFrame = 0;

        const counter = () => {
            currentFrame++;
            const progress = currentFrame / totalFrames;
            const currentValue = Math.round(target * progress); // Simple linear progress

            el.textContent = currentValue;

            if (currentFrame < totalFrames) {
                requestAnimationFrame(counter);
            } else {
                el.textContent = target; // Ensure it ends on the exact number
            }
        };
        requestAnimationFrame(counter);
    }

    function renderStats(bookings) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const upcoming = bookings.filter(b => (b.status.includes('APPROVED') || b.status.includes('CONFIRMED')) && new Date(b.start_date) >= now).length;
        const pending = bookings.filter(b => !b.status.includes('APPROVED') && !b.status.includes('CONFIRMED') && !b.status.includes('REJECTED')).length;
        const rejected = bookings.filter(b => b.status.includes('REJECTED')).length;
        const total = bookings.length;

        animateCountUp(document.getElementById('stat-upcoming'), upcoming);
        animateCountUp(document.getElementById('stat-pending'), pending);
        animateCountUp(document.getElementById('stat-rejected'), rejected);
        animateCountUp(document.getElementById('stat-total'), total);
    }

    function renderUpcomingBookings(bookings) {
        const listEl = document.getElementById('upcoming-bookings-list');
        if (!listEl) return;
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const upcoming = bookings
            .filter(b => (b.status.includes('APPROVED') || b.status.includes('CONFIRMED')) && new Date(b.start_date) >= now)
            .sort((a, b) => new Date(`${a.start_date}T${a.start_time}`) - new Date(`${b.start_date}T${b.start_time}`))
            .slice(0, 10); // Show next 10

        if (upcoming.length === 0) {
            listEl.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-500">
                <i data-lucide="calendar-off" class="w-12 h-12 mb-2"></i>
                <p>No upcoming bookings.</p>
            </div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        const timeFormat = { hour: 'numeric', minute: '2-digit', hour12: true };
        const dateFormat = { month: 'short', day: 'numeric' };

        listEl.innerHTML = upcoming.map(booking => {
            const status = formatStatus(booking.status);
            const startTime = new Date(`1970-01-01T${booking.start_time}`).toLocaleTimeString('en-US', timeFormat).toLowerCase();
            const date = new Date(booking.start_date).toLocaleDateString('en-US', dateFormat);

            return `<div class="bg-slate-900/50 p-4 rounded-xl border-l-4 transition-all duration-200 hover:bg-slate-800/60 hover:shadow-md" style="border-color: ${status.dotColor};">
                        <p class="font-bold text-white truncate">${booking.hall.name}</p>
                        <p class="text-sm text-slate-300 truncate">${booking.purpose}</p>
                        <div class="flex justify-between items-center mt-2 text-xs text-slate-400">
                            <span><i data-lucide="calendar" class="w-3 h-3 inline-block mr-1"></i>${date}</span>
                            <span><i data-lucide="clock" class="w-3 h-3 inline-block mr-1"></i>${startTime}</span>
                        </div>
                    </div>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }
    
    function renderActivityFeed(bookings) {
        const feedEl = document.getElementById('activity-feed-list');
        if (!feedEl) return;

        // Create a mix of recent activities for demonstration
        const activities = bookings
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 15) // Limit to 15 recent items
            .map(b => {
                const status = formatStatus(b.status);
                let icon, text;
                if (status.color === 'green') {
                    icon = `<i data-lucide="check-circle-2" class="w-5 h-5 text-green-400"></i>`;
                    text = `Booking for <span class="font-semibold text-white">${b.hall.name}</span> was confirmed.`;
                } else if (status.color === 'red') {
                    icon = `<i data-lucide="x-circle" class="w-5 h-5 text-red-400"></i>`;
                    text = `Booking for <span class="font-semibold text-white">${b.hall.name}</span> was rejected.`;
                } else {
                    icon = `<i data-lucide="plus-circle" class="w-5 h-5 text-yellow-400"></i>`;
                    text = `New request for <span class="font-semibold text-white">${b.hall.name}</span>.`;
                }
                const timeAgo = moment(b.created_at).fromNow();
                
                return `<div class="relative pl-12 pb-4 border-l border-slate-700/50">
                            <div class="absolute -left-3.5 top-0.5 flex items-center justify-center w-7 h-7 bg-slate-800 rounded-full">
                                ${icon}
                            </div>
                            <p class="text-sm text-slate-300">${text}</p>
                            <p class="text-xs text-slate-500 mt-1">${timeAgo}</p>
                        </div>`;
            });
        
        if(activities.length === 0){
             feedEl.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-500">
                <i data-lucide="activity" class="w-12 h-12 mb-2"></i>
                <p>No recent activity.</p>
            </div>`;
        } else {
            feedEl.innerHTML = activities.join('');
        }
        
        if (window.lucide) lucide.createIcons();
    }


    // --- CALENDAR LOGIC ---

    function processBookingsForCalendar(bookings) {
        const dayNameToNumber = { 'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3, 'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6 };
        
        return bookings.map(booking => {
            const status = formatStatus(booking.status);
            const className = status.color === 'green' ? 'fc-event-approved' : status.color === 'red' ? 'fc-event-rejected' : 'fc-event-pending';
            
            const eventProps = { 
                ...booking, // Pass all booking data
                hallName: booking.hall.name, 
                dotColor: status.dotColor 
            };

            if (booking.days_of_week && booking.days_of_week.length > 0) {
                return {
                    title: `${booking.hall.name}: ${booking.purpose}`,
                    startTime: booking.start_time,
                    endTime: booking.end_time,
                    startRecur: booking.start_date,
                    endRecur: booking.end_date,
                    daysOfWeek: booking.days_of_week.map(day => dayNameToNumber[day.toUpperCase()]),
                    className: className,
                    extendedProps: eventProps
                };
            } else {
                return {
                    title: `${booking.hall.name}: ${booking.purpose}`,
                    start: `${booking.start_date.split('T')[0]}T${booking.start_time}`,
                    end: `${booking.end_date.split('T')[0]}T${booking.end_time}`,
                    className: className,
                    extendedProps: eventProps
                };
            }
        });
    }
    
    function createTooltip() {
        if (document.getElementById('calendar-tooltip')) return;
        tooltip = document.createElement('div');
        tooltip.id = 'calendar-tooltip';
        tooltip.className = 'absolute z-50 hidden p-4 text-sm bg-slate-800 text-white rounded-lg shadow-2xl border border-slate-700 transition-opacity duration-200 ease-in-out opacity-0 min-w-[250px]';
        document.body.appendChild(tooltip);
    }
    
    function positionTooltip(eventEl, tooltipEl) {
        const eventRect = eventEl.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const margin = 10;
        let top, left;

        if (window.innerHeight - eventRect.bottom > tooltipRect.height + margin) {
            top = eventRect.bottom + window.scrollY + margin / 2;
        } else {
            top = eventRect.top + window.scrollY - tooltipRect.height - margin / 2;
        }

        left = eventRect.left + window.scrollX;
        if (left + tooltipRect.width > window.innerWidth) {
            left = window.innerWidth - tooltipRect.width - margin;
        }
        
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    }

    function initializeCalendar(events) {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;
        if (calendar) calendar.destroy();
        
        createTooltip();

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            },
            events: events,
            editable: false,
            dayMaxEvents: 2, // Limit events shown per day in month view
            height: 'auto',
            eventContent: function(arg) {
                const props = arg.event.extendedProps;
                const timeFormat = { hour: 'numeric', minute: '2-digit', hour12: false };
                const startTime = new Date(`1970-01-01T${props.start_time}`).toLocaleTimeString('en-US', timeFormat);
                const title = arg.event.title;

                if (arg.view.type === 'listWeek') {
                    return { html: `<div class="flex items-center w-full"><div class="w-2.5 h-2.5 rounded-full mr-4 flex-shrink-0" style="background-color: ${props.dotColor};"></div><div class="event-time">${startTime}</div><div class="event-title ml-3">${title}</div></div>` };
                }

                const timeHtml = arg.view.type !== 'dayGridMonth' ? `<span class="event-time">${startTime}</span>` : '';
                return { html: `<div class="event-content">${timeHtml}<span class="event-title">${title}</span></div>` };
            },
            eventMouseEnter: function(info) {
                if (!tooltip) return;
                
                const props = info.event.extendedProps;
                const statusFormatted = formatStatus(props.status);
                const timeFormat = { hour: '2-digit', minute:'2-digit' };
                const startTime = new Date(`1970-01-01T${props.start_time}`).toLocaleTimeString([], timeFormat);
                const endTime = new Date(`1970-01-01T${props.end_time}`).toLocaleTimeString([], timeFormat);

                tooltip.innerHTML = `<div class="flex items-center border-b border-slate-700 pb-2 mb-3"><div class="w-2.5 h-2.5 rounded-full mr-3" style="background-color: ${props.dotColor};"></div><div class="font-bold text-base text-white">${props.hallName}</div></div><div class="space-y-2 text-sm"><p><strong class="font-medium text-slate-400 w-16 inline-block">Purpose:</strong> ${props.purpose}</p>${props.class_code ? `<p><strong class="font-medium text-slate-400 w-16 inline-block">Class:</strong> ${props.class_code}</p>` : ''}<p><strong class="font-medium text-slate-400 w-16 inline-block">Time:</strong> ${startTime} - ${endTime}</p><p><strong class="font-medium text-slate-400 w-16 inline-block">Status:</strong> <span class="font-semibold ${statusFormatted.className}">${statusFormatted.text}</span></p></div>`;
                
                tooltip.classList.remove('opacity-0', 'hidden');
                tooltip.classList.add('opacity-100');
                positionTooltip(info.el, tooltip);
            },
            eventMouseLeave: function() {
                if (tooltip) {
                    tooltip.classList.remove('opacity-100');
                    tooltip.classList.add('opacity-0');
                    setTimeout(() => { if (!tooltip.matches(':hover')) tooltip.classList.add('hidden'); }, 200);
                }
            }
        });

        calendar.render();
    }

    // --- MAIN INITIALIZATION & CLEANUP ---
    
    async function initialize() {
        const dashboardView = document.getElementById('dashboard-view');
        if (!dashboardView) return;
        
        if (originalDashboardHTML === null) {
            originalDashboardHTML = dashboardView.innerHTML;
        }
        
        dashboardView.innerHTML = `<div class="flex justify-center items-center h-full"><div class="spinner"></div></div>`;
        
        try {
            // For the activity feed, we'll need a library like moment.js if it's not already available
            // Let's add it dynamically to the head for the "time ago" functionality.
            if (typeof moment === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js';
                document.head.appendChild(script);
                await new Promise(resolve => script.onload = resolve);
            }

            const bookings = await ApiService.bookings.getMyBookings();
            if (!Array.isArray(bookings)) throw new Error("Booking data is not valid.");
            
            dashboardView.innerHTML = originalDashboardHTML;
            
            if (window.lucide) lucide.createIcons();

            renderStats(bookings);
            renderUpcomingBookings(bookings);
            renderActivityFeed(bookings);
            
            const calendarEvents = processBookingsForCalendar(bookings);
            initializeCalendar(calendarEvents);
            
        } catch (error) {
            console.error("Failed to initialize dashboard:", error);
            dashboardView.innerHTML = `<div class="text-center py-20 text-red-400"><i data-lucide="alert-triangle" class="w-12 h-12 mx-auto mb-2"></i><p>Could not load dashboard data.</p><p class="text-sm text-slate-500">${error.message}</p></div>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        if (calendar) {
            calendar.destroy();
            calendar = null;
        }
        const existingTooltip = document.getElementById('calendar-tooltip');
        if (existingTooltip) existingTooltip.remove();
        tooltip = null;
    }

    return { initialize, cleanup };
})();


window.HallBookingDetailsView = (function() {
    
    // --- STATE MANAGEMENT ---
    let state = {
        hall: null,
        availabilityData: [],
        selectedSlots: [], // Format: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
        currentDate: new Date(),
        bookingType: 'INDIVIDUAL',
        purpose: '',
        classCode: '',
        isDragging: false,
        dragSelectionMode: 'add',
        dragDate: null,
        currentSelectedDate: null, // For tracking which date is selected for time buttons
    };
    let abortController;
    const timeSlots = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];

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
            try {
                const parsed = JSON.parse(text);
                // Handle different response structures
                if (parsed.success && parsed.data) {
                    return parsed.data;
                } else if (parsed.data) {
                    return parsed.data;
                } else if (Array.isArray(parsed)) {
                    return parsed;
                } else {
                    return parsed;
                }
            } catch (parseError) {
                return null;
            }
        }
        return response;
    }

    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    async function fetchRawSchools() {
        return await fetchFromAPI(AppConfig.endpoints.allschool);
    }

    async function fetchRawDepartments() {
        return await fetchFromAPI(AppConfig.endpoints.alldept);
    }

    async function fetchAllHalls() {
        // First try to get from global cache (set by browseBook.js)
        if (window.allHallsCache && window.allHallsCache.length > 0) {
            return window.allHallsCache;
        }

        const [rawHalls, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allHall),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        const allHalls = rawHalls.map(hall => {
             const dept = departmentMap.get(hall.department_id);
             const school = schoolMap.get(hall.school_id);
             const incharge = dept 
                ? { name: dept.incharge_name, designation: 'HOD', email: dept.incharge_email, intercom: dept.incharge_contact_number }
                : (school ? { name: school.incharge_name, designation: 'Dean', email: school.incharge_email, intercom: school.incharge_contact_number } : {});

            return { 
                id: hall.unique_id || hall.id, 
                unique_id: hall.unique_id || hall.id,
                name: hall.name, 
                location: `${school ? school.school_name : 'N/A'}${dept ? ' - ' + dept.department_name : ''}`,
                capacity: hall.capacity,
                floor: formatTitleCase(hall.floor),
                zone: formatTitleCase(hall.zone),
                features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase) : [],
                incharge: incharge,
                ...hall 
            };
        });

        // Cache for future use
        window.allHallsCache = allHalls;
        return allHalls;
    }

    async function fetchHallAvailability(hallId) {
        try {
            const bookings = await fetchFromAPI(`/api/booking/hall/${hallId}`);
            
            if (!Array.isArray(bookings)) {
                return [];
            }

            // Transform the booking data to match our expected format
            return bookings.map(booking => ({
                hall_id: hallId,
                start_date: booking.start_time,
                end_date: booking.end_time,
                status: booking.status || 'APPROVED',
                purpose: booking.bookingRequest?.purpose || booking.purpose || 'N/A',
                class_code: booking.bookingRequest?.class_code || booking.class_code || null,
                booking_id: booking.id || booking.booking_id,
                booked_by: booking.bookingRequest?.user?.name || booking.user?.name || 'Unknown User',
                booked_by_email: booking.bookingRequest?.user?.email || booking.user?.email || '',
                department: booking.bookingRequest?.user?.department || booking.department || 'N/A',
                booking_date: booking.created_at || booking.booking_date,
                additional_info: booking.additional_info || booking.notes || ''
            }));
        } catch (error) {
            return [];
        }
    }

    // --- UTILITY FUNCTIONS ---
    function isSlotAvailable(dateString, time) {
        const slotDate = new Date(dateString + "T00:00:00");
        const today = new Date(); 
        today.setHours(0, 0, 0, 0);

        if (slotDate < today) return false;
        
        // Check if slot is in the past for today
        if (slotDate.toDateString() === today.toDateString()) {
            const now = new Date();
            const [hours, minutes] = time.split(':');
            const slotTime = new Date();
            slotTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            if (slotTime <= now) return false;
        }
        
        const booking = state.availabilityData.find(b => {
             const bookingDate = new Date(b.start_date).toISOString().split('T')[0];
             const bookingTime = new Date(b.start_date).toTimeString().substring(0,5);
             return bookingDate === dateString && bookingTime === time;
        });
        
        return !booking || (booking.status !== 'APPROVED' && booking.status !== 'PENDING');
    }

    function getBookingForSlot(dateString, time) {
        return state.availabilityData.find(b => {
            const bookingDate = new Date(b.start_date).toISOString().split('T')[0];
            const bookingTime = new Date(b.start_date).toTimeString().substring(0,5);
            return bookingDate === dateString && bookingTime === time;
        });
    }

    function formatDateForDisplay(dateString) {
        const date = new Date(dateString + "T00:00:00");
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatTimeForDisplay(time) {
        const [hour, minute] = time.split(':');
        const h = parseInt(hour);
        const suffix = h >= 12 ? 'pm' : 'am';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${String(displayHour).padStart(2, '0')}:${minute}${suffix}`;
    }

    // --- BOOKING DETAILS MODAL ---
    function showBookingDetails(booking) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">Booking Details</h3>
                    <button id="close-modal" class="text-slate-400 hover:text-white">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="text-sm font-medium text-slate-300">Status</label>
                        <p class="text-white ${booking.status === 'APPROVED' ? 'text-green-400' : booking.status === 'PENDING' ? 'text-yellow-400' : 'text-red-400'}">${booking.status}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-slate-300">Booked By</label>
                        <p class="text-white">${booking.booked_by}</p>
                        ${booking.booked_by_email ? `<p class="text-sm text-slate-400">${booking.booked_by_email}</p>` : ''}
                    </div>
                    <div>
                        <label class="text-sm font-medium text-slate-300">Department</label>
                        <p class="text-white">${booking.department}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-slate-300">Purpose</label>
                        <p class="text-white">${booking.purpose}</p>
                    </div>
                    ${booking.class_code ? `
                        <div>
                            <label class="text-sm font-medium text-slate-300">Class Code</label>
                            <p class="text-white">${booking.class_code}</p>
                        </div>
                    ` : ''}
                    <div>
                        <label class="text-sm font-medium text-slate-300">Time Slot</label>
                        <p class="text-white">${formatTimeForDisplay(new Date(booking.start_date).toTimeString().substring(0,5))} - ${formatTimeForDisplay(new Date(booking.end_date).toTimeString().substring(0,5))}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-slate-300">Date</label>
                        <p class="text-white">${new Date(booking.start_date).toLocaleDateString()}</p>
                    </div>
                    ${booking.additional_info ? `
                        <div>
                            <label class="text-sm font-medium text-slate-300">Additional Information</label>
                            <p class="text-white">${booking.additional_info}</p>
                        </div>
                    ` : ''}
                    ${booking.booking_date ? `
                        <div>
                            <label class="text-sm font-medium text-slate-300">Booked On</label>
                            <p class="text-sm text-slate-400">${new Date(booking.booking_date).toLocaleString()}</p>
                        </div>
                    ` : ''}
                </div>
                <div class="mt-6 flex justify-end">
                    <button id="close-modal-btn" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        modal.querySelector('#close-modal').addEventListener('click', closeModal);
        modal.querySelector('#close-modal-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // --- RENDERING ---
    function render() {
        const container = document.getElementById('hall-booking-details-content'); 
        if (!container) return;

        container.innerHTML = `
            <div id="hall-booking-details-container" class="container mx-auto max-w-7xl">
                <div class="space-y-8">
                    ${renderHallInfo()}
                    <section id="calendar-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                        ${renderCalendar()}
                    </section>
                    <div class="flex justify-center space-x-4 pt-6">
                        <button id="book-hall-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors duration-300">BOOK THIS HALL</button>
                        <button id="back-btn" class="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors duration-300">BACK TO BROWSE</button>
                    </div>
                </div>
            </div>`;
        
        setupEventHandlers();
    }

    function renderHallInfo() {
        if (!state.hall) return '<div>Loading hall information...</div>';
        
        const hall = state.hall;
        const imageUrl = hall.image_url || `https://placehold.co/600x400/0f172a/93c5fd?text=${encodeURIComponent(hall.name)}`;
        
        return `
            <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-1">
                        <img src="${imageUrl}" alt="${hall.name}" class="w-full h-64 object-cover rounded-lg" 
                             onerror="this.src='https://placehold.co/600x400/0f172a/93c5fd?text=${encodeURIComponent(hall.name)}'">
                    </div>
                    <div class="lg:col-span-2">
                        <h1 class="text-3xl font-bold text-white mb-4">${hall.name}</h1>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 class="text-lg font-semibold text-blue-400 mb-3">Hall Information</h3>
                                <div class="space-y-2 text-sm">
                                    <div><span class="text-slate-400">Location:</span> <span class="text-white">${hall.location}</span></div>
                                    <div><span class="text-slate-400">Capacity:</span> <span class="text-white">${hall.capacity} people</span></div>
                                    <div><span class="text-slate-400">Floor:</span> <span class="text-white">${hall.floor}</span></div>
                                    <div><span class="text-slate-400">Zone:</span> <span class="text-white">${hall.zone}</span></div>
                                </div>
                                ${hall.features && hall.features.length > 0 ? `
                                    <div class="mt-4">
                                        <h4 class="text-blue-400 font-medium mb-2">Features</h4>
                                        <div class="flex flex-wrap gap-2">
                                            ${hall.features.map(feature => `<span class="px-2 py-1 bg-blue-900/30 text-blue-300 rounded-full text-xs">${feature}</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                            
                            <div>
                                <h3 class="text-lg font-semibold text-blue-400 mb-3">Contact Information</h3>
                                <div class="space-y-2 text-sm">
                                    <div><span class="text-slate-400">In-charge:</span> <span class="text-white">${hall.incharge?.name || 'N/A'}</span></div>
                                    <div><span class="text-slate-400">Designation:</span> <span class="text-white">${hall.incharge?.designation || 'N/A'}</span></div>
                                    <div><span class="text-slate-400">Email:</span> <span class="text-white">${hall.incharge?.email || 'N/A'}</span></div>
                                    <div><span class="text-slate-400">Intercom:</span> <span class="text-white">${hall.incharge?.intercom || 'N/A'}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    function renderCalendar() {
        const monthName = state.currentDate.toLocaleString('default', { month: 'long' });
        const year = state.currentDate.getFullYear();
        const month = state.currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const currentTime = new Date();
        
        // Generate days array with day names
        const days = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(year, month, i);
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            days.push({
                date: i,
                dateString: dateString,
                dayName: dateObj.toLocaleString('default', { weekday: 'short' }),
                isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
                hasSlots: state.selectedSlots.some(slot => slot.date === dateString),
                isToday: dateString === today.toISOString().split('T')[0]
            });
        }
        
        let dayHeaders = days.map(day => 
            `<div class="text-center cursor-pointer day-header ${day.hasSlots ? 'bg-blue-600/20 border border-blue-500/50' : ''} ${day.isToday ? 'bg-green-600/20 border border-green-500/50' : ''}" 
                  data-date="${day.dateString}" title="Click to select time slots for ${day.dayName}, ${day.date}">
                <div class="text-sm font-semibold text-slate-300 ${day.isWeekend ? 'text-red-400' : ''} ${day.isToday ? 'text-green-400' : ''}">${day.date}</div>
                <div class="text-xs text-slate-400 ${day.isWeekend ? 'text-red-400' : ''} ${day.isToday ? 'text-green-400' : ''}">${day.dayName}</div>
                ${day.hasSlots ? '<div class="text-xs text-blue-400">●</div>' : ''}
                ${day.isToday ? '<div class="text-xs text-green-400">Today</div>' : ''}
            </div>`
        ).join('');

        let slotRows = timeSlots.map(time => {
            let dayCells = days.map(day => {
                const classes = getSlotClasses(day.dateString, time);
                const isDisabled = classes.includes('slot-booked') || classes.includes('slot-pending') || classes.includes('slot-past');
                return `<button type="button" class="slot ${classes}" data-date="${day.dateString}" data-time="${time}" ${isDisabled ? 'disabled' : ''}></button>`;
            }).join('');
            return `<div class="calendar-body">${dayCells}</div>`;
        }).join('');

        return `
            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Hall Availability: ${state.hall?.name || ''}</h3>
            <div class="flex justify-between items-center mb-4">
                <button id="prev-month-btn" class="p-2 rounded-full hover:bg-slate-700 transition text-white">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <h4 class="text-lg font-bold text-white">${monthName} ${year}</h4>
                <button id="next-month-btn" class="p-2 rounded-full hover:bg-slate-700 transition text-white">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="overflow-x-auto pb-4">
                <div class="calendar-grid min-w-[1200px]">
                    <div class="grid grid-rows-8 gap-1 pr-2">
                        ${timeSlots.map(time => `<div class="text-xs text-right text-slate-400 h-8 flex items-center justify-end">${formatTimeForDisplay(time)}</div>`).join('')}
                    </div>
                    <div class="grid grid-cols-1">
                        <div class="calendar-header">${dayHeaders}</div>
                        ${slotRows}
                    </div>
                </div>
            </div>
            <div class="flex justify-center flex-wrap gap-x-4 gap-y-2 mt-4 text-sm text-slate-300">
                <div class="flex items-center"><span class="h-4 w-4 mr-2 slot-available rounded-sm"></span>Available</div>
                <div class="flex items-center"><span class="h-4 w-4 mr-2 slot-pending rounded-sm"></span>Pending</div>
                <div class="flex items-center"><span class="h-4 w-4 mr-2 slot-booked rounded-sm"></span>Booked</div>
                <div class="flex items-center"><span class="h-4 w-4 mr-2 slot-past rounded-sm"></span>Past/Unavailable</div>
                <div class="flex items-center"><span class="h-4 w-4 mr-2 slot-selected rounded-sm"></span>Selected</div>
            </div>
            <style>
                .calendar-grid {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: 4px;
                }
                .calendar-header {
                    display: grid;
                    grid-template-columns: repeat(${daysInMonth}, minmax(35px, 1fr));
                    gap: 4px;
                }
                .calendar-body {
                    display: grid;
                    grid-template-columns: repeat(${daysInMonth}, minmax(35px, 1fr));
                    gap: 4px;
                }
                .day-header {
                    padding: 4px 2px;
                    border-radius: 4px;
                    transition: all 0.2s ease-in-out;
                }
                .day-header:hover {
                    background-color: rgba(59, 130, 246, 0.1);
                }
                .slot {
                    width: 100%;
                    height: 2rem;
                    border-radius: 0.25rem;
                    cursor: pointer;
                    transition: all 0.2s ease-in-out;
                    border: 1px solid transparent;
                }
                .slot:disabled {
                    cursor: not-allowed;
                }
                .slot-available { 
                    background-color: rgba(34, 197, 94, 0.2); 
                    border-color: rgba(34, 197, 94, 0.4); 
                }
                .slot-available:hover { 
                    background-color: rgba(34, 197, 94, 0.3); 
                }
                .slot-booked { 
                    background-color: rgba(239, 68, 68, 0.2); 
                    border-color: rgba(239, 68, 68, 0.4); 
                    cursor: pointer !important; 
                }
                .slot-booked:hover { 
                    background-color: rgba(239, 68, 68, 0.3); 
                }
                .slot-pending { 
                    background-color: rgba(251, 191, 36, 0.2); 
                    border-color: rgba(251, 191, 36, 0.4); 
                    cursor: pointer !important; 
                }
                .slot-pending:hover { 
                    background-color: rgba(251, 191, 36, 0.3); 
                }
                .slot-past { 
                    background-color: rgba(107, 114, 128, 0.2); 
                    border-color: rgba(107, 114, 128, 0.4); 
                    cursor: not-allowed; 
                }
                .slot-selected { 
                    background-color: rgba(59, 130, 246, 0.8) !important; 
                    border-color: rgba(59, 130, 246, 1) !important; 
                    color: white !important; 
                }
            </style>`;
    }

    function getSlotClasses(dateString, time) {
        const slotDate = new Date(dateString + "T00:00:00");
        const today = new Date(); 
        today.setHours(0, 0, 0, 0);

        if (state.selectedSlots.some(s => s.date === dateString && s.time === time)) {
            return 'slot-selected';
        }
        
        // Check if date is in the past
        if (slotDate < today) {
            return 'slot-past';
        }
        
        // Check if slot is in the past for today
        if (slotDate.toDateString() === today.toDateString()) {
            const now = new Date();
            const [hours, minutes] = time.split(':');
            const slotTime = new Date();
            slotTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            if (slotTime <= now) {
                return 'slot-past';
            }
        }
        
        const booking = state.availabilityData.find(b => {
             const bookingDate = new Date(b.start_date).toISOString().split('T')[0];
             const bookingTime = new Date(b.start_date).toTimeString().substring(0,5);
             return bookingDate === dateString && bookingTime === time;
        });
        
        if (booking) {
            return booking.status === 'APPROVED' ? 'slot-booked' : 'slot-pending';
        }
        return 'slot-available';
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const container = document.getElementById('hall-booking-details-container');
        if (!container) return;

        container.addEventListener('click', e => {
            const target = e.target.closest('button') || e.target.closest('.day-header');
            if (!target) return;

            if (target.id === 'prev-month-btn') {
                state.currentDate.setMonth(state.currentDate.getMonth() - 1);
                const calendarSection = container.querySelector('#calendar-section');
                if (calendarSection) calendarSection.innerHTML = renderCalendar();
                setupCalendarEventHandlers();
            } else if (target.id === 'next-month-btn') {
                state.currentDate.setMonth(state.currentDate.getMonth() + 1);
                const calendarSection = container.querySelector('#calendar-section');
                if (calendarSection) calendarSection.innerHTML = renderCalendar();
                setupCalendarEventHandlers();
            } else if (target.id === 'book-hall-btn') {
                handleBookHall();
            } else if (target.id === 'back-btn') {
                window.history.back();
            }
        }, { signal });

        setupCalendarEventHandlers();
    }

    function setupCalendarEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const calendarSection = document.getElementById('calendar-section');
        if (!calendarSection) return;

        calendarSection.addEventListener('click', e => {
            const target = e.target;
            
            if (target.classList.contains('slot')) {
                handleSlotClick(target);
            } else if (target.closest('.day-header')) {
                const dayHeader = target.closest('.day-header');
                const selectedDate = dayHeader.dataset.date;
                if (selectedDate) {
                    state.currentSelectedDate = selectedDate;
                }
            }
        }, { signal });
    }

    function handleSlotClick(slotEl) {
        const { date, time } = slotEl.dataset;
        
        // Check if this is a booked or pending slot - show details modal
        if (slotEl.classList.contains('slot-booked') || slotEl.classList.contains('slot-pending')) {
            const booking = getBookingForSlot(date, time);
            if (booking) {
                showBookingDetails(booking);
            }
            return;
        }
        
        if (slotEl.disabled || slotEl.classList.contains('slot-past')) {
            return;
        }
        
        // For available slots, toggle selection for viewing purposes
        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        
        if (existingIndex > -1) {
            state.selectedSlots.splice(existingIndex, 1);
        } else {
            state.selectedSlots.push({ date, time });
        }
        
        // Update the calendar display
        const calendarSection = document.getElementById('calendar-section');
        if (calendarSection) {
            calendarSection.innerHTML = renderCalendar();
            setupCalendarEventHandlers();
        }
    }

    function handleBookHall() {
        // Store selected slots and hall data for the booking form
        if (state.selectedSlots.length > 0) {
            sessionStorage.setItem('finalBookingSlots', JSON.stringify(state.selectedSlots));
        }
        
        if (state.hall) {
            sessionStorage.setItem('finalBookingHall', JSON.stringify(state.hall));
        }
        
        if (state.availabilityData) {
            sessionStorage.setItem('finalBookingAvailability', JSON.stringify(state.availabilityData));
        }
        
        // Navigate to booking form
        window.location.hash = `#final-booking-form-view?id=${state.hall?.id || state.hall?.unique_id}`;
    }

    function cleanup() {
        if (abortController) abortController.abort();
    }

    async function initialize(hallId) {
        try {
            // Try to get hall data from session storage first
            let hallData = null;
            
            try {
                const storedHall = sessionStorage.getItem('hallDetailsData');
                if (storedHall) {
                    hallData = JSON.parse(storedHall);
                }
            } catch (e) {
                // Handle parsing errors silently
            }
            
            // If no stored hall data or ID doesn't match, fetch from API
            if (!hallData || (hallData.id !== hallId && hallData.unique_id !== hallId)) {
                const allHalls = await fetchAllHalls();
                hallData = allHalls.find(h => h.id === hallId || h.unique_id === hallId);
                
                if (!hallData) {
                    throw new Error(`Hall not found for ID: ${hallId}`);
                }
            }
            
            // Fetch availability data
            const availabilityData = await fetchHallAvailability(hallId);
            
            // Initialize state
            state = {
                hall: hallData,
                availabilityData: availabilityData,
                selectedSlots: [],
                currentDate: new Date(),
                bookingType: 'INDIVIDUAL',
                purpose: '',
                classCode: '',
                isDragging: false,
                dragSelectionMode: 'add',
                dragDate: null,
                currentSelectedDate: null
            };
            
            render();
            
        } catch (error) {
            console.error('Error initializing hall booking details:', error);
            const container = document.getElementById('hall-booking-details-content');
            if (container) {
                container.innerHTML = `
                    <div class="container mx-auto max-w-7xl">
                        <div class="text-center py-20">
                            <h2 class="text-xl font-bold text-red-400 mb-4">Error Loading Hall Details</h2>
                            <p class="text-slate-400 mb-4">Failed to load hall information.</p>
                            <p class="text-slate-500 text-sm mb-2">Error: ${error.message}</p>
                            <p class="text-slate-500 text-sm mb-6">Hall ID: ${hallId}</p>
                            <div class="flex gap-4 justify-center">
                                <button onclick="window.history.back()" class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">
                                    Go Back
                                </button>
                                <button onclick="location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                    Retry
                                </button>
                                <button onclick="window.location.hash='#browse-book-view'" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                                    Browse Halls
                                </button>
                            </div>
                        </div>
                    </div>`;
            }
        }
    }

    return { 
        initialize, 
        cleanup, 
        render 
    };
})();
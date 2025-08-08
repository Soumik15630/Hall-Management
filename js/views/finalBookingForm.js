// finalBookingForm.js - Complete Implementation with Dynamic Time Handling

window.FinalBookingFormView = (function() {
    
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

    async function addIndividualBooking(bookingDetails) {
        return await fetchFromAPI(AppConfig.endpoints.bookingRequest, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(bookingDetails) 
        });
    }
    
    async function addMultipleIndividualBookings(bookingRequests) {
        const results = [];
        
        // Submit bookings sequentially to avoid overwhelming the server
        for (const request of bookingRequests) {
            try {
                const result = await addIndividualBooking(request);
                results.push({ success: true, data: result, request });
            } catch (error) {
                results.push({ success: false, error: error.message, request });
            }
        }
        
        return results;
    }

    // --- VALIDATION LOGIC ---
    function validateContiguousSlots(newSlot) {
        const currentSelectedForDate = state.selectedSlots.filter(slot => slot.date === newSlot.date);
        
        if (currentSelectedForDate.length === 0) {
            return { valid: true, message: '' };
        }

        // Check if we already have a full day (8 slots) for any date
        const dateGroups = {};
        state.selectedSlots.forEach(slot => {
            if (!dateGroups[slot.date]) dateGroups[slot.date] = [];
            dateGroups[slot.date].push(slot);
        });

        // Check if any date has all 8 slots
        for (const [date, slots] of Object.entries(dateGroups)) {
            if (slots.length === 8) {
                if (date !== newSlot.date) {
                    return { 
                        valid: false, 
                        message: `You already have a full day booking for ${formatDateForDisplay(date)}. Please create a separate booking for additional days.` 
                    };
                }
            }
        }

        const allTimesForDate = [...currentSelectedForDate, newSlot].map(slot => slot.time).sort();
        const uniqueTimes = [...new Set(allTimesForDate)];
        
        // Check if times are contiguous
        const timeIndices = uniqueTimes.map(time => timeSlots.indexOf(time)).sort((a, b) => a - b);
        
        for (let i = 1; i < timeIndices.length; i++) {
            if (timeIndices[i] - timeIndices[i-1] > 1) {
                return { 
                    valid: false, 
                    message: 'Time slots must be contiguous. Please select consecutive time periods.' 
                };
            }
        }

        return { valid: true, message: '' };
    }

    function fillGaps(targetSlot) {
        const currentSelectedForDate = state.selectedSlots.filter(slot => slot.date === targetSlot.date);
        if (currentSelectedForDate.length === 0) return;

        const allTimes = [...currentSelectedForDate.map(slot => slot.time), targetSlot.time];
        const timeIndices = allTimes.map(time => timeSlots.indexOf(time)).sort((a, b) => a - b);
        const minIndex = Math.min(...timeIndices);
        const maxIndex = Math.max(...timeIndices);

        // Fill all gaps between min and max
        for (let i = minIndex; i <= maxIndex; i++) {
            const timeSlot = timeSlots[i];
            const slotExists = state.selectedSlots.some(slot => 
                slot.date === targetSlot.date && slot.time === timeSlot
            );
            
            if (!slotExists && isSlotAvailable(targetSlot.date, timeSlot)) {
                state.selectedSlots.push({ date: targetSlot.date, time: timeSlot });
            }
        }
    }

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
        const container = document.getElementById('final-booking-form-content'); 
        if (!container) return;

        container.innerHTML = `
            <div id="final-booking-form-container" class="container mx-auto max-w-7xl">
                <div class="space-y-8">
                    <section id="calendar-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                        ${renderCalendar()}
                    </section>
                    ${renderTimeSlotSelector()}
                    <form id="bookingForm" class="space-y-8">
                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Booking Details</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label for="start_date" class="block text-slate-300 text-sm font-medium mb-2">FROM DATE</label>
                                    <input type="date" id="start_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" required>
                                </div>
                                <div>
                                    <label for="end_date" class="block text-slate-300 text-sm font-medium mb-2">TO DATE</label>
                                    <input type="date" id="end_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" required>
                                </div>
                            </div>
                        </section>
                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Purpose of Booking</h3>
                            <div>
                                <label for="purpose" class="block text-slate-300 text-sm font-medium mb-2">PURPOSE / EVENT NAME</label>
                                <textarea id="purpose" placeholder="e.g., Department Seminar, Guest Lecture on AI" rows="3" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" required></textarea>
                            </div>
                            <div class="mt-6">
                                <label for="class_code" class="block text-slate-300 text-sm font-medium mb-2">CLASS CODE (OPTIONAL)</label>
                                <input type="text" id="class_code" placeholder="e.g., CS-501" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500">
                            </div>
                        </section>
                        <div class="flex justify-end space-x-4 pt-6">
                            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors duration-300">SUBMIT REQUEST</button>
                            <button type="button" id="reset-btn" class="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors duration-300">CLEAR</button>
                        </div>
                    </form>
                </div>
            </div>`;
        
        updateUI();
        setupEventHandlers();
    }

    function renderCalendar() {
        const monthName = state.currentDate.toLocaleString('default', { month: 'long' });
        const year = state.currentDate.getFullYear();
        const month = state.currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        
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

    function renderTimeSlotSelector() {
        if (!state.currentSelectedDate) {
            return `
                <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Time Slot Selection</h3>
                    <div class="text-center text-slate-400 py-8">
                        <p>Click on a date in the calendar above to select time slots</p>
                    </div>
                </section>`;
        }

        const selectedDate = new Date(state.currentSelectedDate + "T00:00:00");
        const dateDisplay = selectedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        const selectedSlotsForDate = state.selectedSlots.filter(slot => slot.date === state.currentSelectedDate);
        
        const timeButtons = timeSlots.map(time => {
            const isSelected = selectedSlotsForDate.some(slot => slot.time === time);
            const isAvailable = isSlotAvailable(state.currentSelectedDate, time);
            const classes = isSelected 
                ? 'bg-blue-600 text-white border-blue-500'
                : isAvailable 
                    ? 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                    : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed';
            
            return `
                <button type="button" 
                        class="time-slot-btn px-4 py-2 rounded border transition-colors duration-200 ${classes}"
                        data-time="${time}" 
                        ${!isAvailable ? 'disabled' : ''}>
                    ${formatTimeForDisplay(time)}
                </button>`;
        }).join('');

        return `
            <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Time Slot Selection</h3>
                <div class="mb-4">
                    <p class="text-slate-300 mb-2">Selected Date: <span class="text-blue-400 font-semibold">${dateDisplay}</span></p>
                    <p class="text-sm text-slate-400">Click time slots to select/deselect. Slots must be contiguous.</p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    ${timeButtons}
                </div>
                ${selectedSlotsForDate.length > 0 ? `
                    <div class="mt-4 p-3 bg-blue-900/30 rounded border border-blue-700">
                        <p class="text-blue-300 text-sm font-medium mb-1">Selected Time Slots:</p>
                        <p class="text-blue-200 text-sm">
                            ${selectedSlotsForDate.map(slot => formatTimeForDisplay(slot.time)).join(', ')}
                        </p>
                    </div>
                ` : ''}
            </section>`;
    }
    
    function updateUI() {
        const calendarContainer = document.getElementById('calendar-section');
        if (calendarContainer) calendarContainer.innerHTML = renderCalendar();
        
        // Update time slot selector
        const timeSelectorContainer = document.querySelector('#final-booking-form-container .space-y-8');
        if (timeSelectorContainer) {
            const existingTimeSelector = timeSelectorContainer.children[1];
            if (existingTimeSelector) {
                existingTimeSelector.innerHTML = renderTimeSlotSelector().match(/<section[^>]*>(.*)<\/section>/s)[1];
            }
        }
        
        syncFormWithState();
    }

    function syncFormWithState() {
        const startDateInput = document.getElementById('start_date');
        const endDateInput = document.getElementById('end_date');
        if (state.selectedSlots.length > 0) {
            const dates = [...new Set(state.selectedSlots.map(s => s.date))].sort();
            if(startDateInput) startDateInput.value = dates[0];
            if(endDateInput) endDateInput.value = dates[dates.length - 1];
        } else {
            const today = new Date().toISOString().split('T')[0];
            if(startDateInput) startDateInput.value = today;
            if(endDateInput) endDateInput.value = today;
        }
        const purposeInput = document.getElementById('purpose');
        const classCodeInput = document.getElementById('class_code');
        if (purposeInput) purposeInput.value = state.purpose;
        if (classCodeInput) classCodeInput.value = state.classCode;
    }

    // --- LOGIC & HELPERS ---
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

    function formatTimeForDisplay(time) {
        const [hour, minute] = time.split(':');
        const h = parseInt(hour);
        const suffix = h >= 12 ? 'pm' : 'am';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${String(displayHour).padStart(2, '0')}:${minute}${suffix}`;
    }

    function resetForm() {
        const { hall, availabilityData } = state;
        state = { 
            hall, 
            availabilityData, 
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
    }

    async function submitBooking() {
        try {
            const purposeInput = document.getElementById('purpose');
            const classCodeInput = document.getElementById('class_code');
            
            if (!purposeInput?.value.trim()) {
                alert('Please enter a purpose for the booking.');
                purposeInput?.focus();
                return;
            }
            
            if (state.selectedSlots.length === 0) {
                alert('Please select at least one time slot.');
                return;
            }

            // Group slots by date and create booking requests
            const dateGroups = {};
            state.selectedSlots.forEach(slot => {
                if (!dateGroups[slot.date]) {
                    dateGroups[slot.date] = [];
                }
                dateGroups[slot.date].push(slot.time);
            });

            const bookingRequests = [];
            for (const [date, times] of Object.entries(dateGroups)) {
                times.sort();
                const startTime = times[0];
                const endTime = times[times.length - 1];
                
                // Calculate end time (add 1 hour to last slot)
                const [endHour, endMinute] = endTime.split(':');
                const endHourInt = parseInt(endHour) + 1;
                const calculatedEndTime = `${String(endHourInt).padStart(2, '0')}:${endMinute}`;
                
                const startDateTime = `${date}T${startTime}:00.000Z`;
                const endDateTime = `${date}T${calculatedEndTime}:00.000Z`;

                bookingRequests.push({
                    hall_id: state.hall.id,
                    start_time: startDateTime,
                    end_time: endDateTime,
                    purpose: purposeInput.value.trim(),
                    class_code: classCodeInput?.value.trim() || null,
                    booking_type: state.bookingType
                });
            }
            
            // Show loading state
            const submitBtn = document.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Submitting...';
            submitBtn.disabled = true;

            try {
                const results = await addMultipleIndividualBookings(bookingRequests);
                
                const successful = results.filter(r => r.success);
                const failed = results.filter(r => !r.success);
                
                if (successful.length === results.length) {
                    alert(`All ${successful.length} booking request(s) submitted successfully! You will receive confirmation once approved.`);
                    resetForm();
                } else if (successful.length > 0) {
                    alert(`${successful.length} out of ${results.length} booking requests were submitted successfully. ${failed.length} failed.`);
                } else {
                    alert('All booking requests failed. Please try again.');
                }
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
            
        } catch (error) {
            alert('Failed to submit booking request. Please try again.');
        }
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const container = document.getElementById('final-booking-form-container');
        if (!container) return;
        
        container.addEventListener('click', handleContainerClick, { signal });
        container.addEventListener('input', e => {
            if (e.target.id === 'purpose') state.purpose = e.target.value;
            if (e.target.id === 'class_code') state.classCode = e.target.value;
        }, { signal });
        
        const calendarSection = container.querySelector('#calendar-section');
        if (calendarSection) {
            calendarSection.addEventListener('mousedown', handleDragStart, { signal });
            calendarSection.addEventListener('mouseenter', handleDragOver, { signal, capture: true });
        }
        window.addEventListener('mouseup', handleDragStop, { signal });
    }

    function handleContainerClick(e) {
        const target = e.target.closest('button') || e.target.closest('.day-header');
        if (!target) return;
        
        if (target.id === 'prev-month-btn') { 
            state.currentDate.setMonth(state.currentDate.getMonth() - 1); 
            updateUI(); 
        } 
        else if (target.id === 'next-month-btn') { 
            state.currentDate.setMonth(state.currentDate.getMonth() + 1); 
            updateUI(); 
        }
        else if (target.classList.contains('day-header')) {
            const selectedDate = target.dataset.date;
            if (selectedDate) {
                state.currentSelectedDate = selectedDate;
                updateUI();
            }
        }
        else if (target.classList.contains('time-slot-btn')) {
            handleTimeSlotClick(target);
        }
        else if (target.classList.contains('slot')) {
            handleSlotClick(target);
        }
        else if (target.id === 'reset-btn') {
            resetForm();
        }
        else if (target.closest('form')?.id === 'bookingForm' && target.type === 'submit') { 
            e.preventDefault(); 
            submitBooking(); 
        }
    }

    function handleTimeSlotClick(button) {
        const time = button.dataset.time;
        const date = state.currentSelectedDate;
        
        if (!date || !time) return;
        
        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        
        if (existingIndex > -1) {
            // Remove slot
            state.selectedSlots.splice(existingIndex, 1);
        } else {
            // Add slot with validation
            const newSlot = { date, time };
            const validation = validateContiguousSlots(newSlot);
            
            if (!validation.valid) {
                alert(validation.message);
                return;
            }
            
            state.selectedSlots.push(newSlot);
            fillGaps(newSlot);
        }
        
        updateUI();
    }

    function handleSlotClick(slotEl) {
        const { date, time } = slotEl.dataset;
        
        // Check if this is a booked or pending slot
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
        
        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        
        if (existingIndex > -1) {
            // Remove slot
            state.selectedSlots.splice(existingIndex, 1);
        } else {
            // Add slot with validation
            const newSlot = { date, time };
            const validation = validateContiguousSlots(newSlot);
            
            if (!validation.valid) {
                alert(validation.message);
                return;
            }
            
            state.selectedSlots.push(newSlot);
            fillGaps(newSlot);
        }
        
        // Update current selected date for time slot selector
        state.currentSelectedDate = date;
        updateUI();
    }

    function handleDragStart(e) {
        const cell = e.target.closest('.slot');
        if (!cell) return;
        
        e.preventDefault();
        state.isDragging = true;
        
        const dateString = cell.dataset.date;
        const time = cell.dataset.time;
        
        if (cell.disabled || 
            cell.classList.contains('slot-booked') || 
            cell.classList.contains('slot-pending') ||
            cell.classList.contains('slot-past')) {
            state.isDragging = false;
            return;
        }
        
        state.dragDate = dateString;
        const existingSlot = state.selectedSlots.find(s => s.date === dateString && s.time === time);
        state.dragSelectionMode = existingSlot ? 'remove' : 'add';
        
        handleSlotClick(cell);
    }

    function handleDragOver(e) {
        if (!state.isDragging) return;
        const cell = e.target.closest('.slot');
        if (cell && cell.dataset.date === state.dragDate) {
            if (!cell.disabled && 
                !cell.classList.contains('slot-booked') && 
                !cell.classList.contains('slot-pending') &&
                !cell.classList.contains('slot-past')) {
                
                const { date, time } = cell.dataset;
                const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
                const hasSlot = existingIndex > -1;
                
                if (state.dragSelectionMode === 'add' && !hasSlot) {
                    const newSlot = { date, time };
                    const validation = validateContiguousSlots(newSlot);
                    if (validation.valid) {
                        state.selectedSlots.push(newSlot);
                        fillGaps(newSlot);
                        updateUI();
                    }
                } else if (state.dragSelectionMode === 'remove' && hasSlot) {
                    state.selectedSlots.splice(existingIndex, 1);
                    updateUI();
                }
            }
        }
    }

    function handleDragStop() {
        if (state.isDragging) {
            state.isDragging = false;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        window.removeEventListener('mouseup', handleDragStop);
    }

    async function initialize(hallId) {
        try {
            // Try to get hall data from session storage first
            let hallData = null;
            let selectedSlots = [];
            let availabilityData = [];
            
            try {
                const storedHall = sessionStorage.getItem('finalBookingHall');
                const storedSlots = sessionStorage.getItem('finalBookingSlots');
                const storedAvailability = sessionStorage.getItem('finalBookingAvailability');
                
                if (storedHall) {
                    hallData = JSON.parse(storedHall);
                }
                if (storedSlots) {
                    selectedSlots = JSON.parse(storedSlots);
                }
                if (storedAvailability) {
                    availabilityData = JSON.parse(storedAvailability);
                }
            } catch (e) {
                // Handle parsing errors silently
            }
            
            // If no stored hall data, fetch from API
            if (!hallData) {
                const allHalls = await fetchAllHalls();
                hallData = allHalls.find(h => h.id === hallId || h.unique_id === hallId);
                
                if (!hallData) {
                    throw new Error(`Hall not found for ID: ${hallId}`);
                }
            }
            
            // Always fetch fresh availability data
            availabilityData = await fetchHallAvailability(hallId);
            
            // Initialize state
            state = {
                hall: hallData,
                availabilityData: availabilityData,
                selectedSlots: selectedSlots,
                currentDate: new Date(),
                bookingType: 'INDIVIDUAL',
                purpose: '',
                classCode: '',
                isDragging: false,
                dragSelectionMode: 'add',
                dragDate: null,
                currentSelectedDate: selectedSlots.length > 0 ? selectedSlots[0].date : null
            };
            
            render();
            
        } catch (error) {
            const container = document.getElementById('final-booking-form-content');
            if (container) {
                container.innerHTML = `
                    <div class="container mx-auto max-w-7xl">
                        <div class="text-center py-20">
                            <h2 class="text-xl font-bold text-red-400 mb-4">Error Loading Booking Form</h2>
                            <p class="text-slate-400 mb-4">Failed to load hall information for booking.</p>
                            <p class="text-slate-500 text-sm mb-2">Error: ${error.message}</p>
                            <p class="text-slate-500 text-sm mb-6">Hall ID: ${hallId}</p>
                            <div class="flex gap-4 justify-center">
                                <button onclick="window.history.back()" class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">
                                    Go Back
                                </button>
                                <button onclick="location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                    Retry
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
        render, 
        resetForm 
    };
})();
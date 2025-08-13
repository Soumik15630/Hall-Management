// finalBookingForm.js - Enhanced Implementation with Improved Time/Date Selection Logic and Week Navigation

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

    // --- UTILITY FUNCTIONS FOR IST TIME HANDLING ---
    function getCurrentISTTime() {
        // Use toLocaleString to get the current time in the 'Asia/Kolkata' timezone.
        // This is more reliable than manual offset calculations.
        const now = new Date();
        const istDateString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        return new Date(istDateString);
    }

    function getTodayISTString() {
        // This function reliably gets the 'YYYY-MM-DD' string for the current date in IST.
        const now = new Date();
        // Directly format to YYYY-MM-DD to avoid timezone parsing issues with different locales.
        const year = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' });
        const month = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit' });
        const day = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' });
        return `${year}-${month}-${day}`;
    }

    function getCurrentISTTimeString() {
        const now = new Date();
        // The 'en-GB' locale provides the HH:mm:ss format suitable for string slicing
        const timeString = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
        return timeString.substring(0, 5); // Returns time as 'HH:mm'
    }

    function isSlotInPast(dateString, time) {
        const todayISTString = getTodayISTString();

        // If the date is before today, it's in the past
        if (dateString < todayISTString) {
            return true;
        }
        
        // If it's today, check if the time slot has passed using reliable string comparison
        if (dateString === todayISTString) {
            const nowISTTime = getCurrentISTTimeString();
            // String comparison works perfectly for 'HH:MM' format (e.g., '09:30' < '13:06')
            return time < nowISTTime;
        }
        
        return false;
    }

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
            const bookings = await fetchFromAPI(`api/booking/hall/${hallId}`);
            
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

    // --- ENHANCED VALIDATION LOGIC ---
    function validateSingleDayBooking(newSlot) {
        if (state.selectedSlots.length === 0) {
            return { valid: true, message: '' };
        }

        // Check if all existing slots are for the same date
        const existingDates = [...new Set(state.selectedSlots.map(slot => slot.date))];
        
        if (existingDates.length > 0 && !existingDates.includes(newSlot.date)) {
            return { 
                valid: false, 
                message: `You can only book slots for one day at a time. Currently selected: ${formatDateForDisplay(existingDates[0])}. Please clear your selection to book for a different date.` 
            };
        }

        return { valid: true, message: '' };
    }

    function autoFillContiguousSlots(targetSlot) {
        const currentSelectedForDate = state.selectedSlots.filter(slot => slot.date === targetSlot.date);
        
        if (currentSelectedForDate.length === 0) {
            return;
        }

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
        // Check if slot is in the past (IST)
        if (isSlotInPast(dateString, time)) {
            return false;
        }
        
        // Check if slot is already booked
        const booking = state.availabilityData.find(b => {
             const bookingDate = new Date(b.start_date).toISOString().split('T')[0];
             const bookingTime = new Date(b.start_date).toTimeString().substring(0,5);
             return bookingDate === dateString && bookingTime === time;
        });
        
        return !booking;
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
                                    <label for="start_date" class="block text-slate-300 text-sm font-medium mb-2">BOOKING DATE</label>
                                    <input type="date" id="start_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-blue-500 focus:border-blue-500" readonly>
                                    <p class="text-xs text-slate-400 mt-1">Date is automatically set based on your time slot selection</p>
                                </div>
                                <div>
                                    <label class="block text-slate-300 text-sm font-medium mb-2">SELECTED TIME SLOTS</label>
                                    <div id="selected-times-display" class="p-3 bg-slate-700 border border-slate-600 rounded-md text-white min-h-[48px] flex items-center">
                                        ${state.selectedSlots.length > 0 ? 
                                            state.selectedSlots.map(slot => formatTimeForDisplay(slot.time)).join(', ') : 
                                            'No time slots selected'
                                        }
                                    </div>
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
        const todayString = getTodayISTString();
        
        const days = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(year, month, i);
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const isToday = dateString === todayString;
            
            days.push({
                date: i,
                dateString: dateString,
                dayName: dateObj.toLocaleString('default', { weekday: 'short' }),
                isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
                hasSlots: state.selectedSlots.some(slot => slot.date === dateString),
                isToday: isToday,
                isPast: dateString < todayString,
                todayLabel: isToday ? 'Today' : ''
            });
        }
        
        let dayHeaders = days.map(day => 
            `<div class="day-header ${day.hasSlots ? 'bg-blue-600/20 border border-blue-500/50' : ''} ${day.isToday ? 'bg-green-600/20 border border-green-500/50' : ''} ${day.isPast ? 'opacity-50' : ''}" 
                  data-date="${day.dateString}" title="Click to select time slots for ${day.dayName}, ${day.date}">
                <div class="text-sm font-semibold text-slate-300 ${day.isWeekend ? 'text-red-400' : ''} ${day.isToday ? 'text-green-400' : ''} ${day.isPast ? 'text-slate-500' : ''}">${day.date}</div>
                <div class="text-xs text-slate-400 ${day.isWeekend ? 'text-red-400' : ''} ${day.isToday ? 'text-green-400' : ''} ${day.isPast ? 'text-slate-500' : ''}">${day.dayName}</div>
                ${day.hasSlots ? '<div class="text-xs text-blue-400">●</div>' : ''}
                ${day.isToday ? '<div class="text-xs text-green-400">Today</div>' : ''}
            </div>`
        ).join('');

        const allSlotCells = timeSlots.flatMap(time => 
            days.map(day => {
                const classes = getSlotClasses(day.dateString, time);
                const isDisabled = classes.includes('slot-past');
                return `<button type="button" class="slot ${classes}" data-date="${day.dateString}" data-time="${time}" ${isDisabled ? 'disabled' : ''}></button>`;
            })
        ).join('');

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
            <div class="mb-4 p-3 bg-amber-900/30 border border-amber-600/50 rounded-md">
                <p class="text-amber-200 text-sm">
                    <i class="fas fa-info-circle mr-2"></i>
                    <strong>Note:</strong> You can only book slots for one day at a time. Times are displayed in IST. Past time slots are automatically disabled.
                </p>
                <p class="text-amber-100 text-xs mt-1">
                    <i class="fas fa-clock mr-1"></i>
                    Current IST Time: ${getCurrentISTTime().toLocaleString('en-IN', { 
                        timeZone: 'Asia/Kolkata', 
                        weekday: 'short',
                        day: 'numeric', 
                        month: 'short', 
                        hour: '2-digit', 
                        minute: '2-digit'
                    })}
                </p>
            </div>
            <div class="overflow-x-auto pb-4">
                <div class="calendar-grid min-w-[1200px]">
                    <div class="time-labels-col pr-2">
                        ${timeSlots.map(time => `<div class="time-label">${formatTimeForDisplay(time)}</div>`).join('')}
                    </div>
                    <div class="calendar-content-col">
                        <div class="calendar-header">${dayHeaders}</div>
                        <div class="calendar-body">${allSlotCells}</div>
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
                    gap: 8px;
                }
                .time-labels-col {
                    padding-top: 3.5rem; /* This is the buffer zone */
                    display: grid;
                    grid-template-rows: repeat(${timeSlots.length}, 2rem);
                    gap: 4px;
                }
                .time-label {
                    text-align: right;
                    font-size: 0.75rem;
                    color: #94a3b8; /* slate-400 */
                    height: 2rem;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                }
                .calendar-header {
                    display: grid;
                    grid-template-columns: repeat(${daysInMonth}, minmax(35px, 1fr));
                    gap: 4px;
                    margin-bottom: 4px;
                    height: 3rem; /* Fixed height for alignment */
                }
                .day-header {
                    padding: 4px 2px;
                    border-radius: 4px;
                    transition: all 0.2s ease-in-out;
                    text-align: center;
                    cursor: pointer;
                }
                .calendar-body {
                    display: grid;
                    grid-template-columns: repeat(${daysInMonth}, minmax(35px, 1fr));
                    grid-template-rows: repeat(${timeSlots.length}, 2rem);
                    gap: 4px;
                }
                .slot {
                    width: 100%;
                    height: 100%;
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
                    opacity: 0.5;
                }
                .slot-selected { 
                    background-color: rgba(59, 130, 246, 0.8) !important; 
                    border-color: rgba(59, 130, 246, 1) !important; 
                    color: white !important; 
                }
            </style>`;
    }

    // Enhanced renderTimeSlotSelector with better week navigation styling
    function renderTimeSlotSelector() {
        let content;
        if (!state.currentSelectedDate) {
            content = `
                <div class="text-center text-slate-400 py-8">
                    <p>Click on a date in the calendar above to select time slots</p>
                </div>`;
        } else {
            const selectedDate = new Date(state.currentSelectedDate + "T00:00:00");
            const todayString = getTodayISTString();
            
            const startOfWeek = new Date(selectedDate);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); 
            
            let dayButtons = '';
            for (let i = 0; i < 7; i++) {
                const day = new Date(startOfWeek);
                day.setDate(day.getDate() + i);
                
                const year = day.getFullYear();
                const month = String(day.getMonth() + 1).padStart(2, '0');
                const date = String(day.getDate()).padStart(2, '0');
                const dateString = `${year}-${month}-${date}`;
                
                const isSelected = dateString === state.currentSelectedDate;
                const isPast = dateString < todayString;
                const isToday = dateString === todayString;
                const hasSlots = state.selectedSlots.some(slot => slot.date === dateString);
                
                let classes = 'day-selector-btn px-3 py-2 rounded border transition-all duration-200 text-center min-w-[60px]';
                if (isSelected) {
                    classes += ' bg-blue-600 text-white border-blue-500 shadow-lg transform scale-105';
                } else if (isPast) {
                    classes += ' bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50';
                } else if (isToday) {
                    classes += ' bg-green-700/20 text-green-400 border-green-600 hover:bg-green-600/30';
                } else {
                    classes += ' bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600 hover:border-slate-500';
                }

                if (hasSlots && !isSelected) {
                    classes += ' ring-2 ring-blue-400/50';
                }

                dayButtons += `
                    <button type="button" 
                            class="${classes}"
                            data-date="${dateString}"
                            title="${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${hasSlots ? ' (Has selected slots)' : ''}"
                            ${isPast ? 'disabled' : ''}>
                        <div class="font-semibold text-sm">${day.toLocaleString('default', { weekday: 'short' })}</div>
                        <div class="text-xs mt-1">${date}</div>
                        ${isToday ? '<div class="text-xs text-green-400">Today</div>' : ''}
                        ${hasSlots ? '<div class="text-xs text-blue-400">●</div>' : ''}
                    </button>`;
            }

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
                const isPast = isSlotInPast(state.currentSelectedDate, time);
                
                let classes, status;
                if (isSelected) {
                    classes = 'bg-blue-600 text-white border-blue-500 shadow-lg transform scale-105';
                    status = 'Selected';
                } else if (isPast) {
                    classes = 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50';
                    status = 'Past';
                } else if (!isAvailable) {
                    const booking = getBookingForSlot(state.currentSelectedDate, time);
                    status = booking?.status || 'Booked';
                    classes = status === 'PENDING' 
                        ? 'bg-yellow-800/30 text-yellow-400 border-yellow-700 cursor-pointer hover:bg-yellow-800/40'
                        : 'bg-red-800/30 text-red-400 border-red-700 cursor-pointer hover:bg-red-800/40';
                } else {
                    classes = 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600 hover:border-slate-500';
                    status = 'Available';
                }
                
                const isDisabled = isPast;
                
                return `
                    <button type="button" 
                            class="time-slot-btn px-4 py-3 rounded border transition-all duration-200 font-medium ${classes}"
                            data-time="${time}" 
                            title="${formatTimeForDisplay(time)} - ${status}"
                            ${isDisabled ? 'disabled' : ''}>
                        <div class="text-sm">${formatTimeForDisplay(time)}</div>
                        <div class="text-xs opacity-75 mt-1">${status}</div>
                    </button>`;
            }).join('');

            // Get week range for display
            const weekStart = new Date(startOfWeek);
            const weekEnd = new Date(startOfWeek);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            const weekRangeDisplay = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

            content = `
                <div class="mb-6">
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-slate-300 font-medium">Select a Day</p>
                        <p class="text-slate-400 text-sm">Week of ${weekRangeDisplay}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button id="prev-week-btn" 
                                title="Previous Week" 
                                class="p-3 rounded-full hover:bg-slate-700 active:bg-slate-600 transition-all duration-200 text-white border border-slate-600 hover:border-slate-500">
                            <i class="fas fa-chevron-left text-sm"></i>
                        </button>
                        <div class="grid grid-cols-7 gap-2 flex-grow">
                            ${dayButtons}
                        </div>
                        <button id="next-week-btn" 
                                title="Next Week" 
                                class="p-3 rounded-full hover:bg-slate-700 active:bg-slate-600 transition-all duration-200 text-white border border-slate-600 hover:border-slate-500">
                            <i class="fas fa-chevron-right text-sm"></i>
                        </button>
                    </div>
                </div>

                <div>
                    <p class="text-slate-300 mb-2 font-medium">Select Time Slots for <span class="text-blue-400 font-semibold">${dateDisplay}</span></p>
                     <p class="text-sm text-slate-400 mb-4">
                        <i class="fas fa-info-circle mr-1"></i>
                        Click time slots to select/deselect. Gaps between selections will be auto-filled to maintain contiguity.
                    </p>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        ${timeButtons}
                    </div>
                </div>

                ${selectedSlotsForDate.length > 0 ? `
                    <div class="mt-6 p-4 bg-blue-900/30 rounded-lg border border-blue-700">
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-blue-300 font-medium">Selected Time Slots</p>
                            <span class="text-blue-200 text-sm bg-blue-800/50 px-2 py-1 rounded">${selectedSlotsForDate.length} slot${selectedSlotsForDate.length > 1 ? 's' : ''}</span>
                        </div>
                        <p class="text-blue-200 text-sm">
                            ${selectedSlotsForDate.map(slot => formatTimeForDisplay(slot.time)).sort().join(', ')}
                        </p>
                        <p class="text-blue-300/70 text-xs mt-2">
                            <i class="fas fa-clock mr-1"></i>
                            Duration: ${selectedSlotsForDate.length} hour${selectedSlotsForDate.length > 1 ? 's' : ''}
                        </p>
                    </div>
                ` : ''}
            `;
        }

        return `
            <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">
                    <i class="fas fa-calendar-alt mr-2"></i>
                    Date & Time Selection
                </h3>
                ${content}
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
                const newTimeSelectorContent = renderTimeSlotSelector();
                const match = newTimeSelectorContent.match(/<section[^>]*>(.*)<\/section>/s);
                if (match && match[1]) {
                    existingTimeSelector.innerHTML = match[1];
                } else {
                     existingTimeSelector.innerHTML = newTimeSelectorContent;
                }
            }
        }
        
        syncFormWithState();
    }

    function syncFormWithState() {
        const startDateInput = document.getElementById('start_date');
        const selectedTimesDisplay = document.getElementById('selected-times-display');
        
        if (state.selectedSlots.length > 0) {
            const dates = [...new Set(state.selectedSlots.map(s => s.date))].sort();
            if(startDateInput) startDateInput.value = dates[0];
            
            if(selectedTimesDisplay) {
                const sortedTimes = state.selectedSlots
                    .map(slot => formatTimeForDisplay(slot.time))
                    .sort()
                    .join(', ');
                selectedTimesDisplay.textContent = sortedTimes;
            }
        } else {
            const todayString = getTodayISTString();
            if(startDateInput) startDateInput.value = todayString;
            if(selectedTimesDisplay) {
                selectedTimesDisplay.textContent = 'No time slots selected';
            }
        }
        
        const purposeInput = document.getElementById('purpose');
        const classCodeInput = document.getElementById('class_code');
        if (purposeInput) purposeInput.value = state.purpose;
        if (classCodeInput) classCodeInput.value = state.classCode;
    }

    // --- LOGIC & HELPERS ---
    function getSlotClasses(dateString, time) {
        if (state.selectedSlots.some(s => s.date === dateString && s.time === time)) {
            return 'slot-selected';
        }
        
        // Check if slot is in the past using IST
        if (isSlotInPast(dateString, time)) {
            return 'slot-past';
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
        const suffix = h >= 12 ? 'PM' : 'AM';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${String(displayHour).padStart(2, '0')}:${minute} ${suffix}`;
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
            
            // Validation checks (matching book.html exactly)
            if (!state.hall?.id) {
                alert('Hall ID is missing.');
                return;
            }
            
            if (state.selectedSlots.length === 0) {
                alert('Please select at least one time slot.');
                return;
            }
            
            if (!purposeInput?.value.trim()) {
                alert('Please provide a purpose for the booking.');
                purposeInput?.focus();
                return;
            }

            // Since we now only allow single-day bookings, this is simplified
            const selectedDate = state.selectedSlots[0].date;
            const times = state.selectedSlots.map(slot => slot.time).sort();
            
            // Calculate end time exactly like book.html
            const lastSlotStartTime = times[times.length - 1];
            const [hour, minute] = lastSlotStartTime.split(':').map(Number);

            const tempDate = new Date();
            tempDate.setHours(hour, minute, 0, 0);
            tempDate.setHours(tempDate.getHours() + 1);

            const endHour = String(tempDate.getHours()).padStart(2, '0');
            const endMinute = String(tempDate.getMinutes()).padStart(2, '0');
            const actualEndTime = `${endHour}:${endMinute}`;

            // Create payload exactly like book.html
            const payload = {
                hall_id: state.hall.id, // Keep as original type from hall data
                purpose: purposeInput.value.trim(),
                booking_type: state.bookingType,
                start_date: new Date(selectedDate).toISOString(),
                end_date: new Date(selectedDate).toISOString(),
                start_time: times[0],
                end_time: actualEndTime,
            };

            // Add optional class_code if provided
            if (classCodeInput?.value.trim()) {
                payload.class_code = classCodeInput.value.trim();
            }
            
            // Show loading state
            const submitBtn = document.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Submitting...';
            submitBtn.disabled = true;

            try {
                // Use the exact same API call approach as book.html
                const url = AppConfig.apiBaseUrl + AppConfig.endpoints.bookingRequest;
                const response = await fetch(url, { 
                    method: 'POST', 
                    headers: getAuthHeaders(), 
                    body: JSON.stringify(payload) 
                });
                
                if (!response.ok) {
                    if (response.status === 401) { 
                        logout(); 
                        return; 
                    }
                    let errorMsg = `Request failed: ${response.statusText}`;
                    try {
                        const errorResult = await response.json();
                        if (errorResult.message) errorMsg = errorResult.message;
                    } catch (e) { 
                        console.error("Could not parse error response.", e); 
                    }
                    throw new Error(errorMsg);
                }
                
                const result = await response.json();
                alert(result.message || 'Booking request submitted successfully!');
                resetForm();
                
                // Refresh availability data after successful submission
                if (state.hall?.id) {
                    state.availabilityData = await fetchHallAvailability(state.hall.id);
                    render();
                }
                
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
            
        } catch (error) {
            alert(error.message || 'Failed to submit booking request. Please try again.');
            console.error('Booking submission error:', error);
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
        const target = e.target.closest('button');
        if (!target) return;
        
        if (target.id === 'prev-month-btn') { 
            state.currentDate.setMonth(state.currentDate.getMonth() - 1); 
            updateUI(); 
        } 
        else if (target.id === 'next-month-btn') { 
            state.currentDate.setMonth(state.currentDate.getMonth() + 1); 
            updateUI(); 
        }
        else if (target.id === 'prev-week-btn') {
            if (state.currentSelectedDate) {
                const newDate = new Date(state.currentSelectedDate + 'T00:00:00');
                newDate.setDate(newDate.getDate() - 7);
                const year = newDate.getFullYear();
                const month = String(newDate.getMonth() + 1).padStart(2, '0');
                const day = String(newDate.getDate()).padStart(2, '0');
                const newDateString = `${year}-${month}-${day}`;
                
                // Check if user has selected slots and warn before changing week
                if (state.selectedSlots.length > 0) {
                    const confirmChange = confirm('Changing the week will keep your selected time slots. The date selection will move to the new week. Continue?');
                    if (!confirmChange) return;
                }
                
                state.currentSelectedDate = newDateString;
                state.currentDate = newDate;
                updateUI();
            }
        }
        else if (target.id === 'next-week-btn') {
            if (state.currentSelectedDate) {
                const newDate = new Date(state.currentSelectedDate + 'T00:00:00');
                newDate.setDate(newDate.getDate() + 7);
                const year = newDate.getFullYear();
                const month = String(newDate.getMonth() + 1).padStart(2, '0');
                const day = String(newDate.getDate()).padStart(2, '0');
                const newDateString = `${year}-${month}-${day}`;
                
                // Check if user has selected slots and warn before changing week
                if (state.selectedSlots.length > 0) {
                    const confirmChange = confirm('Changing the week will keep your selected time slots. The date selection will move to the new week. Continue?');
                    if (!confirmChange) return;
                }
                
                state.currentSelectedDate = newDateString;
                state.currentDate = newDate;
                updateUI();
            }
        }
        else if (target.classList.contains('day-header') || target.classList.contains('day-selector-btn')) {
            const selectedDate = target.dataset.date;
            if (selectedDate && !target.disabled) {
                if (state.selectedSlots.length > 0) {
                    const existingDate = state.selectedSlots[0].date;
                    if (existingDate !== selectedDate) {
                        const confirmChange = confirm(`You have selected time slots for ${formatDateForDisplay(existingDate)}. Selecting a different date will clear your current selection. Continue?`);
                        if (!confirmChange) return;
                        state.selectedSlots = [];
                    }
                }
                state.currentSelectedDate = selectedDate;
                state.currentDate = new Date(selectedDate + 'T00:00:00');
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
            const confirmReset = confirm('Are you sure you want to clear all selections?');
            if (confirmReset) resetForm();
        }
        else if (target.closest('form')?.id === 'bookingForm' && target.type === 'submit') { 
            e.preventDefault(); 
            submitBooking(); 
        }
    }

    function handleTimeSlotClick(button) {
        const time = button.dataset.time;
        const date = state.currentSelectedDate;
        
        if (!date || !time || button.disabled) return;
        
        const isAvailable = isSlotAvailable(date, time);
        const isSelected = state.selectedSlots.some(s => s.date === date && s.time === time);

        // If the slot is booked/pending and not currently selected, show details and stop.
        if (!isAvailable && !isSelected) {
            const booking = getBookingForSlot(date, time);
            if (booking) {
                showBookingDetails(booking);
                return;
            }
        }

        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        
        if (existingIndex > -1) {
            // --- DESELECTION LOGIC ---
            const slotsForDate = state.selectedSlots
                .filter(s => s.date === date)
                .sort((a, b) => timeSlots.indexOf(a.time) - timeSlots.indexOf(b.time));
            
            const clickedSlotIndex = slotsForDate.findIndex(s => s.time === time);

            // Remove the clicked slot and all subsequent slots on that day
            const slotsToRemove = slotsForDate.slice(clickedSlotIndex);
            
            state.selectedSlots = state.selectedSlots.filter(s => {
                return !slotsToRemove.some(r => r.date === s.date && r.time === s.time);
            });

        } else {
            // --- SELECTION LOGIC ---
            const newSlot = { date, time };
            
            const singleDayValidation = validateSingleDayBooking(newSlot);
            if (!singleDayValidation.valid) {
                alert(singleDayValidation.message);
                return;
            }
            
            state.selectedSlots.push(newSlot);
            autoFillContiguousSlots(newSlot);
        }
        
        updateUI();
    }

    function handleSlotClick(slotEl) {
        const { date, time } = slotEl.dataset;
        
        if (slotEl.classList.contains('slot-booked') || slotEl.classList.contains('slot-pending')) {
            const booking = getBookingForSlot(date, time);
            if (booking) showBookingDetails(booking);
            return;
        }
        
        if (slotEl.disabled || slotEl.classList.contains('slot-past')) return;
        
        if (state.selectedSlots.length > 0) {
            const existingDate = state.selectedSlots[0].date;
            if (existingDate !== date) {
                const confirmChange = confirm(`You have selected time slots for ${formatDateForDisplay(existingDate)}. Selecting a different date will clear your current selection. Continue?`);
                if (!confirmChange) return;
                state.selectedSlots = [];
            }
        }
        
        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        
        if (existingIndex > -1) {
            // --- DESELECTION LOGIC ---
             const slotsForDate = state.selectedSlots
                .filter(s => s.date === date)
                .sort((a, b) => timeSlots.indexOf(a.time) - timeSlots.indexOf(b.time));
            
            const clickedSlotIndex = slotsForDate.findIndex(s => s.time === time);
            const slotsToRemove = slotsForDate.slice(clickedSlotIndex);
            
            state.selectedSlots = state.selectedSlots.filter(s => {
                return !slotsToRemove.some(r => r.date === s.date && r.time === s.time);
            });

        } else {
            // --- SELECTION LOGIC ---
            const newSlot = { date, time };
            
            const singleDayValidation = validateSingleDayBooking(newSlot);
            if (!singleDayValidation.valid) {
                alert(singleDayValidation.message);
                return;
            }
            
            state.selectedSlots.push(newSlot);
            autoFillContiguousSlots(newSlot);
        }
        
        state.currentSelectedDate = date;
        updateUI();
    }

    function handleDragStart(e) {
        const cell = e.target.closest('.slot');
        if (!cell) return;
        
        e.preventDefault();
        const dateString = cell.dataset.date;
        const time = cell.dataset.time;
        
        if (cell.disabled || 
            cell.classList.contains('slot-booked') || 
            cell.classList.contains('slot-pending') ||
            cell.classList.contains('slot-past')) {
            return;
        }
        
        if (state.selectedSlots.length > 0) {
            const existingDate = state.selectedSlots[0].date;
            if (existingDate !== dateString) {
                return; 
            }
        }
        
        state.isDragging = true;
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
                const hasSlot = state.selectedSlots.some(s => s.date === date && s.time === time);
                
                if (state.dragSelectionMode === 'add' && !hasSlot) {
                    const newSlot = { date, time };
                    state.selectedSlots.push(newSlot);
                    autoFillContiguousSlots(newSlot);
                    updateUI();
                } else if (state.dragSelectionMode === 'remove' && hasSlot) {
                    // This part of drag-to-remove is complex with the new rule,
                    // so we simplify it to just handle the single cell on mouseover.
                    const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
                    if (existingIndex > -1) {
                         state.selectedSlots.splice(existingIndex, 1);
                         updateUI();
                    }
                }
            }
        }
    }

    function handleDragStop() {
        if (state.isDragging) {
            state.isDragging = false;
            // After dragging, re-validate and fill any gaps created
            if (state.selectedSlots.length > 0) {
                const lastSelected = state.selectedSlots[state.selectedSlots.length -1];
                autoFillContiguousSlots(lastSelected);
                updateUI();
            }
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
                currentSelectedDate: selectedSlots.length > 0 ? selectedSlots[0].date : getTodayISTString()
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
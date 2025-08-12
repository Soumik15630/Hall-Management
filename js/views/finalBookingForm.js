// finalBookingForm.js - Enhanced Implementation with Improved Time/Date Selection Logic and Week Navigation

(function() {
    
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

            // Corrected mapping: Spread operator first, then explicit properties to ensure correct ID override.
            return { 
                ...hall,
                id: hall.unique_id || hall.id, 
                unique_id: hall.unique_id || hall.id,
                name: hall.name, 
                location: `${school ? school.school_name : 'N/A'}${dept ? ' - ' + dept.department_name : ''}`,
                capacity: hall.capacity,
                floor: formatTitleCase(hall.floor),
                zone: formatTitleCase(hall.zone),
                features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase) : [],
                incharge: incharge
            };
        });

        // Cache for future use
        window.allHallsCache = allHalls;
        return allHalls;
    }

    async function fetchHallAvailability(hallId) {
        try {
            // MODIFIED: Now uses the getHallSchedule endpoint from AppConfig
            const endpoint = `${AppConfig.endpoints.getHallSchedule}${hallId}`;
            const bookings = await fetchFromAPI(endpoint);
            
            if (!Array.isArray(bookings)) {
                console.error("Expected an array of bookings but received:", bookings);
                return [];
            }

            // Transform the booking data to match the state's expected format
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
            console.error(`Failed to fetch hall schedule for hallId ${hallId}:`, error);
            // Return an empty array on error so the UI can still render
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
    
    // --- CUSTOM MODAL & CONFIRMATION ---
    function showCustomAlert(message, type = 'info') {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300';
        
        const alertBox = document.createElement('div');
        alertBox.className = 'bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4 border border-slate-700 shadow-2xl transform transition-all duration-300 scale-95 opacity-0';
        
        let iconColor = 'text-blue-400';
        let icon = 'fa-info-circle';
        if (type === 'success') {
            iconColor = 'text-green-400';
            icon = 'fa-check-circle';
        } else if (type === 'error') {
            iconColor = 'text-red-400';
            icon = 'fa-times-circle';
        }

        alertBox.innerHTML = `
            <div class="flex items-start">
                <div class="mr-4 ${iconColor}">
                    <i class="fas ${icon} fa-2x"></i>
                </div>
                <div class="flex-1">
                    <p class="text-white text-lg font-semibold mb-2">${type.charAt(0).toUpperCase() + type.slice(1)}</p>
                    <p class="text-slate-300">${message}</p>
                </div>
            </div>
            <div class="mt-6 flex justify-end">
                <button class="close-alert-btn px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">OK</button>
            </div>
        `;

        modal.appendChild(alertBox);
        document.body.appendChild(modal);

        setTimeout(() => {
            modal.classList.add('opacity-100');
            alertBox.classList.remove('scale-95', 'opacity-0');
            alertBox.classList.add('scale-100', 'opacity-100');
        }, 10);

        const close = () => {
            alertBox.classList.remove('scale-100', 'opacity-100');
            alertBox.classList.add('scale-95', 'opacity-0');
            modal.classList.remove('opacity-100');
            setTimeout(() => document.body.removeChild(modal), 300);
        };

        alertBox.querySelector('.close-alert-btn').addEventListener('click', close);
    }

    function showCustomConfirm(message) {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300';
            
            const confirmBox = document.createElement('div');
            confirmBox.className = 'bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4 border border-slate-700 shadow-2xl transform transition-all duration-300 scale-95 opacity-0';
            
            confirmBox.innerHTML = `
                <div class="flex items-start">
                    <div class="mr-4 text-yellow-400">
                        <i class="fas fa-exclamation-triangle fa-2x"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-white text-lg font-semibold mb-2">Confirmation</p>
                        <p class="text-slate-300">${message}</p>
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-4">
                    <button id="confirm-cancel-btn" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-semibold">Cancel</button>
                    <button id="confirm-ok-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">OK</button>
                </div>
            `;

            modal.appendChild(confirmBox);
            document.body.appendChild(modal);

            setTimeout(() => {
                modal.classList.add('opacity-100');
                confirmBox.classList.remove('scale-95', 'opacity-0');
                confirmBox.classList.add('scale-100', 'opacity-100');
            }, 10);

            const close = (value) => {
                confirmBox.classList.remove('scale-100', 'opacity-100');
                confirmBox.classList.add('scale-95', 'opacity-0');
                modal.classList.remove('opacity-100');
                setTimeout(() => {
                    document.body.removeChild(modal);
                    resolve(value);
                }, 300);
            };

            confirmBox.querySelector('#confirm-ok-btn').addEventListener('click', () => close(true));
            confirmBox.querySelector('#confirm-cancel-btn').addEventListener('click', () => close(false));
        });
    }

    // --- ENHANCED VALIDATION LOGIC ---
    function validateSingleDayBooking(newSlot) {
        if (state.selectedSlots.length === 0) {
            return { valid: true, message: '' };
        }

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
        if (isSlotInPast(dateString, time)) return false;
        
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

        // Main form container
        container.innerHTML = `
            <div id="final-booking-form-container" class="container mx-auto max-w-7xl">
                <div class="space-y-8">
                    <!-- Hall Details Section -->
                    <section id="hall-details-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                        ${renderHallDetails()}
                    </section>
                    
                    <!-- Calendar Section -->
                    <section id="calendar-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                        ${renderCalendar()}
                    </section>
                    
                    <!-- Time Slot Selector -->
                    ${renderTimeSlotSelector()}

                    <!-- Booking Form -->
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
                                        ${state.selectedSlots.length > 0 ? state.selectedSlots.map(slot => formatTimeForDisplay(slot.time)).sort().join(', ') : 'No time slots selected' }
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

                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <div class="flex flex-col sm:flex-row justify-end items-center gap-4">
                                <button type="button" id="reset-booking-btn" class="w-full sm:w-auto px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-semibold transition-colors">Clear Selection</button>
                                <button type="submit" id="submit-booking-btn" class="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors">Submit Booking Request</button>
                            </div>
                        </section>
                    </form>
                </div>
            </div>
        `;

        updateSelectedInfo();
        attachEventListeners();
    }

    function renderHallDetails() {
        if (!state.hall) {
            return '<p class="text-center text-slate-400">Loading hall details...</p>';
        }
        const { name, location, capacity, floor, zone, features, incharge } = state.hall;
        return `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 border-b border-slate-700 pb-4">
                <div>
                    <h2 class="text-2xl sm:text-3xl font-bold text-white">${name}</h2>
                    <p class="text-slate-400 text-lg">${location}</p>
                </div>
                <div class="mt-4 md:mt-0 text-left md:text-right">
                    <p class="text-slate-300"><i class="fas fa-users mr-2"></i>Capacity: ${capacity}</p>
                    <p class="text-slate-300"><i class="fas fa-layer-group mr-2"></i>Floor: ${floor}</p>
                    <p class="text-slate-300"><i class="fas fa-map-marker-alt mr-2"></i>Zone: ${zone}</p>
                </div>
            </div>
            <div class="flex flex-wrap gap-2 mb-4">
                ${features.map(f => `<span class="bg-blue-900/50 text-blue-300 text-xs font-semibold px-2.5 py-1 rounded-full">${f}</span>`).join('')}
            </div>
            ${incharge && incharge.name ? `
            <div class="bg-slate-800/50 p-3 rounded-md border border-slate-700">
                <p class="text-slate-300 font-semibold">In-charge: ${incharge.name} (${incharge.designation})</p>
                <p class="text-sm text-slate-400">Email: ${incharge.email} | Intercom: ${incharge.intercom || 'N/A'}</p>
            </div>
            ` : ''}
        `;
    }

    function renderCalendar() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentMonth = state.currentDate.getMonth();
        const currentYear = state.currentDate.getFullYear();

        let calendarHtml = `
            <div class="flex justify-between items-center mb-4">
                <button id="prev-week-btn" class="p-2 rounded-md hover:bg-slate-700"><i class="fas fa-chevron-left"></i></button>
                <h3 class="text-xl font-semibold text-white">${state.currentDate.toLocaleString('default', { month: 'long' })} ${currentYear}</h3>
                <button id="next-week-btn" class="p-2 rounded-md hover:bg-slate-700"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="grid grid-cols-7 gap-1 text-center text-slate-400 text-sm mb-2">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
            </div>
            <div id="calendar-grid" class="grid grid-cols-7 gap-1">
        `;
        
        const firstDayOfWeek = new Date(state.currentDate);
        const dayOfWeek = firstDayOfWeek.getDay();
        firstDayOfWeek.setDate(firstDayOfWeek.getDate() - dayOfWeek);

        for (let i = 0; i < 7; i++) {
            const day = new Date(firstDayOfWeek);
            day.setDate(day.getDate() + i);
            const dateString = day.toISOString().split('T')[0];
            const isToday = day.getTime() === today.getTime();
            const isSelected = state.currentSelectedDate === dateString;
            const isPast = day < today;
            
            let classes = 'p-2 rounded-lg cursor-pointer transition-colors text-center ';
            if (isPast) {
                classes += 'text-slate-600 cursor-not-allowed';
            } else if (isSelected) {
                classes += 'bg-blue-600 text-white font-bold';
            } else if (isToday) {
                classes += 'bg-slate-700 hover:bg-slate-600';
            } else {
                classes += 'hover:bg-slate-800';
            }

            calendarHtml += `
                <div class="day-cell ${classes}" data-date="${dateString}">
                    <span class="text-sm">${day.toLocaleString('default', { weekday: 'short' })}</span>
                    <span class="block text-lg">${day.getDate()}</span>
                </div>
            `;
        }

        calendarHtml += '</div>';
        return calendarHtml;
    }

    function renderTimeSlotSelector() {
        if (!state.currentSelectedDate) {
            return `
                <section id="time-slot-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                    <p class="text-center text-slate-400">Please select a date from the calendar to see available time slots.</p>
                </section>
            `;
        }
        
        let timeSlotsHtml = `
            <section id="time-slot-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                <h3 class="text-xl font-semibold text-white mb-4">Available Slots for ${formatDateForDisplay(state.currentSelectedDate)}</h3>
                <div id="time-slots-grid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-3">
        `;

        timeSlots.forEach(time => {
            const isSelected = state.selectedSlots.some(s => s.date === state.currentSelectedDate && s.time === time);
            const isAvailable = isSlotAvailable(state.currentSelectedDate, time);
            const booking = isAvailable ? null : getBookingForSlot(state.currentSelectedDate, time);
            
            let classes = 'time-slot-btn p-3 rounded-md text-center font-semibold transition-all duration-200 ';
            let content = formatTimeForDisplay(time);
            let disabled = false;

            if (!isAvailable) {
                classes += 'bg-red-800/50 text-red-300 cursor-pointer relative group';
                content = `
                    ${formatTimeForDisplay(time)}
                    <div class="absolute bottom-full mb-2 w-max p-2 text-xs text-white bg-slate-900 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-slate-700 shadow-lg">
                        Booked by ${booking?.booked_by || 'Unknown'} for "${booking?.purpose || 'Private Event'}"
                    </div>
                `;
            } else if (isSelected) {
                classes += 'bg-green-600 text-white scale-105 shadow-lg';
            } else {
                classes += 'bg-slate-700 hover:bg-slate-600 cursor-pointer';
            }
            
            timeSlotsHtml += `
                <button type="button" class="${classes}" data-time="${time}" data-date="${state.currentSelectedDate}" ${disabled ? 'disabled' : ''}>
                    ${content}
                </button>
            `;
        });

        timeSlotsHtml += '</div></section>';
        return timeSlotsHtml;
    }

    function formatTimeForDisplay(time) {
        if (!time) return '';
        const [hour, minute] = time.split(':');
        const h = parseInt(hour, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${displayHour}:${minute} ${ampm}`;
    }

    function updateSelectedInfo() {
        const startDateInput = document.getElementById('start_date');
        const selectedTimesDisplay = document.getElementById('selected-times-display');

        if (state.selectedSlots.length > 0) {
            const sortedSlots = [...state.selectedSlots].sort((a, b) => a.time.localeCompare(b.time));
            if (startDateInput) {
                startDateInput.value = sortedSlots[0].date;
            }
            if (selectedTimesDisplay) {
                selectedTimesDisplay.textContent = sortedSlots.map(slot => formatTimeForDisplay(slot.time)).join(', ');
            }
        } else {
            if (startDateInput) startDateInput.value = '';
            if (selectedTimesDisplay) selectedTimesDisplay.textContent = 'No time slots selected';
        }
    }

    // --- EVENT HANDLING ---
    function attachEventListeners() {
        // Calendar navigation
        document.getElementById('prev-week-btn')?.addEventListener('click', handlePrevWeek);
        document.getElementById('next-week-btn')?.addEventListener('click', handleNextWeek);
        
        // Date selection
        document.querySelectorAll('.day-cell').forEach(cell => {
            if (!cell.classList.contains('text-slate-600')) {
                 cell.addEventListener('click', handleDateSelect);
            }
        });
        
        // Time slot selection (with drag support)
        const timeGrid = document.getElementById('time-slots-grid');
        if (timeGrid) {
            timeGrid.addEventListener('mousedown', handleTimeSlotMouseDown);
            timeGrid.addEventListener('mouseover', handleTimeSlotMouseOver);
            // Use window to capture mouseup even if it happens outside the grid
            window.addEventListener('mouseup', handleTimeSlotMouseUp);
        }

        // Form submission and reset
        document.getElementById('bookingForm')?.addEventListener('submit', handleFormSubmit);
        document.getElementById('reset-booking-btn')?.addEventListener('click', resetForm);

        // Booked slot details
        document.querySelectorAll('.time-slot-btn.bg-red-800\\/50').forEach(btn => {
            btn.addEventListener('click', handleBookedSlotClick);
        });
    }

    function handlePrevWeek() {
        state.currentDate.setDate(state.currentDate.getDate() - 7);
        render();
    }

    function handleNextWeek() {
        state.currentDate.setDate(state.currentDate.getDate() + 7);
        render();
    }

    function handleDateSelect(event) {
        const date = event.currentTarget.dataset.date;
        state.currentSelectedDate = date;
        render();
    }

    function handleTimeSlotMouseDown(event) {
        const button = event.target.closest('.time-slot-btn');
        if (!button || button.disabled || button.classList.contains('bg-red-800/50')) return;
        
        event.preventDefault(); // Prevent text selection while dragging
        state.isDragging = true;
        
        const date = button.dataset.date;
        const time = button.dataset.time;
        state.dragDate = date;

        const isSelected = state.selectedSlots.some(s => s.date === date && s.time === time);
        state.dragSelectionMode = isSelected ? 'remove' : 'add';
        
        toggleSlotSelection({ date, time });
        render(); // Re-render to show immediate feedback
    }

    function handleTimeSlotMouseOver(event) {
        if (!state.isDragging) return;
        const button = event.target.closest('.time-slot-btn');
        if (!button || button.disabled || button.dataset.date !== state.dragDate) return;

        const date = button.dataset.date;
        const time = button.dataset.time;
        const slot = { date, time };
        const isSelected = state.selectedSlots.some(s => s.date === date && s.time === time);

        if (state.dragSelectionMode === 'add' && !isSelected) {
            const validation = validateSingleDayBooking(slot);
            if(validation.valid) {
                state.selectedSlots.push(slot);
                autoFillContiguousSlots(slot);
            }
        } else if (state.dragSelectionMode === 'remove' && isSelected) {
            state.selectedSlots = state.selectedSlots.filter(s => !(s.date === date && s.time === time));
        }
        render();
    }

    function handleTimeSlotMouseUp() {
        if(state.isDragging) {
            state.isDragging = false;
            state.dragDate = null;
            render(); // Final render after drag ends
        }
    }

    function handleBookedSlotClick(event) {
        const button = event.target.closest('.time-slot-btn');
        if (!button) return;
        const time = button.dataset.time;
        const date = button.dataset.date;
        const booking = getBookingForSlot(date, time);
        if (booking) {
            showBookingDetails(booking);
        }
    }

    function toggleSlotSelection(slotToToggle) {
        const { date, time } = slotToToggle;
        const index = state.selectedSlots.findIndex(s => s.date === date && s.time === time);

        if (index > -1) {
            // Remove slot
            state.selectedSlots.splice(index, 1);
        } else {
            // Add slot after validation
            const validation = validateSingleDayBooking(slotToToggle);
            if (validation.valid) {
                 state.selectedSlots.push(slotToToggle);
                 autoFillContiguousSlots(slotToToggle);
            } else {
                showCustomAlert(validation.message, 'error');
            }
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        const submitButton = document.getElementById('submit-booking-btn');
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';

        if (state.selectedSlots.length === 0) {
            showCustomAlert('Please select at least one time slot before submitting.', 'error');
            submitButton.disabled = false;
            submitButton.innerHTML = 'Submit Booking Request';
            return;
        }

        const purpose = document.getElementById('purpose').value.trim();
        const classCode = document.getElementById('class_code').value.trim();

        if (!purpose) {
            showCustomAlert('Please provide a purpose for the booking.', 'error');
            submitButton.disabled = false;
            submitButton.innerHTML = 'Submit Booking Request';
            return;
        }
        
        // Sort slots to find the earliest start and latest end time
        const sortedSlots = [...state.selectedSlots].sort((a, b) => {
            if (a.date < b.date) return -1;
            if (a.date > b.date) return 1;
            if (a.time < b.time) return -1;
            if (a.time > b.time) return 1;
            return 0;
        });

        const bookingDate = sortedSlots[0].date;
        const startTime = sortedSlots[0].time;
        // Calculate end time by adding 1 hour to the last slot's start time
        const lastSlotTime = sortedSlots[sortedSlots.length - 1].time;
        const [hours, minutes] = lastSlotTime.split(':').map(Number);
        const endDate = new Date(`${bookingDate}T${lastSlotTime}:00`);
        endDate.setHours(hours + 1);
        const endTime = endDate.toTimeString().substring(0, 5);

        // MODIFIED: Payload structure updated to match backend expectation
        const bookingDetails = {
            hall_id: state.hall.id,
            purpose: purpose,
            booking_type: state.bookingType,
            class_code: classCode || null,
            // The date part of the booking, formatted as a UTC ISO string.
            // new Date('YYYY-MM-DD') creates a date object at midnight UTC.
            start_date: new Date(bookingDate).toISOString(),
            end_date: new Date(bookingDate).toISOString(),
            // The time parts of the booking
            start_time: startTime,
            end_time: endTime,
        };

        const confirmationMessage = `
            You are about to book <strong>${state.hall.name}</strong> on 
            <strong>${formatDateForDisplay(bookingDate)}</strong> from 
            <strong>${formatTimeForDisplay(startTime)}</strong> to 
            <strong>${formatTimeForDisplay(endTime)}</strong>.
            <br/><br/>
            Purpose: ${purpose}
            <br/>
            Please confirm.
        `;
        
        const confirmed = await showCustomConfirm(confirmationMessage);

        if (confirmed) {
            try {
                console.log("Submitting booking details:", bookingDetails);
                const result = await addIndividualBooking(bookingDetails);
                showCustomAlert('Booking request submitted successfully! You will be notified upon approval.', 'success');
                resetForm();
                // Optionally, re-fetch availability to show the new pending booking
                state.availabilityData = await fetchHallAvailability(state.hall.id);
                render();
            } catch (error) {
                console.error("Booking submission failed:", error);
                showCustomAlert(`Booking failed: ${error.message}`, 'error');
            }
        }

        submitButton.disabled = false;
        submitButton.innerHTML = 'Submit Booking Request';
    }

    function resetForm() {
        state.selectedSlots = [];
        const purposeInput = document.getElementById('purpose');
        const classCodeInput = document.getElementById('class_code');
        if (purposeInput) purposeInput.value = '';
        if (classCodeInput) classCodeInput.value = '';
        render();
    }

    function cleanup() {
        if (abortController) {
            abortController.abort();
        }
        // Remove global event listeners
        window.removeEventListener('mouseup', handleTimeSlotMouseUp);
        const container = document.getElementById('final-booking-form-content');
        if (container) {
            container.innerHTML = '';
        }
    }

    // --- INITIALIZATION ---
    async function initialize(hallId) {
        cleanup();
        abortController = new AbortController();
        
        const container = document.getElementById('final-booking-form-content');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-20">
                    <i class="fas fa-spinner fa-spin fa-3x text-blue-400"></i>
                    <p class="mt-4 text-slate-400">Loading booking information...</p>
                </div>`;
        }
        
        try {
            const allHalls = await fetchAllHalls();
            const hall = allHalls.find(h => h.id === hallId);
            
            if (!hall) {
                throw new Error("Hall not found.");
            }
            
            const availability = await fetchHallAvailability(hallId);
            
            state = {
                ...state,
                hall: hall,
                availabilityData: availability,
                selectedSlots: [],
                currentDate: new Date(),
                currentSelectedDate: getTodayISTString()
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
                                <button onclick="window.history.back()" class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">Go Back</button>
                                <button onclick="location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Retry</button>
                            </div>
                        </div>
                    </div>`;
            }
        }
    }

    window.FinalBookingFormView = { initialize, cleanup, render, resetForm };
})();

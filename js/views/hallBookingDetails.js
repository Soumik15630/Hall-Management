window.HallBookingDetailsView = (function() {

    // --- STATE MANAGEMENT (Unchanged) ---
    let state = {
        hall: null,
        availabilityData: [], // Combined list of approved and pending bookings
        selectedSlots: [], // Format: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
        currentDate: new Date(),
        isDragging: false,
        dragSelectionMode: 'add',
        dragDate: null,
        isRendering: false,
    };
    let abortController;
    let tooltipTimeout;
    let renderTimeout;
    const timeSlots = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // --- UI HELPERS (Unchanged) ---
    function showLoader() {
        if (document.getElementById('booking-loader')) return;
        const loader = document.createElement('div');
        loader.id = 'booking-loader';
        loader.className = 'fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[100] transition-opacity duration-300 opacity-0';
        loader.innerHTML = `<style>.spinner{width:56px;height:56px;border-radius:50%;border:8px solid #475569;border-top-color:#60a5fa;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style><div class="spinner" role="status" aria-label="Loading..."></div>`;
        document.body.appendChild(loader);
        setTimeout(() => loader.classList.remove('opacity-0'), 10);
    }

    function hideLoader() {
        const loader = document.getElementById('booking-loader');
        if (loader) {
            loader.classList.add('opacity-0');
            setTimeout(() => loader.remove(), 300);
        }
    }

    // --- UTILITY FUNCTIONS FOR TIME HANDLING (Unchanged) ---
    function getTodayISTString() {
        const now = new Date();
        const year = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' });
        const month = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit' });
        const day = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' });
        return `${year}-${month}-${day}`;
    }

    function getCurrentISTTimeString() {
        return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).substring(0, 5);
    }

    function isSlotInPast(dateString, time) {
        const todayISTString = getTodayISTString();
        if (dateString < todayISTString) return true;
        if (dateString === todayISTString) {
            return time < getCurrentISTTimeString();
        }
        return false;
    }

    // --- API & DATA HANDLING (Updated to use ApiService) ---

    // The local fetchFromAPI function has been REMOVED.

    function getBookingsForSlot(dateString, time) {
        if (!state.availabilityData || state.availabilityData.length === 0) {
            return [];
        }
        const slotStartDateTime = new Date(`${dateString}T${time}:00`);
        const slotEndDateTime = new Date(slotStartDateTime.getTime() + 60 * 60 * 1000);

        return state.availabilityData.filter(b => {
            if (!b || !b.start_time || !b.end_time) return false;
            try {
                const bookingStartDateTime = new Date(b.start_time.slice(0, -1));
                const bookingEndDateTime = new Date(b.end_time.slice(0, -1));
                return slotStartDateTime < bookingEndDateTime && slotEndDateTime > bookingStartDateTime;
            } catch (e) {
                console.error("Error parsing booking dates", b, e);
                return false;
            }
        });
    }

    // --- SELECTION LOGIC (Unchanged) ---
    function validateSingleDayBooking(newSlot) {
        if (state.selectedSlots.length === 0) return true;
        const existingDate = state.selectedSlots[0].date;
        return newSlot.date === existingDate;
    }

    function autoFillContiguousSlots(targetSlot) {
        const currentSelectedForDate = state.selectedSlots.filter(slot => slot.date === targetSlot.date);
        if (currentSelectedForDate.length === 0) return;

        const timeIndices = currentSelectedForDate.map(slot => timeSlots.indexOf(slot.time)).sort((a, b) => a - b);
        const minIndex = Math.min(...timeIndices);
        const maxIndex = Math.max(...timeIndices);

        for (let i = minIndex; i <= maxIndex; i++) {
            const timeSlot = timeSlots[i];
            const slotExists = state.selectedSlots.some(slot => slot.date === targetSlot.date && slot.time === timeSlot);
            if (!slotExists && getBookingsForSlot(targetSlot.date, timeSlot).length === 0) {
                state.selectedSlots.push({ date: targetSlot.date, time: timeSlot });
            }
        }
    }

    // --- TOOLTIP MANAGEMENT (Unchanged) ---
    function createTooltip(content, event) {
        removeTooltip();
        const tooltip = document.createElement('div');
        tooltip.id = 'booking-tooltip';
        tooltip.className = 'absolute z-50 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-sm max-w-xs w-max pointer-events-none';
        tooltip.innerHTML = content;
        document.body.appendChild(tooltip);

        const tooltipRect = tooltip.getBoundingClientRect();

        let top = event.pageY + 15;
        let left = event.pageX + 15;

        if (left + tooltipRect.width > window.innerWidth) {
            left = event.pageX - tooltipRect.width - 15;
        }
        if (top + tooltipRect.height > (window.innerHeight + window.scrollY)) {
            top = event.pageY - tooltipRect.height - 15;
        }

        if (top < window.scrollY) top = window.scrollY + 5;
        if (left < 0) left = 5;

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    function removeTooltip() {
        const existingTooltip = document.getElementById('booking-tooltip');
        if (existingTooltip) existingTooltip.remove();
    }

    // --- SAFE RENDERING (Unchanged) ---
    function safeRender(callback, delay = 0) {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            if (state.isRendering) {
                safeRender(callback, 50);
                return;
            }
            state.isRendering = true;
            try {
                callback();
            } catch (error) {
                console.error('Render error:', error);
            } finally {
                state.isRendering = false;
            }
        }, delay);
    }

    // --- RENDERING LOGIC (Unchanged) ---
    function render() {
        if (!state.hall) return;
        safeRender(() => {
            renderHallInfo();
            rerenderCalendar();
        });
    }

    function renderHallInfo() {
        const { hall } = state;
        const hallDetailsElement = document.getElementById('booking-hall-details');
        const hallFeaturesElement = document.getElementById('booking-hall-features');
        const hallInchargeElement = document.getElementById('booking-hall-incharge');

        if (hallDetailsElement) {
            hallDetailsElement.innerHTML = `
                <h3 class="text-lg font-bold text-blue-300 mb-3">Hall Details</h3>
                <div class="space-y-2 text-sm">
                    <div><span class="text-slate-400">Name:</span> <span class="text-white font-semibold">${hall.name || 'N/A'}</span></div>
                    <div><span class="text-slate-400">Location:</span> <span class="text-white">${hall.location}</span></div>
                    <div><span class="text-slate-400">Capacity:</span> <span class="text-white">${hall.capacity || 'N/A'} people</span></div>
                    <div><span class="text-slate-400">Floor:</span> <span class="text-white">${hall.floor || 'N/A'}</span></div>
                </div>`;
        }
        if (hallFeaturesElement) {
            hallFeaturesElement.innerHTML = `
                <h3 class="text-lg font-bold text-green-300 mb-3">Features</h3>
                ${hall.features && hall.features.length > 0 ?
                    `<div class="flex flex-wrap gap-2">${hall.features.map(f => `<span class="px-2 py-1 bg-green-900/50 text-green-200 rounded-full text-xs">${f}</span>`).join('')}</div>` :
                    '<p class="text-sm text-slate-400">No special features listed.</p>'}`;
        }
        if (hallInchargeElement) {
            hallInchargeElement.innerHTML = `
                <h3 class="text-lg font-bold text-yellow-300 mb-3">Contact Information</h3>
                <div class="space-y-2 text-sm">
                    <div><span class="text-slate-400">In-charge:</span> <span class="text-white">${hall.incharge.name}</span></div>
                    <div><span class="text-slate-400">Designation:</span> <span class="text-white">${hall.incharge.designation}</span></div>
                    <div><span class="text-slate-400">Email:</span> <span class="text-white">${hall.incharge.email}</span></div>
                    <div><span class="text-slate-400">Intercom:</span> <span class="text-white">${hall.incharge.intercom}</span></div>
                </div>`;
        }
    }

    function renderCalendarGrid() {
        const { currentDate } = state;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const monthYearElement = document.getElementById('current-month-year');
        if (monthYearElement) {
            monthYearElement.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
        }

        return `
            <style>
                .calendar-container { min-width: 100%; overflow-x: auto; }
                .slot { width: 100%; height: 2.5rem; border-radius: 0.25rem; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; }
                .slot:disabled { cursor: not-allowed; }
                .slot-available-weekday { background-color: rgba(22, 101, 52, 0.8); border-color: rgba(22, 101, 52, 1); }
                .slot-available-weekday:hover { background-color: rgba(21, 128, 61, 0.8); }
                .slot-available-weekend { background-color: rgba(74, 222, 128, 0.6); border-color: rgba(74, 222, 128, 0.8); }
                .slot-available-weekend:hover { background-color: rgba(74, 222, 128, 0.7); }
                .slot-booked { background-color: rgba(220, 38, 38, 0.8); border-color: rgba(220, 38, 38, 1); cursor: pointer !important; }
                .slot-pending { background-color: rgba(234, 179, 8, 0.8); border-color: rgba(234, 179, 8, 1); cursor: pointer !important; }
                .slot-past { background-color: rgba(71, 85, 105, 0.5); border-color: rgba(71, 85, 105, 0.7); opacity: 0.6; }
                .slot-selected { background-color: rgba(59, 130, 246, 1) !important; border-color: rgba(96, 165, 250, 1) !important; transform: scale(1.05); }
            </style>
            <div class="calendar-container">
                <table class="w-full border-collapse" style="min-width: 800px;">
                    <thead>
                        <tr class="sticky top-0 bg-slate-800/50 backdrop-blur-sm">
                            <th class="p-2 w-24"></th>
                            ${Array.from({ length: daysInMonth }, (_, i) => {
                                const day = new Date(year, month, i + 1);
                                return `<th class="text-center p-2"><div class="font-semibold">${i + 1}</div><div class="text-xs text-slate-400">${dayNames[day.getDay()]}</div></th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700/50" id="calendar-body">
                        ${timeSlots.map(time => `
                            <tr class="divide-x divide-slate-700/50">
                                <td class="text-right text-sm text-slate-300 p-2 whitespace-nowrap">${new Date('1970-01-01T' + time).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', hour12: true})}</td>
                                ${Array.from({ length: daysInMonth }, (_, i) => {
                                    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                                    const { classes, status, isClickable } = getSlotStatus(dateString, time);
                                    return `<td class="p-1"><button class="slot ${classes}" data-date="${dateString}" data-time="${time}" data-status="${status}" ${!isClickable ? 'disabled' : ''}></button></td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function getSlotStatus(dateString, time) {
        if (state.selectedSlots.some(s => s.date === dateString && s.time === time)) {
            return { classes: 'slot-selected', status: 'selected', isClickable: true };
        }
        if (isSlotInPast(dateString, time)) {
            return { classes: 'slot-past', status: 'past', isClickable: false };
        }
        const bookings = getBookingsForSlot(dateString, time);
        if (bookings.length > 0) {
            if (bookings.some(b => b.status === 'APPROVED')) return { classes: 'slot-booked', status: 'booked', isClickable: true };
            if (bookings.some(b => b.status === 'PENDING')) return { classes: 'slot-pending', status: 'pending', isClickable: true };
            return { classes: 'slot-booked', status: 'booked', isClickable: true };
        }
        const dayOfWeek = new Date(dateString + 'T00:00:00').getDay();
        return (dayOfWeek === 0 || dayOfWeek === 6)
            ? { classes: 'slot-available-weekend', status: 'available-weekend', isClickable: true }
            : { classes: 'slot-available-weekday', status: 'available', isClickable: true };
    }

    function updateCalendarUI() {
        document.querySelectorAll('#calendar-body .slot').forEach(slotEl => {
            const { date, time } = slotEl.dataset;
            if (date && time) {
                const { classes, status, isClickable } = getSlotStatus(date, time);
                slotEl.className = `slot ${classes}`;
                slotEl.dataset.status = status;
                slotEl.disabled = !isClickable;
            }
        });
    }

    function rerenderCalendar() {
        const calendarGridContainer = document.getElementById('booking-calendar-grid');
        if (!calendarGridContainer) return;
        safeRender(() => {
            calendarGridContainer.innerHTML = renderCalendarGrid();
            requestAnimationFrame(setupDynamicListeners);
        });
    }

    function showSlotTooltip(slotEl, event) {
        const { date, time, status } = slotEl.dataset;
        const bookings = getBookingsForSlot(date, time);
        if (bookings.length === 0) {
            removeTooltip();
            return;
        };

        let content = '';
        if (status === 'booked') {
            const booking = bookings.find(b => b.status === 'APPROVED') || bookings[0];
            content = `<div class="font-bold text-red-400 mb-2">Slot Booked</div>
                       <div class="space-y-1">
                           <div><span class="text-slate-400">By:</span> <span class="text-white">${booking.user.name}</span></div>
                           <div><span class="text-slate-400">Dept:</span> <span class="text-white">${booking.user.department}</span></div>
                           <div><span class="text-slate-400">Purpose:</span> <span class="text-white">${booking.purpose}</span></div>
                       </div>`;
        } else if (status === 'pending') {
            const pendingBookings = bookings.filter(b => b.status === 'PENDING');
            content = `<div class="font-bold text-yellow-400 mb-2">Pending Requests (${pendingBookings.length})</div>
                       <ul class="space-y-2 list-disc list-inside">
                           ${pendingBookings.map(b => `<li><span class="text-white">${b.purpose}</span> <span class="text-slate-400">by ${b.user.department}</span></li>`).join('')}
                       </ul>
                       <div class="text-xs text-slate-500 mt-2">This slot can still be selected.</div>`;
        }
        if (content) {
            createTooltip(content, event);
        }
    }

    function handleDragStart(e) {
        const slotEl = e.target.closest('button.slot');
        if (!slotEl || slotEl.disabled) return;
        e.preventDefault();

        const { date, time, status } = slotEl.dataset;

        if (status === 'booked') {
            showSlotTooltip(slotEl, e);
            return;
        }
        if (status === 'pending') {
            showSlotTooltip(slotEl, e);
        }

        if (!validateSingleDayBooking({ date, time })) {
            const existingDate = state.selectedSlots[0].date;
            showNotification(`You can only book slots for one day. Please clear your selection for ${new Date(existingDate+'T00:00:00').toLocaleDateString()} to choose a different date.`);
            return;
        }

        state.isDragging = true;
        state.dragDate = date;
        state.dragSelectionMode = slotEl.classList.contains('slot-selected') ? 'remove' : 'add';

        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        if (state.dragSelectionMode === 'add' && existingIndex === -1) {
            state.selectedSlots.push({ date, time });
        } else if (state.dragSelectionMode === 'remove' && existingIndex > -1) {
            state.selectedSlots.splice(existingIndex, 1);
        }
        updateCalendarUI();
    }

    function handleDragOver(e) {
        if (!state.isDragging) return;
        const slotEl = e.target.closest('button.slot');
        if (slotEl && !slotEl.disabled && slotEl.dataset.date === state.dragDate) {
            const { date, time } = slotEl.dataset;
            const isSelected = state.selectedSlots.some(s => s.date === date && s.time === time);
            if (state.dragSelectionMode === 'add' && !isSelected) {
                state.selectedSlots.push({ date, time });
                updateCalendarUI();
            } else if (state.dragSelectionMode === 'remove' && isSelected) {
                const index = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
                if (index > -1) {
                    state.selectedSlots.splice(index, 1);
                    updateCalendarUI();
                }
            }
        }
    }

    function handleDragStop() {
        if (!state.isDragging) return;
        state.isDragging = false;
        if (state.dragSelectionMode === 'add' && state.selectedSlots.length > 0) {
            autoFillContiguousSlots(state.selectedSlots[state.selectedSlots.length - 1]);
        }
        updateCalendarUI();
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg animate-pulse z-[200]';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }

    function handleBookHall() {
        sessionStorage.setItem('finalBookingSlots', JSON.stringify(state.selectedSlots));
        sessionStorage.setItem('finalBookingHall', JSON.stringify(state.hall));
        window.location.hash = `#final-booking-form-view?id=${state.hall?.unique_id}`;
    }

    function cleanup() {
        if (abortController) abortController.abort();
        if (renderTimeout) clearTimeout(renderTimeout);
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        removeTooltip();
        hideLoader();
        state.isRendering = false;
    }

    function setupDynamicListeners() {
        if (!abortController || abortController.signal.aborted) return;
        const { signal } = abortController;
        const calendarBody = document.getElementById('calendar-body');
        if (calendarBody) {
            calendarBody.addEventListener('mousedown', handleDragStart, { signal });
        }
        document.addEventListener('mouseover', handleDragOver, { signal, passive: true });
        document.addEventListener('mouseup', handleDragStop, { signal });

        const calendarGrid = document.getElementById('booking-calendar-grid');
        if (calendarGrid) {
            calendarGrid.addEventListener('mouseover', e => {
                const slot = e.target.closest('button.slot[data-status="booked"], button.slot[data-status="pending"]');
                if (slot) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = setTimeout(() => showSlotTooltip(slot, e), 200);
                }
            }, { signal, passive: true });
            calendarGrid.addEventListener('mouseout', e => {
                const slot = e.target.closest('button.slot');
                if (slot) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = setTimeout(removeTooltip, 300);
                }
            }, { signal, passive: true });
        }
    }

    async function initialize(hallId) {
        if (document.readyState !== 'complete') {
                await new Promise(resolve => {
                    window.addEventListener('load', resolve, { once: true });
                });
            }
    

        showLoader();
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        try {
            state.selectedSlots = [];
            state.isRendering = false;
            sessionStorage.removeItem('finalBookingSlots');
            sessionStorage.removeItem('finalBookingHall');

            // UPDATED: Now uses the centralized ApiService
            const [hallData, approvedBookingsData, pendingBookingsData] = await Promise.all([
                ApiService.halls.getById(hallId),
                ApiService.bookings.getForHall(hallId),
                ApiService.bookings.getPendingForHall(hallId)
            ]);

            if (!hallData) throw new Error(`Hall data not found for ID: ${hallId}`);

            const processedHallData = {
                ...hallData,
                id: hallData.unique_id,
                location: `${hallData.school?.school_name || ''}${hallData.department?.department_name ? ' - ' + hallData.department.department_name : ''}`.trim() || 'N/A',
                incharge: {
                    name: hallData.department?.incharge_name || hallData.school?.incharge_name || hallData.incharge_name || 'N/A',
                    designation: hallData.department ? 'HOD' : (hallData.school ? 'Dean' : (hallData.incharge_designation || 'N/A')),
                    email: hallData.department?.incharge_email || hallData.school?.incharge_email || hallData.incharge_email || 'N/A',
                    intercom: hallData.department?.incharge_contact_number || hallData.school?.incharge_contact_number || hallData.incharge_contact_number || 'N/A',
                }
            };

            const processBooking = (bookingData, status) => {
                const details = bookingData.bookingRequest;
                if (!details) {
                    return {
                        start_time: bookingData.start_time,
                        end_time: bookingData.end_time,
                        status: status,
                        purpose: 'Details unavailable',
                        user: { name: 'Unknown', department: 'Unknown' }
                    };
                }

                const userEmployee = details.user?.employee;
                const department = userEmployee?.belongs_to === 'DEPARTMENT'
                    ? userEmployee?.department?.department_name
                    : userEmployee?.school?.school_name;

                return {
                    start_time: bookingData.start_time,
                    end_time: bookingData.end_time,
                    status: status,
                    purpose: details.purpose || 'N/A',
                    user: {
                        name: userEmployee?.employee_name || 'Unknown User',
                        department: department || 'Unknown Department'
                    }
                };
            };

            const processedApproved = (approvedBookingsData || []).map(b => processBooking(b, 'APPROVED'));
            const processedPending = (pendingBookingsData || []).map(p => processBooking(p, 'PENDING'));

            state = {
                ...state,
                hall: processedHallData,
                availabilityData: [...processedApproved, ...processedPending],
                currentDate: new Date(),
            };

            await new Promise(resolve => {
                render();
                setTimeout(resolve, 10);
            });

            document.getElementById('prev-month-btn')?.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() - 1); rerenderCalendar(); }, { signal });
            document.getElementById('next-month-btn')?.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() + 1); rerenderCalendar(); }, { signal });
            document.getElementById('confirm-booking-btn')?.addEventListener('click', handleBookHall, { signal });

        } catch (error) {
            console.error('Error initializing hall booking details:', error);
            const viewContainer = document.getElementById('hall-booking-details-view');
            if (viewContainer) {
                viewContainer.innerHTML = `<div class="text-center py-20"><h2 class="text-xl font-bold text-red-400 mb-4">Error Loading Details</h2><p class="text-slate-400 mb-4">${error.message}</p><button onclick="window.history.back()" class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">Go Back</button></div>`;
            }
        } finally {
            requestAnimationFrame(() => setTimeout(hideLoader, 100));
        }
    }

    return { initialize, cleanup };
})();

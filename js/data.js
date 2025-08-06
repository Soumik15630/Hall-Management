// HallBooking/js/data.js

// Live Backend Data and Fetch Functions
window.AppData = (function() {
    // Caching Layer to reduce redundant API calls
    const cache = {};

    /**
     * Helper function to make authenticated API calls and handle responses.
     * @param {string} endpoint - The API endpoint to call (e.g., '/api/hall/all-hall').
     * @param {object} options - Fetch options (method, body, etc.).
     * @param {boolean} isJson - Whether to parse the response as JSON.
     * @returns {Promise<any>} - The JSON response data or the raw response object.
     */
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) {
            console.error("No auth token, logging out.");
            logout();
            throw new Error("User not authenticated");
        }

        // Use the base URL from the config file
        const fullUrl = AppConfig.apiBaseUrl + endpoint;

        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);

        if (response.status === 401) {
            logout();
            throw new Error("Authentication failed");
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API Error on ${endpoint}: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage += ` - ${errorJson.message || errorText}`;
            } catch (e) {
                errorMessage += ` - ${errorText}`;
            }
            throw new Error(errorMessage);
        }

        if (isJson) {
            // Handle cases where the response might be empty (e.g., 204 No Content)
            const text = await response.text();
            if (!text) return null;
            const result = JSON.parse(text);
            // The API wraps successful responses in a 'data' object or returns the array directly
            return result.data || result;
        }
        return response;
    }

    // --- Helper to format hall type and features ---
    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(
            /\w\S*/g,
            function(txt) {
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }
        );
    }

    /**
     * **FIXED**: Maps the shortened hall type from the API (e.g., 'LECTURE')
     * to the full display name required by the UI (e.g., 'Lecture Hall').
     * @param {string} apiType - The hall type from the backend.
     * @returns {string} - The full, display-friendly hall type name.
     */
    function mapHallType(apiType) {
        if (!apiType) return 'N/A';
        const type = apiType.toUpperCase();
        switch (type) {
            case 'SEMINAR': return 'Seminar';
            case 'LECTURE': return 'Lecture Hall';
            case 'CONFERENCE': return 'Conference Hall';
            case 'AUDITORIUM': return 'Auditorium';
            default: return formatTitleCase(apiType);
        }
    }

    // --- API-driven Data Functions ---

    async function fetchHallData() {
        // This function fetches and transforms data, returning a FLAT ARRAY.
        // It's used by views that need a simple list of all halls.
        if (cache.allHalls) return JSON.parse(JSON.stringify(cache.allHalls));

        const rawHalls = await fetchFromAPI(AppConfig.endpoints.allHall);
        const schools = await fetchFromAPI(AppConfig.endpoints.allschool);
        const departments = await fetchFromAPI(AppConfig.endpoints.alldept);
        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        const transformedData = rawHalls.map(hall => {
             let incharge = { name: 'N/A', role: 'N/A', email: 'N/A', phone: 'N/A' };
             const dept = departmentMap.get(hall.department_id);
             const school = schoolMap.get(hall.school_id);

             if (dept) {
                 incharge = { name: dept.incharge_name, role: 'HOD', email: dept.incharge_email, phone: dept.incharge_contact_number };
             } else if (school) {
                 incharge = { name: school.incharge_name, role: 'Dean', email: school.incharge_email, phone: school.incharge_contact_number };
             }

            return {
                id: hall.unique_id,
                date: new Date(hall.created_at).toLocaleDateString('en-CA'),
                name: hall.name,
                hallName: hall.name, // for backward compatibility
                hallCode: hall.unique_id,
                type: mapHallType(hall.type), // **FIXED**: Use the new mapping function
                location: `${school ? school.school_name : 'Administration'}${dept ? ' - ' + dept.department_name : ''}`,
                capacity: hall.capacity,
                floor: formatTitleCase(hall.floor) + ' Floor',
                zone: formatTitleCase(hall.zone) + ' Zone',
                school: school ? school.school_name : 'N/A',
                department: dept ? dept.department_name : 'N/A',
                features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase) : [],
                incharge: incharge, // Pass the whole object
                inchargeName: incharge.name,
                inchargeRole: incharge.role,
                inchargeEmail: incharge.email,
                inchargePhone: incharge.phone,
                status: hall.availability
            };
        });
        
        cache.allHalls = transformedData;
        return JSON.parse(JSON.stringify(transformedData));
    }

    async function fetchBookingHalls() {
        // This function fetches all halls and GROUPS them by type for the browse/book view.
        if (cache.bookingHalls) return JSON.parse(JSON.stringify(cache.bookingHalls));
        
        const allHalls = await fetchHallData();

        // **FIXED**: The keys now match the full names used by the UI buttons.
        const groupedHalls = {
            'Seminar': [],
            'Auditorium': [],
            'Lecture Hall': [],
            'Conference Hall': []
        };

        allHalls.forEach(hall => {
            // hall.type is now correctly mapped to the full name (e.g., "Lecture Hall")
            if (groupedHalls.hasOwnProperty(hall.type)) {
                groupedHalls[hall.type].push(hall);
            }
        });
        
        cache.bookingHalls = groupedHalls;
        return JSON.parse(JSON.stringify(groupedHalls));
    }

    async function fetchArchivedHallData() {
        const allHalls = await fetchHallData();
        return allHalls.filter(hall => !hall.status);
    }
    
    async function fetchEmployeeData() {
        const rawEmployees = await fetchFromAPI(AppConfig.endpoints.allemp);
        const schools = await fetchFromAPI(AppConfig.endpoints.allschool);
        const departments = await fetchFromAPI(AppConfig.endpoints.alldept);
        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

        return rawEmployees.map(emp => ({
            id: emp.unique_id,
            name: emp.employee_name,
            email: emp.employee_email,
            phone: emp.employee_mobile,
            designation: emp.designation,
            department: departmentMap.get(emp.department_id) || 'N/A',
            school: schoolMap.get(emp.school_id) || 'N/A',
            status: 'Active'
        }));
    }

    async function getSchools() {
        if (cache.schoolsMap) return cache.schoolsMap;
        const schoolsData = await fetchFromAPI(AppConfig.endpoints.allschool);
        const departmentsData = await fetchFromAPI(AppConfig.endpoints.alldept);

        const schoolsMap = {};
        schoolsData.forEach(school => {
            schoolsMap[school.school_name] = [];
        });

        departmentsData.forEach(dept => {
            const school = schoolsData.find(s => s.unique_id === dept.school_id);
            if (school && schoolsMap[school.school_name]) {
                schoolsMap[school.school_name].push(dept.department_name);
            }
        });
        cache.schoolsMap = schoolsMap;
        return schoolsMap;
    }

    async function fetchMyBookingsData() {
        const requests = await fetchFromAPI(AppConfig.endpoints.myBookings);
        return requests.map(req => ({
            bookedOn: new Date(req.created_at).toLocaleDateString('en-CA'),
            bookingId: req.unique_id,
            hallName: req.hall?.name || 'N/A',
            hallCode: req.hall_id,
            department: 'Your Department',
            purpose: req.purpose,
            course: req.class_code || 'N/A',
            dateTime: `${new Date(req.start_date).toLocaleDateString()} - ${new Date(req.end_date).toLocaleDateString()}\\n${req.start_time} - ${req.end_time}`,
            status: formatTitleCase(req.status)
        }));
    }

    async function fetchApprovalData() {
        const requests = await fetchFromAPI(AppConfig.endpoints.pendingApprovals);
        return requests.map(req => ({
            bookedOn: new Date(req.created_at).toLocaleDateString('en-CA'),
            bookingId: req.unique_id,
            hallName: req.hall?.name || 'N/A',
            hallCode: req.hall_id,
            purpose: req.purpose,
            course: req.class_code || 'N/A',
            dateTime: `${new Date(req.start_date).toLocaleDateString()} - ${new Date(req.end_date).toLocaleDateString()}\\n${req.start_time} - ${req.end_time}`,
            bookedBy: req.user?.employee?.employee_name || 'N/A',
            bookedByDept: 'Department N/A',
            status: formatTitleCase(req.status)
        }));
    }

    // MODIFICATION: This function now fetches all bookings and filters them.
    async function fetchHallAvailability(hallId) {
        if (!hallId) return [];
        
        // Use the existing, reliable endpoint for all user bookings.
        const allBookings = await fetchFromAPI(AppConfig.endpoints.myBookings);

        // Filter the bookings for the specific hall.
        const hallBookings = allBookings.filter(b => b.hall_id === hallId);

        return hallBookings.map(b => {
            const d = new Date(b.start_date); // Use start_date for consistency
            return {
                hallId: b.hall_id,
                year: d.getFullYear(),
                month: d.getMonth(), // JS Date month is 0-11
                day: d.getDate(),
                time: d.toTimeString().substring(0, 5), // Format as HH:MM
                status: formatTitleCase(b.status)
            }
        });
    }


    async function addIndividualBooking(bookingDetails) {
        return await fetchFromAPI(AppConfig.endpoints.bookingRequest, {
            method: 'POST',
            body: JSON.stringify(bookingDetails)
        });
    }

    async function addMultipleIndividualBookings(bookingRequests) {
        const bookingPromises = bookingRequests.map(request =>
            addIndividualBooking(request)
        );
        return await Promise.all(bookingPromises);
    }

    async function updateHall(hallId, payload) {
        return await fetchFromAPI(`${AppConfig.endpoints.hall}/${hallId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
    }
    
    async function deleteEmployees(employeeIds) {
        const deletePromises = employeeIds.map(id => 
            fetchFromAPI(`${AppConfig.endpoints.emp}/${id}`, { method: 'DELETE' }, false)
        );
        return await Promise.all(deletePromises);
    }

    async function updateBookingStatus(bookingId, status) {
        const action = status === 'APPROVED' ? 'approve' : 'reject';
        return await fetchFromAPI(`${AppConfig.endpoints.booking}/${bookingId}/${action}`, {
            method: 'PUT'
        }, false);
    }

    async function updateEmployee(employeeData) {
         return await fetchFromAPI(`${AppConfig.endpoints.emp}/${employeeData.id}`, {
            method: 'PUT',
            body: JSON.stringify(employeeData)
        });
    }

    async function fetchActualUserData() {
        return Promise.resolve({ name: 'HOD' });
    }

    // --- Functions with No Direct API Endpoint (returning empty/default) ---
    function fetchBookingConflictsData() { return Promise.resolve([]); }
    function fetchForwardBookingsData() { return Promise.resolve([]); }
    function getFeatures() { return ['WiFi', 'AC', 'Smartboard', 'Projector', 'Audio System', 'Computer', 'Podium', 'Ramp', 'Video Conferencing', 'Blackboard']; }

    return {
        fetchHallData,
        fetchArchivedHallData,
        fetchEmployeeData,
        fetchBookingHalls, // Now uses the grouping function
        fetchSemesterHalls: fetchBookingHalls, // Also uses the grouping function
        fetchMyBookingsData,
        fetchHallAvailability,
        fetchApprovalData,
        fetchBookingConflictsData,
        fetchForwardBookingsData,
        fetchViewBookingsData: fetchMyBookingsData,
        fetchUserData: fetchActualUserData,
        addIndividualBooking,
        addMultipleIndividualBookings,
        addSemesterBooking: addIndividualBooking,
        updateHall,
        deleteEmployees,
        updateBookingStatus,
        updateEmployee,
        getSchools,
        getFeatures,
    };
})();

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
            const result = await response.json();
            // The API wraps successful responses in a 'data' object or returns the array directly
            return result.data || result;
        }
        return response;
    }

    // --- API-driven Data Functions ---

    async function fetchHallData() {
        if (cache.hallData) return JSON.parse(JSON.stringify(cache.hallData));
        
        const rawHalls = await fetchFromAPI(AppConfig.endpoints.allHall);
        
        // Fetch related data for mapping names
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
                date: new Date(hall.created_at).toLocaleDateString('en-CA'),
                hallName: hall.name,
                hallCode: hall.unique_id,
                capacity: hall.capacity,
                floor: hall.floor.charAt(0) + hall.floor.slice(1).toLowerCase() + ' Floor',
                zone: hall.zone.charAt(0) + hall.zone.slice(1).toLowerCase() + ' Zone',
                school: school ? school.school_name : 'N/A',
                department: dept ? dept.department_name : 'N/A',
                features: Array.isArray(hall.features) ? hall.features.join(', ') : '',
                inchargeName: incharge.name,
                inchargeRole: incharge.role,
                inchargeEmail: incharge.email,
                inchargePhone: incharge.phone,
                status: hall.availability
            };
        });
        
        cache.hallData = transformedData;
        return JSON.parse(JSON.stringify(transformedData));
    }

    async function fetchArchivedHallData() {
        const allHalls = await fetchHallData();
        return allHalls.filter(hall => !hall.status);
    }
    
    async function fetchEmployeeData() {
        if (cache.employeeData) return JSON.parse(JSON.stringify(cache.employeeData));
        const rawEmployees = await fetchFromAPI(AppConfig.endpoints.allemp);

        const schools = await fetchFromAPI(AppConfig.endpoints.allschool);
        const departments = await fetchFromAPI(AppConfig.endpoints.alldept);
        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

        const transformedData = rawEmployees.map(emp => ({
            name: emp.employee_name,
            email: emp.employee_email,
            phone: emp.employee_mobile,
            designation: emp.designation,
            department: departmentMap.get(emp.department_id) || 'N/A',
            school: schoolMap.get(emp.school_id) || 'N/A',
            status: 'Active' // API does not provide status, default to Active
        }));
        
        cache.employeeData = transformedData;
        return JSON.parse(JSON.stringify(transformedData));
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
        const requests = await fetchFromAPI('/api/booking/my-requests');
        return requests.map(req => ({
            bookedOn: new Date(req.created_at).toLocaleDateString('en-CA'),
            bookingId: req.unique_id,
            hallName: req.hall?.name || 'N/A',
            hallCode: req.hall_id,
            department: 'Your Department', // This info is not in the API response
            purpose: req.purpose,
            course: req.class_code || 'N/A',
            dateTime: `${new Date(req.start_date).toLocaleDateString()} - ${new Date(req.end_date).toLocaleDateString()}\\n${req.start_time} - ${req.end_time}`,
            status: req.status.charAt(0) + req.status.slice(1).toLowerCase()
        }));
    }

    async function fetchApprovalData() {
        const requests = await fetchFromAPI('/api/booking/pending-approval');
        return requests.map(req => ({
            bookedOn: new Date(req.created_at).toLocaleDateString('en-CA'),
            hallName: req.hall?.name || 'N/A',
            hallCode: req.hall_id,
            purpose: req.purpose,
            course: req.class_code || 'N/A',
            dateTime: `${new Date(req.start_date).toLocaleDateString()} - ${new Date(req.end_date).toLocaleDateString()}\\n${req.start_time} - ${req.end_time}`,
            bookedBy: req.user?.employee?.employee_name || 'N/A',
            bookedByDept: 'Department N/A', // This info is not in the API response
            status: req.status.charAt(0) + req.status.slice(1).toLowerCase()
        }));
    }

    async function fetchHallAvailability(hallId) {
        if (!hallId) return [];
        const bookings = await fetchFromAPI(`/api/booking/hall/${hallId}`);
        return bookings.map(b => {
            const d = new Date(b.start_time);
            return {
                hallId: hallId,
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                day: d.getDate(),
                time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                status: 'Booked'
            }
        });
    }

    async function addIndividualBooking(bookingDetails) {
        return await fetchFromAPI('/api/booking/request', {
            method: 'POST',
            body: JSON.stringify(bookingDetails)
        });
    }

    async function updateEmployee(employeeData) {
         return await fetchFromAPI(`/api/employee/${employeeData.id}`, {
            method: 'PUT',
            body: JSON.stringify(employeeData)
        });
    }

    async function fetchActualUserData() {
        // Since there is no /user/me endpoint, we cannot fetch the user's name.
        // We will return a default value. This can be updated if an endpoint is added.
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
        fetchBookingHalls: fetchHallData, // Use the same transformed data
        fetchSemesterHalls: fetchHallData, // Use the same transformed data
        fetchMyBookingsData,
        fetchHallAvailability,
        fetchApprovalData,
        fetchBookingConflictsData,
        fetchForwardBookingsData,
        fetchViewBookingsData: fetchMyBookingsData, // Simplified for now
        fetchUserData: fetchActualUserData,
        addIndividualBooking,
        addSemesterBooking: addIndividualBooking, // Use the same endpoint
        updateEmployee,
        getSchools,
        getFeatures,
    };
})();

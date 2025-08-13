// =================================================================
// CENTRAL CONFIGURATION FILE
// =================================================================
function logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('roleToken'); // Also clear the role token
    window.location.href = AppConfig.links.login;
}

function getAuthHeaders() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return null;
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

const AppConfig = {
    apiBaseUrl: 'https://hall-management.nirmaljyotib.workers.dev/',
    endpoints: {
        login: 'auth/login',
        hall: 'api/hall',
        allHall: 'api/hall/all-hall',
        addHall: 'api/hall/create',
        school: 'api/school',
        allschool: 'api/school/all-schools',
        addschool: 'api/school/create',
        department: 'api/department',
        alldept: 'api/department/all-department',
        addDept: 'api/department/create',
        emp: 'api/employee',
        allemp: 'api/employee/all-employees',
        addemp: 'api/employee/create',
        booking: 'api/booking',
        bookingRequest: 'api/booking/request',
        myBookings: 'api/booking/my-requests',
        pendingApprovals: 'api/booking/pending-approval',
        getHallSchedule: 'api/booking/hall/',
        getHallById: 'api/hall/',
        forward: 'api/forward'
    },
    links: {
        // General Links
        login: 'index.html',
        logo: 'download.png',

        // Admin Links
        adminDash: 'admin.html',
        addHall: 'addHall.html',
        manageHall: 'manageHall.html',
        addSD: "addSD.html",
        manageSD: "manageSD.html",
        employee: "employee.html",
        manageEMP: "manageEmployee.html",

        // Faculty & HOD Links
        facultyDash: 'faculty.html',
        hodDash: 'hod.html',
        bookAndBrowse: 'bookBrowse.html',
        myBookings: 'bookings.html'
    },
    
    formOptions: {
        ///////////////////////////////////////////////////////////////////////////
        // changes made here reflect to whole app automatically including filters//
        ///////////////////////////////////////////////////////////////////////////

        // Options for hall floors
        floors: [
            { value: 'ground', label: 'Ground Floor' },
            { value: 'first', label: 'First Floor' },
            { value: 'second', label: 'Second Floor' },
            { value: 'third', label: 'Third Floor' }
        ],

        // Options for hall zones
        zones: [
            { value: 'north', label: 'North Zone' },
            { value: 'south', label: 'South Zone' },
            { value: 'east', label: 'East Zone' },
            { value: 'west', label: 'Wet Zone' }
        ],
        // Options for the hall features dropdown
        features: [
            { value: 'AC', label: 'AC' },
            { value: 'PROJECTOR', label: 'Projector' },
            { value: 'WIFI', label: 'WiFi' },
            { value: 'SMART_BOARD', label: 'Smart Board' },
            { value: 'COMPUTER', label: 'Computer' },
            { value: 'AUDIO_SYSTEM', label: 'Audio System' },
            { value: 'PODIUM', label: 'Podium' },
            { value: 'WHITE_BOARD', label: 'White Board' },
            { value: 'BLACK_BOARD', label: 'Black Board' },
            { value: 'LIFT', label: 'Lift' },
            { value: 'RAMP', label: 'Ramp' }
        ],

        // Options for administrative sections
        generalSections: [
            { value: 'ENGINEERING_WING', label: 'Engineering Wing' },
            { value: 'EXAMINATION_WING', label: 'Examination Wing' },
            { value: 'LIBRARY', label: 'Library' },
            { value: 'GUEST_HOUSE', label: 'Guest House' }
        ],
        
        // Options for why a hall might be unavailable
        unavailabilityReasons: [
            { value: 'AWAITING_INAUGURATION', label: 'Awaiting Inauguration' },
            { value: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
            // { value: 'MAINTENANCE', label: 'Under Maintenance' },
            // { value: 'OTHER', label: 'Other' }
        ],



        ////////////////////////////////
        // for filter purpose only !!!!!
        ////////////////////////////////

        hallTypes: [
            { value: 'SEMINAR', label: 'Seminar' },
            { value: 'AUDITORIUM', label: 'Auditorium' },
            { value: 'LECTURE', label: 'Lecture' },
            { value: 'CONFERENCE', label: 'Conference' }
        ],

        capacityRanges: [
            { value: '<50', label: '< 50' },
            { value: '50-100', label: '50-100' },
            { value: '>100', label: '> 100' }
        ],

        /////////////////////////////////////////////
        // filter part ends here !!!!!!!!
        /////////////////////////////////////////////


        // Options for employee designations
        designations: [
            { value: 'HOD', label: 'HOD' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'DEAN', label: 'Dean' },
            { value: 'PROF', label: 'Professor' },
            { value: 'REGISTER', label: 'Registrar' },
            { value: 'FACULTY', label: 'Faculty' },
            { value: 'OTHERS', label: 'Others' },
        ],
    }
};

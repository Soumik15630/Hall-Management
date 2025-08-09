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
        getHallById: 'api/hall/'
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
    }
};
